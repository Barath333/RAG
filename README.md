# AI Knowledge Inbox

Save short notes or web pages, then ask questions about them. Answers are generated from your saved content only and cite the passages they used.

- **Backend:** Node 20+, Express 4, TypeScript, SQLite (`better-sqlite3`), OpenAI or any OpenAI-compatible API (embeddings + chat)
- **Frontend:** React 19 + Vite, hooks only, plain CSS

## Run it locally

Requirements: Node 20 or newer and an API key for OpenAI or any OpenAI-compatible provider (set `OPENAI_BASE_URL`; `server/.env.example` has a Gemini example).

```bash
npm install
cp server/.env.example server/.env     # then set OPENAI_API_KEY inside it
npm run dev                            # API on :3001, UI on http://localhost:5173
```

Other commands:

```bash
npm test             # 49 server tests (no network or API key needed)
npm run typecheck    # server + client
npm run build        # production build of both
```

The tests inject a fake embedder and fake LLM, so they run offline. Only the real OpenAI calls need a key.

## How it works

```
POST /ingest ──► validate ──► save item (status: processing) ──► 202
                                      │
                         background job (one at a time)
                                      ▼
          [URL only: fetch + extract text] ─► chunk ─► embed ─► store chunks, status: ready

POST /query ──► embed question ─► score every chunk (cosine) ─► top-k above threshold
            ─► LLM answers from numbered passages ─► validate [n] citations ─► { answer, sources }
```

```
server/src
  routes/        thin HTTP handlers (ingest, items, query)
  services/      chunker, embedder, retriever, llm, urlFetcher, ssrfGuard, ingestService, queryService
  db/            schema + repository (all SQL lives here)
  middleware/    validation, error handling, request logging
  lib/           errors, logger, vector math
  app.ts         builds the Express app from injected dependencies
  index.ts       wires real dependencies together (the only file that knows about OpenAI config)
client/src
  api/           typed fetch wrapper
  hooks/         useItems (list + polling), useAsk (query state)
  components/    AddItemForm, ItemList, AskPanel, AnswerView
```

Services depend on small interfaces (`Embedder`, `AnswerGenerator`, `UrlFetcher`), which is what makes the tests offline and lets a local model replace OpenAI without touching the rest.

## API

All errors share one shape: `{ "error": { "code", "message", "details"? } }`.

| Endpoint | Body | Success | Errors |
|---|---|---|---|
| `POST /ingest` | `{ "type": "note", "text": "..." }` or `{ "type": "url", "url": "https://..." }` | `202 { item }` (status `processing`) | `400` invalid body, `422` bad or internal URL |
| `GET /items` | | `200 { items: [...] }` newest first, each with `status` (`processing`, `ready`, `failed`), `error`, `chunkCount`, `preview` | |
| `DELETE /items/:id` | | `204` | `404` |
| `POST /query` | `{ "question": "...", "topK"?: 1-10 }` | `200 { answer, sources: [{ ref, itemTitle, snippet, score, cited, ... }] }` | `400`, `502` upstream failure |
| `GET /health` | | `200 { status: "ok" }` | |

`DELETE` is an addition beyond the three required endpoints, since a list of saved items without delete felt incomplete.

## Design decisions and tradeoffs

**Chunking.** Paragraph-aware packing up to ~1800 characters (about 450 tokens) with ~200 characters of overlap. Paragraphs are natural semantic units, so cutting there keeps ideas together; overlap protects ideas that straddle a boundary. Oversized paragraphs fall back to sentences, then a hard split, so no chunk exceeds the limit. Size is counted in characters rather than tokens to avoid a tokenizer dependency; the approximation is fine for English prose. Short notes stay as one chunk. I chose this over fixed-size windows (cuts mid-sentence) and over semantic or LLM-based chunking (slower, costlier, hard to debug at this scale).

**Vector store: SQLite + brute-force search.** Embeddings are stored as float32 BLOBs next to the text and metadata, and each query scans all chunks in memory. Vectors are normalised on write so cosine similarity is a dot product. This gives exact results, a single file to run and inspect, and no extra service. The cost is that query time grows linearly with the number of chunks.

**Relevance threshold.** Chunks below `MIN_SIMILARITY` are dropped. If nothing is left, the API answers "couldn't find anything" without calling the LLM, which saves a call and removes the chance of a made-up answer. The default (0.2) suits OpenAI's `text-embedding-3-small`. With Gemini embeddings, unrelated text scores much higher, so I tuned the cutoff to 0.55 from observed scores (relevant questions scored 62-77%, an unrelated one 49%). The right value depends on the embedding model and should be re-tuned whenever it changes.

**Citations.** Retrieved passages are sent to the model numbered `[1]..[n]` and the prompt requires citing by number. The server then removes any `[n]` that does not correspond to a passage it sent, and marks each source with `cited: true/false`. The UI shows the cited passages first and the other retrieved ones collapsed. This verifies that citations point at real sources, but it does not prove the cited passage supports the claim.

**Async ingestion.** `POST /ingest` returns `202` straight away; fetching, chunking and embedding run in a background queue and the UI polls `GET /items` until nothing is `processing`. The queue is a promise chain in the process (concurrency 1). Items left `processing` by a crash are re-queued on startup. Failed items keep a readable `error`; there is no automatic retry, so delete and re-add.

**URL fetching.** Static `fetch` followed by Mozilla Readability to strip navigation and boilerplate. Safeguards: http/https only, DNS results checked against private, loopback, link-local and cloud-metadata ranges (SSRF), the same check repeated on every redirect hop, a 10 s timeout, a 2 MB cap, and HTML/plain-text content types only. Bad URLs are rejected with `422` before an item is created.

**JavaScript-rendered pages are not supported.** Scripts are never executed, so a single-page app that builds its content client-side yields almost no text. In that case the item fails with a message suggesting the user paste the text as a note. The requirements don't specify JS rendering, and a headless browser would add a large dependency and setup step for a 6-12 hour task, so I left it out deliberately (see "Production changes").

**Prompt-injection posture.** The system prompt tells the model to treat passages as data, not instructions, and to answer only from them. That reduces the risk but cannot eliminate it, since saved web pages are untrusted input.

**Debuggability.** Structured JSON logs (pino) with a request id that is also returned in the `x-request-id` header; per-item logs for indexing; consistent status codes (`400` validation, `404` missing, `422` content that can't be used, `502` upstream failure, `500` unexpected). Unexpected errors are logged in full but only a generic message is returned or stored on the item.

## Known limitations (deliberately out of scope)

- **JavaScript-rendered pages** are not supported (scripts are never run), nor are pages behind logins, paywalls or bot protection. These fail with a clear message.
- **Only HTML and plain text** are accepted. PDFs, images and other file types are rejected with a 422.
- **Single user, no auth.** Items are not scoped to anyone.
- **No retries or de-duplication.** A failed item has to be deleted and re-added; the same URL can be saved twice.
- **No pagination** on `GET /items` and no streaming of answers.
- **Citation checks are structural.** The server verifies a cited passage exists, not that it supports the claim.
- **The React UI has no automated tests**; the backend does (49).

## What breaks at scale

- **Search is O(number of chunks).** Every query loads and scans all vectors. It is comfortable for thousands of chunks and gets slow somewhere past ~100k, and memory use grows with it.
- **The job queue lives in the process.** A restart loses queue order (items are re-queued, but any in-flight work restarts), and it cannot spread across several servers.
- **SQLite allows one writer.** Fine for a single user, a bottleneck with concurrent writers.
- **Single user, no auth, no rate limiting.** Anyone who can reach the API can spend the OpenAI budget and trigger server-side fetches.
- **Changing the embedding model invalidates stored vectors.** All chunks would need re-embedding; the raw content is kept so this is possible, but no tool for it exists yet.
- **No de-duplication.** Saving the same URL twice stores it twice.
- **Fixed-size context.** Top-k chunks are concatenated with no token budget check, so very large chunks or a large `topK` could exceed the model's context window.

## What I would change for production

- Postgres with **pgvector** (or Qdrant) for approximate nearest-neighbour search, plus metadata filtering and per-user scoping.
- A real **job queue** (BullMQ/Redis or SQS) with retries, backoff and a dead-letter queue; ingestion in separate workers.
- **Authentication**, per-user data isolation, and rate limits and spend caps on `/ingest` and `/query`.
- **Rendering fallback** for JS-heavy pages (Playwright in an isolated worker, or a rendering service), and fetching through an egress proxy rather than the app server to harden against SSRF (the DNS check here has a small time-of-check/time-of-use gap).
- **Retrieval quality:** hybrid search (BM25 + vectors), a reranker, query rewriting, and an evaluation set to tune chunk size, `topK` and the similarity threshold.
- **Streaming answers**, token-budgeted context assembly, response caching, and de-duplication by content hash.
- Metrics and tracing (latency per stage, token cost, retrieval hit rates), health checks that verify the database, and a deployment pipeline.

## Tests

`npm test` runs 49 tests: chunker boundaries and overlap, SSRF address classification and redirect handling, URL extraction and limits, and the full HTTP API (validation, async indexing, failures, delete, retrieval, citation validation, upstream errors) against an in-memory database with a fake embedder and LLM.

Not covered by automated tests: the real OpenAI calls and the React UI.
