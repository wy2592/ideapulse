import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { allowIdea } from "./gatekeeper.js";
import { Semaphore } from "./pool.js";
import { PriorityQueue } from "./queue.js";
import { createQuotaManager } from "./quota.js";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS || 8000);
const MAX_MESSAGE_BYTES = 2048;
const IDEA_TTL_MS = 30_000;
const HEARTBEAT_MS = 30_000;
const RATE_LIMIT_PER_SECOND = 5;
const VALID_SCORE_MIN = 0;
const VALID_SCORE_MAX = 100;
const allowedOrigins = parseAllowedOrigins(process.env.PUBLIC_APP_URL || "http://localhost:5173");

const publicPool = new Semaphore(Number(process.env.POOL_SIZE || 50));
const proPool = new Semaphore(Number(process.env.PRO_POOL_SIZE || 10));
const queue = new PriorityQueue(Number(process.env.MAX_QUEUE || 1000));
const quotas = createQuotaManager();
const activeIdeas = new Map();
const sockets = new Map();
const proKeys = new Set(
  (process.env.PRO_KEYS || "PRO-LOCAL-DEMO")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean)
);

let draining = false;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      online: sockets.size,
      queue: queue.length,
      publicPool: publicPool.snapshot(),
      proPool: proPool.snapshot()
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

const wss = new WebSocketServer({
  server,
  maxPayload: MAX_MESSAGE_BYTES
});

wss.on("connection", (ws, req) => {
  if (!isAllowedOrigin(req.headers.origin)) {
    ws.close(1008, "Origin not allowed");
    return;
  }

  if (sockets.size >= MAX_CONNECTIONS) {
    ws.close(1013, "Server connection limit reached");
    return;
  }

  const deviceId = randomUUID();
  const ipHash = hashIp(getClientIp(req));
  const user = quotas.getOrCreate(deviceId, ipHash);
  const state = {
    deviceId,
    ws,
    user,
    isAlive: true,
    rate: {
      second: Math.floor(Date.now() / 1000),
      count: 0
    }
  };

  sockets.set(deviceId, state);
  ws.send(JSON.stringify({ type: "WELCOME", deviceId, quota: quotaSnapshot(user) }));
  broadcastStatus();

  ws.on("pong", () => {
    state.isAlive = true;
  });

  ws.on("message", (raw) => {
    if (!consumeRateLimit(state)) {
      send(ws, { type: "ERROR", code: "RATE_LIMITED", message: "Too many messages." });
      return;
    }

    let message;
    try {
      message = JSON.parse(raw.toString("utf8"));
    } catch {
      send(ws, { type: "ERROR", code: "BAD_JSON", message: "Invalid JSON." });
      return;
    }
    handleMessage(state, message);
  });

  ws.on("close", () => {
    sockets.delete(deviceId);
    queue.remove((job) => job.deviceId === deviceId);
    for (const idea of activeIdeas.values()) {
      if (idea.authorDeviceId === deviceId) finishIdea(idea.id, "author_left");
    }
    broadcastStatus();
  });
});

function handleMessage(state, message) {
  if (!message || typeof message.type !== "string") {
    send(state.ws, { type: "ERROR", code: "BAD_MESSAGE", message: "Missing message type." });
    return;
  }

  if (message.type === "SUBMIT_IDEA") {
    submitIdea(state, message);
    return;
  }

  if (message.type === "VOTE") {
    vote(state, message);
    return;
  }

  if (message.type === "ACTIVATE_PRO") {
    activatePro(state, message);
    return;
  }

  send(state.ws, { type: "ERROR", code: "UNKNOWN_TYPE", message: "Unknown message type." });
}

function submitIdea(state, message) {
  const text = sanitizeIdea(message.text);
  const tempId = typeof message.tempId === "string" ? message.tempId.slice(0, 80) : randomUUID();

  if (!text) {
    send(state.ws, { type: "ERROR", code: "EMPTY_IDEA", tempId, message: "Idea text is required." });
    return;
  }
  if (!quotas.canSubmit(state.user)) {
    send(state.ws, {
      type: "ERROR",
      code: "QUOTA_EXCEEDED",
      tempId,
      message: "Daily idea quota exceeded.",
      quota: quotaSnapshot(state.user)
    });
    return;
  }

  const job = {
    id: randomUUID(),
    tempId,
    text,
    deviceId: state.deviceId,
    isPaid: state.user.isPaid,
    submittedAt: Date.now()
  };

  const accepted = queue.enqueue(job, priorityFor(state.user));
  if (!accepted) {
    send(state.ws, { type: "ERROR", code: "QUEUE_FULL", tempId, message: "Queue is full. Try again soon." });
    return;
  }

  quotas.recordSubmit(state.user);
  send(state.ws, {
    type: "QUEUED",
    tempId,
    position: queue.positionOf((queued) => queued.id === job.id),
    quota: quotaSnapshot(state.user)
  });
  drainQueue();
}

function vote(state, message) {
  const ideaId = typeof message.ideaId === "string" ? message.ideaId : "";
  const score = Number(message.score);
  const idea = activeIdeas.get(ideaId);

  if (!idea || idea.authorDeviceId === state.deviceId) return;
  if (!Number.isFinite(score) || score < VALID_SCORE_MIN || score > VALID_SCORE_MAX) return;
  if (idea.voters.has(state.deviceId)) return;

  idea.voters.add(state.deviceId);
  idea.scores.push(Math.round(score));
  quotas.recordVote(state.user);
  send(state.ws, { type: "VOTE_ACCEPTED", ideaId, quota: quotaSnapshot(state.user) });
}

function activatePro(state, message) {
  const key = typeof message.key === "string" ? message.key.trim() : "";
  if (!key || !proKeys.has(key)) {
    send(state.ws, { type: "ERROR", code: "BAD_PRO_KEY", message: "Invalid Pro key." });
    return;
  }
  quotas.activatePro(state.user);
  send(state.ws, { type: "PRO_ACTIVATED", quota: quotaSnapshot(state.user) });
}

async function drainQueue() {
  if (draining) return;
  draining = true;

  try {
    while (queue.length > 0) {
      const next = queue.peek();
      if (!next) break;
      const pool = next.isPaid ? proPool : publicPool;
      if (pool.available <= 0) break;

      const job = queue.dequeue();
      const state = sockets.get(job.deviceId);
      if (!state || state.ws.readyState !== WebSocket.OPEN) continue;

      const release = await pool.acquire();
      processJob(job, release).catch(() => release());
    }
  } finally {
    draining = false;
    if (queue.length > 0) setImmediate(drainQueue);
  }
}

async function processJob(job, release) {
  try {
    const author = sockets.get(job.deviceId);
    if (!author) return;

    const allowed = await allowIdea(job.text);
    if (!allowed) {
      send(author.ws, { type: "RESULT", tempId: job.tempId, score: 0, blocked: true });
      return;
    }

    const idea = {
      id: job.id,
      tempId: job.tempId,
      text: job.text,
      authorDeviceId: job.deviceId,
      scores: [],
      voters: new Set(),
      startTime: Date.now(),
      timer: null
    };

    idea.timer = setTimeout(() => finishIdea(idea.id, "timeout"), IDEA_TTL_MS);
    activeIdeas.set(idea.id, idea);
    broadcastExcept(job.deviceId, {
      type: "NEW_IDEA",
      id: idea.id,
      text: idea.text,
      showUntil: Date.now() + IDEA_TTL_MS
    });
  } finally {
    release();
    if (queue.length > 0) setImmediate(drainQueue);
  }
}

function finishIdea(ideaId, reason) {
  const idea = activeIdeas.get(ideaId);
  if (!idea) return;

  clearTimeout(idea.timer);
  activeIdeas.delete(ideaId);

  const author = sockets.get(idea.authorDeviceId);
  const score = idea.scores.length
    ? Math.round(idea.scores.reduce((sum, value) => sum + value, 0) / idea.scores.length)
    : 50;

  if (author) {
    send(author.ws, {
      type: "RESULT",
      tempId: idea.tempId,
      score,
      votes: idea.scores.length,
      reason
    });
  }
}

function priorityFor(user) {
  if (user.isPaid) return 0;
  if (user.votesToday >= 30) return 1;
  if (user.votesToday >= 10) return 2;
  return 3;
}

function sanitizeIdea(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 200);
}

function consumeRateLimit(state) {
  const second = Math.floor(Date.now() / 1000);
  if (state.rate.second !== second) {
    state.rate.second = second;
    state.rate.count = 0;
  }
  state.rate.count += 1;
  return state.rate.count <= RATE_LIMIT_PER_SECOND;
}

function broadcastStatus() {
  broadcast({ type: "UPDATE_STATUS", online: sockets.size });
}

function broadcast(payload) {
  for (const state of sockets.values()) send(state.ws, payload);
}

function broadcastExcept(deviceId, payload) {
  for (const state of sockets.values()) {
    if (state.deviceId !== deviceId) send(state.ws, payload);
  }
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress || "";
}

function hashIp(ip) {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

function parseAllowedOrigins(value) {
  if (value === "*") return "*";
  return new Set(
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function isAllowedOrigin(origin) {
  if (!origin || allowedOrigins === "*") return true;
  return allowedOrigins.has(origin);
}

function quotaSnapshot(user) {
  return {
    dailyQuota: user.isPaid ? 10 : user.dailyQuota,
    ideasToday: user.ideasToday,
    votesToday: user.votesToday,
    isPaid: user.isPaid
  };
}

const heartbeat = setInterval(() => {
  for (const state of sockets.values()) {
    if (!state.isAlive) {
      state.ws.terminate();
      continue;
    }
    state.isAlive = false;
    state.ws.ping();
  }
}, HEARTBEAT_MS);

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function shutdown() {
  clearInterval(heartbeat);
  for (const idea of activeIdeas.values()) clearTimeout(idea.timer);
  activeIdeas.clear();
  wss.close(() => server.close(() => process.exit(0)));
  setTimeout(() => process.exit(1), 3000).unref();
}

server.listen(PORT, HOST, () => {
  console.log(`IdeaPulse backend listening on ws://${HOST}:${PORT}`);
});
