import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Compass,
  FileText,
  GripVertical,
  Landmark,
  Luggage,
  MapPin,
  Moon,
  Navigation,
  Plane,
  Play,
  RefreshCcw,
  Route,
  Save,
  Sparkles,
  Sun,
  Trash2,
  Utensils,
  Wallet,
  X,
} from "lucide-react";
import { sampleTripPlan } from "./sampleTripPlan.js";

const STORAGE_KEY = "trip-planner:sessions";
const THEME_KEY = "trip-planner:theme";
const PROMPT_EXAMPLES = [
  {
    label: "Tokyo Food Week",
    text: "5 days in Tokyo, food markets, design shops, one museum day, medium budget, staying near Shinjuku, not too many early mornings.",
  },
  {
    label: "Family Europe",
    text: "7 days in Paris and Amsterdam with parents, easy pace, classic landmarks, good cafes, avoid long walks, mid-range hotels.",
  },
  {
    label: "Goa Reset",
    text: "3 days in Goa, relaxed beaches, seafood, one heritage walk, scooter-friendly, budget conscious, no packed schedule.",
  },
];
const CATEGORY_ICONS = {
  food: Utensils,
  dinner: Utensils,
  lunch: Utensils,
  cafe: Utensils,
  museum: Landmark,
  temple: Landmark,
  shrine: Landmark,
  garden: Landmark,
  nature: Camera,
  walk: Navigation,
  transit: Route,
  logistics: Luggage,
};

export default function App() {
  const [input, setInput] = useState("");
  const [tripPlan, setTripPlan] = useState(null);
  const [focusedDayId, setFocusedDayId] = useState("");
  const [expandedStopIds, setExpandedStopIds] = useState(() => new Set());
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [slowNotice, setSlowNotice] = useState(false);
  const [savedTrips, setSavedTrips] = useState(loadSavedTrips);
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "light");
  const [saveStatus, setSaveStatus] = useState("");
  const [draggingStopId, setDraggingStopId] = useState("");
  const [briefOpen, setBriefOpen] = useState(false);
  const requestRef = useRef({ id: 0, controller: null });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!saveStatus) {
      return undefined;
    }

    const timer = window.setTimeout(() => setSaveStatus(""), 2200);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") {
        setBriefOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  const focusedDay = useMemo(() => {
    if (!tripPlan) {
      return null;
    }

    return tripPlan.days.find((day) => day.id === focusedDayId) || tripPlan.days[0];
  }, [focusedDayId, tripPlan]);

  const totals = useMemo(() => {
    const days = tripPlan?.days || [];
    return {
      days: days.length,
      stops: days.reduce((count, day) => count + day.stops.length, 0),
      bookings: days.reduce(
        (count, day) => count + day.stops.filter((stop) => stop.bookingNeeded).length,
        0
      ),
    };
  }, [tripPlan]);
  const selectedStop = focusedDay?.stops.find((stop) => expandedStopIds.has(stop.id)) || focusedDay?.stops[0];

  async function generateTripPlan() {
    const tripRequest = input.trim();

    if (!tripRequest) {
      setError({
        title: "Add trip details",
        message: "Describe the destination, dates, pace, interests, or budget first.",
      });
      setPhase("error");
      return;
    }

    requestRef.current.controller?.abort();

    const requestId = requestRef.current.id + 1;
    const controller = new AbortController();
    requestRef.current = { id: requestId, controller };

    setPhase("loading");
    setError(null);
    setWarnings([]);
    setSlowNotice(false);

    const slowTimer = window.setTimeout(() => {
      if (requestRef.current.id === requestId) {
        setSlowNotice(true);
      }
    }, 9000);

    const timeoutTimer = window.setTimeout(() => {
      if (requestRef.current.id === requestId) {
        controller.abort();
      }
    }, 45000);

    try {
      const response = await fetch("/api/generate-trip-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: tripRequest }),
        signal: controller.signal,
      });
      const payload = await readJson(response);

      if (requestRef.current.id !== requestId) {
        return;
      }

      if (!response.ok || !payload.ok) {
        throw new Error(payload?.error?.message || "The trip plan could not be generated.");
      }

      openTripPlan(payload.tripPlan);
      setWarnings(payload.warnings || []);
      setPhase("ready");
    } catch (requestError) {
      if (requestRef.current.id !== requestId) {
        return;
      }

      setPhase("error");
      setError({
        title: requestError.name === "AbortError" ? "Request timed out" : "Generation failed",
        message:
          requestError.name === "AbortError"
            ? "The model took too long. Try again with a shorter trip request."
            : requestError.message,
      });
    } finally {
      window.clearTimeout(slowTimer);
      window.clearTimeout(timeoutTimer);
      if (requestRef.current.id === requestId) {
        requestRef.current.controller = null;
        setSlowNotice(false);
      }
    }
  }

  function openTripPlan(plan) {
    setTripPlan(plan);
    setFocusedDayId(plan.days[0]?.id || "");
    setExpandedStopIds(new Set(plan.days[0]?.stops[0] ? [plan.days[0].stops[0].id] : []));
    setError(null);
  }

  function loadSample() {
    requestRef.current.controller?.abort();
    setInput("3 days in Kyoto, culture and food, medium budget, first-time visitor, easy train access.");
    openTripPlan(sampleTripPlan);
    setWarnings([]);
    setPhase("ready");
  }

  function applyPromptExample(exampleText) {
    setInput(exampleText);
    setError(null);
  }

  function jumpTo(sectionId) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function saveTrip() {
    if (!tripPlan) {
      return;
    }

    const session = {
      ...tripPlan,
      savedAt: new Date().toISOString(),
    };
    const nextTrips = [
      session,
      ...savedTrips.filter((saved) => saved.id !== tripPlan.id && saved.title !== tripPlan.title),
    ].slice(0, 6);

    setSavedTrips(nextTrips);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTrips));
    setSaveStatus("Itinerary saved");
  }

  function restoreTrip(session) {
    requestRef.current.controller?.abort();
    openTripPlan(session);
    setWarnings([]);
    setPhase("ready");
    setSaveStatus("Itinerary opened");
  }

  function deleteTrip(sessionId) {
    const nextTrips = savedTrips.filter((session) => session.id !== sessionId);
    setSavedTrips(nextTrips);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTrips));
    setSaveStatus("Saved itinerary removed");
  }

  function toggleStop(stopId) {
    setExpandedStopIds((current) => {
      const next = new Set(current);
      if (next.has(stopId)) {
        next.delete(stopId);
      } else {
        next.add(stopId);
      }
      return next;
    });
  }

  function removeStop(dayId, stopId) {
    setTripPlan((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        days: current.days.map((day) =>
          day.id === dayId ? { ...day, stops: day.stops.filter((stop) => stop.id !== stopId) } : day
        ),
      };
    });

    setExpandedStopIds((current) => {
      const next = new Set(current);
      next.delete(stopId);
      return next;
    });
  }

  function moveStop(dayId, stopId, direction) {
    setTripPlan((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        days: current.days.map((day) => {
          if (day.id !== dayId) {
            return day;
          }

          const index = day.stops.findIndex((stop) => stop.id === stopId);
          const nextIndex = index + direction;
          if (index === -1 || nextIndex < 0 || nextIndex >= day.stops.length) {
            return day;
          }

          const stops = [...day.stops];
          const [movedStop] = stops.splice(index, 1);
          stops.splice(nextIndex, 0, movedStop);
          return { ...day, stops };
        }),
      };
    });
  }

  function reorderStop(dayId, sourceStopId, targetStopId) {
    if (!sourceStopId || sourceStopId === targetStopId) {
      return;
    }

    setTripPlan((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        days: current.days.map((day) => {
          if (day.id !== dayId) {
            return day;
          }

          const fromIndex = day.stops.findIndex((stop) => stop.id === sourceStopId);
          const toIndex = day.stops.findIndex((stop) => stop.id === targetStopId);

          if (fromIndex === -1 || toIndex === -1) {
            return day;
          }

          const stops = [...day.stops];
          const [movedStop] = stops.splice(fromIndex, 1);
          stops.splice(toIndex, 0, movedStop);
          return { ...day, stops };
        }),
      };
    });
  }

  return (
    <main className={`app-shell ${tripPlan ? "has-plan" : ""}`}>
      {saveStatus && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {saveStatus}
        </div>
      )}

      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Plane size={22} />
          </div>
          <div>
            <h1>Trip Planner</h1>
            <p>Structured itineraries from free-form travel ideas.</p>
          </div>
        </div>
        <nav className="topnav" aria-label="Page sections">
          <button type="button" onClick={() => jumpTo("planner-input")}>
            Plan
          </button>
          <button type="button" onClick={() => jumpTo("itinerary")}>
            Itinerary
          </button>
          <button type="button" onClick={() => jumpTo("saved-trips")}>
            Saved
          </button>
        </nav>
        <div className="topbar-actions">
          <button className="primary-button compact-cta" type="button" onClick={() => jumpTo("planner-input")}>
            <Sparkles size={17} />
            Start
          </button>
          <button
            className="icon-button"
            type="button"
            title={theme === "dark" ? "Use light mode" : "Use dark mode"}
            aria-label={theme === "dark" ? "Use light mode" : "Use dark mode"}
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <section className="layout-grid">
        <aside className="composer-panel" id="planner-input" aria-label="Create a trip plan">
          <ComposerShowcase />

          <div className="panel-heading">
            <div>
              <span className="eyebrow">Input</span>
              <h2>Trip request</h2>
            </div>
            <span className="count">{input.trim().length}/7000</span>
          </div>

          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={7000}
            placeholder="Example: 4 days in Lisbon in October, food and viewpoints, medium budget, traveling with parents, avoid packed mornings."
            aria-label="Trip request"
          />

          <PromptExamples examples={PROMPT_EXAMPLES} onUse={applyPromptExample} />

          <div className="button-row">
            <button className="primary-button" type="button" onClick={generateTripPlan} disabled={phase === "loading"}>
              {phase === "loading" ? <RefreshCcw className="spin" size={18} /> : <Sparkles size={18} />}
              {phase === "loading" ? "Planning" : "Generate"}
            </button>
            <button className="secondary-button" type="button" onClick={loadSample}>
              <Play size={18} />
              Sample
            </button>
          </div>

          {slowNotice && (
            <div className="notice">
              <RefreshCcw className="spin" size={17} />
              Still waiting on the model.
            </div>
          )}

          {error && (
            <ErrorBanner
              title={error.title}
              message={error.message}
              onRetry={input.trim() ? generateTripPlan : null}
            />
          )}

          {warnings.length > 0 && (
            <div className="warning-list" role="status">
              {warnings.map((warning) => (
                <p key={warning}>
                  <AlertTriangle size={16} />
                  {warning}
                </p>
              ))}
            </div>
          )}

          <SavedTrips sessions={savedTrips} onRestore={restoreTrip} onDelete={deleteTrip} />
        </aside>

        <section className="workspace-panel" id="itinerary" aria-label="Trip workspace">
          {phase === "loading" && <LoadingState />}
          {phase !== "loading" && !tripPlan && <EmptyState onSample={loadSample} />}
          {phase !== "loading" && tripPlan && focusedDay && (
            <>
              <TripHero
                tripPlan={tripPlan}
                focusedDay={focusedDay}
                selectedStop={selectedStop}
                totals={totals}
                onSave={saveTrip}
                onOpenBrief={() => setBriefOpen(true)}
              />
              <ItineraryView
                days={tripPlan.days}
                focusedDay={focusedDay}
                focusedDayId={focusedDay.id}
                expandedStopIds={expandedStopIds}
                draggingStopId={draggingStopId}
                onFocusDay={setFocusedDayId}
                onToggleStop={toggleStop}
                onRemoveStop={removeStop}
                onMoveStop={moveStop}
                onDragStart={setDraggingStopId}
                onDragEnd={() => setDraggingStopId("")}
                onDropStop={(targetStopId) => {
                  reorderStop(focusedDay.id, draggingStopId, targetStopId);
                  setDraggingStopId("");
                }}
              />
            </>
          )}
        </section>
      </section>

      {briefOpen && tripPlan && (
        <TripBriefModal tripPlan={tripPlan} totals={totals} onClose={() => setBriefOpen(false)} />
      )}
    </main>
  );
}

function ComposerShowcase() {
  return (
    <div className="composer-hero">
      <div className="composer-copy">
        <span className="eyebrow">AI itinerary builder</span>
        <h2>Turn a rough travel idea into a route that feels ready to use.</h2>
        <p>Balanced days, clear timings, and edit-ready stops from a single travel brief.</p>
      </div>

      <div className="showcase-card" aria-hidden="true">
        <img
          src="https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=900&q=80"
          alt=""
          loading="lazy"
        />
        <div className="showcase-overlay">
          <span>Smart route</span>
          <strong>Kyoto</strong>
        </div>
        <div className="floating-route-note">
          <Route size={16} />
          3 days - 9 stops
        </div>
      </div>

      <div className="feature-pills" aria-label="Planner strengths">
        <span>
          <Sparkles size={15} />
          JSON checked
        </span>
        <span>
          <Navigation size={15} />
          Reorder stops
        </span>
        <span>
          <Save size={15} />
          Save locally
        </span>
      </div>
    </div>
  );
}

function PromptExamples({ examples, onUse }) {
  return (
    <div className="prompt-examples" aria-label="Trip request examples">
      {examples.map((example) => (
        <button key={example.label} type="button" onClick={() => onUse(example.text)}>
          {example.label}
        </button>
      ))}
    </div>
  );
}

function TripHero({ tripPlan, focusedDay, selectedStop, totals, onSave, onOpenBrief }) {
  return (
    <div className="trip-hero">
      <div className="trip-header">
        <div>
          <span className="eyebrow">Itinerary</span>
          <h2>{tripPlan.title}</h2>
          <p>{tripPlan.summary}</p>
        </div>
        <div className="trip-actions">
          <button className="secondary-button" type="button" onClick={onOpenBrief}>
            <FileText size={18} />
            Brief
          </button>
          <button className="icon-button" type="button" title="Save trip" aria-label="Save trip" onClick={onSave}>
            <Save size={18} />
          </button>
        </div>
        <div className="focus-strip" aria-label="Current plan focus">
          <div>
            <span>Travel style</span>
            <strong>{tripPlan.travelStyle}</strong>
          </div>
          <div>
            <span>Current day</span>
            <strong>{focusedDay.title}</strong>
          </div>
          <div>
            <span>Next highlight</span>
            <strong>{selectedStop?.title || "Pick a stop"}</strong>
          </div>
        </div>
        <div className="stats-strip" aria-label="Trip summary">
          <span>
            <MapPin size={15} />
            {tripPlan.destination}
          </span>
          <span>
            <CalendarDays size={15} />
            {totals.days} days
          </span>
          <span>
            <Route size={15} />
            {totals.stops} stops
          </span>
          <span>
            <CheckCircle2 size={15} />
            {totals.bookings} bookings
          </span>
        </div>
      </div>
      <div className="hero-side-stack">
        <DestinationPoster tripPlan={tripPlan} selectedStop={selectedStop} />
        <RoutePreview day={focusedDay} />
      </div>
    </div>
  );
}

function DestinationPoster({ tripPlan, selectedStop }) {
  return (
    <aside className="destination-poster" aria-label="Destination visual summary">
      <img
        src="https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=900&q=80"
        alt=""
        loading="lazy"
      />
      <div className="poster-scrim" />
      <div className="poster-content">
        <span>{tripPlan.destination}</span>
        <strong>{selectedStop?.title || tripPlan.travelStyle}</strong>
        <p>{selectedStop?.location || "A visual route board for the active itinerary."}</p>
      </div>
    </aside>
  );
}

function RoutePreview({ day }) {
  const visibleStops = day.stops.slice(0, 5);

  return (
    <aside className="route-preview" aria-label={`${day.dateLabel} route preview`}>
      <div className="route-preview-heading">
        <span className="eyebrow">Route</span>
        <strong>{day.dateLabel}</strong>
      </div>
      <div className="route-map">
        {visibleStops.map((stop, index) => (
          <div className="route-node" key={stop.id} style={{ "--node-delay": `${index * 90}ms` }}>
            <span>{index + 1}</span>
            <p>{stop.title}</p>
          </div>
        ))}
      </div>
      <div className="route-foot">
        <span>
          <Navigation size={15} />
          {day.stops.length} stops
        </span>
        <span>
          <Compass size={15} />
          {day.theme || "Balanced route"}
        </span>
      </div>
    </aside>
  );
}

function ItineraryView({
  days,
  focusedDay,
  focusedDayId,
  expandedStopIds,
  draggingStopId,
  onFocusDay,
  onToggleStop,
  onRemoveStop,
  onMoveStop,
  onDragStart,
  onDragEnd,
  onDropStop,
}) {
  const dayStats = summarizeDay(focusedDay);

  return (
    <div className="itinerary-view">
      <div className="day-tabs" aria-label="Itinerary days">
        {days.map((day) => (
          <button
            key={day.id}
            type="button"
            className={focusedDayId === day.id ? "active" : ""}
            onClick={() => onFocusDay(day.id)}
            aria-pressed={focusedDayId === day.id}
          >
            <span>{day.dateLabel}</span>
            <strong>{day.stops.length}</strong>
          </button>
        ))}
      </div>

      <section className="day-panel" key={focusedDay.id}>
        <div className="day-heading">
          <div>
            <span className="eyebrow">{focusedDay.dateLabel}</span>
            <h3>{focusedDay.title}</h3>
            {focusedDay.theme && <p>{focusedDay.theme}</p>}
          </div>
          {focusedDay.notes && <p className="day-note">{focusedDay.notes}</p>}
        </div>

        <div className="day-insights" aria-label={`${focusedDay.dateLabel} summary`}>
          <span>
            <Clock3 size={16} />
            {dayStats.start}
          </span>
          <span>
            <Luggage size={16} />
            {dayStats.bookings} bookings
          </span>
          <span>
            <Wallet size={16} />
            {dayStats.cost}
          </span>
        </div>

        {focusedDay.stops.length === 0 ? (
          <div className="empty-mini">
            <Route size={30} />
            <h3>No stops left for this day</h3>
          </div>
        ) : (
          <div className="stop-list">
            {focusedDay.stops.map((stop, index) => (
              <StopItem
                key={stop.id}
                dayId={focusedDay.id}
                stop={stop}
                index={index}
                totalStops={focusedDay.stops.length}
                expanded={expandedStopIds.has(stop.id)}
                dragging={draggingStopId === stop.id}
                onToggle={() => onToggleStop(stop.id)}
                onRemove={() => onRemoveStop(focusedDay.id, stop.id)}
                onMove={(direction) => onMoveStop(focusedDay.id, stop.id, direction)}
                onDragStart={() => onDragStart(stop.id)}
                onDragEnd={onDragEnd}
                onDrop={() => onDropStop(stop.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StopItem({
  stop,
  index,
  totalStops,
  expanded,
  dragging,
  onToggle,
  onRemove,
  onMove,
  onDragStart,
  onDragEnd,
  onDrop,
}) {
  const CategoryIcon = getCategoryIcon(stop.category);

  return (
    <article
      className={`stop-card ${expanded ? "expanded" : ""} ${dragging ? "dragging" : ""}`}
      style={{ "--stop-delay": `${index * 45}ms` }}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <div className="timeline-marker" aria-hidden="true">
        <span>{index + 1}</span>
      </div>

      <button className="stop-main" type="button" onClick={onToggle} aria-expanded={expanded}>
        <div className="stop-title-row">
          <span className="time-pill">
            <Clock3 size={15} />
            {stop.time}
          </span>
          <span className="category-pill">
            <CategoryIcon size={15} />
            {stop.category}
          </span>
          {stop.bookingNeeded && <span className="booking-pill">Book</span>}
        </div>
        <h4>{stop.title}</h4>
        {stop.location && (
          <p className="stop-location">
            <MapPin size={15} />
            {stop.location}
          </p>
        )}
      </button>

      <div className="stop-controls" aria-label={`${stop.title} controls`}>
        <span className="drag-handle" title="Drag stop" aria-hidden="true">
          <GripVertical size={16} />
        </span>
        <button
          className="icon-button subtle"
          type="button"
          title="Move stop up"
          aria-label={`Move ${stop.title} up`}
          onClick={() => onMove(-1)}
          disabled={index === 0}
        >
          <ArrowUp size={16} />
        </button>
        <button
          className="icon-button subtle"
          type="button"
          title="Move stop down"
          aria-label={`Move ${stop.title} down`}
          onClick={() => onMove(1)}
          disabled={index === totalStops - 1}
        >
          <ArrowDown size={16} />
        </button>
        <button
          className="icon-button subtle"
          type="button"
          title={expanded ? "Collapse stop" : "Expand stop"}
          aria-label={expanded ? `Collapse ${stop.title}` : `Expand ${stop.title}`}
          onClick={onToggle}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <button
          className="icon-button subtle danger-icon"
          type="button"
          title="Remove stop"
          aria-label={`Remove ${stop.title}`}
          onClick={onRemove}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {expanded && (
        <div className="stop-details">
          <p>{stop.description}</p>
          <div className="detail-grid">
            {stop.duration && (
              <span>
                <Clock3 size={15} />
                {stop.duration}
              </span>
            )}
            {stop.cost && <span>{stop.cost}</span>}
          </div>
          {stop.tips.length > 0 && (
            <ul>
              {stop.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

function getCategoryIcon(category) {
  const key = String(category || "").toLowerCase();
  return (
    Object.entries(CATEGORY_ICONS).find(([name]) => key.includes(name))?.[1] ||
    MapPin
  );
}

function SavedTrips({ sessions, onRestore, onDelete }) {
  return (
    <div className="saved-panel" id="saved-trips">
      <div className="panel-heading compact">
        <h2>Saved</h2>
        <span>{sessions.length}</span>
      </div>
      {sessions.length === 0 ? (
        <p className="muted">Saved itineraries appear here.</p>
      ) : (
        <div className="saved-list">
          {sessions.map((session) => (
            <div className="saved-item" key={session.id}>
              <button type="button" onClick={() => onRestore(session)}>
                <strong>{session.title}</strong>
                <span>
                  {session.destination} - {session.days.length} days
                </span>
              </button>
              <button
                className="icon-button subtle"
                type="button"
                title="Delete saved trip"
                aria-label={`Delete ${session.title}`}
                onClick={() => onDelete(session.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorBanner({ title, message, onRetry }) {
  return (
    <div className="error-banner" role="alert">
      <AlertTriangle size={18} />
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {onRetry && (
        <button className="secondary-button small" type="button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading-state" aria-live="polite">
      <div className="loading-orbit">
        <Plane size={34} />
      </div>
      <h2>Building your itinerary</h2>
      <p>Grouping stops by day, checking the shape, and preparing the route.</p>
      <div className="loading-route" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function EmptyState({ onSample }) {
  return (
    <div className="empty-state">
      <div className="empty-card">
        <div className="empty-icon">
          <Route size={34} />
        </div>
        <h2>Ready for a destination.</h2>
        <p>Generate a trip plan or open the sample itinerary.</p>
        <button className="primary-button" type="button" onClick={onSample}>
          <Play size={18} />
          Explore sample
        </button>
      </div>
    </div>
  );
}

function TripBriefModal({ tripPlan, totals, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-brief-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">Trip brief</span>
            <h2 id="trip-brief-title">{tripPlan.title}</h2>
          </div>
          <button className="icon-button" type="button" title="Close brief" aria-label="Close brief" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p className="modal-summary">{tripPlan.summary}</p>

        <div className="modal-stat-grid">
          <span>
            <MapPin size={16} />
            {tripPlan.destination}
          </span>
          <span>
            <Compass size={16} />
            {tripPlan.travelStyle}
          </span>
          <span>
            <CalendarDays size={16} />
            {totals.days} days
          </span>
          <span>
            <Route size={16} />
            {totals.stops} stops
          </span>
        </div>

        <div className="brief-days">
          {tripPlan.days.map((day) => (
            <article key={day.id}>
              <strong>{day.dateLabel}</strong>
              <span>{day.title}</span>
              <p>{day.theme || day.notes || `${day.stops.length} planned stops`}</p>
            </article>
          ))}
        </div>

        <div className="modal-actions">
          <button className="primary-button" type="button" onClick={onClose}>
            <CheckCircle2 size={18} />
            Done
          </button>
        </div>
      </section>
    </div>
  );
}

function summarizeDay(day) {
  const firstTimedStop = day.stops.find((stop) => stop.time && stop.time !== "Flexible");
  const bookings = day.stops.filter((stop) => stop.bookingNeeded).length;
  const costs = day.stops.map((stop) => stop.cost).filter(Boolean);
  const paidStops = costs.filter((cost) => cost !== "Free").length;

  return {
    start: firstTimedStop?.time ? `Starts ${firstTimedStop.time}` : "Flexible start",
    bookings,
    cost: paidStops === 0 ? "Mostly free" : `${paidStops} paid stops`,
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return {
      ok: false,
      error: {
        message: response.ok
          ? "The server returned an empty response."
          : "The server returned an unreadable error.",
      },
    };
  }
}

function loadSavedTrips() {
  try {
    const sessions = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(sessions) ? sessions : [];
  } catch (error) {
    return [];
  }
}
