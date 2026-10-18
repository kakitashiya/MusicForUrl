import test from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORMS } from '../src/platforms.js';
import { PLATFORM_TABLE } from '../../web/src/lib/platform-data.js';

// 后端决定接口是否存在，前端据此决定入口是否显示。两边分叉时会出现
// 「按钮点了报 403」或者「明明支持却没有入口」，所以这里逐字段锁死。
test('frontend and backend platform tables agree field by field', () => {
  const backendIds = Object.keys(PLATFORMS);
  const frontendIds = PLATFORM_TABLE.map(item => item.id);
  assert.deepEqual(frontendIds, backendIds, '平台集合与顺序必须一致');

  for (const item of PLATFORM_TABLE) {
    const backend = PLATFORMS[item.id];
    assert.ok(backend, `${item.id} 在后端注册表里不存在`);
    assert.equal(item.account, backend.account, `${item.id}.account`);
    assert.equal(item.library, backend.library, `${item.id}.library`);
    assert.equal(item.playback, backend.playback, `${item.id}.playback`);
    assert.equal(item.label, backend.label, `${item.id}.label`);
  }
});

test('every platform declares a non-empty capability note', () => {
  for (const item of PLATFORM_TABLE) {
    assert.equal(typeof item.short, 'string');
    assert.ok(item.short.length > 0, `${item.id}.short`);
    assert.ok(item.note.length > 8, `${item.id}.note 需要说明能力边界`);
  }
});

test('library implies account for every platform', () => {
  // 没有账号就不可能有个人的歌单与收藏，这条不变量两边都要成立
  for (const item of PLATFORM_TABLE) {
    assert.equal(item.library, item.account, `${item.id}: library 必须与 account 一致`);
  }
});
