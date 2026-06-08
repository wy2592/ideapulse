import { useState } from "preact/hooks";

export default function Slider({ idea, onVote }) {
  const [score, setScore] = useState(50);
  const [sent, setSent] = useState(false);

  function release() {
    if (sent) return;
    setSent(true);
    onVote(idea.id, score);
  }

  return (
    <section className="votePanel">
      <p>{idea.text}</p>
      <div className="sliderRow">
        <span>No</span>
        <input
          type="range"
          min="0"
          max="100"
          value={score}
          disabled={sent}
          onInput={(event) => setScore(Number(event.currentTarget.value))}
          onMouseUp={release}
          onTouchEnd={release}
          onKeyUp={(event) => {
            if (event.key === "Enter" || event.key === " ") release();
          }}
        />
        <span>Yes</span>
      </div>
      <div className="voteMeta">{sent ? "Vote sent" : `${score}`}</div>
    </section>
  );
}
