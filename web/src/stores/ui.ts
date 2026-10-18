import { create } from 'zustand';
import type { Platform } from '../lib/types';

interface UiState {
  loginOpen: boolean;
  loginPlatform: Platform;
  openLogin(platform?: Platform): void;
  closeLogin(): void;
}

export const useUi = create<UiState>(set => ({
  loginOpen: false,
  loginPlatform: 'netease',
  openLogin(platform) {
    set(state => ({ loginOpen: true, loginPlatform: platform ?? state.loginPlatform }));
  },
  closeLogin() { set({ loginOpen: false }); },
}));
