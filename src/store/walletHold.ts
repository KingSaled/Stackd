import { create } from 'zustand';

/**
 * Winnings the wallet display holds back while a minigame animation plays out:
 * the server pays instantly, but the top bar shouldn't give away the result
 * before the reel stops or the coin lands.
 */
export const useWalletHold = create<{ held: number; hold(n: number): void; release(): void }>((set) => ({
  held: 0,
  hold: (n) => set({ held: Math.max(0, n) }),
  release: () => set({ held: 0 }),
}));
