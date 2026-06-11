// src/lib/analytics-sync-config.ts
// Tipi e configurazione default per la sincronizzazione automatica analytics.
// Separati dal route handler per rispettare i vincoli di Next.js 15
// (i file route.ts non possono esportare simboli arbitrari).

export interface AutoSyncConfig {
  enabled: boolean;
  platforms: ('INSTAGRAM' | 'FACEBOOK' | 'TIKTOK')[];

  /** 'preset' = configurazione guidata, 'cron' = espressione CRON personalizzata */
  mode: 'preset' | 'cron';

  // ─ Preset ─────────────────────────────────────────────────────
  /** Tipo di cadenza base */
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  /** Orari in cui eseguire la sync (0-23), es. [8, 14, 20] */
  hours: number[];
  /** Giorni della settimana (0=Dom…6=Sab), [] = ogni giorno */
  weekdays: number[];
  /** Giorni del mese (1-31), [] = ogni giorno del mese */
  monthdays: number[];

  // ─ CRON personalizzato ────────────────────────────────────────
  /** Espressione CRON standard a 5 campi: min ora giorno-mese mese giorno-settimana */
  customCron: string;

  // ─ Legacy (backward compat) ──────────────────────────────────
  hour: number;
  hour2: number;
  weekday: number;

  lastSync: Partial<Record<'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK', string | null>>;
}

export const DEFAULT_CONFIG: AutoSyncConfig = {
  enabled: false,
  platforms: ['INSTAGRAM', 'FACEBOOK', 'TIKTOK'],
  mode: 'preset',
  frequency: 'daily',
  hours: [2],
  weekdays: [],
  monthdays: [],
  customCron: '0 2 * * *',
  // legacy
  hour: 2,
  hour2: 14,
  weekday: 1,
  lastSync: {},
};

