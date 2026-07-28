import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import {
  createTripPlanResponse,
  publicErrorMessage,
  statusForCode,
} from "./tripPlanService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

loadLocalEnv();

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "32kb" }));

app.post("/api/generate-trip-plan", async (request, response) => {
  try {
    const result = await createTripPlanResponse(request.body?.input);
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
