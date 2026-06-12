import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Formattazione numeri ────────────────────────────────────────────────────
export function formatNumber(n: number | undefined | null): string {
  if (n == null) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

// ─── Formattazione date ──────────────────────────────────────────────────────
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  const now = Date.now();
  const diff = now - d.getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const mins = Math.floor(abs / 60_000);
  const hours = Math.floor(abs / 3_600_000);
  const days = Math.floor(abs / 86_400_000);
  if (mins < 1) return future ? 'tra poco' : 'adesso';
  if (mins < 60) return future ? `tra ${mins}m` : `${mins}m fa`;
  if (hours < 24) return future ? `tra ${hours}h` : `${hours}h fa`;
  if (days < 30) return future ? `tra ${days}gg` : `${days}gg fa`;
  return formatDate(d);
}

// ─── Platform helpers ────────────────────────────────────────────────────────
export function getPlatformLabel(platform: string | null | undefined): string {
  switch ((platform ?? '').toUpperCase()) {
    case 'INSTAGRAM': return 'Instagram';
    case 'FACEBOOK':  return 'Facebook';
    case 'TIKTOK':    return 'TikTok';
    default:          return platform ?? 'Sconosciuta';
  }
}

export function getPlatformIcon(platform: string | null | undefined): string {
  switch ((platform ?? '').toUpperCase()) {
    case 'INSTAGRAM': return '📸';
    case 'FACEBOOK':  return '🔵';
    case 'TIKTOK':    return '🎵';
    default:          return '🌐';
  }
}

export function getPlatformBadgeColor(platform: string | null | undefined): string {
  switch ((platform ?? '').toUpperCase()) {
    case 'INSTAGRAM': return 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300';
    case 'FACEBOOK':  return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'TIKTOK':    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    default:          return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  }
}

// ─── Post type helpers ───────────────────────────────────────────────────────
export function getTypeLabel(type: string | null | undefined): string {
  switch ((type ?? '').toUpperCase()) {
    case 'POST':      return 'Post';
    case 'STORY':     return 'Story';
    case 'REEL':      return 'Reel';
    case 'CAROUSEL':  return 'Carosello';
    default:          return type ?? 'Sconosciuto';
  }
}

export function getTypeIcon(type: string | null | undefined): string {
  switch ((type ?? '').toUpperCase()) {
    case 'POST':      return '🖼️';
    case 'STORY':     return '⏱️';
    case 'REEL':      return '🎬';
    case 'CAROUSEL':  return '🎠';
    default:          return '📄';
  }
}

// ─── Post status helpers ─────────────────────────────────────────────────────
export function getStatusLabel(status: string | null | undefined): string {
  switch ((status ?? '').toUpperCase()) {
    case 'DRAFT':      return 'Bozza';
    case 'SCHEDULED':  return 'Pianificato';
    case 'PUBLISHING': return 'In pubblicazione';
    case 'PUBLISHED':  return 'Pubblicato';
    case 'FAILED':     return 'Fallito';
    case 'CANCELLED':  return 'Annullato';
    case 'ARCHIVED':   return 'Archiviato';
    default:           return status ?? 'Sconosciuto';
  }
}

export function getStatusColor(status: string | null | undefined): string {
  switch ((status ?? '').toUpperCase()) {
    case 'DRAFT':      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    case 'SCHEDULED':  return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'PUBLISHING': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'PUBLISHED':  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    case 'FAILED':     return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    case 'CANCELLED':  return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500';
    case 'ARCHIVED':   return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
    default:           return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  }
}
