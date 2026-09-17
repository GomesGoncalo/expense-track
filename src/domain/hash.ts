async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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
