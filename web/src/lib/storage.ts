import type { Platform, QualityId } from './types';

// 这些键必须与旧版前端逐字节一致，否则现有用户会被登出、丢失主题与音质偏好。
export const STORAGE_KEYS = {
  token: 'token',
  qqToken: 'qqToken',
  theme: 'theme',
  generatorPlatform: 'generatorPlatform',
  personalPlatformTab: 'personalPlatformTab',
  playerQuality: 'mfu:player-quality',
} as const;

function safeRead(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}

function safeWrite(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* 隐私模式下忽略 */ }
}

function safeRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* 忽略 */ }
}

export function readToken(platform: Platform): string {
  return safeRead(platform === 'qq' ? STORAGE_KEYS.qqToken : STORAGE_KEYS.token);
}

export function writeToken(platform: Platform, token: string): void {
  safeWrite(platform === 'qq' ? STORAGE_KEYS.qqToken : STORAGE_KEYS.token, token);
}

export function clearToken(platform: Platform): void {
  safeRemove(platform === 'qq' ? STORAGE_KEYS.qqToken : STORAGE_KEYS.token);
}

export type ThemeName = 'light' | 'dark';

export function readTheme(): ThemeName {
  return safeRead(STORAGE_KEYS.theme) === 'dark' ? 'dark' : 'light';
}

// 旧版写入的是 'light' 字符串而不是删除键，保持一致以免出现两种状态
export function writeTheme(theme: ThemeName): void {
  safeWrite(STORAGE_KEYS.theme, theme);
}

export function readGeneratorPlatform(): Platform {
  return safeRead(STORAGE_KEYS.generatorPlatform) === 'qq' ? 'qq' : 'netease';
}

export function writeGeneratorPlatform(platform: Platform): void {
  safeWrite(STORAGE_KEYS.generatorPlatform, platform);
}

export function readPersonalPlatform(): Platform | '' {
  const value = safeRead(STORAGE_KEYS.personalPlatformTab);
  return value === 'qq' || value === 'netease' ? value : '';
}

export function writePersonalPlatform(platform: Platform): void {
  safeWrite(STORAGE_KEYS.personalPlatformTab, platform);
}

export function readPlayerQuality(): QualityId | '' {
  const value = safeRead(STORAGE_KEYS.playerQuality);
  return value === 'low' || value === 'medium' || value === 'high' || value === 'lossless' ? value : '';
}

export function writePlayerQuality(quality: QualityId): void {
  safeWrite(STORAGE_KEYS.playerQuality, quality);
}
