import { create } from 'zustand';
import { api } from '../lib/api';
import { clearToken, readToken, writeToken } from '../lib/storage';
import type { AccountUser, Platform } from '../lib/types';

interface AuthState {
  tokens: Record<Platform, string>;
  users: Record<Platform, AccountUser | null>;
  ready: boolean;
  adopt(platform: Platform, token: string, user: AccountUser): void;
  logout(platform: Platform): Promise<void>;
  refresh(platform: Platform): Promise<AccountUser | null>;
  refreshAll(): Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  tokens: { netease: readToken('netease'), qq: readToken('qq') },
  users: { netease: null, qq: null },
  ready: false,

  adopt(platform, token, user) {
    writeToken(platform, token);
    set(state => ({
      tokens: { ...state.tokens, [platform]: token },
      users: { ...state.users, [platform]: user },
    }));
  },

  async logout(platform) {
    try { await api.logout(platform); } catch { /* 本地状态仍要清掉 */ }
    clearToken(platform);
    set(state => ({
      tokens: { ...state.tokens, [platform]: '' },
      users: { ...state.users, [platform]: null },
    }));
  },

  async refresh(platform) {
    if (!get().tokens[platform]) {
      set(state => ({ users: { ...state.users, [platform]: null } }));
      return null;
    }
    try {
      const status = await api.authStatus(platform);
      const user = status.logged && status.user ? status.user : null;
      set(state => ({ users: { ...state.users, [platform]: user } }));
      return user;
    } catch (error) {
      // 401 说明令牌已失效，直接清掉，避免一直带着坏令牌请求
      if (error instanceof Error && 'status' in error && (error as { status?: number }).status === 401) {
        clearToken(platform);
        set(state => ({
          tokens: { ...state.tokens, [platform]: '' },
          users: { ...state.users, [platform]: null },
        }));
      }
      return null;
    }
  },

  async refreshAll() {
    await Promise.all([get().refresh('netease'), get().refresh('qq')]);
    set({ ready: true });
  },
}));

export function activeToken(platform: Platform): string {
  return useAuth.getState().tokens[platform];
}
