import {
  createTripPlanResponse,
  publicErrorMessage,
  statusForCode,
} from "../server/tripPlanService.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({
      ok: false,
      error: {
        code: "method_not_allowed",
        message: "Use POST to generate a trip plan.",
      },
    });
  }

  try {
    const body = readBody(request.body);
    const result = await createTripPlanResponse(body?.input);
    return response.status(200).json({ ok: true, ...result });
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
}

function readBody(body) {
  if (typeof body !== "string") {
    return body;
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    return {};
  }
}
