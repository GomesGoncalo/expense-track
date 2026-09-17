export function createId(): string {
  // crypto.randomUUID requires a secure context (HTTPS or localhost). Fall
  // back to a Math.random-based UUID v4 so the app still works when opened
  // over plain HTTP on a local network (e.g. testing from a phone against a
  // dev server by IP address). GitHub Pages serves over HTTPS, so this path
  // isn't hit in production.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function nowIso(): string {
  return new Date().toISOString();
}
