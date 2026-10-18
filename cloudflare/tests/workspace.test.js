import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accountKey, readAccountPreferences, validateMediaUrl, writeAccountPreferences,
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
