export interface ChunkOptions {
  maxChars: number;
  overlapChars: number;
}

/**
 * Paragraph-aware chunking with overlap.
 *
 * 1. Split into paragraphs (blank-line separated) so we cut on natural boundaries.
 * 2. Paragraphs longer than maxChars are split into sentences, and sentences longer
 *    than maxChars are hard-split, so no unit ever exceeds the limit.
 * 3. Units are packed greedily up to maxChars.
 * 4. Each new chunk starts with the tail of the previous one (overlapChars) so an idea
 *    that straddles a boundary is still retrievable from either side.
 *
 * Size is measured in characters (~4 chars per token) to avoid a tokenizer dependency.
 */
export function chunkText(text: string, { maxChars, overlapChars }: ChunkOptions): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const units = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length <= maxChars ? [p] : splitLongParagraph(p, maxChars)));

  const chunks: string[] = [];
  let current = "";

  for (const unit of units) {
    const candidate = current ? `${current}\n\n${unit}` : unit;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    const overlap = overlapTail(current, overlapChars);
    const withOverlap = overlap ? `${overlap}\n\n${unit}` : unit;
    // Only keep the overlap if it still fits; otherwise the unit starts clean.
    current = withOverlap.length <= maxChars ? withOverlap : unit;
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitLongParagraph(paragraph: string, maxChars: number): string[] {
  const sentences = paragraph.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [paragraph];
  const pieces: string[] = [];
  let buffer = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length > maxChars) {
      if (buffer) pieces.push(buffer);
      buffer = "";
      for (let i = 0; i < sentence.length; i += maxChars) pieces.push(sentence.slice(i, i + maxChars));
      continue;
    }
    const candidate = buffer ? `${buffer} ${sentence}` : sentence;
    if (candidate.length <= maxChars) {
      buffer = candidate;
    } else {
      pieces.push(buffer);
      buffer = sentence;
    }
  }
  if (buffer) pieces.push(buffer);
  return pieces;
}

/** Last `size` characters of `text`, trimmed forward to a word boundary. */
function overlapTail(text: string, size: number): string {
  if (!text || size <= 0) return "";
  if (text.length <= size) return text;
  const tail = text.slice(-size);
  const firstSpace = tail.search(/\s/);
  return (firstSpace === -1 ? tail : tail.slice(firstSpace)).trim();
}
