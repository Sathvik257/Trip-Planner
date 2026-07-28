import assert from "node:assert/strict";
import test from "node:test";
import { createTripPlanResponse } from "./tripPlanService.js";

test("creates a demo itinerary when AI_API_KEY is missing", async () => {
  const originalKey = process.env.AI_API_KEY;
  const originalDisableFallback = process.env.AI_DISABLE_DEMO_FALLBACK;
  delete process.env.AI_API_KEY;
  delete process.env.AI_DISABLE_DEMO_FALLBACK;

  try {
    const result = await createTripPlanResponse(
      "Plan a 4-day trip to Singapore for street food, skyline views, gardens, and shopping."
    );

    assert.equal(result.tripPlan.destination, "Singapore");
    assert.equal(result.tripPlan.days.length, 4);
    assert.ok(result.tripPlan.days[0].stops.length >= 3);
    assert.equal(result.warnings.length, 1);
  } finally {
    if (originalKey === undefined) {
      delete process.env.AI_API_KEY;
    } else {
      process.env.AI_API_KEY = originalKey;
    }

    if (originalDisableFallback === undefined) {
      delete process.env.AI_DISABLE_DEMO_FALLBACK;
    } else {
      process.env.AI_DISABLE_DEMO_FALLBACK = originalDisableFallback;
    }
  }
});

test("still rejects empty input before demo fallback", async () => {
  await assert.rejects(() => createTripPlanResponse("   "), {
    code: "empty_input",
    statusCode: 400,
  });
});
