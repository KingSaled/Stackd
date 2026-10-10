import { create } from 'zustand';

/** Which player's profile card is open (any screen can open one by user id). */
export const useProfileViewer = create<{ userId: string | null; open(id: string | null | undefined): void; close(): void }>((set) => ({
  userId: null,
  open: (id) => {
    // Bots and placeholder ids have no profile.
    if (id && /^[0-9a-f-]{36}$/i.test(id)) set({ userId: id });
  },
  close: () => set({ userId: null }),
}));

export const openProfile = (id: string | null | undefined) => useProfileViewer.getState().open(id);

/** Props that make any element open a player's profile card (click, Enter or Space). */
export function profileLink(id: string | null | undefined) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    title: 'View profile',
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      openProfile(id);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openProfile(id);
      }
    },
  };
}
