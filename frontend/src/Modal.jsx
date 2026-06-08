import { useState } from "preact/hooks";

export default function Modal({ onClose, onLaunch }) {
  const [text, setText] = useState("");
  const remaining = 200 - text.length;

  function submit(event) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    onLaunch(clean);
  }

  return (
    <div className="modalShade" role="presentation" onMouseDown={onClose}>
      <form className="modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <textarea
          autoFocus
          maxLength={200}
          value={text}
          placeholder="One sentence. No pitch deck."
          onInput={(event) => setText(event.currentTarget.value)}
        />
        <div className="modalActions">
          <span className={remaining < 20 ? "count warn" : "count"}>{remaining}</span>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={!text.trim()}>Launch</button>
        </div>
      </form>
    </div>
  );
}
