import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import Modal from "./Modal.jsx";
import Slider from "./Slider.jsx";

const WS_URL = import.meta.env.VITE_WS_URL || `ws://${location.hostname}:8787`;
const EMPTY_LIGHTS = [
  { id: "a", status: "empty", score: null },
  { id: "b", status: "empty", score: null },
  { id: "c", status: "empty", score: null }
];

export default function App() {
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState(0);
  const [quota, setQuota] = useState(null);
  const [lights, setLights] = useState(EMPTY_LIGHTS);
  const [modalOpen, setModalOpen] = useState(false);
  const [incoming, setIncoming] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, []);

  const quotaText = useMemo(() => {
    if (!quota) return "";
    return `${Math.max(0, quota.dailyQuota - quota.ideasToday)}/${quota.dailyQuota}`;
  }, [quota]);

  function connect() {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      setConnected(true);
      setMessage("");
    });

    ws.addEventListener("close", () => {
      setConnected(false);
      reconnectRef.current = setTimeout(connect, 1200);
    });

    ws.addEventListener("message", (event) => {
      const packet = safeJson(event.data);
      if (!packet) return;
      handlePacket(packet);
    });
  }

  function handlePacket(packet) {
    if (packet.type === "WELCOME") {
      setQuota(packet.quota);
      return;
    }
    if (packet.type === "UPDATE_STATUS") {
      setOnline(packet.online);
      return;
    }
    if (packet.type === "QUEUED") {
      setQuota(packet.quota);
      setMessage(packet.position ? `Queued #${packet.position}` : "Queued");
      return;
    }
    if (packet.type === "NEW_IDEA") {
      setIncoming(packet);
      return;
    }
    if (packet.type === "VOTE_ACCEPTED") {
      setQuota(packet.quota);
      setIncoming(null);
      return;
    }
    if (packet.type === "PRO_ACTIVATED") {
      setQuota(packet.quota);
      setMessage("Pro active");
      return;
    }
    if (packet.type === "RESULT") {
      setLights((current) => applyResult(current, packet.tempId, packet.score));
      setMessage(`${packet.votes ?? 0} votes`);
      return;
    }
    if (packet.type === "ERROR") {
      setMessage(packet.message || packet.code || "Error");
      if (packet.quota) setQuota(packet.quota);
    }
  }

  function launchIdea(text) {
    const tempId = crypto.randomUUID();
    setLights((current) => markPending(current, tempId));
    setModalOpen(false);
    send({ type: "SUBMIT_IDEA", text, tempId });
  }

  function vote(ideaId, score) {
    send({ type: "VOTE", ideaId, score });
  }

  function activatePro() {
    const key = prompt("Pro key");
    if (key) send({ type: "ACTIVATE_PRO", key });
  }

  function send(packet) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(packet));
      return true;
    }
    setMessage("Offline");
    return false;
  }

  return (
    <main className="shell">
      <div className="lights" aria-label="Idea results">
        {lights.map((light) => (
          <div key={light.id} className={`light ${classForLight(light)}`}>
            <span>{light.score ?? ""}</span>
          </div>
        ))}
      </div>

      <div className="controls">
        <div className="statusLine">
          <span className={connected ? "dot on" : "dot"} />
          <strong>{online}</strong>
          <span>online</span>
          {quotaText && <button className="quota" onClick={activatePro}>{quotaText}</button>}
        </div>
        <button className="sendButton" onClick={() => setModalOpen(true)} disabled={!connected}>
          <span aria-hidden="true">+</span>
          Send Idea
        </button>
        {message && <div className="toast">{message}</div>}
      </div>

      {incoming && <Slider idea={incoming} onVote={vote} />}
      {modalOpen && <Modal onClose={() => setModalOpen(false)} onLaunch={launchIdea} />}
    </main>
  );
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function markPending(lights, tempId) {
  const next = [...lights];
  const index = next.findIndex((light) => light.status === "empty");
  const targetIndex = index === -1 ? 0 : index;
  next[targetIndex] = { id: next[targetIndex].id, tempId, status: "pending", score: null };
  return next;
}

function applyResult(lights, tempId, score) {
  return lights.map((light) => (
    light.tempId === tempId
      ? { ...light, status: "done", score }
      : light
  ));
}

function classForLight(light) {
  if (light.status === "pending") return "light-pending";
  if (light.status !== "done") return "light-empty";
  if (light.score < 40) return "light-danger";
  if (light.score < 60) return "light-meh";
  if (light.score < 80) return "light-good";
  return "light-god";
}
