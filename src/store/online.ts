import { create } from 'zustand';

/** How many signed-in players have Stackd open right now (lobby or tables). */
export const useOnline = create<{ count: number | null }>(() => ({ count: null }));
