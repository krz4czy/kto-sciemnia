import { describe, expect, it } from 'vitest';
import { parseClientMessage, parseServerMessage, payloadTooLarge } from '../src/net/protocol';

describe('protocol', () => {
  it('accepts player messages and rejects garbage or the wrong version', () => {
    expect(parseClientMessage({ v: 1, t: 'join', name: 'Ala' })).toEqual({ ok: true, msg: { t: 'join', name: 'Ala' } });
    expect(parseClientMessage({ v: 1, t: 'clue', text: 'trop' }).ok).toBe(true);
    expect(parseClientMessage({ v: 1, t: 'vote', targetId: 'p1' }).ok).toBe(true);
    expect(parseClientMessage({ v: 1, t: 'rejoin', playerId: 'p1', token: 'token' }).ok).toBe(true);
    expect(parseClientMessage({ v: 2, t: 'join', name: 'Ala' })).toEqual({ ok: false, error: 'version' });
    expect(parseClientMessage({ v: 1, t: 'join', name: 'x'.repeat(80) }).ok).toBe(false);
    expect(parseClientMessage(['join']).ok).toBe(false);
    expect(parseClientMessage(null).ok).toBe(false);
  });

  it('rejects an impostor view that smuggles the secret', () => {
    const view = {
      phase: 'submit',
      spice: 'mild',
      you: { id: 'p1', name: 'Ala', score: 0 },
      roundNumber: 1,
      category: 'Test',
      role: 'impostor',
      secret: 'nie powinno tu być',
      submitted: false,
      yourClue: null,
      roster: [],
      deadline: null,
    };
    expect(parseServerMessage({ v: 1, t: 'view', now: 10, view }).ok).toBe(false);
  });

  it('drops oversized payloads', () => {
    expect(payloadTooLarge({ t: 'clue', text: 'x'.repeat(9_000) })).toBe(true);
    expect(payloadTooLarge({ t: 'ping' })).toBe(false);
  });
});
