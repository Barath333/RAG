import { describe, expect, it } from "vitest";
import { extractReadableText, HttpUrlFetcher } from "../src/services/urlFetcher.js";

const publicResolver = async () => ["93.184.216.34"];
const article = `<html><head><title>My Article</title></head><body><nav>menu</nav><article><h1>My Article</h1>${"<p>Readable paragraph about vector databases and retrieval. </p>".repeat(10)}</article></body></html>`;

const htmlResponse = (body: string, init: ResponseInit = {}) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html" }, ...init });

const makeFetcher = (fetchImpl: typeof fetch, extra = {}) =>
  new HttpUrlFetcher({ timeoutMs: 1000, maxBytes: 100_000, resolver: publicResolver, fetchImpl, ...extra });

describe("HttpUrlFetcher", () => {
  it("extracts readable text and title", async () => {
    const page = await makeFetcher(async () => htmlResponse(article)).fetchPage("https://example.com/a");
    expect(page.title).toBe("My Article");
    expect(page.text).toContain("vector databases");
  });

  it("rejects pages with too little text (typical of JS-rendered shells) with a 422", async () => {
    const shell = `<html><body><div id="root"></div><script>render()</script></body></html>`;
    await expect(makeFetcher(async () => htmlResponse(shell)).fetchPage("https://example.com/spa")).rejects.toMatchObject({
      status: 422,
    });
  });

  it("follows redirects but re-checks every hop for private targets", async () => {
    const fetchImpl = (async () =>
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } })) as unknown as typeof fetch;
    await expect(makeFetcher(fetchImpl).fetchPage("https://example.com/redirect")).rejects.toMatchObject({ status: 422 });
  });

  it("gives up after too many redirects", async () => {
    const fetchImpl = (async () => new Response(null, { status: 302, headers: { location: "https://example.com/loop" } })) as unknown as typeof fetch;
    await expect(makeFetcher(fetchImpl, { maxRedirects: 2 }).fetchPage("https://example.com/loop")).rejects.toMatchObject({ status: 502 });
  });

  it("rejects non-HTML content types", async () => {
    const fetchImpl = (async () => new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } })) as unknown as typeof fetch;
    await expect(makeFetcher(fetchImpl).fetchPage("https://example.com/x.pdf")).rejects.toMatchObject({ status: 422 });
  });

  it("enforces the size cap", async () => {
    const big = htmlResponse("a".repeat(5000));
    await expect(makeFetcher(async () => big, { maxBytes: 1000 }).fetchPage("https://example.com/big")).rejects.toMatchObject({ status: 422 });
  });

  it("maps upstream HTTP errors to 502", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    await expect(makeFetcher(fetchImpl).fetchPage("https://example.com/missing")).rejects.toMatchObject({ status: 502 });
  });
});

describe("extractReadableText", () => {
  it("drops script content", () => {
    const { text } = extractReadableText(`<html><body><article><p>Visible text here.</p><script>secret()</script></article></body></html>`, "https://example.com");
    expect(text).not.toContain("secret");
  });
});
