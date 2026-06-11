// src/app/api/posts/[id]/route.ts — GET/PUT/DELETE singolo post
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { markMediaReady } from '@/lib/scheduler';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _prismaAny = prisma as unknown as Record<string, unknown>; // per generationJob via any

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const post = await prisma.scheduledPost.findUnique({
      where: { id },
      include: {
        account: { select: { username: true, profilePicture: true } },
        site: true,
        campaign: true,
      },
    });
    if (!post) return NextResponse.json({ success: false, error: 'Non trovato' }, { status: 404 });

    // GenerationJobs separati per non bloccare se il Prisma client è vecchio
    let generationJobs: unknown[] = [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      generationJobs = await (prisma as any).generationJob.findMany({
        where: { relatedPostId: id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
    } catch { /* modello non ancora disponibile nel client */ }

    return NextResponse.json({ success: true, data: { ...post, generationJobs } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Carica il post attuale per confronti
    const current = await prisma.scheduledPost.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ success: false, error: 'Non trovato' }, { status: 404 });

    const updateData: Record<string, unknown> = {};
    if (body.caption !== undefined) updateData.caption = body.caption;
    if (body.hashtags !== undefined) updateData.hashtags = JSON.stringify(body.hashtags);
    if (body.type !== undefined) updateData.type = body.type;
    if (body.platform !== undefined) updateData.platform = body.platform;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.campaignId !== undefined) updateData.campaignId = body.campaignId;

    // Gestione mediaUrls: se vengono aggiunti media, aggiorna mediaReady
    if (body.mediaUrls !== undefined) {
      const newMediaUrls: string[] = body.mediaUrls;
      updateData.mediaUrls = JSON.stringify(newMediaUrls);
      if (newMediaUrls.length > 0 && current.mediaReady !== 'READY') {
        updateData.mediaReady = 'READY';
        // Completa i job in coda per questo post
        await markMediaReady(id);
      }
    }

    // Richiesta di rigenerazione immagine AI
    if (body.regenerateImage === true && current.tenantId) {
      updateData.mediaReady = 'PENDING';
      updateData.mediaUrls = JSON.stringify([]);
      try {
        const gj = (prisma as any).generationJob; // eslint-disable-line @typescript-eslint/no-explicit-any
        const captionToUse = (body.caption ?? current.caption ?? '') as string;
        const inputMediaRefs: Array<{ url: string; alt?: string; description?: string }> = body.inputMediaRefs ?? [];
        const refDescriptions = inputMediaRefs
          .slice(0, 3)
          .map((r) => r.description || r.alt)
          .filter(Boolean)
          .join('; ');
        const imagePrompt = [
          body.imageDescription,
          captionToUse.slice(0, 300),
          refDescriptions ? `Visual reference: ${refDescriptions}` : '',
          `Platform: ${current.platform}. Style: professional social media photography, modern, high quality.`,
        ].filter(Boolean).join('. ');
        await gj.create({
          data: {
            tenantId: current.tenantId,
            type: 'IMAGE',
            status: 'PENDING',
            relatedPostId: current.id,
            scheduledFor: current.scheduledAt,
            priority: 50,
            payload: JSON.stringify({
              imagePrompt,
              caption: captionToUse,
              platform: current.platform,
              postType: current.type,
              inputMediaRefs: inputMediaRefs.length > 0 ? inputMediaRefs : undefined,
            }),
          },
        });
      } catch { /* Prisma client vecchio */ }
    }

    // Gestisci cambio stato — SCHEDULED è sempre permesso anche con media PENDING
    // (il cron processDuePublications pubblica SOLO se mediaReady=READY, quindi sicuro)
    if (body.status !== undefined) {
      updateData.status = body.status;
    }

    if (body.scheduledAt !== undefined) {
      updateData.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
      // Auto-schedula solo se media pronto
      if (body.scheduledAt && body.status === undefined) {
        const readyStatus = (updateData.mediaReady ?? current.mediaReady) as string;
        updateData.status = (readyStatus === 'READY' || readyStatus === 'NONE') ? 'SCHEDULED' : 'DRAFT';
      }
    }

    const post = await prisma.scheduledPost.update({ where: { id }, data: updateData });
    return NextResponse.json({ success: true, data: post });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.scheduledPost.delete({ where: { id } });
    return NextResponse.json({ success: true, message: 'Post eliminato' });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

