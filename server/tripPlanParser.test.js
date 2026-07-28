import assert from "node:assert/strict";
import test from "node:test";
import { extractJson, normalizeTripPlan, TripPlanError } from "./tripPlanParser.js";

test("extracts JSON from fenced model output", () => {
  const raw = "```json\n{\"destination\":\"Tokyo\",\"days\":[]}\n```";
  assert.deepEqual(extractJson(raw), { destination: "Tokyo", days: [] });
});

test("normalizes day-by-day itineraries", () => {
  const { tripPlan } = normalizeTripPlan({
    title: "Lisbon Long Weekend",
    destination: "Lisbon",
    days: [
      {
        day: "Day 1",
        theme: "Arrival and viewpoints",
        activities: [
          {
            name: "Miradouro da Senhora do Monte",
            when: "5:00 PM",
            area: "Graca",
            length: "45 min",
            details: "Catch sunset over the city.",
            tips: ["Bring a light jacket."],
          },
        ],
      },
    ],
  });

  assert.equal(tripPlan.destination, "Lisbon");
  assert.equal(tripPlan.days.length, 1);
  assert.equal(tripPlan.days[0].stops[0].title, "Miradouro da Senhora do Monte");
});

test("repairs ungrouped stops into a single day", () => {
  const { tripPlan, warnings } = normalizeTripPlan({
    destination: "Kyoto",
    stops: [
      { title: "Fushimi Inari", description: "Walk the lower shrine loop." },
      { title: "Nishiki Market", description: "Snack crawl." },
    ],
  });

  assert.equal(tripPlan.days.length, 1);
  assert.equal(tripPlan.days[0].stops.length, 2);
  assert.equal(warnings.length, 1);
});

test("throws a typed error for malformed JSON", () => {
  assert.throws(() => extractJson("not json"), TripPlanError);
});
