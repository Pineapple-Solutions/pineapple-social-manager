// src/app/api/analytics/sync-config/route.ts
// API per leggere e salvare la configurazione della sincronizzazione automatica analytics
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import type { AutoSyncConfig } from '@/lib/analytics-sync-config';
import * as syncConfigLib from '@/lib/analytics-sync-config';

const DEFAULT_CONFIG_VALUE: AutoSyncConfig = syncConfigLib.DEFAULT_CONFIG;

const CONFIG_KEY = 'analytics_auto_sync';


/** Migra configurazioni vecchie al nuovo formato */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateConfig(raw: any): AutoSyncConfig {
  const c: AutoSyncConfig = { ...DEFAULT_CONFIG_VALUE, ...raw };
  // Se non ha mode, migra dai vecchi campi
  if (!raw.mode) {
    c.mode = 'preset';
    if (raw.frequency === 'twice_daily') {
      c.frequency = 'daily';
      c.hours = Array.from(new Set([raw.hour ?? 2, raw.hour2 ?? 14])).sort((a, b) => a - b);
    } else if (raw.frequency === 'weekly') {
      c.frequency = 'weekly';
      c.hours = [raw.hour ?? 2];
      c.weekdays = [raw.weekday ?? 1];
    } else {
      c.frequency = 'daily';
      c.hours = [raw.hour ?? 2];
    }
  }
  if (!c.hours?.length) c.hours = [c.hour ?? 2];
  return c;
}

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('pineapple_session')?.value;
    const user = token ? await verifyToken(token) : null;
    if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } });
  const config: AutoSyncConfig = row ? migrateConfig(JSON.parse(row.value)) : DEFAULT_CONFIG_VALUE;
    return NextResponse.json({ success: true, data: config });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('pineapple_session')?.value;
    const user = token ? await verifyToken(token) : null;
    if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const body = await req.json() as Partial<AutoSyncConfig>;

    // Merge con config esistente
    const existing = await prisma.config.findUnique({ where: { key: CONFIG_KEY } });
    const current: AutoSyncConfig = existing ? migrateConfig(JSON.parse(existing.value)) : DEFAULT_CONFIG_VALUE;
    const updated: AutoSyncConfig = { ...current, ...body };

    await prisma.config.upsert({
      where: { key: CONFIG_KEY },
      update: { value: JSON.stringify(updated) },
      create: { key: CONFIG_KEY, value: JSON.stringify(updated) },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

