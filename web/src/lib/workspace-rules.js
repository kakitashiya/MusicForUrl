// 纯函数：账号本机备注与媒体链接校验。
//
// 存储对象由调用方注入，因此 node:test 可以直接导入本文件断言行为，不需要构建步骤、
// 不需要 DOM。这是从旧版 public/js/workspace.js 移植的，键格式与截断长度必须保持一致，
// 否则现有用户保存在浏览器里的备注会失效。

const ACCOUNT_KEY_PREFIX = 'mfu:account:';
const NAME_LIMIT = 40;
const REMARK_LIMIT = 200;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

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

export {
  ACCOUNT_KEY_PREFIX, NAME_LIMIT, REMARK_LIMIT,
  accountKey, readAccountPreferences, validateMediaUrl, writeAccountPreferences,
};
