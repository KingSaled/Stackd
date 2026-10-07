import { describe, expect, it } from 'vitest';
import { pickQuickTable, quickBuyInNeeded, type OpenTableRow } from '../src/lib/quickMatch';
import { pokerTableConfig } from '../src/lib/tableOptions';
import type { PokerQuickPlay } from '../src/store/quickplay';

// 10/20 blinds, 6 seats, standard buy-in (800-2,000), with bots.
const prefs: PokerQuickPlay = { blind: 1, seats: 6, buyin: 1, timer: 30, bots: true, joinOpen: true };

const row = (over: Partial<OpenTableRow>): OpenTableRow => ({
  id: 'T',
  name: 'Table',
  small_blind: 10,
  big_blind: 20,
  max_seats: 6,
  min_buy_in: 800,
  max_buy_in: 2000,
  player_count: 1,
  updated_at: '2026-10-07T10:00:00Z',
  bots: true,
  game: 'holdem',
  turn_seconds: 30,
  ...over,
});

describe('quick play', () => {
  it('turns settings into a table config', () => {
    expect(pokerTableConfig(prefs)).toEqual({ smallBlind: 10, bigBlind: 20, maxSeats: 6, minBuyIn: 800, maxBuyIn: 2000, turnSeconds: 30, bots: true });
    expect(quickBuyInNeeded(prefs)).toBe(800);
  });

  it('joins the busiest open poker table with the same blinds, seats and bots', () => {
    const rows = [
      row({ id: 'QUIET', player_count: 1 }),
      row({ id: 'BUSY', player_count: 3 }),
      row({ id: 'FULL', player_count: 6 }),
      row({ id: 'BIGGER', small_blind: 25, big_blind: 50, player_count: 5 }),
      row({ id: 'NINE', max_seats: 9, player_count: 5 }),
      row({ id: 'NOBOTS', bots: false, player_count: 5 }),
      row({ id: 'BJ', game: 'blackjack', small_blind: null, big_blind: null, player_count: 5 }),
    ];
    expect(pickQuickTable(rows, 'holdem', prefs, 10_000)?.id).toBe('BUSY');
  });

  it('skips tables the wallet cannot cover and opens a new one when nothing fits', () => {
    expect(pickQuickTable([row({ id: 'DEEP', min_buy_in: 2000 })], 'holdem', prefs, 1500)).toBeNull();
    expect(pickQuickTable([row({ player_count: 6 })], 'holdem', prefs, 10_000)).toBeNull();
    expect(pickQuickTable([], 'holdem', prefs, 10_000)).toBeNull();
  });

  it('a timer difference does not stop players joining each other', () => {
    expect(pickQuickTable([row({ id: 'SLOW', turn_seconds: 60 })], 'holdem', prefs, 10_000)?.id).toBe('SLOW');
  });

  it('blackjack joins any blackjack table with a free seat, busiest first', () => {
    const bj = { timer: 15, joinOpen: true };
    const rows = [
      row({ id: 'POKER', player_count: 4 }),
      row({ id: 'BJ1', game: 'blackjack', small_blind: null, big_blind: null, max_seats: 6, player_count: 2 }),
      row({ id: 'BJ2', game: 'blackjack', small_blind: null, big_blind: null, max_seats: 6, player_count: 4 }),
      row({ id: 'BJFULL', game: 'blackjack', small_blind: null, big_blind: null, max_seats: 6, player_count: 6 }),
    ];
    expect(pickQuickTable(rows, 'blackjack', bj, 0)?.id).toBe('BJ2');
    expect(pickQuickTable(rows.slice(0, 1), 'blackjack', bj, 0)).toBeNull();
  });
});
