// 纯函数：账号本机备注、多账号登记表与媒体链接校验。
//
// 存储对象由调用方注入，因此 node:test 可以直接导入本文件断言行为，不需要构建步骤、
// 不需要 DOM。账号备注的键格式与截断长度是从旧版 public/js/workspace.js 移植的，
// 必须保持一致，否则现有用户保存在浏览器里的备注会失效。

const ACCOUNT_KEY_PREFIX = 'mfu:account:';
const NAME_LIMIT = 40;
const REMARK_LIMIT = 200;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

// 多账号登记表：一个平台可以同时记住多个账号，各自带自己的令牌。
// 上限刻意压得很低——它只是「本机记住过哪些账号」的便利功能，不是账号管理器。
const ACCOUNTS_KEY = 'mfu:accounts';
const ACCOUNT_LIMIT = 8;
const NICKNAME_LIMIT = 40;
const AVATAR_LIMIT = 400;
const TOKEN_LIMIT = 256;
const PLATFORM_IDS = ['netease', 'qq', 'kugou', 'kuwo'];

function accountKey(platform, userId) {
  return userId ? `${ACCOUNT_KEY_PREFIX}${platform}:${userId}` : null;
}

function readAccountPreferences(storage, account) {
  const key = accountKey(account?.platform, account?.user?.userId);
  if (!key) return { name: '', remark: '' };
  try {
    const value = JSON.parse(storage.getItem(key) || '{}');
    return {
      name: String(value?.name || '').slice(0, NAME_LIMIT),
      remark: String(value?.remark || '').slice(0, REMARK_LIMIT),
    };
  } catch (_) {
    return { name: '', remark: '' };
  }
}

function writeAccountPreferences(storage, account, input) {
  const key = accountKey(account?.platform, account?.user?.userId);
  if (!key) return false;
  storage.setItem(key, JSON.stringify({
    name: String(input?.name || '').trim().slice(0, NAME_LIMIT),
    remark: String(input?.remark || '').trim().slice(0, REMARK_LIMIT),
  }));
  return true;
}

function validateMediaUrl(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch (_) { throw new Error('请输入完整的媒体链接'); }
  const local = LOCAL_HOSTS.includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('请使用 HTTPS 媒体链接');
  if (url.username || url.password) throw new Error('链接不能包含账号或密码');
  return url.href;
}

// —— 多账号登记表 ——

function accountId(platform, userId) {
  return `${platform}:${String(userId || '')}`;
}

function sanitizeAccount(value) {
  if (!value || typeof value !== 'object') return null;
  const platform = String(value.platform || '');
  const userId = String(value.userId || '').trim();
  const token = String(value.token || '').trim();
  if (!PLATFORM_IDS.includes(platform) || !userId || !token) return null;
  return {
    platform,
    userId: userId.slice(0, 64),
    nickname: String(value.nickname || '').slice(0, NICKNAME_LIMIT),
    avatar: String(value.avatar || '').slice(0, AVATAR_LIMIT),
    vipType: Number(value.vipType) || 0,
    token: token.slice(0, TOKEN_LIMIT),
    addedAt: Number(value.addedAt) || 0,
  };
}

/** 读取登记表。任何损坏的条目都会被丢弃，而不是让整个列表失效。 */
function readAccounts(storage) {
  let parsed;
  try { parsed = JSON.parse(storage.getItem(ACCOUNTS_KEY) || '[]'); } catch (_) { return []; }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  const accounts = [];
  for (const item of parsed) {
    const account = sanitizeAccount(item);
    if (!account) continue;
    const id = accountId(account.platform, account.userId);
    if (seen.has(id)) continue;
    seen.add(id);
    accounts.push(account);
  }
  // 最近使用的排在最前。排序放在读取侧，这样无论存储里的顺序如何，契约都成立。
  accounts.sort((a, b) => b.addedAt - a.addedAt);
  return accounts.slice(0, ACCOUNT_LIMIT);
}

function writeAccounts(storage, accounts) {
  const list = Array.isArray(accounts) ? accounts.map(sanitizeAccount).filter(Boolean) : [];
  storage.setItem(ACCOUNTS_KEY, JSON.stringify(list.slice(0, ACCOUNT_LIMIT)));
  return true;
}

/**
 * 加入或更新一个账号。同一个 (平台, 账号 ID) 只保留一条，并用最新的令牌覆盖旧的——
 * 平台侧重新登录会轮换令牌，旧令牌立刻失效，留着只会让切换账号时得到 401。
 * 传入的 addedAt 会被忽略：能走到这里就说明这个账号刚刚被用过。
 */
function upsertAccount(accounts, record) {
  const account = sanitizeAccount({ ...record, addedAt: Date.now() });
  if (!account) return Array.isArray(accounts) ? accounts.slice() : [];
  const id = accountId(account.platform, account.userId);
  const rest = (Array.isArray(accounts) ? accounts : []).filter(item => accountId(item.platform, item.userId) !== id);
  // 最近使用的排在最前，超出上限时淘汰最久未用的
  return [account, ...rest].slice(0, ACCOUNT_LIMIT);
}

function removeAccount(accounts, platform, userId) {
  const id = accountId(platform, userId);
  return (Array.isArray(accounts) ? accounts : []).filter(item => accountId(item.platform, item.userId) !== id);
}

function accountsFor(accounts, platform) {
  return (Array.isArray(accounts) ? accounts : []).filter(item => item.platform === platform);
}

function findAccount(accounts, platform, userId) {
  const id = accountId(platform, userId);
  return (Array.isArray(accounts) ? accounts : []).find(item => accountId(item.platform, item.userId) === id) || null;
}

/** 当前生效的账号 = 令牌与浏览器里那份一致的那条。 */
function activeAccount(accounts, platform, token) {
  if (!token) return null;
  return (Array.isArray(accounts) ? accounts : [])
    .find(item => item.platform === platform && item.token === token) || null;
}

export {
  ACCOUNT_KEY_PREFIX, ACCOUNTS_KEY, ACCOUNT_LIMIT, AVATAR_LIMIT, NAME_LIMIT, NICKNAME_LIMIT,
  PLATFORM_IDS, REMARK_LIMIT, TOKEN_LIMIT,
  accountId, accountKey, accountsFor, activeAccount, findAccount, readAccountPreferences,
  readAccounts, removeAccount, sanitizeAccount, upsertAccount, validateMediaUrl,
  writeAccountPreferences, writeAccounts,
};
