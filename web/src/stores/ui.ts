import { create } from 'zustand';
import { readSidebarCollapsed, writeSidebarCollapsed } from '../lib/storage';
import type { Platform } from '../lib/types';

interface UiState {
  loginOpen: boolean;
  loginPlatform: Platform;
  /** 侧栏默认收起，展开状态持久化在本机 */
  sidebarCollapsed: boolean;
  openLogin(platform?: Platform): void;
  closeLogin(): void;
  toggleSidebar(): void;
  setSidebar(collapsed: boolean): void;
}

export const useUi = create<UiState>(set => ({
  loginOpen: false,
  loginPlatform: 'netease',
  sidebarCollapsed: readSidebarCollapsed(),

  openLogin(platform) {
    set(state => ({ loginOpen: true, loginPlatform: platform ?? state.loginPlatform }));
  },
  closeLogin() { set({ loginOpen: false }); },

  toggleSidebar() {
    set(state => {
      const next = !state.sidebarCollapsed;
      writeSidebarCollapsed(next);
      return { sidebarCollapsed: next };
    });
  },

  setSidebar(collapsed) {
    writeSidebarCollapsed(collapsed);
    set({ sidebarCollapsed: collapsed });
  },
}));
