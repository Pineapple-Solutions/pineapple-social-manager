// src/lib/video-generator.ts — Generazione video con coda e token management

import { prisma } from './db';
import { checkTokenBudget, trackTokenUsage } from './ai-client';
import { saveFileFromUrl, isLocalUrl } from './file-storage';
import {
  needsStitching,
  calculateClipDurations,
  StitchingMeta,
  extractLastFrame,
  persistClipFromUri,
  stitchClips,
  publicUrlToLocalPath,
} from './video-stitching';

export interface VideoGenerationRequest {
  tenantId: string;
  prompt: string;
  aspectRatio?: '9:16' | '16:9' | '1:1';
  duration?: number;
  style?: string;
  relatedPostId?: string;
  notes?: string;
  /** Sito collegato a cui appartiene il video generato (opzionale) */
  siteId?: string | null;
}

/**
 * Ritorna il range di durata (secondi) valido per un modello Veo.
 * Usato sia per il clamping backend che per la UI dinamica della coda.
 */
export function getVeoDurationRange(model: string): { min: number; max: number; options: number[] } {
  // veo-3.x (Fast e Preview): 5-8 secondi
  if (model.toLowerCase().includes('veo-3')) return { min: 5, max: 8, options: [5, 6, 7, 8] };
  // veo-2.x: 5-8 secondi
  if (model.toLowerCase().includes('veo-2')) return { min: 5, max: 8, options: [5, 6, 7, 8] };
  // Fallback generico (modelli futuri / non riconosciuti): 4-8 secondi
  return { min: 4, max: 8, options: [4, 5, 6, 7, 8] };
}

// Stima token necessari per la generazione video (per il budget tracking)
export const VIDEO_TOKEN_ESTIMATE = 5000;

// ─── Crea job di generazione video ──────────────────────────────
export async function createVideoJob(req: VideoGenerationRequest) {
  // 1. Cerca provider con video abilitato (stesso ordine di priorità di AI Generator)
  const videoProvider = await prisma.aIProviderConfig.findFirst({
    where: { tenantId: req.tenantId, isActive: true, videoEnabled: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });

  // 2. Se non esiste un provider video specifico, usa il provider di default del tenant
  const provider = videoProvider?.provider ?? await (async () => {
    const def = await prisma.aIProviderConfig.findFirst({
      where: { tenantId: req.tenantId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return def?.provider ?? 'google';
  })();

  // Controlla budget token
  const budget = await checkTokenBudget(req.tenantId, provider, VIDEO_TOKEN_ESTIMATE);

  const job = await prisma.videoGenerationJob.create({
    data: {
      tenantId: req.tenantId,
      prompt: req.prompt,
      aspectRatio: req.aspectRatio ?? '9:16',
      duration: req.duration ?? 5,
      provider,
      style: req.style,
      status: budget.ok ? 'PENDING' : 'WAITING_TOKENS',
      estimatedTokens: VIDEO_TOKEN_ESTIMATE,
      scheduledRetryAt: budget.ok ? null : budget.retryAfter ?? null,
      relatedPostId: req.relatedPostId,
      notes: req.notes,
      siteId: req.siteId ?? null,
    },
  });

  if (budget.ok) {
    // Avvia la generazione in modo asincrono (non blocca la risposta)
    processVideoJob(job.id).catch(console.error);
  }

  return job;
}

// ─── Processa un job video ───────────────────────────────────────
export async function processVideoJob(jobId: string): Promise<void> {
  const job = await prisma.videoGenerationJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  if (job.status !== 'PENDING' && job.status !== 'WAITING_TOKENS') return;
  if (job.attempts >= job.maxAttempts) {
    await prisma.videoGenerationJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', errorMessage: 'Numero massimo di tentativi raggiunto' },
    });
    return;
  }

  // Controlla budget
  const budget = await checkTokenBudget(job.tenantId, job.provider, job.estimatedTokens);
  if (!budget.ok) {
    await prisma.videoGenerationJob.update({
      where: { id: jobId },
      data: {
        status: 'WAITING_TOKENS',
        errorMessage: budget.reason,
        scheduledRetryAt: budget.retryAfter ?? null,
      },
    });
    return;
  }

  // Segna come in processing
  await prisma.videoGenerationJob.update({
    where: { id: jobId },
    data: { status: 'PROCESSING', attempts: job.attempts + 1 },
  });

  const providerConfig = await prisma.aIProviderConfig.findUnique({
    where: { tenantId_provider: { tenantId: job.tenantId, provider: job.provider } },
  });

  if (!providerConfig) {
    await prisma.videoGenerationJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', errorMessage: 'Provider non trovato' },
    });
    return;
  }

  try {
    if (job.provider === 'google') {
      // ── Multi-clip stitching? ────────────────────────────────
      if (needsStitching(job.duration)) {
        const clipDurations = calculateClipDurations(job.duration);
        const stitching: StitchingMeta = {
          totalDuration: job.duration,
          clips: clipDurations.map((d, i) => ({ index: i, duration: d, status: 'PENDING' as const })),
          currentClipIndex: 0,
          finalPrompt: job.prompt,
          aspectRatio: job.aspectRatio,
        };
        // Avvia clip 0
        const operationName = await startGoogleVeoOperation(
          providerConfig.apiKey,
          providerConfig.videoModel ?? 'veo-2.0-generate-001',
          job.prompt,
          job.aspectRatio,
          clipDurations[0]
        );
        stitching.clips[0].status = 'PROCESSING';
        stitching.clips[0].operationName = operationName;

        // Usa raw SQL per stitchingMeta (colonna nuova)
        const stitchingJson0 = JSON.stringify(stitching);
        await prisma.videoGenerationJob.update({
          where: { id: jobId },
          data: { operationName, errorMessage: null },
        });
        await prisma.$executeRaw`UPDATE VideoGenerationJob SET stitchingMeta = ${stitchingJson0} WHERE id = ${jobId}`;
        return;
      }

      // ── Google Veo singola clip ───────────────────────────────
      const operationName = await startGoogleVeoOperation(
        providerConfig.apiKey,
        providerConfig.videoModel ?? 'veo-2.0-generate-001',
        job.prompt,
        job.aspectRatio,
        job.duration
      );

      await prisma.videoGenerationJob.update({
        where: { id: jobId },
        data: { operationName, errorMessage: null },
      });

    } else if (job.provider === 'openai') {
      // OpenAI DALL-E / Sora (sincrono con immagine come placeholder)
      const result = await generateWithOpenAIVideo(
        providerConfig.apiKey,
        job.prompt,
        job.aspectRatio
      );

      await trackTokenUsage(job.tenantId, job.provider, result.tokens);

      let persistedUrl = result.videoUrl;
      if (result.videoUrl && !result.videoUrl.startsWith('data:') && !isLocalUrl(result.videoUrl)) {
        try {
          const saved = await saveFileFromUrl(result.videoUrl, 'video-ai', job.tenantId, {
            optimize: true,
            imageQuality: 85,
            siteId: job.siteId ?? null,
          });
          persistedUrl = saved.publicUrl;
        } catch (e) {
          console.warn('[video-generator] persistenza locale fallita:', e instanceof Error ? e.message : e);
        }
      }

      await prisma.videoGenerationJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          videoUrl: persistedUrl,
          tokensConsumed: result.tokens,
          errorMessage: null,
        },
      });

    } else {
      throw new Error(`Provider video ${job.provider} non ancora supportato`);
    }

  } catch (err) {
    const error = err instanceof Error ? err.message : 'Errore sconosciuto';
    const isTokenError = error.toLowerCase().includes('quota') || error.toLowerCase().includes('rate limit');

    if (isTokenError && job.attempts < job.maxAttempts) {
      const retryAt = new Date(Date.now() + 3600000);
      await prisma.videoGenerationJob.update({
        where: { id: jobId },
        data: { status: 'WAITING_TOKENS', errorMessage: error, scheduledRetryAt: retryAt },
      });
    } else {
      await prisma.videoGenerationJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', errorMessage: error },
      });
    }
  }
}

// ─── Utility: rileva se un URL è un video ────────────────────────────────────
const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv', 'm4v'];
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp'];

export function isVideoUrl(url: string): boolean {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return VIDEO_EXTS.includes(ext);
}

export function isImageUrl(url: string): boolean {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTS.includes(ext);
}

// ─── Carica un'immagine (locale o remota) come base64 per image-to-video ────
// ATTENZIONE: solo immagini supportate — i video NON possono essere passati
// come `instance.image` all'API Veo. Usare isImageUrl() prima di chiamare.
export async function loadImageAsBase64(
  url: string
): Promise<{ base64: string; mimeType: string }> {
  let buffer: Buffer;
  let mimeType = 'image/jpeg';

  if (url.startsWith('/uploads/') || url.startsWith('/')) {
    // File locale: leggi da filesystem
    const fs = await import('fs');
    const path = await import('path');
    const localPath = path.join(process.cwd(), 'public', url);
    buffer = fs.readFileSync(localPath);
    // Detect MIME dall'estensione
    const ext = url.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'png')       mimeType = 'image/png';
    else if (ext === 'webp') mimeType = 'image/webp';
    else if (ext === 'gif')  mimeType = 'image/gif';
    else if (ext === 'avif') mimeType = 'image/avif';
    else                     mimeType = 'image/jpeg';
  } else {
    // URL remoto: scarica
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`Download immagine di riferimento fallito: HTTP ${res.status}`);
    const ct = res.headers.get('content-type') ?? 'image/jpeg';
    mimeType = ct.split(';')[0].trim();
    // Rifiuta esplicitamente se il server restituisce un tipo video
    if (mimeType.startsWith('video/')) {
      throw new Error(`L'URL "${url}" punta a un video (${mimeType}), non a un'immagine. Usare solo immagini come riferimento visivo per Veo.`);
    }
    buffer = Buffer.from(await res.arrayBuffer());
  }

  return { base64: buffer.toString('base64'), mimeType };
}

// ─── Sanitizzazione prompt video ─────────────────────────────────
/**
 * Rileva se un errore Veo è causato da parole "sensibili" nel prompt
 * secondo le Google Responsible AI policies.
 */
export function isSensitiveWordsError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('sensitive words') ||
    msg.includes('responsible ai') ||
    msg.includes('prompt could not be submitted') ||
    msg.includes('allowlisting') ||
    (msg.includes('violate') && (msg.includes('ai') || msg.includes('prompt')))
  );
}

/**
 * Sanitizza un prompt video rimuovendo/sostituendo termini che possono
 * violare le Google Responsible AI policies per la generazione video (Veo).
 * Chiamata sia preventivamente che come fallback in caso di errore "sensitive words".
 *
 * @param aggressive - se true, applica un set più ampio di sostituzioni (usato nel retry)
 */
export function sanitizeVideoPrompt(prompt: string, aggressive = false): string {
  const replacements: Array<[RegExp, string]> = [
    // ── Frasi italiane specifiche che triggerano il filtro ───────────────────
    [/La tua telecamera ti spia\?[^\n.]*/gi, 'Pineapple Home protegge la tua privacy.'],
    [/eliminando il timore di spionaggio o hackeraggio esterno/gi, 'garantendo la massima protezione dei tuoi dati'],
    [/eliminando il timore[^.,]*/gi, 'garantendo sicurezza'],
    [/timori[^.,]*di[^.,]*(?:spionaggio|sorveglianza|privacy)[^.,]*/gi, 'preoccupazioni sulla protezione dei dati'],
    [/Usa il concetto di ['"]?Privacy by Design['"]?[^.]+\./gi, ''],
    [/Privacy by Design/gi, 'protezione dati integrata'],
    // ── Termini singoli IT ───────────────────────────────────────────────────
    [/\bspionaggio\b/gi, 'raccolta dati non autorizzata'],
    [/\bhackeraggio\b/gi, 'accesso non autorizzato'],
    [/\bti spia\b/gi, 'raccoglie dati senza consenso'],
    [/\bspiare\b/gi, 'monitorare senza consenso'],
    [/\bsegreti\b/gi, 'informazioni private'],
    [/\bsegreto\b/gi, 'riservato'],
    [/\bnascosti?\b/gi, 'protetti'],
    [/\bsorveglianza\b/gi, 'monitoraggio'],
    // ── Termini inglesi ──────────────────────────────────────────────────────
    [/\bespionage\b/gi, 'unauthorized surveillance'],
    [/\bhacking\b/gi, 'security breach'],
    [/\bspy on\b/gi, 'monitor without consent'],
    [/\bsurveillance\b/gi, 'monitoring'],
    [/\bsecrets?\b/gi, 'private information'],
  ];

  // In modalità aggressiva rimuove anche regole di generazione immagine
  // non pertinenti ai video e ulteriori frasi problematiche
  const aggressiveReplacements: Array<[RegExp, string]> = [
    // Istruzioni image-specific — non pertinenti a Veo
    [/Genera l['']immagine senza[^.]+\./gi, ''],
    [/Genera solo l['']immagine del prodotto[^.]+\./gi, ''],
    [/con uno stile professionale e pulito;[^,]+,/gi, ''],
    [/Do not include any screens[^.]+\./gi, ''],
    [/Strictly avoid generating[^.]+\./gi, ''],
    [/assicurati che l['']immagine sia[^.]+\./gi, ''],
    [/watermark|filigrana|overlay testual[ei]/gi, ''],
    // Ulteriori frasi privacy/security
    [/\bspia\b/gi, 'monitora'],
    [/timore di[^.,]*/gi, 'preoccupazione per '],
    [/violazione della privacy/gi, 'uso non autorizzato dei dati'],
    [/accesso non autorizzato/gi, 'uso improprio'],
  ];

  let sanitized = prompt;
  const allReplacements = aggressive
    ? [...replacements, ...aggressiveReplacements]
    : replacements;

  for (const [pattern, replacement] of allReplacements) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  // Pulisce spazi multipli e punteggiatura doppia generata dalle rimozioni
  return sanitized.replace(/\s{2,}/g, ' ').replace(/\.\s*\./g, '.').trim();
}

/**
 * Filtra le global prompt rules per renderle adatte alla generazione video Veo.
 * Rimuove SOLO le regole progettate esclusivamente per immagini (non pertinenti a Veo).
 * NON esegue sostituzione statica di parole — eventuali termini sensibili
 * vengono gestiti dinamicamente da aiRewriteVideoPrompt() in caso di errore.
 */
export function filterRulesForVideo(rules: string[]): string[] {
  // Pattern che identificano regole esclusivamente per immagini/watermark
  const imageOnlyPattern = /\bimmagin[ei]\b|watermark|filigrana|genera solo l['']immagine|genera l['']immagine|senza alcun tipo di testo|overlay testual[ei]|UI mockup|wireframe/i;
  return rules.filter(rule => !imageOnlyPattern.test(rule));
}

/**
 * Filtra le negative rules per la generazione video (rimuove quelle image-only).
 * Le negative rules video vengono inviate come `negativePrompt` nativo a Google Veo.
 */
export function filterNegativeRulesForVideo(rules: string[]): string[] {
  const imageOnlyPattern = /\bimmagin[ei]\b|watermark|filigrana|overlay testual[ei]|UI mockup|wireframe/i;
  return rules.filter(rule => !imageOnlyPattern.test(rule));
}

// ─── Avvia operazione Google Veo (asincrona) ─────────────────────
// Usa il corretto endpoint :predictLongRunning con il formato body Mldev.
// Se viene passata una referenceImage → modalità image-to-video.
// Restituisce operationName (es: "models/veo-2.0-generate-001/operations/abc123")
export async function startGoogleVeoOperation(
  apiKey: string,
  model: string,
  prompt: string,
  aspectRatio: string,
  duration: number,
  referenceImage?: { base64: string; mimeType: string },
  /** Se true (default su veo-3.0), abilita la generazione audio nativa in Veo */
  generateAudio?: boolean,
  /** Opzioni aggiuntive */
  options?: { negativePrompt?: string }
): Promise<string> {
  // Il modello nel path deve avere il prefisso "models/"
  const modelId = model.startsWith('models/') ? model : `models/${model}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelId}:predictLongRunning?key=${apiKey}`;

  // Clamp duration al range valido per il modello — previene errore 400 "out of bound"
  const { min: dMin, max: dMax } = getVeoDurationRange(model);
  const safeDuration = Math.max(dMin, Math.min(dMax, Math.round(duration)));
  if (safeDuration !== duration) {
    console.warn(`[Veo] durationSeconds ${duration}s fuori range [${dMin}-${dMax}] per "${model}" → clampato a ${safeDuration}s`);
  }

  // Descrizione orientazione — iniettata nel prompt perché in image-to-video
  // Veo può ignorare il parametro `aspectRatio` e usare l'aspect ratio dell'immagine sorgente.
  // Aggiungere il formato nel testo del prompt aiuta a forzare l'orientazione corretta.
  const aspectRatioHint = aspectRatio === '16:9'
    ? 'Horizontal widescreen 16:9 landscape format.'
    : aspectRatio === '9:16'
      ? 'Vertical portrait 9:16 format.'
      : `${aspectRatio} format.`;

  // Se il prompt già contiene la descrizione del formato non la duplichiamo
  const promptAlreadyHasAR = /16:9|9:16|landscape|portrait|widescreen/i.test(prompt);
  const finalPrompt = promptAlreadyHasAR
    ? `${prompt} Duration: ${safeDuration} seconds.`
    : `${aspectRatioHint} ${prompt} Duration: ${safeDuration} seconds.`;

  // Costruisce l'istanza: text-to-video o image-to-video
  const instance: Record<string, unknown> = {
    prompt: finalPrompt,
  };
  if (referenceImage) {
    // Modalità image-to-video: includi l'immagine di riferimento come base64
    instance.image = {
      bytesBase64Encoded: referenceImage.base64,
      mimeType: referenceImage.mimeType,
    };
    console.log(`[Veo] Modalità image-to-video attiva (${referenceImage.mimeType}, ${Math.round(referenceImage.base64.length * 0.75 / 1024)} KB)`);
  }

  // Formato body corretto per Gemini Developer API (Mldev)
  // generateAudio è supportato SOLO da veo-3.0-generate-001 (standard).
  // Le varianti fast/lite/preview e tutti i modelli veo-3.1-* NON lo supportano.
  const supportsGenerateAudio = model.includes('veo-3.0') && !model.includes('fast') && !model.includes('lite') && !model.includes('preview');
  const isVeo3 = model.includes('veo-3');
  const shouldGenerateAudio = generateAudio !== undefined ? generateAudio : supportsGenerateAudio;
  const parameters: Record<string, unknown> = {
    sampleCount: 1,
    durationSeconds: safeDuration,
    aspectRatio,
  };
  if (shouldGenerateAudio) {
    parameters.generateAudio = true;
    if (supportsGenerateAudio) console.log('[Veo] Audio nativo abilitato (veo-3.0-generate-001)');
  }
  // Veo supporta negativePrompt nativo nel campo parameters
  const negativePromptStr = options?.negativePrompt?.trim() ?? '';
  if (negativePromptStr) {
    parameters.negativePrompt = negativePromptStr;
    console.log(`[Veo] Negative prompt inviato (${negativePromptStr.length} chars): "${negativePromptStr.slice(0, 100)}${negativePromptStr.length > 100 ? '…' : ''}"`);
  }

  const body = {
    instances: [instance],
    parameters,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new Error(`Errore di rete Veo API: ${networkErr instanceof Error ? networkErr.message : networkErr}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let errMsg = errText;
    try { errMsg = JSON.parse(errText)?.error?.message ?? errText; } catch { /* usa errText raw */ }

    // ── Auto-fallback: generateAudio non supportato → retry senza audio nativo ──
    // Il TTS post-processing verrà applicato dallo scheduler (ttsScripts già impostati).
    const isGenerateAudioError =
      res.status === 400 &&
      shouldGenerateAudio &&
      (errMsg.toLowerCase().includes('generateaudio') || errMsg.toLowerCase().includes('generate_audio'));

    if (isGenerateAudioError) {
      console.warn(`[Veo] ⚠️ generateAudio non supportato da "${model}" → retry senza audio nativo (TTS post-processing verrà applicato)`);
      delete parameters.generateAudio;
      let retryRes: Response;
      try {
        retryRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instances: [instance], parameters }),
        });
      } catch (networkErr) {
        throw new Error(`Errore di rete Veo API (retry senza audio): ${networkErr instanceof Error ? networkErr.message : networkErr}`);
      }
      if (retryRes.ok) {
        const retryData = await retryRes.json() as { name?: string };
        if (retryData.name) {
          console.log(`[Veo] Retry senza generateAudio riuscito → operazione ${retryData.name}`);
          return retryData.name;
        }
      }
      // Se anche il retry fallisce, procedi con l'errore originale
      const retryErrText = await retryRes!.text().catch(() => '');
      let retryErrMsg = retryErrText;
      try { retryErrMsg = JSON.parse(retryErrText)?.error?.message ?? retryErrText; } catch { /* usa raw */ }
      throw new Error(`Google Veo API error ${retryRes!.status}: ${retryErrMsg}`);
    }

    let friendlyMsg = `Google Veo API error ${res.status}`;
    if (res.status === 404) {
      throw new Error(
        `Modello Veo "${model}" non trovato (404). Verifica il nome in Provider AI. ` +
        `Modelli supportati: veo-2.0-generate-001, veo-3.0-generate-preview. ` +
        `Risposta: ${errMsg}`
      );
    }
    friendlyMsg += errMsg ? `: ${errMsg}` : '';
    throw new Error(friendlyMsg);
  }

  const data = await res.json() as { name?: string };
  if (!data.name) {
    throw new Error(`Google Veo API non ha restituito un operationName. Risposta: ${JSON.stringify(data)}`);
  }

  return data.name; // es: "models/veo-2.0-generate-001/operations/abc123"
}

// ─── Controlla lo stato di un'operazione Veo in corso ───────────
export async function checkGoogleVeoOperation(
  apiKey: string,
  operationName: string
): Promise<{ done: boolean; videoUri?: string; tokens?: number; error?: string }> {
  // L'operationName può essere "models/{model}/operations/{id}" oppure "operations/{id}"
  // In entrambi i casi lo usiamo direttamente con v1beta
  const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`;

  const res = await fetch(pollUrl);
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let msg = `Polling error ${res.status}`;
    try { msg += `: ${JSON.parse(errText)?.error?.message ?? errText}`; } catch { if (errText) msg += `: ${errText}`; }
    // 400/401/403/404 → errori definitivi: l'operazione non esiste o non è autorizzata.
    // Restituiamo done:true per evitare che il job rimanga bloccato per sempre.
    // 429/5xx → errori transitori: riproveremo al prossimo ciclo di polling.
    const isDefinitive = res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404;
    return { done: isDefinitive, error: msg };
  }

  const data = await res.json() as {
    done?: boolean;
    error?: { message?: string };
    response?: {
      generateVideoResponse?: {
        generatedSamples?: Array<{ video?: { uri?: string } }>;
      };
    };
    metadata?: { progressPercent?: number };
  };

  if (data.error) {
    return { done: true, error: data.error.message ?? 'Errore operazione Veo' };
  }

  if (!data.done) {
    return { done: false };
  }

  // Operazione completata — estrai l'URL del video
  const samples = data.response?.generateVideoResponse?.generatedSamples ?? [];
  const videoUri = samples[0]?.video?.uri ?? '';

  if (!videoUri) {
    return { done: true, error: 'Operazione completata ma nessun video nell\'output' };
  }

  return { done: true, videoUri, tokens: VIDEO_TOKEN_ESTIMATE };
}

// ─── Polling job PROCESSING con operationName ────────────────────
// Da chiamare periodicamente per aggiornare lo stato dei job Veo in corso.
export async function pollProcessingVideoJobs(): Promise<void> {
  const processingJobs = await prisma.videoGenerationJob.findMany({
    where: {
      status: 'PROCESSING',
      provider: 'google',
      operationName: { not: null },
    },
  });

  for (const job of processingJobs) {
    if (!job.operationName) continue;

    const providerConfig = await prisma.aIProviderConfig.findUnique({
      where: { tenantId_provider: { tenantId: job.tenantId, provider: job.provider } },
    });
    if (!providerConfig) continue;

    try {
      const check = await checkGoogleVeoOperation(providerConfig.apiKey, job.operationName);

      if (!check.done) continue;

      // ── Ha un errore? ────────────────────────────────────────
      if (check.error) {
        const isTokenError = check.error.toLowerCase().includes('quota') || check.error.toLowerCase().includes('rate limit');
        if (isTokenError && job.attempts < job.maxAttempts) {
          await prisma.videoGenerationJob.update({
            where: { id: job.id },
            data: {
              status: 'WAITING_TOKENS',
              errorMessage: check.error,
              scheduledRetryAt: new Date(Date.now() + 3600000),
            },
          });
        } else {
          await prisma.videoGenerationJob.update({
            where: { id: job.id },
            data: { status: 'FAILED', errorMessage: check.error },
          });
        }
        continue;
      }

      // ── Clip completata con successo ─────────────────────────
      await trackTokenUsage(job.tenantId, job.provider, check.tokens ?? VIDEO_TOKEN_ESTIMATE);

      // Scarica e persisti la clip corrente
      let clipLocalPath: string | undefined;
      let clipPublicUrl = check.videoUri!;
      if (check.videoUri && !isLocalUrl(check.videoUri)) {
        try {
          const saved = await persistClipFromUri(check.videoUri, providerConfig.apiKey, job.tenantId, job.siteId);
          clipLocalPath = saved.localPath;
          clipPublicUrl = saved.publicUrl;
        } catch (e) {
          console.warn('[video-generator] persistenza clip fallita:', e instanceof Error ? e.message : e);
        }
      }

      // ── Stitching multi-clip? ────────────────────────────────
      // Legge stitchingMeta via raw query (colonna nuova, Prisma client non ancora rigenerato)
      const [stitchingRow] = await prisma.$queryRaw<Array<{ stitchingMeta: string | null }>>`
        SELECT stitchingMeta FROM VideoGenerationJob WHERE id = ${job.id} LIMIT 1
      `;
      const rawSM = stitchingRow?.stitchingMeta;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jobAny = job as any;
      if (rawSM || jobAny.stitchingMeta) {
        const smRaw = rawSM ?? jobAny.stitchingMeta;
        let stitching: StitchingMeta;
        try { stitching = JSON.parse(smRaw) as StitchingMeta; }
        catch {
          await _completeVideoJob(job.id, clipPublicUrl, check.tokens ?? VIDEO_TOKEN_ESTIMATE, null);
          continue;
        }

        const clipIdx = stitching.currentClipIndex;
        stitching.clips[clipIdx].status = 'COMPLETED';
        stitching.clips[clipIdx].videoUrl = clipPublicUrl;
        stitching.clips[clipIdx].operationName = undefined;

        const nextIdx = clipIdx + 1;

        if (nextIdx >= stitching.clips.length) {
          // ── Tutte le clip sono pronte: concatena ────────────
          let finalUrl = clipPublicUrl;
          try {
            const stitchResult = await stitchClips(stitching, job.tenantId, job.siteId);
            finalUrl = stitchResult.url;
            if (stitchResult.ttsError) {
              console.warn(`[video-generator] TTS fallito: ${stitchResult.ttsError}`);
            }
            console.log(`[video-generator] Stitching completato → ${finalUrl}`);
          } catch (e) {
            console.warn('[video-generator] Concatenazione fallita:', e instanceof Error ? e.message : e);
            // Fallback: usa l'ultima clip
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          // Usa raw SQL perché stitchingMeta è colonna nuova (prisma generate non ancora rigenerato)
          const stitchingJson = JSON.stringify(stitching);
          await prisma.videoGenerationJob.update({
            where: { id: job.id },
            data: { status: 'COMPLETED', videoUrl: finalUrl, tokensConsumed: (job.tokensConsumed ?? 0) + (check.tokens ?? VIDEO_TOKEN_ESTIMATE), errorMessage: null, operationName: null },
          });
          await prisma.$executeRaw`UPDATE VideoGenerationJob SET stitchingMeta = ${stitchingJson} WHERE id = ${job.id}`;
        } else {
          // ── Avvia la prossima clip con last-frame come riferimento ──
          stitching.currentClipIndex = nextIdx;
          stitching.clips[nextIdx].status = 'PROCESSING';

          let referenceImage: { base64: string; mimeType: string } | undefined;
          if (clipLocalPath) {
            try {
              referenceImage = await extractLastFrame(clipLocalPath);
              console.log(`[video-generator] Ultimo frame estratto per clip ${nextIdx}`);
            } catch (e) {
              console.warn('[video-generator] extractLastFrame fallita:', e instanceof Error ? e.message : e);
            }
          } else {
            // Prova dal path locale della publicUrl
            try {
              const lp = publicUrlToLocalPath(clipPublicUrl);
              referenceImage = await extractLastFrame(lp);
            } catch { /* text-to-video fallback */ }
          }

          const nextDuration = stitching.clips[nextIdx].duration;
          const nextClipPrompt = stitching.clipPrompts?.[nextIdx] ?? stitching.finalPrompt;
          const stNegPrompt2 = stitching.negativePrompt;
          let newOpName: string;
          try {
            newOpName = await startGoogleVeoOperation(
              providerConfig.apiKey,
              providerConfig.videoModel ?? 'veo-2.0-generate-001',
              nextClipPrompt,
              stitching.aspectRatio,
              nextDuration,
              referenceImage,
              undefined,
              stNegPrompt2 ? { negativePrompt: stNegPrompt2 } : undefined
            );
          } catch (veoErr) {
            const errMsg = veoErr instanceof Error ? veoErr.message.toLowerCase() : String(veoErr).toLowerCase();
            const isHumanErr = errMsg.includes('humans') || errMsg.includes('people') || errMsg.includes('not permitted') || errMsg.includes('person');
            if (isHumanErr && referenceImage) {
              console.warn(`[video-generator] Clip ${nextIdx}: frame contiene persone → retry text-to-video`);
              newOpName = await startGoogleVeoOperation(
                providerConfig.apiKey,
                providerConfig.videoModel ?? 'veo-2.0-generate-001',
                nextClipPrompt,
                stitching.aspectRatio,
                nextDuration,
                undefined,
                undefined,
                stNegPrompt2 ? { negativePrompt: stNegPrompt2 } : undefined
              );
            } else {
              throw veoErr;
            }
          }

          stitching.clips[nextIdx].operationName = newOpName;

          // Usa raw SQL per stitchingMeta (colonna nuova)
          const stitchingJson2 = JSON.stringify(stitching);
          await prisma.videoGenerationJob.update({
            where: { id: job.id },
            data: { operationName: newOpName, tokensConsumed: (job.tokensConsumed ?? 0) + (check.tokens ?? VIDEO_TOKEN_ESTIMATE), errorMessage: null },
          });
          await prisma.$executeRaw`UPDATE VideoGenerationJob SET stitchingMeta = ${stitchingJson2} WHERE id = ${job.id}`;
          console.log(`[video-generator] Avviata clip ${nextIdx + 1}/${stitching.clips.length} (opName: ${newOpName})`);
        }
        continue;
      }

      // ── Singola clip: completa il job ────────────────────────
      await _completeVideoJob(job.id, clipPublicUrl, check.tokens ?? VIDEO_TOKEN_ESTIMATE, null);

    } catch (err) {
      console.error(`[video-generator] polling job ${job.id} fallito:`, err);
    }
  }
}

/** Helper: segna il VideoGenerationJob come COMPLETED */
async function _completeVideoJob(
  jobId: string,
  videoUrl: string,
  tokens: number,
  stitchingMeta: string | null | undefined
): Promise<void> {
  await prisma.videoGenerationJob.update({
    where: { id: jobId },
    data: { status: 'COMPLETED', videoUrl, tokensConsumed: tokens, errorMessage: null, operationName: null },
  });
  if (stitchingMeta !== undefined && stitchingMeta !== null) {
    await prisma.$executeRaw`UPDATE VideoGenerationJob SET stitchingMeta = ${stitchingMeta} WHERE id = ${jobId}`;
  }
}

// ─── Generazione con OpenAI (Sora placeholder / DALL-E) ──────────
async function generateWithOpenAIVideo(
  apiKey: string,
  prompt: string,
  aspectRatio: string
): Promise<{ videoUrl: string; tokens: number }> {
  // OpenAI attualmente supporta DALL-E per immagini, Sora per video (API in accesso limitato)
  // Questo crea un'immagine come "frame" del video:
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });

  const size = aspectRatio === '16:9' ? '1792x1024'
    : aspectRatio === '9:16' ? '1024x1792'
    : '1024x1024';

  const image = await client.images.generate({
    model: 'dall-e-3',
    prompt: `High-quality video frame: ${prompt}`,
    size: size as '1024x1024' | '1024x1792' | '1792x1024',
    quality: 'hd',
    n: 1,
  });

  return {
    videoUrl: image.data?.[0]?.url ?? '',
    tokens: 1000, // stima per DALL-E
  };
}

// ─── Retry jobs in attesa di token ───────────────────────────────
export async function retryWaitingVideoJobs(): Promise<void> {
  const now = new Date();
  const waitingJobs = await prisma.videoGenerationJob.findMany({
    where: {
      status: 'WAITING_TOKENS',
      scheduledRetryAt: { lte: now },
    },
  });

  for (const job of waitingJobs) {
    if (job.attempts >= job.maxAttempts) continue;
    await prisma.videoGenerationJob.update({
      where: { id: job.id },
      data: { status: 'PENDING' },
    });
    processVideoJob(job.id).catch(console.error);
  }

  // Controlla anche i job Veo in corso (polling operazioni asincrone)
  try {
    await pollProcessingVideoJobs();
  } catch (err) {
    console.error('[video-generator] pollProcessingVideoJobs fallito:', err);
  }
}
