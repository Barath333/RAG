import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { UnprocessableError, UpstreamError } from "../lib/errors.js";
import { assertPublicHttpUrl, type Resolver } from "./ssrfGuard.js";

export interface FetchedPage {
  title: string;
  text: string;
}

export interface UrlFetcher {
  /** Cheap, synchronous-feeling check so bad URLs are rejected before an item is created. */
  validate(url: string): Promise<void>;
  fetchPage(url: string): Promise<FetchedPage>;
}

export interface UrlFetcherOptions {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects?: number;
  minTextChars?: number;
  resolver?: Resolver;
  fetchImpl?: typeof fetch;
}

/**
 * Static fetch + Readability. Scripts are never executed, so pages that render
 * their content with client-side JavaScript yield little text and are rejected
 * with a clear 422 (see README: "What breaks").
 */
export class HttpUrlFetcher implements UrlFetcher {
  private readonly maxRedirects: number;
  private readonly minTextChars: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: UrlFetcherOptions) {
    this.maxRedirects = opts.maxRedirects ?? 5;
    this.minTextChars = opts.minTextChars ?? 200;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async validate(rawUrl: string): Promise<void> {
    await assertPublicHttpUrl(rawUrl, this.opts.resolver);
  }

  async fetchPage(rawUrl: string): Promise<FetchedPage> {
    const { html, finalUrl } = await this.download(rawUrl);
    const page = extractReadableText(html, finalUrl);
    if (page.text.length < this.minTextChars) {
      throw new UnprocessableError(
        "Could not extract readable text from this page. It may be rendered with JavaScript, " +
          "behind a login, or mostly non-text content. Try pasting the text as a note instead.",
      );
    }
    return page;
  }

  private async download(rawUrl: string): Promise<{ html: string; finalUrl: string }> {
    let current = rawUrl;
    for (let hop = 0; hop <= this.maxRedirects; hop++) {
      // Re-validate every hop so a public URL can't redirect us to an internal one.
      const url = await assertPublicHttpUrl(current, this.opts.resolver);
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(this.opts.timeoutMs),
          headers: { "user-agent": "AIKnowledgeInbox/1.0", accept: "text/html,text/plain;q=0.9,*/*;q=0.1" },
        });
      } catch (err) {
        throw new UpstreamError(`Could not fetch ${url.hostname}: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new UpstreamError(`Redirect from ${url.hostname} had no Location header.`);
        current = new URL(location, url).toString();
        continue;
      }
      if (!res.ok) throw new UpstreamError(`${url.hostname} responded with HTTP ${res.status}.`);

      const contentType = res.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
        throw new UnprocessableError(`Unsupported content type "${contentType || "unknown"}". Only HTML and plain text are supported.`);
      }
      const body = await readCapped(res, this.opts.maxBytes);
      return { html: body, finalUrl: url.toString() };
    }
    throw new UpstreamError(`Too many redirects (more than ${this.maxRedirects}).`);
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new UnprocessableError(`Page is larger than the ${Math.round(maxBytes / 1_000_000)} MB limit.`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function extractReadableText(html: string, url: string): FetchedPage {
  const dom = new JSDOM(html, { url }); // no runScripts, no resource loading
  const article = new Readability(dom.window.document).parse();
  const text = (article?.textContent ?? dom.window.document.body?.textContent ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n\n")
    .trim();
  const title = (article?.title || dom.window.document.title || new URL(url).hostname).trim();
  return { title, text };
}
