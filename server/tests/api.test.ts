import request from "supertest";
import { describe, expect, it } from "vitest";
import { UpstreamError } from "../src/lib/errors.js";
import { NO_ANSWER } from "../src/services/queryService.js";
import { buildTestApp, FakeGenerator, FakeUrlFetcher } from "./helpers.js";

const NOTE_A = "Vector databases store embeddings and support similarity search over high dimensional data.";
const NOTE_B = "Sourdough bread needs a starter, flour, water and a long slow fermentation.";

async function addNote(ctx: ReturnType<typeof buildTestApp>, text: string) {
  const res = await request(ctx.app).post("/ingest").send({ type: "note", text });
  await ctx.ingestService.whenIdle();
  return res;
}

describe("POST /ingest", () => {
  it("accepts a note with 202 and indexes it in the background", async () => {
    const ctx = buildTestApp();
    const res = await addNote(ctx, NOTE_A);
    expect(res.status).toBe(202);
    expect(res.body.item).toMatchObject({ sourceType: "note", status: "processing" });

    const list = await request(ctx.app).get("/items");
    expect(list.body.items[0]).toMatchObject({ id: res.body.item.id, status: "ready", chunkCount: 1 });
  });

  it("rejects empty notes, unknown types and bad JSON with 400 and a clear message", async () => {
    const { app } = buildTestApp();
    const empty = await request(app).post("/ingest").send({ type: "note", text: "   " });
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe("validation_error");
    expect(empty.body.error.message).toMatch(/text/);

    expect((await request(app).post("/ingest").send({ type: "pdf" })).status).toBe(400);
    const badJson = await request(app).post("/ingest").set("content-type", "application/json").send("{oops");
    expect(badJson.status).toBe(400);
  });

  it("rejects notes over the length limit", async () => {
    const { app } = buildTestApp();
    const res = await request(app).post("/ingest").send({ type: "note", text: "a".repeat(5001) });
    expect(res.status).toBe(400);
  });

  it("indexes a URL after fetching it", async () => {
    const ctx = buildTestApp({
      urlFetcher: new FakeUrlFetcher({ "https://example.com/a": { title: "Example", text: NOTE_A } }),
    });
    const res = await request(ctx.app).post("/ingest").send({ type: "url", url: "https://example.com/a" });
    expect(res.status).toBe(202);
    await ctx.ingestService.whenIdle();
    const item = (await request(ctx.app).get("/items")).body.items[0];
    expect(item).toMatchObject({ status: "ready", title: "Example", sourceType: "url" });
  });

  it("rejects internal URLs immediately with 422", async () => {
    const { app } = buildTestApp();
    const res = await request(app).post("/ingest").send({ type: "url", url: "http://10.0.0.1/admin" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("unprocessable_content");
  });

  it("marks the item failed (with a readable reason) when the page cannot be read", async () => {
    const ctx = buildTestApp({ urlFetcher: new FakeUrlFetcher() });
    await request(ctx.app).post("/ingest").send({ type: "url", url: "https://example.com/spa" });
    await ctx.ingestService.whenIdle();
    const item = (await request(ctx.app).get("/items")).body.items[0];
    expect(item.status).toBe("failed");
    expect(item.error).toMatch(/readable text/);
  });

  it("hides unexpected error details from the item's error field", async () => {
    const ctx = buildTestApp({ urlFetcher: new FakeUrlFetcher({ "https://example.com/boom": new Error("db password is hunter2") }) });
    await request(ctx.app).post("/ingest").send({ type: "url", url: "https://example.com/boom" });
    await ctx.ingestService.whenIdle();
    const item = (await request(ctx.app).get("/items")).body.items[0];
    expect(item.status).toBe("failed");
    expect(item.error).not.toContain("hunter2");
  });
});

describe("GET /items and DELETE /items/:id", () => {
  it("lists newest first, and deleting removes the item and its chunks from search", async () => {
    const ctx = buildTestApp();
    const a = await addNote(ctx, NOTE_A);
    await new Promise((r) => setTimeout(r, 5));
    await addNote(ctx, NOTE_B);
    const items = (await request(ctx.app).get("/items")).body.items;
    expect(items).toHaveLength(2);
    expect(items[0].preview).toContain("Sourdough");

    expect((await request(ctx.app).delete(`/items/${a.body.item.id}`)).status).toBe(204);
    expect((await request(ctx.app).delete(`/items/${a.body.item.id}`)).status).toBe(404);

    const q = await request(ctx.app).post("/query").send({ question: "vector databases similarity search" });
    expect(q.body.answer).toBe(NO_ANSWER);
  });
});

describe("POST /query", () => {
  it("returns an answer with cited sources, most relevant first", async () => {
    const ctx = buildTestApp();
    await addNote(ctx, NOTE_B);
    await addNote(ctx, NOTE_A);

    const res = await request(ctx.app).post("/query").send({ question: "How do vector databases do similarity search?" });
    expect(res.status).toBe(200);
    expect(res.body.answer).toContain("[1]");
    expect(res.body.sources[0]).toMatchObject({ ref: 1, cited: true, snippet: NOTE_A });
    // the model was shown the passages in the same order as the sources
    expect(ctx.generator).toBeInstanceOf(FakeGenerator);
    expect((ctx.generator as FakeGenerator).lastPassages[0]?.text).toBe(NOTE_A);
  });

  it("does not call the LLM when nothing is relevant", async () => {
    const ctx = buildTestApp({ minSimilarity: 0.9 });
    await addNote(ctx, NOTE_B);
    const res = await request(ctx.app).post("/query").send({ question: "quantum chromodynamics lattice" });
    expect(res.body).toEqual({ answer: NO_ANSWER, sources: [] });
    expect((ctx.generator as FakeGenerator).lastPassages).toEqual([]);
  });

  it("strips citations that point at passages that were never provided", async () => {
    const ctx = buildTestApp({ generator: new FakeGenerator("[7]") });
    await addNote(ctx, NOTE_A);
    const res = await request(ctx.app).post("/query").send({ question: "vector databases similarity" });
    expect(res.body.answer).not.toContain("[7]");
    expect(res.body.answer).toContain("[1]");
  });

  it("validates the question", async () => {
    const { app } = buildTestApp();
    expect((await request(app).post("/query").send({ question: "" })).status).toBe(400);
    expect((await request(app).post("/query").send({ question: "x".repeat(1001) })).status).toBe(400);
    expect((await request(app).post("/query").send({ question: "ok", topK: 99 })).status).toBe(400);
  });

  it("maps upstream LLM failures to 502", async () => {
    const failing = { answer: async () => { throw new UpstreamError("Answer generation failed: rate limited"); } };
    const ctx = buildTestApp({ generator: failing });
    await addNote(ctx, NOTE_A);
    const res = await request(ctx.app).post("/query").send({ question: "vector databases similarity" });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("upstream_error");
  });
});

describe("misc", () => {
  it("returns a JSON 404 for unknown routes and a health check", async () => {
    const { app } = buildTestApp();
    expect((await request(app).get("/nope")).body.error.code).toBe("not_found");
    expect((await request(app).get("/health")).body).toEqual({ status: "ok" });
  });
});
