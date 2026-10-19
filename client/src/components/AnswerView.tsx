import type { QueryResult } from "../api/types";

interface Props {
  question: string;
  result: QueryResult;
  stale: boolean;
}

export function AnswerView({ question, result, stale }: Props) {
  const cited = result.sources.filter((s) => s.cited);
  const other = result.sources.filter((s) => !s.cited);

  return (
    <div className={stale ? "answer stale" : "answer"} aria-live="polite">
      <p className="muted">You asked: {question}</p>
      <p className="answer-text">{result.answer}</p>

    {result.sources.length > 0 && (
  <>
    {cited.length > 0 && (
      <>
        <h3>Sources used in the answer</h3>
        <ul className="sources">{cited.map((s) => <SourceCard key={s.ref} source={s} />)}</ul>
      </>
    )}
    {other.length > 0 && (
      <details>
        <summary>
          {cited.length > 0 ? "Other passages that were retrieved" : "Passages that were retrieved but not used"} ({other.length})
        </summary>
        <ul className="sources">{other.map((s) => <SourceCard key={s.ref} source={s} />)}</ul>
      </details>
    )}
  </>
)}
    </div>
  );
}

function SourceCard({ source }: { source: QueryResult["sources"][number] }) {
  return (
    <li className="source">
      <div className="source-head">
        <span className="ref">[{source.ref}]</span>
        {source.sourceUrl ? (
          <a href={source.sourceUrl} target="_blank" rel="noreferrer noopener">{source.itemTitle}</a>
        ) : (
          <span>{source.itemTitle}</span>
        )}
        <span className="score" title="Cosine similarity to your question">match {(source.score * 100).toFixed(0)}%</span>
      </div>
      <blockquote>{source.snippet}</blockquote>
    </li>
  );
}
