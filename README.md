# Stackd

**Real-time multiplayer Texas Hold'em for friends.** Create a private table, share the link, and play No-Limit Hold'em on any desktop or phone browser. Stackd has accounts (or one-tap guest play), chips and stats that follow you between devices, animated cards and chips, and sound effects synthesized in the browser.

Everything runs on free tiers: **Netlify** (static site + serverless functions) and **Supabase** (Postgres, Auth, Realtime).

---

## Features

**Gameplay**
- Server-side No-Limit Hold'em engine that decides every outcome: blinds, button rotation (with heads-up rules), pre-flop/flop/turn/river, showdown and payout.
- Check, call, bet, raise, fold and all-in, with full minimum-raise validation. A short all-in does not re-open betting, unless several short all-ins together add up to a full raise.
- Side pots for any number of all-ins of different sizes. Folded chips stay in the pot as dead money. Uncalled bets are returned, and odd chips in a split pot go left of the button.
- A deterministic 7-card hand evaluator (high card through royal flush) with exact kicker tie-breaks.
- A configurable turn timer that auto-checks or auto-folds. After two timeouts in a row a player is marked away, sits out, and acts instantly so the table never waits.
- All-in run-outs reveal every hand and deal the remaining board with dramatic pauses.

**Bots**
- When creating a table you can tick **Fill empty seats with bots**. Every open seat is then kept filled with a bot as long as at least one real player is seated.
- Each bot gets a random, hidden skill level (easy, medium or hard) and its own personality (how tight, aggressive and bluff-happy it is), so there's no reliable "free money" seat. In simulations, hard bots beat easy ones by a wide margin.
- Bots only see what a real player would: their own cards, the board and the betting. They decide from simulated win chances, pot odds, position and bet pressure.
- Anyone who isn't seated sees a **Sit** button on every bot. Picking one replaces that bot right away, or, if the bot is in the middle of a hand, when the hand ends. The buy-in is held until then and refunded if you cancel.
- Bots have no wallet and no stats, are never written to the database, and hands are never dealt with only bots at the table. If every real player leaves, the table closes.

**Rooms & social**
- Private tables with custom blinds, 2–9 seats, buy-in range, turn timer, optional password and optional lobby listing.
- One-click invite links (`/t/ROOMID`). These use the native share sheet on mobile, and the host's link can carry the password in the URL fragment (`#key=…`).
- Friends who open an invite can play right away as a guest and save the account later.
- Table chat, a hand log, and emoji reactions that float above the sender's seat.
- Presence shows who is connected. Disconnected players get a badge.

**Accounts & economy**
- Email/password accounts, password reset, and guest accounts that can be upgraded later.
- A profile with display name, avatar and color, plus stats: hands played, hands won, win rate, biggest pot and best hand.
- 10,000 starting chips.
- A daily bonus (2,000 chips, plus 500 per consecutive day up to a 7-day streak) every 24 hours.
- An emergency reload: if your wallet plus the chips you have at tables drop below 1,000, you can top back up to 2,500. It has a 60-minute cooldown.
- Leaderboard of saved accounts (guest accounts are left off).

**Session recovery**
- All game state lives in Postgres. If you refresh, lose your connection or switch devices, you get your seat, cards and turn back.
- The lobby lists **Your seats** so you can rejoin from any device.
- An hourly janitor closes abandoned tables, refunds any hand in progress and cashes every seated player out.

**Feel**
- A dark casino look with a felt table, wooden rail and gold accents, laid out for desktop widescreen, mobile portrait and mobile landscape.
- Spring-physics animations: cards dealt from the center, 3D card flips, chips tossed into the pot and pushed to the winner, a pulsing turn timer ring, a winner glow with confetti, and hand-strength hints.
- Sound effects for dealing, flips, chips, check knocks, fold swooshes, all-in swells, countdown ticks, your-turn chimes and win fanfares. They are synthesized with the **Web Audio API** (no audio files) and have a global mute and volume control.
- Keyboard shortcuts: `F` fold, `C` check/call, `R` raise, `Enter` confirm.
- Pre-actions: Check/Fold, Check, Call any.
- Optional four-color deck.

---

## Architecture

```
 Browser (React + Vite)                 Netlify                         Supabase
┌────────────────────────┐   POST    ┌──────────────────────────┐  RPC  ┌───────────────────────────┐
│ UI, animations, sound   │ ───────▶ │ /.netlify/functions/api   │ ────▶ │ Postgres                   │
│ shared engine (preview) │  (JWT)   │  • verifies the user       │       │  • commit_table(): atomic, │
│                         │          │  • loads table + secrets   │       │    version-checked writes  │
│                         │          │  • runs the poker engine   │       │  • RLS on every table      │
│                         │          │  • commits atomically      │       │  • economy RPCs            │
│                         │ ◀─────── │                            │       │                            │
│                         │  Realtime (websocket): table state, private cards, chat, presence          │
│                         │ ◀──────────────────────────────────────────────────────────────────────── │
└────────────────────────┘          │ janitor (scheduled, hourly)│       │ Auth (email, anonymous)    │
                                     └──────────────────────────┘       └───────────────────────────┘
```

- **The engine runs on the server.** `shared/poker` is pure TypeScript: no I/O, with time and randomness injected. Netlify Functions load a table, apply exactly one transition, and commit the new state through a single Postgres function inside one transaction (state, deck, private cards, wallet movements, stats and seat projection). Optimistic concurrency (a version check plus retries) means simultaneous actions can't corrupt a hand.
- **Hidden information stays hidden.** The deck and everyone's hole cards live in `table_secrets`, which clients cannot read. Each player's own cards go to `player_cards`, where row-level security only lets the owner read them. The public table state that is streamed to everyone never contains unrevealed cards.
- **Timers without servers.** Serverless functions can't hold timers, so deadlines (turn timer, next-hand countdown) are stored as server timestamps. When one expires, a connected client asks the server to advance the table. Clients take turns in a staggered order, so normally only one asks. The server acts only if the deadline really passed, and the table moves on as long as anyone is watching.
- **Chips cost nothing to sync.** Clients read state straight from Supabase over Realtime. Netlify functions only run on player actions (roughly one call per action plus one per hand), which keeps usage well inside the free tiers.

### Repository layout

```
shared/poker/        Poker engine: cards, evaluator, side pots, state machine, projections
shared/economy.ts    Economy constants, avatars, colors, blind presets
server/              Table service (load → apply → commit with retries), Supabase repo, auth
netlify/functions/   api.mts (game API) and janitor.mts (hourly scheduled cleanup)
supabase/schema.sql  Full database schema: tables, RLS, RPCs, triggers, realtime publication
src/                 React app (pages, table UI, hooks, sound engine, styles)
src/dev/Playground   Dev-only table playground at /dev (local engine, no backend)
tests/               Engine, evaluator, side-pot, SQL (PGlite) and service integration tests
```

---

## Deploy it (about 10 minutes, free)

### 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a new project (free plan). Pick any region and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste the full contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. The script is idempotent, so you can re-run it after pulling updates.
3. Open **Authentication → Sign In / Providers**:
   - **Email** stays enabled. For instant sign-ups with no confirmation email, turn **off** "Confirm email". Leave it on if you want verified emails.
   - Turn **on** "Allow anonymous sign-ins" to enable one-tap guest play. This is recommended because it makes invite links frictionless.
4. Open **Authentication → URL Configuration** and set **Site URL** to your Netlify URL (for example `https://your-site.netlify.app`). Add the same URL with `/**` under **Redirect URLs**. Password-reset and confirmation emails use these. You can come back to this step after step 2.
5. Open **Project Settings → API** (or **API Keys**) and copy:
   - the **Project URL**
   - the **anon / publishable** key
   - the **service_role / secret** key (keep this one private)

### 2. Deploy on Netlify

1. In Netlify choose **Add new site → Import an existing project → GitHub** and pick this repository. Netlify reads the build settings from `netlify.toml`: build command `npm run build`, publish directory `dist`, functions in `netlify/functions`.
2. Before the first deploy (or under **Site configuration → Environment variables**), add these three variables:

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL` | Project URL |
   | `SUPABASE_ANON_KEY` | anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |

   The anon key is embedded in the browser bundle at build time, which is safe because RLS protects all data. The service role key is only read by the functions.
   > If you use Netlify's Supabase extension instead, the variables it creates (`SUPABASE_DATABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) also work.
3. Deploy. Any time you change environment variables, trigger **Deploys → Trigger deploy → Clear cache and deploy site**.
4. Open your site, create an account (or play as a guest), create a table and send the invite link to your friends.

Until the variables are set, the deployed site shows a setup screen with these steps. If your repository's default branch isn't the one Netlify builds, set the production branch under **Site configuration → Build & deploy → Branches**.

---

## Local development

```bash
npm install
cp .env.example .env        # fill in your Supabase URL + keys
npx netlify dev             # Vite + functions together on http://localhost:8888
```

- `npm run dev` runs only the Vite frontend. Game actions need the functions, so use `netlify dev` for real play.
- `http://localhost:5173/dev?scene=flop&seats=6` opens the **UI playground**. It runs the real engine locally with fake players and no backend. Scenes: `waiting`, `preflop`, `flop`, `showdown`, `allin`. It is stripped from production builds.
- `npm test` runs the full test suite. `npm run typecheck` checks types. `npm run build` builds for production.

### Tests

```bash
npm test
```

- **Evaluator:** every hand category, wheel straights, kickers, exact ties, and a statistical check that 60,000 random 7-card hands match the known category frequencies.
- **Side pots:** layered all-ins, dead money from folds, and odd-chip distribution.
- **Engine:** blinds and positions (including heads-up), the BB option, minimum raises, incomplete all-ins (and cumulative ones re-opening betting), uncalled bets, split pots, short blinds, busting, timeouts, away players, standing up mid-hand, closing a table, and a **fuzz test**. The fuzz test plays thousands of random actions, seat changes and top-ups across 40 tables and checks that chips are never created or destroyed and the table never stalls.
- **SQL** (runs `supabase/schema.sql` in an in-process Postgres via PGlite): profile creation, guest upgrades, daily bonus streaks, reload cooldowns and broke checks, profile validation, password rooms and brute-force throttling, RLS isolation of cards, secrets and chat, chat identity stamping and rate limits, and atomic commits with version conflicts and overdraft rollback.
- **Service integration:** the real table service against the real SQL functions. It creates rooms, buys in, deals, acts, resolves concurrent writers, applies timeouts, stands up and cashes out, runs the janitor and checks password-room gating.

---

## Free-tier notes

- **Netlify:** the static site plus about one function call per player action. Clients never poll Netlify for updates.
- **Supabase free plan:** 500 MB database, 2 million Realtime messages a month, 200 concurrent Realtime connections. That is plenty for friends' games.
- Supabase pauses free projects after about a week of inactivity. The hourly janitor function touches the database, which usually keeps the project awake. If it does get paused, restore it from the Supabase dashboard.

- New free-plan Netlify sites show a "Powered by Netlify" badge in the bottom-right corner, which covers the action buttons on phones. Turn it off under **Project configuration → General → Powered by Netlify badge**. No redeploy is needed.

## Releasing updates

- **Players with the game open:** every build writes a `version.json`. Open tabs check it every few minutes and show a "new version ready" banner with a Refresh button. Nobody is reloaded mid-hand, and game state lives in the database, so refreshing is always safe.
- **Changelog:** add a new entry at the top of `src/changelog.ts` with a new `version`. Each player sees the newest entry once (tracked on their account by `mark_changelog_seen`); accounts created after that release skip it.

## Credits

Avatar and reaction images are [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) by Microsoft (MIT license, see `public/emoji/LICENSE.txt`). They are bundled as images so every player sees the same picture on any device.

## Security model

- Clients can only **read** what row-level security allows. They can only **write** through a short list of validated `SECURITY DEFINER` functions (profile edits, daily bonus, emergency reload, joining a room) and chat inserts. Chat inserts are checked by a trigger that stamps the sender's identity and rate-limits messages.
- Chip balances, seats and game state are changed only by Netlify Functions using the service role, and every change goes through `commit_table()`, which refuses overdrafts and stale writes.
- Room passwords are bcrypt-hashed (`pgcrypto`). Joining is throttled after 5 failed attempts.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Almost ready to deal" setup screen | Set the three environment variables in Netlify and redeploy (clear the cache). |
| "Server is not configured" when acting | `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_URL` is missing for Functions. Check the variable scopes in Netlify. |
| Guest button says guest play is disabled | Enable anonymous sign-ins in Supabase Auth. |
| Sign-up says "check your inbox" | Email confirmation is on. Confirm the email, or turn it off in Supabase Auth. |
| "Email rate limit exceeded" on sign-up | Supabase's built-in mailer only sends a few emails per hour. Turn off "Confirm email", or add your own SMTP provider under Auth settings. |
| Table never updates live | Make sure `schema.sql` ran completely. It adds the tables to the `supabase_realtime` publication. |
| "Game server not found" locally | Run `npx netlify dev` instead of `npm run dev`. |
