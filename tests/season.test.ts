import { describe, expect, it } from 'vitest';
import { SEASON_WINDOWS, nextSeasonChange, seasonAt } from '../src/lib/season';

const at = (y: number, m: number, d: number, h = 0, min = 0, s = 0, ms = 0) => new Date(y, m - 1, d, h, min, s, ms).getTime();

describe('seasons', () => {
  it('Halloween runs through October 31 and ends at midnight on November 1 (local time)', () => {
    expect(seasonAt(at(2026, 9, 30, 23, 59))).toBeNull();
    expect(seasonAt(at(2026, 10, 1))).toBe('halloween');
    expect(seasonAt(at(2026, 10, 7, 21, 30))).toBe('halloween');
    expect(seasonAt(at(2026, 10, 31, 23, 59, 59, 999))).toBe('halloween');
    expect(seasonAt(at(2026, 11, 1))).toBeNull();
    expect(seasonAt(at(2026, 12, 25))).toBeNull();
  });

  it('knows when to switch back', () => {
    expect(nextSeasonChange(at(2026, 10, 7))).toBe(at(2026, 11, 1));
    expect(nextSeasonChange(at(2026, 11, 1))).toBeNull();
    expect(SEASON_WINDOWS.every((w) => w.start < w.end)).toBe(true);
  });
});
