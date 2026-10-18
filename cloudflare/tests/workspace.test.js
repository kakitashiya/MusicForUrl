import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_LIMIT, accountId, accountKey, accountsFor, activeAccount, findAccount,
  readAccountPreferences, readAccounts, removeAccount, upsertAccount,
  validateMediaUrl, writeAccountPreferences, writeAccounts,
} from '../../web/src/lib/workspace-rules.js';

// 这些断言原本针对旧版 public/js/workspace.js（用 vm 沙箱加载）。新前端上线后
// public/js/workspace.js 仍为冻结的 Node 版保留，继续测它等于什么都没测，
// 因此改为直接导入实际发布到 Cloudflare 的 web/src/lib/workspace-rules.js。
// 断言内容逐条保持不变。

function storage(initial = new Map()) {
  return {
    getItem(key) { return initial.get(key) ?? null; },
    setItem(key, value) { initial.set(key, value); },
  };
}

test('account annotations stay isolated across platforms and accounts and tolerate damaged browser storage', () => {
  const store = storage(new Map([
    ['mfu:account:netease:1001', JSON.stringify({ name: '工作账号', remark: '歌单 A' })],
    ['mfu:account:qq:1001', JSON.stringify({ name: '生活账号', remark: '歌单 B' })],
    ['mfu:account:netease:1002', '{invalid json'],
  ]));
  assert.deepEqual(readAccountPreferences(store, { platform: 'netease', user: { userId: '1001' } }),
    { name: '工作账号', remark: '歌单 A' });
  assert.deepEqual(readAccountPreferences(store, { platform: 'qq', user: { userId: '1001' } }),
    { name: '生活账号', remark: '歌单 B' });
  assert.deepEqual(readAccountPreferences(store, { platform: 'netease', user: { userId: '1002' } }),
    { name: '', remark: '' });
  assert.deepEqual(readAccountPreferences(store, { platform: 'netease', user: { userId: '1003' } }),
    { name: '', remark: '' });
  // 没有账号 ID 时不读也不写，避免把备注写到错误的位置
  assert.equal(accountKey('netease', ''), null);
  assert.equal(writeAccountPreferences(store, { platform: 'netease', user: {} }, { name: 'x' }), false);
  assert.deepEqual(readAccountPreferences(store, { platform: 'netease', user: {} }), { name: '', remark: '' });
});

test('account annotations are truncated and trimmed before they are stored', () => {
  const store = storage();
  const account = { platform: 'netease', user: { userId: '1001' } };
  assert.equal(writeAccountPreferences(store, account, {
    name: `  ${'n'.repeat(60)}  `, remark: `  ${'r'.repeat(260)}  `,
  }), true);
  const saved = JSON.parse(store.getItem('mfu:account:netease:1001'));
  assert.equal(saved.name, 'n'.repeat(40));
  assert.equal(saved.remark, 'r'.repeat(200));
});

test('media URL validation rejects executable URLs, remote HTTP and embedded credentials', () => {
  for (const value of ['javascript:alert(1)', 'data:video/mp4;base64,AA', 'file:///K:/clip.mp4',
    'http://media.example.test/clip.mp4', 'https://account:secret@media.example.test/clip.mp4']) {
    assert.throws(() => validateMediaUrl(value));
  }
  assert.equal(validateMediaUrl('https://music.example.test/stream.m3u8?token=test'),
    'https://music.example.test/stream.m3u8?token=test');
  assert.equal(validateMediaUrl('http://127.0.0.1:8787/clip.mp4'), 'http://127.0.0.1:8787/clip.mp4');
});

// —— 多账号登记表 ——
// 数据本身按账号隔离由服务端保证（users.id 是 favorites / play_stats 的主键第一列），
// 这里锁的是浏览器侧的那一半：谁被记住了、谁是当前生效的、令牌会不会被旧值覆盖。

const account = (overrides = {}) => ({
  platform: 'netease', userId: '1001', nickname: '甲', avatar: '', vipType: 0,
  token: 'token-a', addedAt: 1, ...overrides,
});

test('the account registry keeps one entry per (platform, account) and refreshes the token', () => {
  let accounts = upsertAccount([], account());
  accounts = upsertAccount(accounts, account({ platform: 'qq', userId: '2002', token: 'token-b' }));
  assert.equal(accounts.length, 2);

  // 同一个账号重新登录会轮换令牌，旧令牌立刻失效，登记表必须换成新的
  accounts = upsertAccount(accounts, account({ token: 'token-a2', nickname: '甲改' }));
  assert.equal(accounts.length, 2);
  assert.equal(findAccount(accounts, 'netease', '1001').token, 'token-a2');
  assert.equal(findAccount(accounts, 'netease', '1001').nickname, '甲改');

  // 同名账号在不同平台上互不影响
  assert.equal(findAccount(accounts, 'qq', '1001'), null);
  assert.equal(accountsFor(accounts, 'netease').length, 1);
  assert.equal(accountsFor(accounts, 'qq').length, 1);
});

test('switching accounts resolves by token, not by nickname or position', () => {
  const accounts = [
    account({ token: 'token-b' }),
    account({ userId: '1002', nickname: '乙', token: 'token-c' }),
  ];
  assert.equal(activeAccount(accounts, 'netease', 'token-b').userId, '1001');
  assert.equal(activeAccount(accounts, 'netease', 'token-c').userId, '1002');
  // 令牌不属于这个平台时不认，避免把 QQ 的令牌当成网易云的
  assert.equal(activeAccount(accounts, 'qq', 'token-b'), null);
  assert.equal(activeAccount(accounts, 'netease', ''), null);
});

test('the registry drops damaged entries and caps how many accounts it remembers', () => {
  const store = storage(new Map([['mfu:accounts', '{not json']]));
  assert.deepEqual(readAccounts(store), []);

  // 依次写入，每次 addedAt 都更新，因此最后写入的排在最前
  const accounts = [];
  for (let index = 0; index < ACCOUNT_LIMIT + 3; index++) {
    accounts.unshift(account({ userId: String(1000 + index), token: `t${index}` }));
  }
  writeAccounts(store, accounts.slice(0, ACCOUNT_LIMIT + 3));
  const restored = readAccounts(store);
  assert.equal(restored.length, ACCOUNT_LIMIT);
  // 最近使用的排在最前，超出上限时淘汰最久未用的
  assert.equal(restored[0].userId, String(1000 + ACCOUNT_LIMIT + 2));

  // 缺字段或平台非法的条目会被丢弃，而不是让整个列表失效
  writeAccounts(store, [account(), { platform: 'spotify', userId: '1', token: 'x' }, { platform: 'qq' }]);
  assert.deepEqual(readAccounts(store).map(item => item.userId), ['1001']);
});

test('upserting an account moves it to the front of the registry', () => {
  let accounts = [
    account({ userId: '1001', token: 'a', addedAt: 100 }),
    account({ userId: '1002', token: 'b', addedAt: 200 }),
  ];
  // 再次使用 1001：它必须排到最前，令牌换成新的
  accounts = upsertAccount(accounts, { ...accounts[0], token: 'a2' });
  assert.deepEqual(accounts.map(item => item.userId), ['1001', '1002']);
  assert.equal(accounts[0].token, 'a2');
});

test('removing an account only touches that account', () => {
  const accounts = [account(), account({ userId: '1002', token: 'token-c' })];
  const remaining = removeAccount(accounts, 'netease', '1001');
  assert.deepEqual(remaining.map(item => item.userId), ['1002']);
  assert.equal(accountId('netease', '1001'), 'netease:1001');
  // 移除不存在的账号是空操作，不是错误
  assert.equal(removeAccount(remaining, 'netease', '9999').length, 1);
});
