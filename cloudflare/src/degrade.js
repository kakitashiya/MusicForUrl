// 免费额度是硬上限，耗尽后所有人都播不了，所以余量优先留给已经在看的人。
// 单独成文件是为了让 index.js 与 player.js 共用，避免循环依赖。
const DEGRADE_MODES = new Set(['normal', 'links-only', 'shed']);

function degradeMode(env) {
  const value = String(env?.DEGRADE_MODE || 'normal').trim().toLowerCase();
  return DEGRADE_MODES.has(value) ? value : 'normal';
}

function secondsUntilUtcMidnight(now = Date.now()) {
  return Math.max(1, Math.ceil(((Math.floor(now / 86400000) + 1) * 86400000 - now) / 1000));
}

export { degradeMode, secondsUntilUtcMidnight };
