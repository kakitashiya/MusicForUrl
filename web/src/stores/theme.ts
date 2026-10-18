import { create } from 'zustand';
import { readTheme, writeTheme, type ThemeName } from '../lib/storage';

interface ThemeState {
  theme: ThemeName;
  toggle(): void;
  apply(): void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: readTheme(),

  apply() {
    document.documentElement.dataset.theme = get().theme;
  },

  toggle() {
    const theme: ThemeName = get().theme === 'dark' ? 'light' : 'dark';
    writeTheme(theme);
    set({ theme });
    document.documentElement.dataset.theme = theme;
  },
}));
