import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { extractJson, normalizeTripPlan, TripPlanError } from "./tripPlanParser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

loadLocalEnv();

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "32kb" }));

app.post("/api/generate-trip-plan", async (request, response) => {
  const input = typeof request.body?.input === "string" ? request.body.input.trim() : "";

  if (!input) {
    return response.status(400).json({
      ok: false,
      error: {
        code: "empty_input",
        message: "Describe your trip before generating an itinerary.",
      },
    });
  }

  if (input.length > 7000) {
    return response.status(413).json({
      ok: false,
      error: {
        code: "input_too_large",
        message: "Please shorten the trip request to under 7,000 characters.",
      },
    });
  }

  try {
    const result = await generateTripPlan(input);
    return response.json({ ok: true, ...result });
  } catch (error) {
    const statusCode = error.statusCode || statusForCode(error.code);
    return response.status(statusCode).json({
      ok: false,
      error: {
        code: error.code || "ai_request_failed",
        message: publicErrorMessage(error),
      },
    });
  }
});

if (process.env.NODE_ENV === "production") {
  const distPath = path.join(root, "dist");
  app.use(express.static(distPath));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(distPath, "index.html"));
  });
} else {
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.listen(port, "127.0.0.1", () => {
  console.log(`Trip Planner running at http://127.0.0.1:${port}`);
});

async function generateTripPlan(input) {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_API_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 45000);

  if (!apiKey) {
    const error = new Error("AI_API_KEY is not configured.");
    error.code = "missing_api_key";
    error.statusCode = 500;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const aiResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: buildHeaders(apiKey),
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You generate practical travel itineraries as strict JSON only. Do not include markdown, prose, or comments. Prefer realistic pacing, location-aware grouping, and clear stop details.",
          },
          {
            role: "user",
            content: buildPrompt(input),
          },
        ],
      }),
    });

    const responseText = await aiResponse.text();

    if (!aiResponse.ok) {
      const error = new Error(readProviderError(responseText) || "The AI provider rejected the request.");
      error.code = "provider_error";
      error.statusCode = aiResponse.status >= 500 ? 502 : 400;
      throw error;
    }

    const providerPayload = parseProviderPayload(responseText);
    const content = readAssistantContent(providerPayload);
    return normalizeTripPlan(extractJson(content));
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("The model took too long to respond. Please retry.");
      timeoutError.code = "timeout";
      timeoutError.statusCode = 504;
      throw timeoutError;
    }

    if (error instanceof TripPlanError) {
      error.statusCode = 502;
      throw error;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(input) {
  return `Create one day-by-day trip itinerary from this request.

Return exactly this JSON shape:
{
  "title": "short itinerary title",
  "destination": "primary destination",
  "summary": "one sentence overview",
  "travelStyle": "short travel style",
  "days": [
    {
      "id": "day-1",
      "dateLabel": "Day 1",
      "title": "day title",
      "theme": "day focus",
      "notes": "optional day note",
      "stops": [
        {
          "id": "day-1-stop-1",
          "time": "9:00 AM",
          "title": "place or activity name",
          "location": "neighborhood or address",
          "duration": "90 min",
          "category": "Food, Museum, Transit, Nature, etc.",
          "description": "why this stop belongs here",
          "tips": ["short practical tip"],
          "cost": "$, $$, Free, or unknown",
          "bookingNeeded": false
        }
      ]
    }
  ]
}

Rules:
- Make 1 to 7 days unless the request clearly asks for more.
- Make 3 to 5 stops per day.
- Keep each day geographically sensible and not overpacked.
- Include meals, transit/logistics, and downtime when useful.
- If dates, budget, pace, travelers, or interests are missing, make reasonable assumptions in the itinerary.

Trip request:
"""${input}"""`;
}

function buildHeaders(apiKey) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  if (process.env.AI_HTTP_REFERER) {
    headers["HTTP-Referer"] = process.env.AI_HTTP_REFERER;
  }

  if (process.env.AI_APP_TITLE) {
    headers["X-Title"] = process.env.AI_APP_TITLE;
  }

  return headers;
}

function parseProviderPayload(responseText) {
  try {
    return JSON.parse(responseText);
  } catch (error) {
    const parseError = new Error("The AI provider returned a non-JSON API response.");
    parseError.code = "provider_malformed_response";
    parseError.statusCode = 502;
    throw parseError;
  }
}

function readAssistantContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text || part?.content || ""))
      .join("");
  }

  return content;
}

function readProviderError(responseText) {
  try {
    const parsed = JSON.parse(responseText);
    return parsed?.error?.message || parsed?.message || "";
  } catch (error) {
    return responseText.slice(0, 220);
  }
}

function publicErrorMessage(error) {
  if (error.code === "missing_api_key") {
    return "The server is missing AI_API_KEY. Add it to .env and restart the app.";
  }

  if (error.code === "provider_error") {
    return `The AI provider returned an error: ${error.message}`;
  }

  return error.message || "Something went wrong while generating the trip plan.";
}

function statusForCode(code) {
  if (code === "timeout") {
    return 504;
  }

  if (code === "malformed_json" || code === "wrong_shape" || code === "empty_output") {
    return 502;
  }

  return 500;
}

function loadLocalEnv() {
  const envPath = path.join(root, ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
