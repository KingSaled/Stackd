import { create } from 'zustand';

/**
 * Limited-time looks. A season only changes how the site looks: it sets
 * `data-season` on <html>, which the seasonal stylesheet keys off. Windows run
 * in the player's local time, and an open tab switches back by itself the
 * moment a season ends, without a reload.
 */
export type Season = 'halloween';

export interface SeasonWindow {
  id: Season;
  start: Date;
  end: Date;
}

export const SEASON_WINDOWS: SeasonWindow[] = [
  // Spooky season: on until midnight at the start of November 1.
  { id: 'halloween', start: new Date(2026, 9, 1), end: new Date(2026, 10, 1) },
];

export function seasonAt(t: number, windows: SeasonWindow[] = SEASON_WINDOWS): Season | null {
  return windows.find((w) => t >= w.start.getTime() && t < w.end.getTime())?.id ?? null;
}

/** The next moment a season starts or ends after `t` (null when nothing else is scheduled). */
export function nextSeasonChange(t: number, windows: SeasonWindow[] = SEASON_WINDOWS): number | null {
  const times = windows.flatMap((w) => [w.start.getTime(), w.end.getTime()]).filter((x) => x > t);
  return times.length ? Math.min(...times) : null;
}

// Preview any look with ?season=halloween or ?season=off (kept for this tab only).
const PREVIEW_KEY = 'stackd:season-preview';
function preview(): Season | 'off' | null {
  try {
    const param = new URLSearchParams(window.location.search).get('season');
    if (param === 'halloween' || param === 'off') sessionStorage.setItem(PREVIEW_KEY, param);
    else if (param === 'auto') sessionStorage.removeItem(PREVIEW_KEY);
    const saved = sessionStorage.getItem(PREVIEW_KEY);
    return saved === 'halloween' || saved === 'off' ? saved : null;
  } catch {
    return null;
  }
}

export const useSeason = create<{ season: Season | null }>(() => ({ season: null }));

/** Is a season's look showing right now? (For the few touches made in code, like confetti colours.) */
export const isSeason = (s: Season) => useSeason.getState().season === s;

const THEME_COLOR: Record<Season | 'none', string> = { halloween: '#0b0714', none: '#070a12' };

function apply(season: Season | null) {
  const root = document.documentElement;
  if (season) root.dataset.season = season;
  else delete root.dataset.season;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[season ?? 'none']);
  if (useSeason.getState().season !== season) useSeason.setState({ season });
}

/** Apply the current season and keep it current (call once at startup, before the first render). */
export function startSeasons() {
  const forced = preview();
  let timer = 0;
  const update = () => {
    clearTimeout(timer);
    const now = Date.now();
    apply(forced === 'off' ? null : forced ?? seasonAt(now));
    if (forced) return;
    const next = nextSeasonChange(now);
    // Browsers cap timers at ~24.8 days, so wait in steps of at most six hours.
    if (next != null) timer = window.setTimeout(update, Math.min(next - now + 50, 6 * 3600_000));
  };
  // Sleeping laptops and background tabs can delay timers, so check again whenever the page comes back.
  const onVisible = () => document.visibilityState === 'visible' && update();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', update);
  update();
  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', update);
  };
}

/** Confetti colours for wins (pumpkin, candlelight, potion green and witch purple in October). */
export function celebrationColors(normal: string[]): string[] {
  return isSeason('halloween') ? ['#ff8a1c', '#ffc46b', '#9cf06a', '#a66bff', '#fff3e0'] : normal;
}
