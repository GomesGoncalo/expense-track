import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeDedupeHash, computeTextHash } from '../../src/domain/hash';

describe('computeDedupeHash', () => {
  it('is deterministic for identical inputs', async () => {
    const a = await computeDedupeHash('acc1', '2026-01-05', 'TESCO STORES', -1234);
    const b = await computeDedupeHash('acc1', '2026-01-05', 'TESCO STORES', -1234);
    expect(a).toBe(b);
  });

  it('is insensitive to description whitespace and case', async () => {
    const a = await computeDedupeHash('acc1', '2026-01-05', '  Tesco   Stores ', -1234);
    const b = await computeDedupeHash('acc1', '2026-01-05', 'TESCO STORES', -1234);
    expect(a).toBe(b);
  });

  it('differs when account, date, description, or amount differ', async () => {
    const base = await computeDedupeHash('acc1', '2026-01-05', 'TESCO STORES', -1234);
    expect(await computeDedupeHash('acc2', '2026-01-05', 'TESCO STORES', -1234)).not.toBe(base);
    expect(await computeDedupeHash('acc1', '2026-01-06', 'TESCO STORES', -1234)).not.toBe(base);
    expect(await computeDedupeHash('acc1', '2026-01-05', 'SAINSBURYS', -1234)).not.toBe(base);
    expect(await computeDedupeHash('acc1', '2026-01-05', 'TESCO STORES', -1235)).not.toBe(base);
  });
});

describe('computeTextHash', () => {
  it('is deterministic and differs for different text', async () => {
    const a = await computeTextHash('statement contents');
    const b = await computeTextHash('statement contents');
    const c = await computeTextHash('different contents');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('hashing without crypto.subtle', () => {
  // Simulates Safari/WebKit in a non-secure context (e.g. testing over plain
  // HTTP on a local network), where crypto.subtle doesn't exist.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to a deterministic non-crypto hash for dedupe hashes', async () => {
    vi.stubGlobal('crypto', { ...crypto, subtle: undefined });
    const a = await computeDedupeHash('acc1', '2026-01-05', 'TESCO STORES', -1234);
    const b = await computeDedupeHash('acc1', '2026-01-05', 'TESCO STORES', -1234);
    const c = await computeDedupeHash('acc1', '2026-01-05', 'SAINSBURYS', -1234);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('falls back to a deterministic non-crypto hash for text hashes', async () => {
    vi.stubGlobal('crypto', { ...crypto, subtle: undefined });
    const a = await computeTextHash('statement contents');
    const b = await computeTextHash('statement contents');
    expect(a).toBe(b);
  });
});
