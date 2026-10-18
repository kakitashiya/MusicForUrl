import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 封面与头像可能是 http，统一升级到 https 并在失败时回退占位图
export function imageSrc(value: string | undefined | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '/placeholder.svg';
  if (raw.startsWith('https://')) return raw;
  if (raw.startsWith('http://')) return `https://${raw.slice('http://'.length)}`;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('/')) return raw;
  return '/placeholder.svg';
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function formatBitrate(bitrate: number | null): string {
  return bitrate ? `${Math.round(bitrate / 1000)} kbps` : '';
}

export function platformLabel(platform: string): string {
  return platform === 'qq' ? 'QQ 音乐' : '网易云音乐';
}
