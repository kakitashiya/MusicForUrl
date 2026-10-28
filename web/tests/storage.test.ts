import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readToken, writeToken, clearToken } from '../src/lib/storage';
import { api } from '../src/lib/api';
import type { Platform } from '../src/lib/types';

const platforms: Platform[] = ['netease', 'qq', 'kugou', 'kuwo'];
const keys = { netease: 'token', qq: 'qqToken', kugou: 'kugouToken', kuwo: 'kuwoToken' };
const headers = { netease: 'x-token', qq: 'x-qq-token', kugou: 'x-kugou-token', kuwo: 'x-kuwo-token' };
const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, String(value)); },
  removeItem: (key: string) => { values.delete(key); },
};
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
const { useAuth } = await import('../src/stores/auth');
const originalFetch = globalThis.fetch;

beforeEach(() => {
  values.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  useAuth.setState({
    tokens: { netease: '', qq: '', kugou: '', kuwo: '' },
    users: { netease: null, qq: null, kugou: null, kuwo: null },
    accounts: [], ready: false,
  });
});
afterEach(() => { globalThis.fetch = originalFetch; });

// Fixtures are deliberately fake; no real account or external requests are used.
function seed() {
  for (const platform of platforms) writeToken(platform, `fixture-${platform}`);
}

test('legacy NetEase and QQ keys remain readable without leaking into other platforms', () => {
  storage.setItem('token', 'fixture-legacy-netease');
  storage.setItem('qqToken', 'fixture-legacy-qq');
  assert.equal(readToken('netease'), 'fixture-legacy-netease');
  assert.equal(readToken('qq'), 'fixture-legacy-qq');
  assert.equal(readToken('kugou'), '');
  assert.equal(readToken('kuwo'), '');
});

test('all four platform tokens survive repeated writes independently', () => {
  seed();
  for (const platform of platforms) {
    assert.equal(readToken(platform), `fixture-${platform}`);
    assert.equal(storage.getItem(keys[platform]), `fixture-${platform}`);
  }
  writeToken('kugou', 'fixture-replaced');
  assert.equal(readToken('netease'), 'fixture-netease');
  assert.equal(readToken('kuwo'), 'fixture-kuwo');
  assert.equal(readToken('kugou'), 'fixture-replaced');
});

test('clearing each platform preserves every other platform', () => {
  for (const target of platforms) {
    seed();
    clearToken(target);
    for (const platform of platforms) {
      assert.equal(readToken(platform), platform === target ? '' : `fixture-${platform}`);
    }
  }
});

test('API requests use only the selected platform token and header', async () => {
  seed();
  for (const platform of platforms) {
    globalThis.fetch = async (_input, init) => {
      assert.deepEqual(init?.headers, { [headers[platform]]: `fixture-${platform}` });
      return Response.json({ success: true, data: { logged: true } });
    };
    await api.authStatus(platform);
  }
});

test('auth adoption and logout keep storage and requests isolated across platforms', async () => {
  for (const platform of platforms) {
    useAuth.getState().adopt(platform, `fixture-${platform}`, {
      userId: `user-${platform}`, nickname: 'Test', avatar: '', vipType: 0,
    });
  }
  for (const platform of platforms) assert.equal(readToken(platform), useAuth.getState().tokens[platform]);
  for (const target of platforms) {
    globalThis.fetch = async (_input, init) => {
      assert.deepEqual(init?.headers, { [headers[target]]: `fixture-${target}`, 'content-type': 'application/json' });
      return Response.json({ success: true });
    };
    await useAuth.getState().logout(target);
    assert.equal(readToken(target), '');
    assert.equal(useAuth.getState().tokens[target], '');
    for (const platform of platforms.slice(platforms.indexOf(target) + 1)) {
      assert.equal(readToken(platform), `fixture-${platform}`);
      assert.equal(useAuth.getState().tokens[platform], `fixture-${platform}`);
    }
  }
});

test('blocked browser storage remains non-throwing', () => {
  const blocked = () => { throw new Error('storage unavailable'); };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: blocked, setItem: blocked, removeItem: blocked,
  } });
  for (const platform of platforms) {
    assert.equal(readToken(platform), '');
    assert.doesNotThrow(() => writeToken(platform, 'fixture'));
    assert.doesNotThrow(() => clearToken(platform));
  }
});
