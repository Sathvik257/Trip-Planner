import { extractJson, normalizeTripPlan, TripPlanError } from "./tripPlanParser.js";

export async function createTripPlanResponse(input) {
  const cleanInput = typeof input === "string" ? input.trim() : "";

  if (!cleanInput) {
    const error = new Error("Describe your trip before generating an itinerary.");
    error.code = "empty_input";
    error.statusCode = 400;
    throw error;
  }

  if (cleanInput.length > 7000) {
    const error = new Error("Please shorten the trip request to under 7,000 characters.");
    error.code = "input_too_large";
    error.statusCode = 413;
    throw error;
  }

  if (!process.env.AI_API_KEY && process.env.AI_DISABLE_DEMO_FALLBACK !== "true") {
    return createDemoTripPlan(cleanInput);
  }

  return generateTripPlan(cleanInput);
}

export async function generateTripPlan(input) {
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

export function publicErrorMessage(error) {
  if (error.code === "missing_api_key") {
    return "The server is missing AI_API_KEY. Add it as a deployment environment variable and redeploy.";
  }

  if (error.code === "provider_error") {
    return `The AI provider returned an error: ${error.message}`;
  }

  return error.message || "Something went wrong while generating the trip plan.";
}

export function statusForCode(code) {
  if (code === "empty_input") {
    return 400;
  }

  if (code === "input_too_large") {
    return 413;
  }

  if (code === "timeout") {
    return 504;
  }

  if (code === "malformed_json" || code === "wrong_shape" || code === "empty_output") {
    return 502;
  }

  return 500;
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

function createDemoTripPlan(input) {
  const dayCount = detectDayCount(input);
  const destination = detectDestination(input);
  const interests = detectInterests(input);
  const days = Array.from({ length: dayCount }, (_value, dayIndex) =>
    createDemoDay(destination, interests, dayIndex)
  );

  return {
    tripPlan: {
      id: `demo-${Date.now().toString(36)}`,
      title: `${destination} Smart Itinerary`,
      destination,
      summary: `A demo ${dayCount}-day itinerary shaped from your request. Add an API key for fully AI-generated plans.`,
      travelStyle: detectTravelStyle(input),
      createdAt: new Date().toISOString(),
      days,
    },
    warnings: [
      "Demo itinerary generated because AI_API_KEY is not configured. Add an API key for real AI-generated plans.",
    ],
  };
}

function detectDayCount(input) {
  const match = input.match(/\b([1-9]|10)\s*[- ]?\s*day/i);
  const parsed = match ? Number(match[1]) : 3;
  return Math.min(Math.max(parsed || 3, 1), 7);
}

function detectDestination(input) {
  const destinationMatch = input.match(/\b(?:to|in|for)\s+([a-z][a-z\s.'-]{1,42}?)(?:,|\s+for\s+|\s+with\s+|\s+in\s+|\s+during\s+|\s+on\s+|$)/i);
  const destination = destinationMatch?.[1]?.trim();

  if (!destination) {
    return "Your Destination";
  }

  return toTitleCase(destination.replace(/\b\d+\s*[- ]?\s*day\b/gi, "").trim()) || "Your Destination";
}

function detectTravelStyle(input) {
  const lowerInput = input.toLowerCase();

  if (lowerInput.includes("luxury")) {
    return "Luxury";
  }

  if (lowerInput.includes("budget")) {
    return "Budget friendly";
  }

  if (lowerInput.includes("family") || lowerInput.includes("parents") || lowerInput.includes("kids")) {
    return "Family friendly";
  }

  if (lowerInput.includes("relaxed") || lowerInput.includes("slow") || lowerInput.includes("easy")) {
    return "Relaxed pace";
  }

  if (lowerInput.includes("food") || lowerInput.includes("street food") || lowerInput.includes("restaurants")) {
    return "Food and culture";
  }

  return "Balanced";
}

function detectInterests(input) {
  const lowerInput = input.toLowerCase();
  const interests = [];

  const interestMap = [
    ["food", "Food"],
    ["street food", "Food"],
    ["restaurant", "Food"],
    ["temple", "Temple"],
    ["museum", "Museum"],
    ["garden", "Garden"],
    ["shopping", "Shopping"],
    ["market", "Market"],
    ["beach", "Beach"],
    ["nature", "Nature"],
    ["view", "Viewpoint"],
    ["skyline", "Viewpoint"],
    ["anime", "Shopping"],
    ["heritage", "Culture"],
    ["culture", "Culture"],
  ];

  for (const [needle, label] of interestMap) {
    if (lowerInput.includes(needle) && !interests.includes(label)) {
      interests.push(label);
    }
  }

  return interests.length > 0 ? interests : ["Culture", "Food", "Viewpoint"];
}

function createDemoDay(destination, interests, dayIndex) {
  const dayNumber = dayIndex + 1;
  const theme = buildDayTheme(interests, dayIndex);

  return {
    id: `day-${dayNumber}`,
    dateLabel: `Day ${dayNumber}`,
    title: `${theme} In ${destination}`,
    theme: `A balanced ${theme.toLowerCase()} day with realistic pacing and simple navigation.`,
    notes: "This is a demo plan. Add an API key to generate destination-specific live AI details.",
    stops: createDemoStops(destination, interests, dayIndex),
  };
}

function buildDayTheme(interests, dayIndex) {
  const first = interests[dayIndex % interests.length];
  const second = interests[(dayIndex + 1) % interests.length];
  return first === second ? first : `${first} And ${second}`;
}

function createDemoStops(destination, interests, dayIndex) {
  const focus = interests[dayIndex % interests.length];
  const secondary = interests[(dayIndex + 1) % interests.length];
  const dayNumber = dayIndex + 1;

  return [
    {
      id: `day-${dayNumber}-stop-1`,
      time: "9:30 AM",
      title: `${destination} ${focus} District`,
      location: "Central area",
      duration: "2 hr",
      category: focus,
      description: `Start with an easy-paced ${focus.toLowerCase()} stop that anchors the day and keeps travel time manageable.`,
      tips: ["Start after peak commute.", "Keep tickets and map links ready."],
      cost: "$$",
      bookingNeeded: focus === "Museum" || focus === "Temple",
    },
    {
      id: `day-${dayNumber}-stop-2`,
      time: "12:30 PM",
      title: "Local Lunch Stop",
      location: "Nearby neighborhood",
      duration: "75 min",
      category: "Food",
      description: "Build in a relaxed meal break close to the morning activity so the itinerary does not feel rushed.",
      tips: ["Save one backup restaurant.", "Check opening hours before leaving."],
      cost: "$$",
      bookingNeeded: false,
    },
    {
      id: `day-${dayNumber}-stop-3`,
      time: "3:00 PM",
      title: `${secondary} Walk`,
      location: "Walkable route",
      duration: "90 min",
      category: secondary,
      description: `Use the afternoon for ${secondary.toLowerCase()} time with room to pause, browse, and adjust on the go.`,
      tips: ["Keep this stop flexible.", "Move it earlier if weather changes."],
      cost: secondary === "Shopping" ? "$$" : "$",
      bookingNeeded: false,
    },
    {
      id: `day-${dayNumber}-stop-4`,
      time: "6:30 PM",
      title: "Sunset And Dinner Area",
      location: "Scenic evening zone",
      duration: "2 hr",
      category: "Dinner",
      description: "End near a lively but low-stress evening area with dinner options and an easy route back.",
      tips: ["Reserve dinner for weekends.", "Check return transport before late evening."],
      cost: "$$",
      bookingNeeded: false,
    },
  ];
}

function toTitleCase(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}
