/**
 * cyrb53: a fast, well-distributed non-cryptographic string hash. Used as a
 * fallback when crypto.subtle is unavailable (it requires a secure context —
 * HTTPS or localhost — so it's missing when testing over plain HTTP on a
 * local network, e.g. from a phone against a dev server by IP address).
 * These hashes are only ever used for local dedupe/change-detection, never
 * for anything security-sensitive, so this fallback is fine to rely on.
 */
function cyrb53Hex(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return h2.toString(16).padStart(8, '0') + h1.toString(16).padStart(8, '0');
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return cyrb53Hex(input);
}

function normalizeDescription(description: string): string {
  return description.trim().replace(/\s+/g, ' ').toUpperCase();
}

export async function computeDedupeHash(
  accountId: string,
  date: string,
  description: string,
  amountPence: number,
): Promise<string> {
  const key = `${accountId}|${date}|${normalizeDescription(description)}|${amountPence}`;
  return sha256Hex(key);
}

export async function computeTextHash(text: string): Promise<string> {
  return sha256Hex(text);
}
