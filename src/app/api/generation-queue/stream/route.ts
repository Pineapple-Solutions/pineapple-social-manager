// src/app/api/generation-queue/stream/route.ts
// Route SSE (Server-Sent Events) per notifiche real-time dei job di generazione.
// I client si connettono con EventSource('/api/generation-queue/stream?tenantId=xxx')
// e ricevono un evento 'job-update' ogni volta che un job cambia stato.

import { NextRequest } from 'next/server';
import { jobEvents, type JobUpdateEvent } from '@/lib/job-events';

export const dynamic = 'force-dynamic';
// Non cacheable
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const tenantId = searchParams.get('tenantId') ?? null;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Invia subito un evento "connected" per confermare la connessione
      controller.enqueue(encoder.encode('event: connected\ndata: {}\n\n'));

      const handler = (event: JobUpdateEvent) => {
        // Filtra per tenant se specificato
        if (tenantId && event.tenantId !== tenantId) return;
        try {
          controller.enqueue(
            encoder.encode(`event: job-update\ndata: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          // Il controller potrebbe essere già chiuso
        }
      };

      jobEvents.on('job-update', handler);

      // Heartbeat ogni 20 secondi per mantenere la connessione aperta
      // (i proxy e i load balancer chiudono connessioni idle, tipicamente dopo 60s)
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 20_000);

      // Quando il client si disconnette, pulizia
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        jobEvents.off('job-update', handler);
        try { controller.close(); } catch { /* già chiuso */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',   // disabilita il buffering di Nginx
      'Access-Control-Allow-Origin': '*',
    },
  });
}

