// src/lib/job-events.ts
// EventEmitter singleton per notifiche real-time dei job di generazione.
// Usa globalThis per sopravvivere ai hot-reload in dev e per essere condiviso
// tra il modulo scheduler e la route SSE nello stesso processo Node.js.
//
// NON funziona in ambienti serverless (Vercel Functions) — solo server Node.js
// persistente (self-hosted Next.js), che è il caso di questo progetto.

import { EventEmitter } from 'events';

// Tipo dell'evento emesso quando un job cambia stato
export interface JobUpdateEvent {
  jobId: string;
  tenantId: string;
  /** COMPLETED | FAILED | PROCESSING | PENDING */
  status: string;
  /** IMAGE | VIDEO | TEXT | MANUAL */
  type?: string;
}

const KEY = '_pineappleJobEvents';
const g = globalThis as Record<string, unknown>;

if (!g[KEY]) {
  const ev = new EventEmitter();
  ev.setMaxListeners(500); // supporta molti client SSE connessi
  g[KEY] = ev;
}

export const jobEvents = g[KEY] as EventEmitter;

/** Emette un evento di aggiornamento job — da chiamare dallo scheduler dopo ogni cambio di stato. */
export function emitJobUpdate(payload: JobUpdateEvent): void {
  try {
    jobEvents.emit('job-update', payload);
  } catch {
    // Non bloccare mai lo scheduler per un errore di notifica
  }
}

