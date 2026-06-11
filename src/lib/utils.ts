// src/lib/utils.ts

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    ...options,
  });
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (diff < 0) {
    const absDays = Math.abs(days);
    const absHours = Math.abs(hours);
    const absMinutes = Math.abs(minutes);
    if (absMinutes < 60) return `tra ${absMinutes}m`;
    if (absHours < 24) return `tra ${absHours}h`;
    return `tra ${absDays}gg`;
  }

  if (seconds < 60) return 'adesso';
  if (minutes < 60) return `${minutes}m fa`;
  if (hours < 24) return `${hours}h fa`;
  if (days < 7) return `${days}gg fa`;
  return formatDate(d);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '…';
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'text-gray-400 bg-gray-400/10',
    SCHEDULED: 'text-blue-400 bg-blue-400/10',
    PUBLISHING: 'text-yellow-400 bg-yellow-400/10',
    PUBLISHED: 'text-green-400 bg-green-400/10',
    FAILED: 'text-red-400 bg-red-400/10',
    CANCELLED: 'text-gray-500 bg-gray-500/10',
  };
  return map[status] ?? 'text-gray-400 bg-gray-400/10';
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'Bozza',
    SCHEDULED: 'Schedulato',
    PUBLISHING: 'In pubblicazione...',
    PUBLISHED: 'Pubblicato',
    FAILED: 'Errore',
    CANCELLED: 'Annullato',
  };
  return map[status] ?? status;
}

export function getTypeIcon(type: string): string {
  const map: Record<string, string> = {
    POST: '🖼️',
    STORY: '📱',
    REEL: '🎬',
    CAROUSEL: '🎠',
  };
  return map[type] ?? '📄';
}

export function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    POST: 'Post',
    STORY: 'Storia',
    REEL: 'Reel',
    CAROUSEL: 'Carousel',
  };
  return map[type] ?? type;
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function maskToken(token: string): string {
  if (!token || token.length < 8) return '••••••••';
  return token.slice(0, 6) + '••••••••' + token.slice(-4);
}

// ─── Platform helpers ────────────────────────────────────────────

export function getPlatformIcon(platform: string): string {
  const map: Record<string, string> = {
    INSTAGRAM: '📸',
    FACEBOOK: '🔵',
    TIKTOK: '🎵',
  };
  return map[platform] ?? '📱';
}

export function getPlatformLabel(platform: string): string {
  const map: Record<string, string> = {
    INSTAGRAM: 'Instagram',
    FACEBOOK: 'Facebook',
    TIKTOK: 'TikTok',
  };
  return map[platform] ?? platform;
}

export function getPlatformColor(platform: string): string {
  const map: Record<string, string> = {
    INSTAGRAM: 'text-pink-400 bg-pink-400/10 border-pink-400/30',
    FACEBOOK: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
    TIKTOK: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30',
  };
  return map[platform] ?? 'text-gray-400 bg-gray-400/10 border-gray-400/30';
}

export function getPlatformBadgeColor(platform: string): string {
  const map: Record<string, string> = {
    INSTAGRAM: 'text-pink-400 bg-pink-500/10',
    FACEBOOK: 'text-blue-400 bg-blue-500/10',
    TIKTOK: 'text-cyan-400 bg-cyan-500/10',
  };
  return map[platform] ?? 'text-gray-400 bg-gray-400/10';
}

