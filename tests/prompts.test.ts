import { describe, expect, it } from 'vitest';
import { pickPrompt } from '../src/game/logic';
import { PROMPTS } from '../src/game/prompts';
import { CATEGORY_MAX, SECRET_MAX } from '../src/game/types';

describe('prompt bank', () => {
  it('is a large original Polish deck with unique ids', () => {
    const mild = PROMPTS.filter((card) => card.spice === 'mild');
    const spicy = PROMPTS.filter((card) => card.spice === 'spicy');
    expect(mild.length).toBeGreaterThanOrEqual(40);
    expect(spicy.length).toBeGreaterThanOrEqual(24);
    expect(new Set(PROMPTS.map((card) => card.id)).size).toBe(PROMPTS.length);
    expect(new Set(PROMPTS.map((card) => card.secret)).size).toBe(PROMPTS.length);
    expect(PROMPTS.some((card) => /[ąćęłńóśźż]/i.test(card.secret))).toBe(true);
  });

  it('keeps categories from spoiling their own secret', () => {
    for (const card of PROMPTS) {
      expect(card.category.length).toBeGreaterThan(0);
      expect(card.category.length).toBeLessThanOrEqual(CATEGORY_MAX);
      expect(card.secret.length).toBeGreaterThan(8);
      expect(card.secret.length).toBeLessThanOrEqual(SECRET_MAX);
      const category = card.category.toLocaleLowerCase('pl');
      const secret = card.secret.toLocaleLowerCase('pl');
      expect(secret.includes(category)).toBe(false);
      expect(category.includes(secret)).toBe(false);
    }
  });

  it('does not deal a spicy card in the mild deck and eventually reshuffles', () => {
    const seen: string[] = [];
    let used: string[] = [];
    for (let i = 0; i < 80; i += 1) {
      const picked = pickPrompt(PROMPTS, used, 'mild', () => 0.97);
      expect(picked.prompt.spice).toBe('mild');
      seen.push(picked.prompt.id);
      used = picked.usedIds;
    }
    expect(new Set(seen).size).toBeGreaterThan(10);
    const spicy = pickPrompt(PROMPTS, [], 'spicy', () => 0.999);
    expect(spicy.prompt.spice).toBe('spicy');
  });
});
