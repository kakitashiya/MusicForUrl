import { create } from 'zustand';
import { api } from '../lib/api';
import { ACCOUNT_PLATFORMS, PLATFORM_IDS } from '../lib/platforms';
import { clearToken, readToken, writeToken } from '../lib/storage';
import { activeAccount, readAccounts, removeAccount, upsertAccount, writeAccounts } from '../lib/workspace-rules';
import type { AccountUser, Platform } from '../lib/types';

/**
 * 多账号模型。
 *
 * 数据归属的规则只有一条，而且由服务端保证：**一切个人数据都以账号为单位**。
 * `favorites`、`play_stats`、`playlists` 的主键第一列都是 users.id，而 users.id
 * 唯一对应 (platform, platform_user_id)，所以换账号就等于换一份数据，不存在串号。
 *
 * 浏览器这边只需要记住「每个平台当前生效的是哪个账号的令牌」：
 *   - 网易云 / QQ 保留旧版 `token` / `qqToken` 键，酷狗 / 酷我使用独立的 `kugouToken` / `kuwoToken`；
 *   - `mfu:accounts` 是新增的登记表，额外记住本机登录过的其它账号，支持一键切回。
 *
 * 因此这里不做任何数据合并：切换账号后看到的就是那个账号自己的歌单、收藏与记录。
 */
export interface AccountRecord {
  platform: Platform;
  userId: string;
  nickname: string;
  avatar: string;
  vipType: number;
  token: string;
  addedAt: number;
}

interface AuthState {
  /** 每个平台当前生效的令牌 */
  tokens: Record<Platform, string>;
  /** 每个平台当前生效的账号资料 */
  users: Record<Platform, AccountUser | null>;
  /** 本机登录过的账号（含当前生效的），最近的排在最前 */
  accounts: AccountRecord[];
  ready: boolean;
  adopt(platform: Platform, token: string, user: AccountUser): void;
  switchTo(platform: Platform, userId: string): Promise<{ ok: boolean; message?: string }>;
  logout(platform: Platform): Promise<void>;
  forget(platform: Platform, userId: string): void;
  refresh(platform: Platform): Promise<AccountUser | null>;
  refreshAll(): Promise<void>;
}

const emptyTokens = () => Object.fromEntries(PLATFORM_IDS.map(id => [id, ''])) as Record<Platform, string>;
const emptyUsers = () => Object.fromEntries(PLATFORM_IDS.map(id => [id, null])) as Record<Platform, AccountUser | null>;

function initialTokens(): Record<Platform, string> {
  const tokens = emptyTokens();
  for (const item of ACCOUNT_PLATFORMS) tokens[item.id] = readToken(item.id);
  return tokens;
}

/** 登记表只保存有账号能力的平台，游客平台没有令牌可存。 */
function persist(accounts: AccountRecord[]): AccountRecord[] {
  try { writeAccounts(localStorage, accounts); } catch { /* 隐私模式下忽略 */ }
  return accounts;
}

function recordFrom(platform: Platform, token: string, user: AccountUser): AccountRecord {
  return {
    platform,
    userId: user.userId,
    nickname: user.nickname || '',
    avatar: user.avatar || '',
    vipType: user.vipType || 0,
    token,
    addedAt: Date.now(),
  };
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof Error && 'status' in error && (error as { status?: number }).status === 401;
}

export const useAuth = create<AuthState>((set, get) => {
  /** 令牌失效时把该平台彻底清干净：令牌、资料、登记表里的对应条目 */
  function drop(platform: Platform, userId?: string) {
    clearToken(platform);
    set(state => ({
      tokens: { ...state.tokens, [platform]: '' },
      users: { ...state.users, [platform]: null },
      accounts: persist(userId ? removeAccount(state.accounts, platform, userId) : state.accounts),
    }));
  }

  return {
    tokens: initialTokens(),
    users: emptyUsers(),
    accounts: readAccounts(localStorage) as AccountRecord[],
    ready: false,

    adopt(platform, token, user) {
      writeToken(platform, token);
      set(state => ({
        tokens: { ...state.tokens, [platform]: token },
        users: { ...state.users, [platform]: { ...user, platform } },
        accounts: persist(upsertAccount(state.accounts, recordFrom(platform, token, user))),
      }));
    },

    async switchTo(platform, userId) {
      const record = get().accounts.find(item => item.platform === platform && item.userId === userId);
      if (!record) return { ok: false, message: '本机没有这个账号的登录信息，请重新登录' };
      writeToken(platform, record.token);
      set(state => ({
        tokens: { ...state.tokens, [platform]: record.token },
        users: { ...state.users, [platform]: null },
      }));
      const user = await get().refresh(platform);
      if (!user) return { ok: false, message: '这个账号的登录状态已失效，请重新登录' };
      // 切回来的账号排到最前
      set(state => ({ accounts: persist(upsertAccount(state.accounts, record)) }));
      return { ok: true };
    },

    async logout(platform) {
      const active = activeAccount(get().accounts, platform, get().tokens[platform]);
      try { await api.logout(platform); } catch { /* 本地状态仍要清掉 */ }
      drop(platform, active?.userId);
    },

    forget(platform, userId) {
      set(state => ({ accounts: persist(removeAccount(state.accounts, platform, userId)) }));
    },

    async refresh(platform) {
      const token = get().tokens[platform];
      if (!token) {
        set(state => ({ users: { ...state.users, [platform]: null } }));
        return null;
      }
      try {
        const status = await api.authStatus(platform);
        const user = status.logged && status.user ? status.user : null;
        set(state => ({
          users: { ...state.users, [platform]: user },
          accounts: user ? persist(upsertAccount(state.accounts, recordFrom(platform, token, user))) : state.accounts,
        }));
        return user;
      } catch (error) {
        // 401 说明令牌已失效，直接清掉，避免一直带着坏令牌请求
        if (isUnauthorized(error)) drop(platform, activeAccount(get().accounts, platform, token)?.userId);
        return null;
      }
    },

    async refreshAll() {
      await Promise.all(ACCOUNT_PLATFORMS.map(item => get().refresh(item.id)));
      set({ ready: true });
    },
  };
});

export function activeToken(platform: Platform): string {
  return useAuth.getState().tokens[platform];
}

/** 当前生效账号的登记表条目；没有对应条目时返回 null。 */
export function currentAccount(platform: Platform): AccountRecord | null {
  const { accounts, tokens } = useAuth.getState();
  return activeAccount(accounts, platform, tokens[platform]) as AccountRecord | null;
}
