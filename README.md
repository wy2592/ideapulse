# IdeaPulse

A zero-signup desktop widget for instant idea validation. Broadcast your one-line project idea to global strangers, get real-time scores on a red-green slider, and see the aggregated result as a breathing alert light. No tracking, no accounts, just pure signal.

IdeaPulse is built for makers, indie hackers, product people, students, and anyone who has too many ideas and not enough fast feedback. Instead of polishing a pitch deck or posting into a noisy social feed, you write one sentence, launch it, and wait for the crowd's instinctive response.

The app is intentionally tiny: three lights, one send button, one voting slider. Every idea is ephemeral, every result is immediate, and the server keeps state only in memory.

## Project Status

IdeaPulse is currently a v1.0 public prototype. The local product flow, WebSocket backend, in-memory queue, voting UI, and optional DeepSeek idea gate are implemented, but the project has not yet been validated on a public server because of limited hosting budget.

Contributions are very welcome. If you can help with production deployment, WebSocket scaling, security review, UI polish, load testing, Tauri packaging, or turning this into a more complete open-source tool, please jump in. The goal is to keep the core idea simple while making the system more reliable for real public use.

## What It Does

- Send a one-line idea in 200 characters or less.
- Broadcast it over WebSocket to currently online users.
- Let strangers score it with a red-to-green slider.
- Return a 30-second aggregated result as a traffic-light signal.
- Optionally use an OpenAI-compatible model, such as DeepSeek, to filter spam and non-ideas before broadcast.
- Keep the system database-free and resettable by design.

## Why It Exists

Most idea feedback arrives too late, too politely, or with too much social baggage. IdeaPulse aims for the opposite: a quick anonymous pulse check before you spend days building the wrong thing.

It is not a full survey platform, community forum, analytics dashboard, or startup scoring oracle. It is a small signal tool: fast, volatile, and deliberately lightweight.

## Privacy And Safety

- No signup.
- No user accounts.
- No database.
- No browser `localStorage`.
- No idea history written to disk.
- In-memory quotas, queues, active ideas, and Pro keys.
- WebSocket payloads capped at 2 KB.
- Per-connection rate limit of 5 messages per second.
- Hard limits for connections, queue size, and admit pools.
- AI checks fail open after 3 seconds so the queue does not block forever.
- API keys stay server-side through environment variables only.

## Architecture

```text
[Browser / Preact]
  |
  | WebSocket
  v
[Node.js ws Gateway]
  |
  |-- Rate limit
  |-- Public / Pro admit pools
  |-- Priority queue
  |-- Optional AI idea gate
  |-- In-memory active ideas
```

## Project Structure

```text
backend/
  server.js       WebSocket gateway, dispatcher, heartbeats, resource limits
  pool.js         Semaphore admit pools
  queue.js        bounded min-heap priority queue
  gatekeeper.js   optional AI idea classifier with 3s fail-open timeout
  quota.js        in-memory user quota logic
frontend/
  src/App.jsx     main compact app
  src/Modal.jsx   idea submission modal
  src/Slider.jsx  red-green vote slider
  src/styles.css  traffic-light states and layout
```

## Run Locally

```bash
npm install
cp .env.example .env
npm run dev
```

Frontend: `http://localhost:5173`

Backend health: `http://localhost:8787/health`

For local development without AI review:

```env
SKIP_AI=true
```

## DeepSeek Idea Gate

IdeaPulse can use DeepSeek through its OpenAI-compatible chat completions API to decide whether a submitted message looks like a real business need, project idea, creative concept, product plan, feature request, or practical problem.

```env
SKIP_AI=false
MODERATION_ENABLED=false
IDEA_CHECK=true
IDEA_LLM_API_KEY=
IDEA_LLM_BASE_URL=https://api.deepseek.com
IDEA_LLM_MODEL=deepseek-chat
```

Store real keys in `.env` or your deployment platform's secret manager. Do not commit secrets to GitHub.

For a different OpenAI-compatible model:

```env
IDEA_LLM_API_KEY=
IDEA_LLM_BASE_URL=https://your-model-host.example
IDEA_LLM_MODEL=your-model-name
```

## WebSocket Protocol

Client to server:

```json
{ "type": "SUBMIT_IDEA", "text": "A tiny idea", "tempId": "client-id" }
{ "type": "VOTE", "ideaId": "server-id", "score": 85 }
{ "type": "ACTIVATE_PRO", "key": "PRO-LOCAL-DEMO" }
```

Server to client:

```json
{ "type": "QUEUED", "position": 12 }
{ "type": "NEW_IDEA", "id": "server-id", "text": "...", "showUntil": 1234567890 }
{ "type": "RESULT", "tempId": "client-id", "score": 75 }
{ "type": "UPDATE_STATUS", "online": 512 }
```

## Environment

See [.env.example](.env.example).

Important defaults:

- `POOL_SIZE=50`
- `PRO_POOL_SIZE=10`
- `MAX_QUEUE=1000`
- `MAX_CONNECTIONS=8000`
- `PRO_KEYS=PRO-LOCAL-DEMO`
- `PUBLIC_APP_URL=http://localhost:5173`
- `MODERATION_ENABLED=false`
- `IDEA_CHECK=true`
- `IDEA_LLM_BASE_URL=https://api.deepseek.com`
- `IDEA_LLM_MODEL=deepseek-chat`

## Before Publishing

```bash
npm run secret:scan
npm audit
git status --short
```

## GitHub Setup

```bash
git add .
git commit -m "Initial public IdeaPulse release"
git branch -M main
git remote add origin <your-repo-url>
git pull --rebase origin main
git push -u origin main
```
