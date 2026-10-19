import { useState, type FormEvent } from "react";
import { useAsk } from "../hooks/useAsk";
import { AnswerView } from "./AnswerView";

interface Props {
  readyCount: number;
}

export function AskPanel({ readyCount }: Props) {
  const [question, setQuestion] = useState("");
  const { ask, asked, result, loading, error } = useAsk();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (question.trim()) void ask(question.trim());
  }

  return (
    <section className="panel">
      <h2>Ask your notes</h2>
      <form onSubmit={handleSubmit} className="ask-form">
        <input
          aria-label="Question"
          placeholder={readyCount === 0 ? "Save something first, then ask about it" : "What would you like to know?"}
          value={question}
          maxLength={1000}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" className="primary" disabled={loading || !question.trim()}>
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      {error && <p className="error" role="alert">{error}</p>}
      {result && asked && <AnswerView question={asked} result={result} stale={loading} />}
    </section>
  );
}
