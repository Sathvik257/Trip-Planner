export class TripPlanError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TripPlanError";
    this.code = code;
  }
}

export function extractJson(modelContent) {
  if (modelContent && typeof modelContent === "object") {
    return modelContent;
  }

  if (typeof modelContent !== "string" || modelContent.trim().length === 0) {
    throw new TripPlanError("empty_output", "The model returned an empty response.");
  }

  const trimmed = modelContent.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : sliceToJsonObject(trimmed);

  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new TripPlanError("malformed_json", "The model returned text that could not be parsed as JSON.");
  }
}

export function normalizeTripPlan(raw) {
  const source = unwrapRoot(raw);
  const warnings = [];
  const rawDays = firstArray(source.days, source.itinerary, source.plan, source.schedule);

  let normalizedDays = [];

  if (rawDays) {
    normalizedDays = rawDays.map((day, index) => normalizeDay(day, index)).filter(Boolean);
  } else {
    const rawStops = firstArray(source.stops, source.activities, source.places);
    if (rawStops) {
      normalizedDays = [
        normalizeDay(
          {
            id: "day-1",
            title: "Day 1",
            stops: rawStops,
          },
          0
        ),
      ].filter(Boolean);
      warnings.push("Stops were placed into a single day because the AI did not group them by day.");
    }
  }

  normalizedDays = normalizedDays
    .map((day, dayIndex) => ({
      ...day,
      id: day.id || `day-${dayIndex + 1}`,
      stops: day.stops.slice(0, 8),
    }))
    .slice(0, 10);

  const stopCount = normalizedDays.reduce((count, day) => count + day.stops.length, 0);

  if (normalizedDays.length === 0 || stopCount === 0) {
    throw new TripPlanError("wrong_shape", "The model response did not include a usable itinerary.");
  }

  const destination =
    cleanText(source.destination || source.city || source.location || source.region, 72) ||
    "Your Trip";

  return {
    tripPlan: {
      id: createId(source.title || destination),
      title: cleanText(source.title, 80) || `${destination} Itinerary`,
      destination,
      summary:
        cleanText(source.summary || source.overview || source.description, 220) ||
        "A day-by-day itinerary generated from your trip request.",
      travelStyle: cleanText(source.travelStyle || source.style || source.vibe, 44) || "Balanced",
      createdAt: new Date().toISOString(),
      days: normalizedDays,
    },
    warnings,
  };
}

function unwrapRoot(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TripPlanError("wrong_shape", "The model response was not a JSON object.");
  }

  return raw.tripPlan || raw.trip_plan || raw.itinerary || raw.result || raw;
}

function normalizeDay(day, index) {
  if (!day || typeof day !== "object") {
    return null;
  }

  const rawStops = firstArray(day.stops, day.activities, day.items, day.places);
  const stops = rawStops ? rawStops.map((stop, stopIndex) => normalizeStop(stop, index, stopIndex)).filter(Boolean) : [];

  if (stops.length === 0) {
    return null;
  }

  return {
    id: cleanId(day.id) || `day-${index + 1}`,
    title: cleanText(day.title || day.name || `Day ${index + 1}`, 72) || `Day ${index + 1}`,
    dateLabel: cleanText(day.dateLabel || day.date || day.day || `Day ${index + 1}`, 40) || `Day ${index + 1}`,
    theme: cleanText(day.theme || day.focus || day.area, 100),
    notes: cleanText(day.notes || day.summary || day.description, 220),
    stops,
  };
}

function normalizeStop(stop, dayIndex, stopIndex) {
  if (!stop || typeof stop !== "object") {
    return null;
  }

  const title = cleanText(stop.title || stop.name || stop.place || stop.activity, 92);
  const description = cleanText(stop.description || stop.details || stop.why || stop.notes, 300);

  if (!title && !description) {
    return null;
  }

  return {
    id: cleanId(stop.id) || `day-${dayIndex + 1}-stop-${stopIndex + 1}`,
    time: cleanText(stop.time || stop.startTime || stop.when, 24) || "Flexible",
    title: title || "Untitled stop",
    location: cleanText(stop.location || stop.neighborhood || stop.address || stop.area, 90),
    duration: cleanText(stop.duration || stop.length, 36),
    category: cleanText(stop.category || stop.type || stop.kind, 32) || "Stop",
    description: description || "No description provided.",
    tips: normalizeTextList(stop.tips || stop.notesList || stop.advice, 3, 120),
    cost: cleanText(stop.cost || stop.price || stop.budget, 40),
    bookingNeeded: Boolean(stop.bookingNeeded || stop.reservationRequired || stop.booking),
  };
}

function normalizeTextList(value, maxItems, maxLength) {
  if (typeof value === "string") {
    return value
      .split(/[;\n]/)
      .map((item) => cleanText(item, maxLength))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function firstArray(...values) {
  return values.find((value) => Array.isArray(value));
}

function sliceToJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new TripPlanError("malformed_json", "The model response did not contain a JSON object.");
  }

  return text.slice(start, end + 1);
}

function cleanText(value, maxLength) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trim()}...` : cleaned;
}

function cleanId(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
}

function createId(seed) {
  const base = cleanId(seed) || "trip-plan";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${Date.now().toString(36)}-${suffix}`;
}
