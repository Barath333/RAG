export function normalize(vector: number[] | Float32Array): Float32Array {
  const out = Float32Array.from(vector);
  let sumSquares = 0;
  for (const v of out) sumSquares += v * v;
  const norm = Math.sqrt(sumSquares) || 1;
  for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) / norm;
  return out;
}

/** Dot product. Equals cosine similarity because all stored vectors are unit length. */
export function dot(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (a[i] as number) * (b[i] as number);
  return sum;
}

export function toBuffer(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

export function fromBuffer(buffer: Buffer): Float32Array {
  // Copy so the Float32Array has its own correctly aligned ArrayBuffer.
  const copy = new Uint8Array(buffer).buffer;
  return new Float32Array(copy);
}
