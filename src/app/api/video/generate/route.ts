// src/app/api/video/generate/route.ts — Avvia generazione video in Coda Generazione
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, hasPermission, PERMISSIONS } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Helper tipo-sicuro
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gj = () => (prisma as any).generationJob;

export async function POST(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || !hasPermission(user, PERMISSIONS.VIDEO_GENERATE)) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  const body = await req.json();
  const { prompt, aspectRatio, duration, style, relatedPostId, notes, siteId, storyboard, topic, language, videoModel } = body;

  if (!prompt && !topic) {
    return NextResponse.json({ success: false, error: 'prompt o topic è obbligatorio' }, { status: 400 });
  }

  // Se viene passato un topic senza prompt esplicito, usa il topic come prompt base
  const effectivePrompt = prompt || `Create a professional social media video about: ${topic}`;

  // ── Risolvi tenantId dal siteId (se fornito) ──────────────────────────────
  let tenantId = body.tenantId ?? user.tenantId;
  if (siteId && !body.tenantId) {
    try {
      const site = await prisma.connectedSite.findUnique({
        where: { id: siteId },
        select: { tenantId: true },
      });
      if (site?.tenantId) {
        tenantId = site.tenantId;
      }
    } catch (err) {
      console.warn(`[video/generate] Errore nel caricamento del sito ${siteId}:`, err instanceof Error ? err.message : err);
    }
  }

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'tenantId richiesto' }, { status: 400 });
  }

  try {
    // Crea un GenerationJob di tipo VIDEO nella coda unificata
    const job = await gj().create({
      data: {
        tenantId,
        type: 'VIDEO',
        status: 'PENDING',
        relatedPostId: relatedPostId ?? null,
        priority: 50,
        maxAttempts: 3,
        payload: JSON.stringify({
          prompt: effectivePrompt,
          topic: topic ?? null,
          language: language ?? 'it',
          aspectRatio: aspectRatio ?? '9:16',
          duration: duration ?? 5,
          style: style ?? null,
          siteId: siteId ?? null,
          notes: notes ?? null,
          // Modello video override (per singola esecuzione senza modificare impostazioni globali)
          ...(videoModel ? { videoModel } : {}),
          // Storyboard con scene, musica, hook, CTA — usato per prompt per-clip e TTS
          _storyboard: storyboard ?? undefined,
          // source identifica questa come generazione manuale standalone
          source: 'video-ai',
        }),
      },
    });

    return NextResponse.json({
      success: true,
      data: job,
      message: '🎬 Video aggiunto alla Coda Generazione — verrà elaborato a breve.',
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Errore',
    }, { status: 500 });
  }
}
