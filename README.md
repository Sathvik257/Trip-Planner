# Trip Planner

A polished React app that turns a free-form travel request into a structured, interactive itinerary. The AI returns JSON, the backend validates and normalizes it, and the frontend renders the plan as editable days and stops instead of a chatbot transcript.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Sathvik257/Trip-Planner&env=AI_API_KEY,AI_API_BASE_URL,AI_MODEL,AI_TIMEOUT_MS&envDescription=AI%20provider%20settings%20for%20Trip%20Planner)

## Highlights

- Free-form trip prompt for destinations, dates, pace, budget, interests, and constraints.
- Real LLM integration through a backend route/serverless function, so API keys are not exposed in browser code.
- Demo fallback mode when `AI_API_KEY` is missing, so the hosted app still generates structured itineraries for reviewers.
- Structured itinerary rendering with day tabs, stop cards, day pulse metrics, expandable details, route preview, and a trip brief modal.
- Interactive editing: add custom stops, remove stops, move stops up/down, and drag-and-drop reorder stops within a day.
- Resilient AI handling for malformed JSON, wrong shapes, empty responses, slow requests, provider failures, and stale responses.
- Responsive modern UI with animated route visuals, hover transitions, loading shimmer, save toasts, dark mode, and reduced-motion support.
- Local saved itineraries using browser storage.

## Tech Stack

- React 18 with hooks and functional components
- Vite for frontend bundling
- Express for the backend API route
- Lucide React for icons
- OpenAI-compatible chat completion API
- Node test runner for parser tests

## Getting Started

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Add your AI provider key:

```bash
AI_API_KEY=your_api_key_here
```

Start the app:

```bash
npm start
```

Open:

```text
http://127.0.0.1:3000
```

The sample itinerary and Generate button both work without an API key. Without `AI_API_KEY`, Generate uses a clearly marked demo itinerary fallback. With `AI_API_KEY`, Generate uses the real LLM provider.

## Deploy Online

This project is ready to host on Vercel without running the local Express server.

1. Push or import this repository into Vercel.
2. Use the default build settings:

   ```text
   Framework Preset: Vite
   Build Command: npm run build
   Output Directory: dist
   ```

3. Add these environment variables in the Vercel project settings:

   ```text
   AI_API_KEY=your_api_key_here
   AI_API_BASE_URL=https://api.openai.com/v1
   AI_MODEL=gpt-4o-mini
   AI_TIMEOUT_MS=45000
   AI_DISABLE_DEMO_FALLBACK=false
   AI_APP_TITLE=Trip Planner
   ```

4. Deploy.

The hosted app uses `api/generate-trip-plan.js` as the serverless AI endpoint. The browser calls `/api/generate-trip-plan`, and the API key stays in the hosting environment, not in the frontend bundle. If `AI_API_KEY` is not configured, the endpoint returns a demo itinerary with a warning instead of failing.

GitHub Pages is not recommended for the full AI version because it only hosts static files and cannot run the serverless API route.

## Environment Variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `AI_API_KEY` | No for demo mode, yes for real AI | Empty | Provider API key. Kept on the server only. |
| `AI_API_BASE_URL` | No | `https://api.openai.com/v1` | Any OpenAI-compatible `/chat/completions` base URL. |
| `AI_MODEL` | No | `gpt-4o-mini` | Model sent to the provider. |
| `AI_TIMEOUT_MS` | No | `45000` | Server-side timeout for model requests. |
| `AI_DISABLE_DEMO_FALLBACK` | No | `false` | Set to `true` if you want missing API keys to fail instead of returning demo itineraries. |
| `PORT` | No | `3000` | Local server port. |
| `AI_HTTP_REFERER` | No | `http://localhost:3000` | Optional OpenRouter metadata. |
| `AI_APP_TITLE` | No | `Trip Planner` | Optional OpenRouter metadata. |

## Scripts

```bash
npm start
```

Runs the Express server and Vite middleware on `127.0.0.1:3000`.

```bash
npm run build
```

Builds the production frontend bundle.

```bash
npm test
```

Runs parser and normalization tests.

```bash
npm run check
```

Runs tests and then builds the app.

## How It Works

1. The user writes a trip request in natural language.
2. The frontend posts that text to `/api/generate-trip-plan`.
3. The backend calls the configured LLM provider with a strict JSON itinerary prompt. Locally this runs through `server/index.js`; online this runs through `api/generate-trip-plan.js`.
4. The parser extracts JSON even if the model wraps it in code fences or extra text.
5. The normalizer validates the shape, cleans text, creates missing IDs, accepts common alternate keys, and repairs ungrouped stops into a single day when possible.
6. The React UI renders validated data as interactive itinerary components.

## AI Failure Handling

The assignment emphasizes unreliable AI output, so this app treats model responses as untrusted data.

- Malformed JSON returns a structured error instead of crashing the UI.
- Empty responses and wrong object shapes are rejected.
- Oversized inputs are blocked before hitting the model.
- Provider failures are converted into readable frontend errors.
- Slow responses show a waiting state and are aborted after the timeout.
- The client aborts older requests and tracks request IDs so stale responses cannot overwrite newer plans.
- If the model returns valid stops without day grouping, the backend repairs them into a single-day itinerary and returns a warning.
- If no API key is configured, the backend returns a demo itinerary with a warning so the deployed app remains usable.

## Frontend Details

- Desktop layout uses a sticky planning panel beside the itinerary workspace.
- Mobile layout stacks cleanly with horizontal day navigation.
- Stop cards support expand/collapse, manual additions, drag reorder, button reorder, and removal.
- The trip brief modal summarizes the destination, style, days, and stops.
- Visual polish includes route-board illustrations, animated route nodes, day pulse meters, hover lift, button shine, loading shimmer, save toasts, and dark mode.
- Accessibility details include semantic buttons, labels, focus states, keyboard-friendly modal closing, and `prefers-reduced-motion` support.

## Known Limitations

- Real AI generation targets OpenAI-compatible chat completion APIs. Native Gemini or Ollama endpoints would need a small adapter.
- Demo fallback mode is useful for review and deployment smoke tests, but it is not a replacement for real model output.
- Reordering is scoped to stops within a day, not moving stops between days.
- Saved itineraries are local to the current browser and are not synced across devices.
- The visual route boards are decorative and do not include a real map or live distance calculations.
- Streaming generation is not included.

## AI Usage Note

I used Codex to help scaffold the project, implement the React UI, write the backend parsing/normalization logic, add tests, and draft documentation. I reviewed the code paths so I can explain the data contract, request handling, UI state, and failure behavior in an interview.

## Time Spent

Approximately 7 to 8 hours total for the app scaffold, LLM route, JSON hardening, interactive itinerary UI, visual polish, tests, and documentation.
