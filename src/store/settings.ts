import { create } from 'zustand';
import { readJSON, writeJSON } from '../lib/storage';
import { sound } from '../lib/sound';

interface Settings {
  volume: number;
  muted: boolean;
  fourColor: boolean;
  showHandStrength: boolean;
}

interface SettingsState extends Settings {
  set(patch: Partial<Settings>): void;
  toggleMute(): void;
}

const KEY = 'stackd:settings';
const defaults: Settings = { volume: 0.7, muted: false, fourColor: false, showHandStrength: true };
const initial = { ...defaults, ...readJSON<Partial<Settings>>(KEY, {}) };
sound.configure(initial.volume, initial.muted);

export const useSettings = create<SettingsState>((set, get) => ({
  ...initial,
  set(patch) {
    set(patch);
    const { volume, muted, fourColor, showHandStrength } = { ...get(), ...patch };
    writeJSON(KEY, { volume, muted, fourColor, showHandStrength });
    sound.configure(volume, muted);
  },
  toggleMute() {
    get().set({ muted: !get().muted });
  },
}));
