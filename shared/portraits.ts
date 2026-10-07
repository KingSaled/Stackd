/**
 * Pixel-art player portraits (public/portraits/<id>.png, 32×32 with a transparent
 * background so a backdrop can show behind them).
 */
export const PORTRAITS = [
  'p01', 'p03', 'p04', 'p06', 'p07', 'p11', 'p13', 'p15', 'p16', 'p18',
  'p20', 'p21', 'p22', 'p23', 'p24', 'p26', 'p29', 'p31', 'p33', 'p34',
  'p35', 'p38', 'p39', 'p42', 'p43', 'p44', 'p46', 'p47', 'p48', 'p50',
  'p51', 'p53', 'p56', 'p57', 'p59', 'p62', 'p67', 'p68', 'p69', 'p75',
  'p76', 'p83', 'p90', 'p91', 'p97', 'p98', 'p99', 'p102', 'p105', 'p110',
] as const;

export type PortraitId = (typeof PORTRAITS)[number];

/** Emoji avatars used before portraits existed, in their original order. */
export const LEGACY_EMOJI = [
  '🦊', '🐺', '🦁', '🐯', '🐼', '🐸', '🐙', '🦄',
  '🐲', '🦈', '🦉', '🐻', '🐵', '🐧', '🦝', '🐨',
  '👽', '🤖', '👑', '🎩', '💎', '🔥', '⚡', '🍀',
  '🎲', '🃏', '🚀', '🌙', '😎', '🤠', '🥷', '🧙', '👻',
];

const SET = new Set<string>(PORTRAITS);

export function isPortrait(id: string | null | undefined): id is PortraitId {
  return !!id && SET.has(id);
}

/**
 * Resolve any stored avatar to a portrait. Old emoji avatars (in profiles,
 * chat history and tables saved before the switch) map to a fixed portrait.
 */
export function portraitOf(avatar: string | null | undefined): PortraitId {
  if (isPortrait(avatar)) return avatar;
  const i = avatar ? LEGACY_EMOJI.indexOf(avatar.replace(/️/g, '')) : -1;
  if (i >= 0) return PORTRAITS[i % PORTRAITS.length];
  // Anything else: a stable pick from the text so the same player always looks the same.
  let h = 0;
  for (const ch of avatar ?? '') h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return PORTRAITS[h % PORTRAITS.length];
}

export function portraitSrc(avatar: string | null | undefined): string {
  return `/portraits/${portraitOf(avatar)}.png`;
}
