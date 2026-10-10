/**
 * Name styles, Stackd Club cards and the public profile card, against the real schema
 * in an in-process Postgres: buying and equipping, member numbers, what other players
 * can see about you, and that your look travels with you into chat and the minigames.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createDb } from './pglite';
import { CLUB_CARDS, COSMETICS, NAME_STYLES } from '../shared/cosmetics';

const A = '00000000-0000-0000-0000-0000000000a1';
const B = '00000000-0000-0000-0000-0000000000b1';
const C = '00000000-0000-0000-0000-0000000000c1';

let db: PGlite;

async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); select set_config('request.headers', '', false);`);
  await db.exec(user ? 'set role authenticated' : 'set role service_role');
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}
const rpc = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => (await as<{ r: T }>(user, `select ${sql} as r`, params))[0].r;
const setChips = (id: string, n: number) => db.query('update public.profiles set chips = $2 where id = $1', [id, n]);
const profile = async (id: string) =>
  (await db.query<{ chips: string; name_fx: string | null; club: string | null }>('select chips, name_fx, club from public.profiles where id = $1', [id])).rows[0];

beforeAll(async () => {
  db = await createDb();
  for (const [id, name] of [[A, 'Ann'], [B, 'Ben'], [C, 'Cy']])
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${name}@example.com`, JSON.stringify({ display_name: name })]);
  // Saved accounts (not guests) so they count for the leaderboard.
  await db.query(`update public.profiles set is_guest = false, hands_played = 10`);
}, 120_000);

describe('catalogue', () => {
  it('has a big range of name styles and club cards, topping out at 30M and 100M', () => {
    expect(NAME_STYLES.length).toBeGreaterThanOrEqual(15);
    expect(Math.max(...NAME_STYLES.map((n) => n.price))).toBe(30_000_000);
    expect(Math.max(...COSMETICS.filter((c) => c.kind === 'frame').map((c) => c.price))).toBe(30_000_000);
    expect(Math.max(...COSMETICS.filter((c) => c.kind === 'backdrop').map((c) => c.price))).toBe(30_000_000);
    expect(Math.max(...CLUB_CARDS.map((c) => c.price))).toBe(100_000_000);
    expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
  });
});

describe('name styles and club cards', () => {
  it('buys and equips a name style, and can switch back to a plain name', async () => {
    await setChips(A, 1_000_000);
    const r = await rpc<{ ok: boolean; name_fx: string; chips: number }>(A, `public.buy_cosmetic('name-rainbow')`);
    expect(r).toMatchObject({ ok: true, name_fx: 'name-rainbow' });
    // 150,000 for the style, plus the 1,000 first-purchase achievement.
    expect(Number((await profile(A)).chips)).toBe(1_000_000 - 150_000 + 1_000);
    expect(await rpc<{ name_fx: string | null }>(A, `public.equip_cosmetic('name', null)`)).toMatchObject({ name_fx: null });
    expect(await rpc<{ name_fx: string | null }>(A, `public.equip_cosmetic('name', 'name-rainbow')`)).toMatchObject({ name_fx: 'name-rainbow' });
  });

  it("won't equip a card you don't own or a name style in the card slot", async () => {
    await expect(as(A, `select public.equip_cosmetic('club', 'club-black')`)).rejects.toThrow(/own/);
    await expect(as(A, `select public.equip_cosmetic('club', 'name-rainbow')`)).rejects.toThrow(/own/);
    await expect(as(A, `select public.equip_cosmetic('aura', null)`)).rejects.toThrow(/slot/);
  });

  it('numbers club members in the order they joined', async () => {
    await setChips(B, 6_000_000);
    await setChips(C, 6_000_000);
    expect((await rpc<{ ok: boolean }>(C, `public.buy_cosmetic('club-gold')`)).ok).toBe(true);
    expect((await rpc<{ ok: boolean }>(B, `public.buy_cosmetic('club-gold')`)).ok).toBe(true);
    expect((await profile(B)).club).toBe('club-gold');
    const b = await rpc<{ counts: Record<string, number>; mine: Record<string, number> }>(B, 'public.club_stats()');
    expect(Number(b.counts['club-gold'])).toBe(2);
    expect(Number(b.mine['club-gold'])).toBe(2);
    const c = await rpc<{ mine: Record<string, number> }>(C, 'public.club_stats()');
    expect(Number(c.mine['club-gold'])).toBe(1);
    expect(await rpc<{ mine: Record<string, number> }>(A, 'public.club_stats()')).toMatchObject({ mine: {} });
  });

  it('refuses a card you cannot afford', async () => {
    await setChips(A, 50_000);
    expect(await rpc<{ ok: boolean; reason: string }>(A, `public.buy_cosmetic('club-infinite')`)).toMatchObject({ ok: false, reason: 'insufficient_chips' });
  });
});

describe('profile card', () => {
  it('shows net worth, collection value, rank and the club card to other players', async () => {
    await setChips(B, 2_000_000);
    await setChips(C, 9_000_000);
    const p = await rpc<{
      display_name: string;
      net_worth: number;
      collection_value: number;
      items_owned: number;
      rank: number;
      club: string;
      club_card: { id: string; number: number };
    }>(A, 'public.public_profile($1)', [B]);
    expect(p.display_name).toBe('Ben');
    expect(Number(p.net_worth)).toBe(2_000_000);
    expect(Number(p.collection_value)).toBe(5_000_000);
    expect(p.items_owned).toBe(1);
    expect(p.rank).toBe(2); // C has more
    expect(p.club).toBe('club-gold');
    expect(Number(p.club_card.number)).toBe(2);
  });

  it('keeps net worth and rank private for players hidden from the leaderboard', async () => {
    await db.query('update public.profiles set leaderboard_hidden = true where id = $1', [C]);
    const p = await rpc<{ net_worth: number | null; rank: number | null }>(A, 'public.public_profile($1)', [C]);
    expect(p).toMatchObject({ net_worth: null, rank: null });
    // Your own card always shows your own net worth.
    expect(Number((await rpc<{ net_worth: number }>(C, 'public.public_profile($1)', [C])).net_worth)).toBe(9_000_000);
    await db.query('update public.profiles set leaderboard_hidden = false where id = $1', [C]);
  });

  it('needs a signed-in player and returns nothing for unknown ids', async () => {
    await expect(as(null, `select public.public_profile('${B}')`)).rejects.toThrow();
    expect(await rpc(A, `public.public_profile('00000000-0000-0000-0000-00000000ffff')`)).toBeNull();
  });
});

describe('your look travels with you', () => {
  it('into the leaderboard, Coin Flip lobbies and Roulette bets', async () => {
    const board = await as<{ id: string; name_fx: string | null; club: string | null }>(A, 'select id, name_fx, club from public.leaderboard()');
    expect(board.find((r) => r.id === A)?.name_fx).toBe('name-rainbow');
    expect(board.find((r) => r.id === B)?.club).toBe('club-gold');

    await setChips(A, 100_000);
    const flip = await rpc<{ ok: boolean; id: number }>(A, 'public.create_coinflip(1000)');
    const [row] = (await db.query<{ creator_name_fx: string; creator_club: string | null }>('select creator_name_fx, creator_club from public.coinflips where id = $1', [flip.id])).rows;
    expect(row).toMatchObject({ creator_name_fx: 'name-rainbow', creator_club: null });

    await rpc(B, `public.place_roulette_bet('red', 100)`);
    const state = await rpc<{ bets: { user_id: string; club: string | null }[] }>(B, 'public.roulette_state()');
    expect(state.bets.find((b) => b.user_id === B)?.club).toBe('club-gold');
  });
});
