// src/app/api/scheduler/queue/route.ts
// API per la coda di generazione contenuti globale
// GET  — lista job con filtri
// POST — forza run manuale del processore (trigger on-demand)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getTenantFilter, buildTenantWhere } from '@/lib/auth';
import { processGenerationQueue } from '@/lib/scheduler';

export async function GET(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') ?? '50');
    const page = parseInt(searchParams.get('page') ?? '1');
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { ...buildTenantWhere(scope) };
    if (status) where.status = status;
    if (type) where.type = type;

    const [jobs, total] = await Promise.all([
      prisma.generationJob.findMany({
        where,
        include: {
          relatedPost: { select: { id: true, type: true, caption: true, scheduledAt: true, status: true, mediaReady: true } },
        },
        orderBy: [{ priority: 'asc' }, { scheduledFor: 'asc' }, { createdAt: 'asc' }],
        take: limit,
        skip,
      }),
      prisma.generationJob.count({ where }),
    ]);

    // Statistiche rapide
    const stats = await prisma.generationJob.groupBy({
      by: ['status'],
      where: { ...(scope.tenantId ? { tenantId: scope.tenantId } : {}) },
      _count: { status: true },
    });

    return NextResponse.json({
      success: true,
      data: jobs,
      stats: Object.fromEntries(stats.map(s => [s.status, s._count.status])),
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

// Trigger manuale — esegue il processore ora, senza attendere il cron
export async function POST(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    // Azione specifica: mark media ready
    if (body.action === 'mark_media_ready' && body.postId) {
      const { markMediaReady } = await import('@/lib/scheduler');
      await markMediaReady(body.postId as string);
      return NextResponse.json({ success: true, message: 'Media segnato come pronto' });
    }

    // Azione: cancella job
    if (body.action === 'cancel' && body.jobId) {
      await prisma.generationJob.update({
        where: { id: body.jobId as string },
        data: { status: 'CANCELLED' },
      });
      return NextResponse.json({ success: true, message: 'Job annullato' });
    }

    // Azione: retry job fallito
    if (body.action === 'retry' && body.jobId) {
      await prisma.generationJob.update({
        where: { id: body.jobId as string },
        data: { status: 'PENDING', errorMessage: null, nextRetryAt: null },
      });
      return NextResponse.json({ success: true, message: 'Job rimesso in coda' });
    }

    // Default: esegui il processore
    await processGenerationQueue();
    return NextResponse.json({ success: true, message: 'Coda generazione processata' });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

