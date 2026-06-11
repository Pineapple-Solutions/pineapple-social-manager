// src/app/api/posts/route.ts — Post schedulati (tenant-scoped)
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
    const siteId = searchParams.get('siteId');
    const limit = parseInt(searchParams.get('limit') ?? '50');
    const page = parseInt(searchParams.get('page') ?? '1');
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { ...buildTenantWhere(scope) };
    if (status) where.status = status;
    if (type) where.type = type;
    if (siteId) where.siteId = siteId;

    const [posts, total] = await Promise.all([
      prisma.scheduledPost.findMany({
        where,
        include: {
          account: { select: { username: true, profilePicture: true } },
          site: { select: { name: true, url: true } },
          campaign: { select: { name: true } },
        },
        orderBy: { scheduledAt: 'asc' },
        take: limit,
        skip,
      }),
      prisma.scheduledPost.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: posts,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const body = await req.json();
    const tenantId = (body.tenantId && body.tenantId.trim() !== '') ? body.tenantId : scope.tenantId;
    const platform: string = body.platform ?? 'INSTAGRAM';

    // Trova l'account corretto in base alla piattaforma
    let accountId: string | null = body.accountId ?? null;
    let facebookAccountId: string | null = body.facebookAccountId ?? null;
    let tiktokAccountId: string | null = body.tiktokAccountId ?? null;

    const isDraft = !body.scheduledAt && (body.status === 'DRAFT' || !body.status);

    // Trova l'account corretto in base alla piattaforma.
    // Per le bozze (DRAFT) l'account è opzionale — può essere impostato al momento della pubblicazione.
    if (platform === 'FACEBOOK' && !facebookAccountId) {
      const where = tenantId ? { isActive: true, tenantId } : { isActive: true };
      const fbAccount = await prisma.facebookAccount.findFirst({ where });
      if (!fbAccount && !isDraft) return NextResponse.json({ success: false, error: 'Nessun account Facebook configurato per questo cliente' }, { status: 400 });
      facebookAccountId = fbAccount?.id ?? null;
    } else if (platform === 'TIKTOK' && !tiktokAccountId) {
      const where = tenantId ? { isActive: true, tenantId } : { isActive: true };
      const ttAccount = await prisma.tikTokAccount.findFirst({ where });
      if (!ttAccount && !isDraft) return NextResponse.json({ success: false, error: 'Nessun account TikTok configurato per questo cliente' }, { status: 400 });
      tiktokAccountId = ttAccount?.id ?? null;
    } else if (platform === 'INSTAGRAM' && !accountId) {
      const where = tenantId ? { isActive: true, tenantId } : { isActive: true };
      const igAccount = await prisma.instagramAccount.findFirst({ where });
      if (!igAccount && !isDraft) return NextResponse.json({ success: false, error: 'Nessun account Instagram configurato per questo cliente' }, { status: 400 });
      accountId = igAccount?.id ?? null;
    }

    const mediaUrls: string[] = body.mediaUrls ?? [];
    const hasMedia = mediaUrls.length > 0;
    // mediaReady: NONE se post solo testo (nessun media necessario), READY se già fornito, PENDING altrimenti
    const mediaReady = body.mediaReady ?? (hasMedia ? 'READY' : 'PENDING');

    // Storyboard REEL: se fornito come JSON string, lo usiamo sia in notes che nel job payload
    let parsedStoryboard: Record<string, unknown> | null = null;
    if (body.reelScript) {
      try {
        const raw: string = typeof body.reelScript === 'string'
          ? body.reelScript
          : JSON.stringify(body.reelScript);
        // extractJSON-like: prendi primo { ... }
        const s = raw.indexOf('{'); const e = raw.lastIndexOf('}');
        if (s !== -1 && e > s) parsedStoryboard = JSON.parse(raw.slice(s, e + 1));
      } catch { /* ignora parse error */ }
    }

    // notes: se c'è uno storyboard lo salviamo come JSON (retrocompatibile con note testuali)
    const notesValue = parsedStoryboard
      ? JSON.stringify({ description: body.notes ?? null, storyboard: parsedStoryboard })
      : (body.notes ?? null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createData: any = {
      tenantId: tenantId ?? null,
      platform,
      type: body.type ?? 'POST',
      status: body.scheduledAt && (mediaReady === 'READY' || mediaReady === 'NONE') ? 'SCHEDULED' : 'DRAFT',
      caption: body.caption,
      hashtags: JSON.stringify(body.hashtags ?? []),
      mediaUrls: JSON.stringify(mediaUrls),
      // Se il tipo è REEL forza sempre VIDEO indipendentemente da quanto inviato dal client
      mediaType: (body.type === 'REEL') ? 'VIDEO' : (body.mediaType ?? 'IMAGE'),
      coverUrl: body.coverUrl,
      aiGenerated: body.aiGenerated ?? false,
      aiPrompt: body.aiPrompt,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      accountId: accountId ?? undefined,
      facebookAccountId: facebookAccountId ?? undefined,
      tiktokAccountId: tiktokAccountId ?? undefined,
      siteId: body.siteId || null,
      campaignId: body.campaignId || null,
      notes: notesValue,
      mediaReady, // campo aggiunto via db push — il Prisma client potrebbe non averlo ancora
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const post = await prisma.scheduledPost.create({ data: createData });

    // Se il post richiede media (PENDING) e ha un tenantId, crea automaticamente
    // un GenerationJob IMAGE/VIDEO nella coda
    if (mediaReady === 'PENDING' && tenantId) {
      try {
        // Determina se il media richiesto è un VIDEO (Reel è sempre video, oppure mediaType=VIDEO)
        const postType: string = body.type ?? 'POST';
        // Se postType è REEL forza VIDEO indipendentemente da body.mediaType
        const mediaType: string = (postType === 'REEL') ? 'VIDEO' : (body.mediaType ?? 'IMAGE');
        const needsVideo = postType === 'REEL' || mediaType === 'VIDEO';
        const jobType = needsVideo ? 'VIDEO' : 'IMAGE';
        // Aspect ratio: 9:16 per REEL (portrait), fallback a body.videoAspectRatio
        const videoAspectRatioForJob = postType === 'REEL'
          ? (body.videoAspectRatio ?? '9:16')
          : (body.videoAspectRatio ?? null);

        // Costruisce il prompt per la generazione media
        // Arricchisce con le descrizioni delle immagini di riferimento (se fornite)
        const inputMediaRefs: Array<{ url: string; alt?: string; description?: string }> = body.inputMediaRefs ?? [];
        const refDescriptions = inputMediaRefs
          .slice(0, 3)
          .map((r) => r.description || r.alt)
          .filter(Boolean)
          .join('; ');
        const imagePrompt = [
          body.imageDescription,
          body.caption ? body.caption.slice(0, 300) : '',
          body.aiPrompt ? `Topic: ${body.aiPrompt}` : '',
          refDescriptions ? `Visual reference: ${refDescriptions}` : '',
          `Platform: ${platform}. Style: professional social media ${needsVideo ? 'video' : 'photography'}, modern, high quality.`,
        ].filter(Boolean).join('. ');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma as any).generationJob.create({
          data: {
            tenantId,
            type: jobType, // 'IMAGE' per foto statiche, 'VIDEO' per video (Reel o mediaType=VIDEO)
            status: 'PENDING',
            relatedPostId: post.id,
            scheduledFor: body.scheduledAt ? new Date(body.scheduledAt) : null,
            priority: body.scheduledAt
              ? Math.min(100, Math.max(0, Math.floor((new Date(body.scheduledAt).getTime() - Date.now()) / (1000 * 60 * 60))))
              : 50,
            payload: JSON.stringify({
              imagePrompt,
              topic: body.aiPrompt,
              caption: body.caption,
              platform,
              postType,
              language: body.language ?? 'it',  // Lingua scelta in AI Generator
              mediaType: jobType, // IMAGE o VIDEO — usato dal scheduler per scegliere il modello corretto
              siteId: body.siteId ?? null,
              carouselCount: body.carouselCount ?? undefined,
              // Aspect ratio per video (9:16 o 16:9) — scelto dall'utente in AI Generator; per REEL default 9:16
              videoAspectRatio: needsVideo ? videoAspectRatioForJob : undefined,
              // Durata video in secondi (range valido Veo: 4–8s) — scelto dall'utente in AI Generator
              duration: needsVideo ? (typeof body.videoDuration === 'number' ? body.videoDuration : undefined) : undefined,
              // Immagini di riferimento per la generazione AI
              inputMediaRefs: inputMediaRefs.length > 0 ? inputMediaRefs : undefined,
              // Storyboard REEL (solo metadato informativo — non influenza la suddivisione delle clip)
              _storyboard: parsedStoryboard ?? undefined,
              // Override modello video scelto dall'utente in AI Generator (es. veo-3-fast-generate-001)
              // Il scheduler legge questo campo e sovrascrive il modello di default del provider
              videoModel: body.videoModel ?? undefined,
              // Auto-rimozione filigrana: se impostata dal form, applica automaticamente dopo la generazione
              autoRemoveWatermark: body.autoRemoveWatermark === true ? true : false,
              wmPreset: body.wmPreset ?? 'bottom-right',
              wmMethod: body.wmMethod ?? 'taglio',
            }),
          },
        });
      } catch {
        // Non blocca la risposta — il Prisma client potrebbe essere vecchio
      }

      // Avvia subito la coda (fire-and-forget) senza aspettare il cron dei 5 minuti
      processGenerationQueue().catch(() => {});
    }

    return NextResponse.json({ success: true, data: post });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

// DELETE — elimina più post in blocco
export async function DELETE(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const body = await req.json();
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    if (!ids.length) return NextResponse.json({ success: false, error: 'ids obbligatorio' }, { status: 400 });

    const isMaster = scope.user.role === 'master';

    // Verifica ownership per utenti non-master
    if (!isMaster) {
      const posts = await prisma.scheduledPost.findMany({ where: { id: { in: ids } }, select: { tenantId: true } });
      const unauthorized = posts.some(p => p.tenantId !== scope.tenantId);
      if (unauthorized) return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
    }

    const result = await prisma.scheduledPost.deleteMany({ where: { id: { in: ids } } });
    return NextResponse.json({ success: true, count: result.count, message: `${result.count} post eliminati` });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

