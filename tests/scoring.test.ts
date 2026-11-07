import { describe, expect, it } from 'vitest';
import { scoreRound } from '../src/game/logic';
import { POINTS } from '../src/game/types';

const ids = ['a', 'b', 'c', 'd'];

describe('scoreRound', () => {
  it('catches the impostor on a strict majority and pays correct voters', () => {
    const result = scoreRound(ids.slice(0, 3), 'b', { a: 'b', c: 'b', b: 'a' });
    expect(result.caught).toBe(true);
    expect(result.counts).toEqual({ a: 1, b: 2, c: 0 });
    expect(result.deltas).toEqual({
      a: POINTS.voteCaught,
      b: POINTS.impostorCaught,
      c: POINTS.voteCaught,
    });
  });

  it('lets the impostor escape on a tie and still gives a small point for a correct vote', () => {
    const result = scoreRound(['a', 'b', 'c'], 'b', { a: 'b', c: 'a' });
    expect(result.caught).toBe(false);
    expect(result.deltas).toEqual({
      a: POINTS.voteEscaped,
      b: POINTS.impostorEscaped,
      c: 0,
    });
  });

  it('treats abstentions as no vote and still catches a unique leader', () => {
    const result = scoreRound(['a', 'b', 'c'], 'b', { a: 'b' });
    expect(result.caught).toBe(true);
    expect(result.counts.b).toBe(1);
    expect(result.deltas).toEqual({ a: POINTS.voteCaught, b: 0, c: 0 });
  });

  it('lets the impostor escape when nobody votes', () => {
    const result = scoreRound(['a', 'b', 'c'], 'a', {});
    expect(result.caught).toBe(false);
    expect(result.deltas.a).toBe(POINTS.impostorEscaped);
    expect(result.deltas.b).toBe(0);
  });

  it('ignores self-votes and votes for people outside the round', () => {
    const result = scoreRound(['a', 'b', 'c'], 'a', { a: 'a', b: 'a', c: 'ghost' });
    expect(result.counts).toEqual({ a: 1, b: 0, c: 0 });
    expect(result.caught).toBe(true);
    expect(result.deltas.c).toBe(0);
  });

  it('scores a full table of ten', () => {
    const table = Array.from({ length: 10 }, (_, index) => `p${index}`);
    const impostor = 'p3';
    const votes: Record<string, string> = {};
    for (const id of table) {
      if (id !== impostor) votes[id] = impostor;
    }
    votes[impostor] = 'p0';
    const result = scoreRound(table, impostor, votes);
    expect(result.caught).toBe(true);
    expect(result.counts[impostor]).toBe(9);
    expect(result.deltas[impostor]).toBe(0);
    expect(result.deltas.p0).toBe(POINTS.voteCaught);
    expect(result.deltas.p8).toBe(POINTS.voteCaught);
  });
});
