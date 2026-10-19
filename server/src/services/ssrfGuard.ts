import dns from "node:dns/promises";
import net from "node:net";
import { UnprocessableError } from "../lib/errors.js";

/** True for loopback, private, link-local, CGNAT, multicast, and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // not a valid IP: refuse
}

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, incl. cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast + reserved
  );
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return isPrivateIPv4(mapped[1] as string);
  return /^f[cd]/.test(lower) /* fc00::/7 */ || /^fe[89ab]/.test(lower) /* fe80::/10 */ || lower.startsWith("ff");
}

export type Resolver = (hostname: string) => Promise<string[]>;

const systemResolver: Resolver = async (hostname) => {
  const records = await dns.lookup(hostname, { all: true });
  return records.map((r) => r.address);
};

/**
 * Throws unless the URL is http(s) and every address its host resolves to is public.
 * Called for the initial URL and again for every redirect hop.
 */
export async function assertPublicHttpUrl(rawUrl: string, resolve: Resolver = systemResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnprocessableError("That is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnprocessableError("Only http and https URLs are supported.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [host] : await resolve(host).catch(() => []);
  if (addresses.length === 0) throw new UnprocessableError(`Could not resolve host "${host}".`);
  if (addresses.some(isPrivateAddress)) {
    throw new UnprocessableError("URLs that point to private or internal addresses are not allowed.");
  }
  return url;
}
