// src/app/api/generation-queue/route.ts — Coda generazione media
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getTenantFilter, buildTenantWhere } from '@/lib/auth';
import { markMediaReady, processGenerationQueue } from '@/lib/scheduler';
import { saveFileFromUrl, isLocalUrl } from '@/lib/file-storage';
import { isSensitiveWordsError } from '@/lib/video-generator';

// Helper sicuro per accedere a generationJob (il modello potrebbe non essere nel client vecchio)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gj = () => (prisma as any).generationJob;

const EMPTY_SUMMARY = {
  PENDING: 0, PROCESSING: 0, WAITING_TOKENS: 0,
  MANUAL_UPLOAD: 0, FAILED: 0, COMPLETED_TODAY: 0, CANCELLED: 0,
};

export async function GET(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status        = searchParams.get('status');
    const type          = searchParams.get('type');
    const tenantId      = searchParams.get('tenantId');
    const relatedPostId = searchParams.get('relatedPostId');
    const limit         = parseInt(searchParams.get('limit') ?? '100');

    const tenantWhere = buildTenantWhere(scope);
    const where: Record<string, unknown> = { ...tenantWhere };
    if (tenantId)      where.tenantId = tenantId;
    if (status)        where.status = status;
    if (type)          where.type = type;
    if (relatedPostId) where.relatedPostId = relatedPostId;

    // Se il Prisma client è vecchio, restituisce array vuoto + summary zero
    let jobs: unknown[] = [];
    let summary = { ...EMPTY_SUMMARY };

    try {
      jobs = await gj().findMany({
        where,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        take: limit,
        include: {
          relatedPost: {
            select: {
              id: true, type: true, status: true, platform: true,
              caption: true, scheduledAt: true, mediaReady: true,
              site: { select: { name: true, url: true } },
            },
          },
          tenant: { select: { id: true, name: true, slug: true } },
        },
      });

      const summaryWhere: Record<string, unknown> = { ...tenantWhere };
      if (tenantId) summaryWhere.tenantId = tenantId;

      const [p, proc, wt, mu, f, c, ca] = await Promise.all([
        gj().count({ where: { ...summaryWhere, status: 'PENDING' } }),
        gj().count({ where: { ...summaryWhere, status: 'PROCESSING' } }),
        gj().count({ where: { ...summaryWhere, status: 'WAITING_TOKENS' } }),
        gj().count({ where: { ...summaryWhere, status: 'MANUAL_UPLOAD' } }),
        gj().count({ where: { ...summaryWhere, status: 'FAILED' } }),
        gj().count({ where: { ...summaryWhere, status: 'COMPLETED', updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
        gj().count({ where: { ...summaryWhere, status: 'CANCELLED' } }),
      ]);

      summary = {
        PENDING: p, PROCESSING: proc, WAITING_TOKENS: wt,
        MANUAL_UPLOAD: mu, FAILED: f, COMPLETED_TODAY: c, CANCELLED: ca,
      };
    } catch {
      // Prisma client vecchio — il modello GenerationJob non è ancora disponibile
      // Restituisce dati vuoti finché il server non viene riavviato
    }

    return NextResponse.json({ success: true, data: jobs, summary });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

// POST — azioni sui job: retry | cancel | markReady
export async function POST(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const body = await req.json();
    const { action, jobId, postId } = body;
    const isMaster = scope.user.role === 'master';

    if (action === 'retry' && jobId) {
      const job = await gj().findUnique({
        where: { id: jobId },
        include: { relatedPost: { select: { caption: true, platform: true, type: true } } },
      });
      if (!job) return NextResponse.json({ success: false, error: 'Job non trovato' }, { status: 404 });
      if (!isMaster && job.tenantId !== scope.tenantId) {
        return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
      }

      // Se il job era MANUAL, convertilo in IMAGE per la generazione automatica AI
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const relatedPost = job.relatedPost as any;
      const updateData: Record<string, unknown> = {
        status: 'PENDING',
        attempts: 0,
        nextRetryAt: null,
        errorMessage: null,
      };
      if (job.type === 'MANUAL' || job.type === 'MANUAL_UPLOAD') {
        const imagePrompt = [
          relatedPost?.caption?.slice(0, 300),
          `Platform: ${relatedPost?.platform ?? 'INSTAGRAM'}.`,
          'Style: professional social media photography, modern, high quality.',
        ].filter(Boolean).join(' ');
        updateData.type = 'IMAGE';
        updateData.payload = JSON.stringify({
          imagePrompt,
          caption: relatedPost?.caption,
          platform: relatedPost?.platform ?? 'INSTAGRAM',
          postType: relatedPost?.type ?? 'POST',
        });
      } else {
        // Rimuovi i flag di retry: permette al retry automatico di riattivarsi
        // La riscrittura AI / text-to-video avverrà automaticamente in pollVeoVideoGenerationJobs.
        let currentPayload: Record<string, unknown> = {};
        try { currentPayload = JSON.parse(job.payload ?? '{}'); } catch { /* */ }

        // Per job VIDEO, rimuovi anche operationName e _stitching stale per garantire
        // un fresh start (evita che il job riparta da un'operazione Veo già scaduta/bloccata).
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _sensitiveWordsRetried: _swr, _humanImageRetried: _hir,
          operationName: _op, _stitching: _st, ...cleanPayload } = currentPayload;

        updateData.payload = JSON.stringify(cleanPayload);
      }

      await gj().update({ where: { id: jobId }, data: updateData });
      if (job.relatedPostId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.scheduledPost.update as any)({
          where: { id: job.relatedPostId },
          data: { mediaReady: 'PENDING' },
        });
      }
      return NextResponse.json({ success: true, message: job.type === 'MANUAL' ? 'Job convertito in generazione AI e rimesso in coda' : 'Job rimesso in coda' });
    }

    // Forza l'esecuzione immediata di un job PENDING annullando il nextRetryAt
    if (action === 'forceRetry' && jobId) {
      const job = await gj().findUnique({ where: { id: jobId } });
      if (!job) return NextResponse.json({ success: false, error: 'Job non trovato' }, { status: 404 });
      if (!isMaster && job.tenantId !== scope.tenantId) {
        return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
      }
      await gj().update({
        where: { id: jobId },
        data: { nextRetryAt: null, status: 'PENDING', errorMessage: null },
      });
      return NextResponse.json({ success: true, message: 'Retry forzato — il job verrà elaborato al prossimo ciclo' });
    }

    if (action === 'cancel' && jobId) {
      const job = await gj().findUnique({ where: { id: jobId } });
      if (!job) return NextResponse.json({ success: false, error: 'Job non trovato' }, { status: 404 });
      if (!isMaster && job.tenantId !== scope.tenantId) {
        return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
      }
      await gj().update({ where: { id: jobId }, data: { status: 'CANCELLED' } });
      return NextResponse.json({ success: true, message: 'Job annullato' });
    }

    // Aggiorna campi nel payload del job (es: videoAspectRatio, imagePrompt, ...)
    // Usato dalla Coda per modificare parametri di un job senza ricrearlo.
    // forceReset=true forza il reset a PENDING anche per job PROCESSING (usato per cambio durata)
    if (action === 'updatePayload' && jobId) {
      const job = await gj().findUnique({ where: { id: jobId } });
      if (!job) return NextResponse.json({ success: false, error: 'Job non trovato' }, { status: 404 });
      if (!isMaster && job.tenantId !== scope.tenantId) {
        return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
      }
      const payloadPatch = body.payloadPatch as Record<string, unknown> ?? {};
      const forceReset = body.forceReset === true;
      const currentPayload = JSON.parse(job.payload || '{}');
      // Rimuovi _stitching dal payload se esplicitamente impostato a null/undefined nel patch
      const newPayload: Record<string, unknown> = { ...currentPayload, ...payloadPatch };
      if (payloadPatch._stitching === null || payloadPatch._stitching === undefined) {
        delete newPayload._stitching;
      }
      // Resetta a PENDING con errore pulito se:
      // - job non è in stato terminale (COMPLETED, CANCELLED)
      // - oppure forceReset=true (usato per cambio durata su job PROCESSING)
      const isHardTerminal = job.status === 'COMPLETED' || job.status === 'CANCELLED';
      const shouldReset = !isHardTerminal || forceReset;
      await gj().update({
        where: { id: jobId },
        data: {
          payload: JSON.stringify(newPayload),
          ...(shouldReset ? {
            status: 'PENDING',
            attempts: 0,
            nextRetryAt: null,
            errorMessage: null,
          } : {}),
        },
      });
      return NextResponse.json({ success: true, message: 'Payload aggiornato — job rimesso in coda' });
    }

    // Sblocca TUTTI i job WAITING_TOKENS del tenant → rimanda in PENDING immediatamente
    if (action === 'unlockQuota') {
      const targetTenantId = body.tenantId ?? scope.tenantId;
      if (!isMaster && targetTenantId !== scope.tenantId) {
        return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
      }
      const where: Record<string, unknown> = {
        status: 'WAITING_TOKENS',
      };
      if (targetTenantId) where.tenantId = targetTenantId;
      const result = await gj().updateMany({
        where,
        data: {
          status: 'PENDING',
          nextRetryAt: null,
          errorMessage: 'Sbloccato manualmente dall\'utente',
        },
      });
      return NextResponse.json({
        success: true,
        message: `${result.count} job sbloccati e rimessi in coda`,
        count: result.count,
      });
    }

    if (action === 'markReady' && postId) {
      const post = await prisma.scheduledPost.findUnique({ where: { id: postId } });
      if (!post) return NextResponse.json({ success: false, error: 'Post non trovato' }, { status: 404 });
      if (!isMaster && post.tenantId !== scope.tenantId) {
        return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
      }
      await markMediaReady(postId);
      return NextResponse.json({ success: true, message: 'Media segnato come pronto' });
    }

    // Ri-scarica e persiste il video di un job VIDEO COMPLETATO con URL remoto (Veo scaduto/non salvato)
    if (action === 'redownloadVideo' && jobId) {
      const job = await gj().findUnique({ where: { id: jobId } });
      if (!job) return NextResponse.json({ success: false, error: 'Job non trovato' }, { status: 404 });
      if (!isMaster && job.tenantId !== scope.tenantId) {
        return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
      }
      let resultData: Record<string, unknown> = {};
      try { resultData = JSON.parse(job.result ?? '{}'); } catch { /* */ }
      let videoUrl = (resultData.url ?? resultData.videoUrl) as string | undefined;
      if (!videoUrl) return NextResponse.json({ success: false, error: 'Nessun URL video nel result' }, { status: 400 });
      if (isLocalUrl(videoUrl)) return NextResponse.json({ success: true, message: 'Video già persistito localmente', url: videoUrl });

      // Trova la API key Google del tenant
      const providerConfig = await prisma.aIProviderConfig.findFirst({
        where: { tenantId: job.tenantId, provider: 'google', isActive: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
      if (!providerConfig?.apiKey) return NextResponse.json({ success: false, error: 'Provider Google non trovato o senza API key' }, { status: 400 });

      // Autenticazione corretta: ?key=API_KEY
      const downloadUrl = videoUrl.includes('?')
        ? `${videoUrl}&key=${providerConfig.apiKey}`
        : `${videoUrl}?key=${providerConfig.apiKey}`;

      let payloadData: Record<string, unknown> = {};
      try { payloadData = JSON.parse(job.payload ?? '{}'); } catch { /* */ }

      const saved = await saveFileFromUrl(downloadUrl, 'video-ai', job.tenantId, {
        optimize: false,
        forceExt: 'mp4',
        siteId: (payloadData.siteId as string | null) ?? null,
      });
      videoUrl = saved.publicUrl;

      // Aggiorna result con URL locale
      await gj().update({
        where: { id: jobId },
        data: {
          result: JSON.stringify({ ...resultData, url: videoUrl, videoUrl, mimeType: 'video/mp4' }),
        },
      });

      // Aggiorna anche il post collegato
      if (job.relatedPostId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.scheduledPost.update as any)({
          where: { id: job.relatedPostId },
          data: { mediaUrls: JSON.stringify([videoUrl]), mediaReady: 'READY' },
        }).catch(() => {});
      }
      return NextResponse.json({ success: true, message: 'Video scaricato e persistito!', url: videoUrl });
    }

    // ── Crea un job di MIGLIORAMENTO partendo da un job completato ──────────
    // Reinvia lo stesso prompt ma aggiunge il media generato come immagine di riferimento.
    // Accetta { jobId } oppure { postId } (cerca automaticamente l'ultimo job completato).
    if (action === 'refineJob') {
      const additionalPrompt = typeof body.additionalPrompt === 'string' ? body.additionalPrompt.trim() : undefined;

      // Trova il job sorgente
      let sourceJob: { id: string; tenantId: string; type: string; result: string | null; payload: string; relatedPostId: string | null } | null = null;

      if (jobId) {
        sourceJob = await gj().findUnique({ where: { id: jobId } });
      } else if (postId) {
        const jobs = await gj().findMany({
          where: { relatedPostId: postId, status: 'COMPLETED' },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        });
        sourceJob = jobs[0] ?? null;
      }

      if (!sourceJob) return NextResponse.json({ success: false, error: 'Nessun job completato trovato' }, { status: 404 });
      if (!isMaster && sourceJob.tenantId !== scope.tenantId) {
        return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
      }

      // Estrai URL del media precedentemente generato
      let resultData: Record<string, unknown> = {};
      try { resultData = JSON.parse(sourceJob.result ?? '{}'); } catch { /* */ }
      const previousMediaUrl = (resultData.url ?? resultData.videoUrl ?? resultData.imageUrl) as string | undefined;
      if (!previousMediaUrl) {
        return NextResponse.json({ success: false, error: 'Nessun media nel job precedente da migliorare' }, { status: 400 });
      }

      // Costruisce il nuovo payload: uguale al precedente ma con il media generato come primo inputMediaRef
      let previousPayload: Record<string, unknown> = {};
      try { previousPayload = JSON.parse(sourceJob.payload ?? '{}'); } catch { /* */ }

      // Rimuovi campi specifici del job precedente (operationName, _promptInfo, _refineOf)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { operationName: _op, _promptInfo: _pi, _refineOf: _ro, _additionalPrompt: _ap, ...cleanPayload } = previousPayload as Record<string, unknown>;

      // Tutti i ref originali del job sorgente (senza limite)
      const originalRefs: Array<{ url: string; alt?: string; description?: string; mimeType?: string }> =
        Array.isArray(cleanPayload.inputMediaRefs)
          ? (cleanPayload.inputMediaRefs as Array<{ url: string; alt?: string; description?: string; mimeType?: string }>)
          : [];

      // Se il post collegato ha mediaUrls, aggiungi quelli NON già presenti nei ref originali
      // (esclude l'output precedente che stiamo già inserendo come primo ref)
      let postMediaRefs: Array<{ url: string; alt: string; description: string }> = [];
      if (sourceJob.relatedPostId) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const relPost = await (prisma.scheduledPost.findUnique as any)({
            where: { id: sourceJob.relatedPostId },
            select: { mediaUrls: true },
          });
          if (relPost?.mediaUrls) {
            const urls: string[] = JSON.parse(relPost.mediaUrls as string);
            const existingUrls = new Set([previousMediaUrl, ...originalRefs.map(r => r.url)]);
            postMediaRefs = urls
              .filter(u => u && !existingUrls.has(u))
              .map(u => ({
                url: u,
                alt: 'Post media',
                description: 'Existing post media — use as additional visual reference',
              }));
          }
        } catch { /* ignora errori — i ref del post sono opzionali */ }
      }

      const refinedPayload = {
        ...cleanPayload,
        inputMediaRefs: [
          // 1. Output del job precedente (da migliorare)
          {
            url: previousMediaUrl,
            alt: 'Previous AI generation output',
            description: additionalPrompt
              ? `Previous AI generation — ${additionalPrompt.trim()}`
              : 'Previous AI generation — improve quality, details and coherence while keeping the same style, subject and composition',
          },
          // 2. Tutti i ref media originali del job sorgente
          ...originalRefs,
          // 3. Media aggiuntivi dal post collegato (non già presenti sopra)
          ...postMediaRefs,
        ],
        _refineOf: sourceJob.id,
        ...(additionalPrompt ? { _additionalPrompt: additionalPrompt } : {}),
      };

      const newJob = await gj().create({
        data: {
          tenantId: sourceJob.tenantId,
          type: sourceJob.type,
          status: 'PENDING',
          relatedPostId: sourceJob.relatedPostId,
          priority: 45, // Priorità leggermente più alta dei nuovi job
          payload: JSON.stringify(refinedPayload),
        },
      });

      // Aggiorna il post collegato a PENDING (il nuovo media sostituirà quello attuale)
      if (sourceJob.relatedPostId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.scheduledPost.update as any)({
          where: { id: sourceJob.relatedPostId },
          data: { mediaReady: 'PENDING' },
        }).catch(() => {});
      }

      // Avvia subito la coda
      processGenerationQueue().catch(() => {});

      return NextResponse.json({ success: true, message: 'Job di miglioramento creato e avviato!', jobId: newJob.id });
    }

    // ── Retry di una singola clip di uno job di stitching ─────────────────
    // Resetta le clip dall'indice specificato in poi, imposta currentClipIndex = clipIndex
    // e rimette il job in PENDING per ripartire da quel punto.
    if (action === 'retryClip' && jobId) {
      const clipIndex = typeof body.clipIndex === 'number' ? body.clipIndex : parseInt(String(body.clipIndex ?? '0'), 10);

      const job = await gj().findUnique({ where: { id: jobId } });
      if (!job) return NextResponse.json({ success: false, error: 'Job non trovato' }, { status: 404 });
      if (!isMaster && job.tenantId !== scope.tenantId) {
        return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
      }

      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(job.payload ?? '{}'); } catch { /* */ }

      const stitching = payload._stitching as {
        totalDuration: number;
        currentClipIndex: number;
        clips: Array<{ index: number; duration: number; status: string; videoUrl?: string; operationName?: string; errorMessage?: string }>;
        clipPrompts?: string[];
        finalPrompt?: string;
      } | undefined;

      if (!stitching || !Array.isArray(stitching.clips)) {
        return NextResponse.json({ success: false, error: 'Nessun dato stitching trovato nel payload' }, { status: 400 });
      }

      // Reset le clip dall'indice specificato in poi
      stitching.clips = stitching.clips.map(clip => {
        if (clip.index >= clipIndex) {
          return { index: clip.index, duration: clip.duration, status: 'PENDING' };
        }
        return clip;
      });
      stitching.currentClipIndex = clipIndex;

      // Se il job era COMPLETED con clip 0 in stato PROCESSING (bug), recupera la videoUrl
      // dal result del job e imposta clip 0 come COMPLETED con la videoUrl del video generato
      if (clipIndex > 0 && stitching.clips[clipIndex - 1].status === 'PROCESSING') {
        let resultData: Record<string, unknown> = {};
        try { resultData = JSON.parse((job as Record<string, unknown>).result as string ?? '{}'); } catch { /* */ }
        const existingVideoUrl = (resultData.videoUrl ?? resultData.url) as string | undefined;
        if (existingVideoUrl && stitching.clips[clipIndex - 1]) {
          stitching.clips[clipIndex - 1].status = 'COMPLETED';
          stitching.clips[clipIndex - 1].videoUrl = existingVideoUrl;
          stitching.clips[clipIndex - 1].operationName = undefined;
        }
      }

      // Pulisce operationName top-level: evita che pollVeo controlli una vecchia operazione Veo
      // Se l'errore precedente era "humans in image", rimuove anche inputMediaRefs
      const prevErrForClip = (job.errorMessage ?? '').toLowerCase();
      const clipIsHumanError =
        prevErrForClip.includes('humans') ||
        prevErrForClip.includes('people') ||
        prevErrForClip.includes('not permitted for video generation') ||
        (prevErrForClip.includes('human') && prevErrForClip.includes('image'));

      // Rimuovi SEMPRE i flag di retry e, se l'errore è "humans in image", anche inputMediaRefs.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { inputMediaRefs: _humanRefs, _sensitiveWordsRetried: _swr2, _humanImageRetried: _hir2, ...payloadWithoutRefs } = payload as Record<string, unknown>;
      // Se l'errore era "humans in image": rimuovi inputMediaRefs per forzare text-to-video
      // Altrimenti: tieni inputMediaRefs ma rimuovi comunque entrambi i flag di retry
      const basePayload = clipIsHumanError
        ? payloadWithoutRefs
        : { ...payloadWithoutRefs, ...((_humanRefs !== undefined) ? { inputMediaRefs: _humanRefs } : {}) };

      if (clipIsHumanError) {
        console.log(`[retryClip] Job ${jobId} clip ${clipIndex}: rimosso inputMediaRefs (errore humans) → retry text-to-video`);
      }

      // Se l'errore era "sensitive words": NON sanitizza staticamente —
      // la riscrittura AI avverrà automaticamente in pollVeoVideoGenerationJobs al prossimo ciclo.
      const clipIsSensitiveError = isSensitiveWordsError(job.errorMessage ?? '');
      if (clipIsSensitiveError) {
        console.log(`[retryClip] Job ${jobId} clip ${clipIndex}: errore sensitive words → riscrittura AI automatica al prossimo ciclo di polling`);
      }

      const newPayload = { ...basePayload, operationName: undefined, _stitching: stitching };

      await gj().update({
        where: { id: jobId },
        data: {
          payload: JSON.stringify(newPayload),
          status: 'PENDING',
          attempts: 0,
          nextRetryAt: null,
          errorMessage: null,
          result: null,
        },
      });

      // Avvia subito la coda
      processGenerationQueue().catch(() => {});

      return NextResponse.json({
        success: true,
        message: `Generazione ripresa dalla clip ${clipIndex + 1} — job rimesso in coda`,
      });
    }

    return NextResponse.json({ success: false, error: 'Azione non riconosciuta' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

// DELETE — elimina uno o più job definitivamente dal DB
export async function DELETE(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const body = await req.json();
    const isMaster = scope.user.role === 'master';

    // Elimina tutti i job filtrati (delete all / delete by status)
    if (body.deleteAll) {
      const where: Record<string, unknown> = {};
      if (!isMaster) where.tenantId = scope.tenantId;
      else if (body.tenantId) where.tenantId = body.tenantId;
      if (body.status) where.status = body.status;
      const result = await gj().deleteMany({ where });
      return NextResponse.json({ success: true, count: result.count, message: `${result.count} job eliminati` });
    }

    // Elimina una lista di IDs
    const ids: string[] = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : []);
    if (!ids.length) return NextResponse.json({ success: false, error: 'ids obbligatorio' }, { status: 400 });

    // Verifica che i job appartengano al tenant dell'utente (se non master)
    if (!isMaster) {
      const jobs = await gj().findMany({ where: { id: { in: ids } }, select: { tenantId: true } });
      const unauthorized = jobs.some((j: { tenantId: string }) => j.tenantId !== scope.tenantId);
      if (unauthorized) return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
    }

    const result = await gj().deleteMany({ where: { id: { in: ids } } });
    return NextResponse.json({ success: true, count: result.count, message: `${result.count} job eliminati` });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

