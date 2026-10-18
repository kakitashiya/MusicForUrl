import { create } from 'zustand';
import { readTheme, writeTheme } from '../lib/storage';
import type { ThemeName } from '../lib/types';

const QUERY = '(prefers-color-scheme: dark)';

interface ThemeState {
  /** 用户的显式选择：light / dark / system */
  theme: ThemeName;
  /** 实际生效的主题，'system' 时跟随系统 */
  resolved: 'light' | 'dark';
  set(theme: ThemeName): void;
  toggle(): void;
  /** 跟随系统变化时同步 */
  sync(): void;
  apply(): void;
}

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(QUERY).matches === true;
}

function resolve(theme: ThemeName): 'light' | 'dark' {
  return theme === 'system' ? (systemDark() ? 'dark' : 'light') : theme;
}

function paint(theme: ThemeName): 'light' | 'dark' {
  const resolved = resolve(theme);
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = resolved;
  return resolved;
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: readTheme(),
  resolved: resolve(readTheme()),

  set(theme) {
    writeTheme(theme);
    set({ theme, resolved: paint(theme) });
  },

  // 两态切换只走 light ↔ dark，不把 system 塞进循环里：
  // 用户在 system 下点一次，得到与当前观感相反的那个主题
  toggle() {
    get().set(get().resolved === 'dark' ? 'light' : 'dark');
  },

  sync() {
    if (get().theme !== 'system') return;
    set({ resolved: paint('system') });
  },

  apply() {
    paint(get().theme);
  },
}));

// 跟随系统时监听媒体查询变化。旧版前端没有这个能力，属于纯增量。
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia(QUERY).addEventListener('change', () => useTheme.getState().sync());
}

export { resolve as resolveTheme };
