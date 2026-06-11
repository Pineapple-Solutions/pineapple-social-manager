// src/app/api/scheduler/init/route.ts
// Endpoint chiamato all'avvio per inizializzare il scheduler

import { NextResponse } from 'next/server';
import { initScheduler, processDuePublications, processGenerationQueue, pollVeoVideoGenerationJobs } from '@/lib/scheduler';

let initialized = false;

export async function GET() {
  if (!initialized) {
    initScheduler();
    initialized = true;
  }
  return NextResponse.json({ success: true, message: 'Scheduler attivo' });
}

export async function POST() {
  // Trigger manuale per processing immediato (pubblicazioni + generazione + polling Veo)
  await Promise.all([
    processDuePublications(),
    processGenerationQueue(),
    pollVeoVideoGenerationJobs(),
  ]);
  return NextResponse.json({ success: true, message: 'Coda generazione, pubblicazioni e polling Veo processati' });
}

