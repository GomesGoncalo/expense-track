import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId } from '../../src/domain/id';

describe('createId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a UUID-shaped string via crypto.randomUUID when available', () => {
    const id = createId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('falls back to a Math.random-based UUID when crypto.randomUUID is unavailable', () => {
    // Simulates Safari/WebKit in a non-secure context (e.g. testing over
    // plain HTTP on a local network), where crypto.randomUUID doesn't exist.
    vi.stubGlobal('crypto', { ...crypto, randomUUID: undefined });
    const id = createId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('produces unique ids in the fallback path', () => {
    vi.stubGlobal('crypto', { ...crypto, randomUUID: undefined });
    const ids = new Set(Array.from({ length: 50 }, () => createId()));
    expect(ids.size).toBe(50);
  });
});
