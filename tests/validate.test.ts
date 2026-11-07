import { describe, expect, it } from 'vitest';
import { peopleLabel, votesLabel } from '../src/copy';
import {
  buildScreenUrl,
  cleanClue,
  cleanName,
  hostPeerId,
  isRoomCode,
  normalizeRoomInput,
  roomCodeError,
  takeToken,
} from '../src/game/validate';

describe('input rules', () => {
  it('cleans names and clues', () => {
    expect(cleanName('  Żaneta  ')).toBe('Żaneta');
    expect(cleanName('Anna Maria')).toBe('Anna Maria');
    expect(cleanName('A')).toBeNull();
    expect(cleanName('Ala<script>')).toBeNull();
    expect(cleanName('krzak_1')).toBe('krzak_1');
    expect(cleanClue('  a\nb  ')).toBe('a b');
    expect(cleanClue('   ')).toBeNull();
    expect(cleanClue('x'.repeat(80))).toBe('x'.repeat(80));
    expect(cleanClue('x'.repeat(81))).toBeNull();
  });

  it('normalizes room codes and rejects ambiguous characters', () => {
    expect(normalizeRoomInput(' ab7k ')).toBe('AB7K');
    expect(isRoomCode('AB7K')).toBe(true);
    expect(isRoomCode('AB70')).toBe(false);
    expect(roomCodeError('ABO2')).toMatch(/0, 1, O ani I/);
    expect(roomCodeError('AB')).toMatch(/4 znaki/);
    expect(roomCodeError('AB7K')).toBeNull();
    expect(hostPeerId('AB7K')).toBe('ktoab7k');
  });

  it('rate-limits a burst and refills over time', () => {
    let bucket = { tokens: 10, updatedAt: 0 };
    for (let i = 0; i < 10; i += 1) {
      const result = takeToken(bucket, 0, 1);
      expect(result.ok).toBe(true);
      bucket = result.bucket;
    }
    expect(takeToken(bucket, 0, 1).ok).toBe(false);
    expect(takeToken(bucket, 1_000, 1).ok).toBe(true);
  });

  it('builds a join link on the current path, including a GitHub Pages subpath', () => {
    expect(buildScreenUrl('https://krz4czy.github.io/kto-sciemnia/?screen=host', 'join', 'AB7K'))
      .toBe('https://krz4czy.github.io/kto-sciemnia/?screen=join&room=AB7K');
    expect(buildScreenUrl('https://krz4czy.github.io/kto-sciemnia/index.html?screen=host', 'join', 'AB7K'))
      .toBe('https://krz4czy.github.io/kto-sciemnia/?screen=join&room=AB7K');
    expect(buildScreenUrl('http://127.0.0.1:4173/?screen=host', 'host'))
      .toBe('http://127.0.0.1:4173/?screen=host');
  });

  it('pluralizes votes and people', () => {
    expect(votesLabel(1)).toBe('1 głos');
    expect(votesLabel(2)).toBe('2 głosy');
    expect(votesLabel(5)).toBe('5 głosów');
    expect(votesLabel(12)).toBe('12 głosów');
    expect(votesLabel(22)).toBe('22 głosy');
    expect(peopleLabel(1)).toBe('1 osoba');
    expect(peopleLabel(3)).toBe('3 osoby');
    expect(peopleLabel(5)).toBe('5 osób');
  });
});
