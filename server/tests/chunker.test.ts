import { describe, expect, it } from "vitest";
import { chunkText } from "../src/services/chunker.js";

const opts = { maxChars: 200, overlapChars: 40 };

describe("chunkText", () => {
  it("returns nothing for empty input", () => {
    expect(chunkText("   \n ", opts)).toEqual([]);
  });

  it("keeps short text as a single chunk", () => {
    expect(chunkText("A short note.", opts)).toEqual(["A short note."]);
  });

  it("never exceeds maxChars, even for one giant unpunctuated run", () => {
    const chunks = chunkText("x".repeat(1000), opts);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= opts.maxChars)).toBe(true);
  });

  it("splits on paragraph boundaries and overlaps neighbouring chunks", () => {
    const paragraphs = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} ${"word ".repeat(20)}`.trim());
    const chunks = chunkText(paragraphs.join("\n\n"), opts);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= opts.maxChars)).toBe(true);
    // The start of chunk N+1 repeats the end of chunk N.
    for (let i = 1; i < chunks.length; i++) {
      const prevTail = (chunks[i - 1] as string).slice(-20);
      expect(chunks[i] as string).toContain(prevTail.trim().split(" ").pop());
    }
  });

  it("splits long paragraphs by sentence", () => {
    const sentence = "This is a fairly ordinary sentence about nothing. ";
    const chunks = chunkText(sentence.repeat(20), opts);
    expect(chunks.every((c) => c.length <= opts.maxChars)).toBe(true);
    expect(chunks.every((c) => /[.]$/.test(c.trim()))).toBe(true);
  });
});
