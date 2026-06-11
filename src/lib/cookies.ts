// src/lib/cookies.ts — Utility per leggere/scrivere cookie lato client (SSR-safe)

/** Nomi dei cookie usati dall'app */
export const COOKIE_TENANT = 'psm_tenant';
export const COOKIE_SITE   = 'psm_site';

/** Legge un cookie per nome. Ritorna '' se non trovato o se chiamato lato server. */
export function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie
    .split('; ')
    .find(row => row.startsWith(name + '='));
  if (!match) return '';
  try {
    return decodeURIComponent(match.split('=').slice(1).join('='));
  } catch {
    return '';
  }
}

/** Scrive un cookie con scadenza `days` giorni (default 365). SameSite=Lax, path=/. */
export function setCookie(name: string, value: string, days = 365): void {
  if (typeof document === 'undefined') return;
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

/** Cancella un cookie impostandone la scadenza nel passato. */
export function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Lax`;
}

