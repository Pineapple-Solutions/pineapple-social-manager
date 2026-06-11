// src/lib/scheduler.ts
// Scheduler per pubblicazione automatica multi-piattaforma
// Usa node-cron per job periodici

import cron from 'node-cron';
import { prisma } from './db';
import { createInstagramClient } from './instagram';
import type { AutoSyncConfig } from '@/lib/analytics-sync-config';
import { generateContent, generateImageForTenant, QuotaExceededError, RateLimitError, ModelNotFoundError, ApiTimeoutError, NoImageGeneratedError, loadGlobalPromptRules } from './ai-client';
import { scrapeSite, buildSiteContext } from './content-scraper';
import { checkTokenBudget, trackTokenUsage } from './ai-client';
import { removeWatermarkFromImage, WATERMARK_PRESETS, type RemovalMethod } from './watermark-remover';
import { startGoogleVeoOperation, checkGoogleVeoOperation, VIDEO_TOKEN_ESTIMATE, getVeoDurationRange, loadImageAsBase64, isImageUrl, isVideoUrl, isSensitiveWordsError, sanitizeVideoPrompt, filterRulesForVideo, filterNegativeRulesForVideo } from './video-generator';
import { saveFileFromUrl, isLocalUrl } from './file-storage';
import { needsStitching, calculateClipDurations, StitchingMeta, extractLastFrame, persistClipFromUri, stitchClips, publicUrlToLocalPath } from './video-stitching';
import { emitJobUpdate } from './job-events';

let schedulerInitialized = false;
const activeJobs = new Map<string, cron.ScheduledTask>();

// ─── Hot-reload guard (Next.js dev mode) ─────────────────────────────────────
// In Next.js dev, ogni hot-reload rivaluta il modulo ma i vecchi cron/setTimeout
// rimangono nell'event loop con le closure OLD. Questo causa race condition dove
// il codice vecchio (con bug) elabora i job prima del codice nuovo (con fix).
//
// Soluzione: contatore "generation" globale. Ogni rivalutazione del modulo
// incrementa il contatore. I vecchi tick() si auto-terminano confrontando
// MY_GENERATION con g.__psmGen. I vecchi cron vengono fermati da initScheduler().
type PsmGlobal = typeof globalThis & {
  __psmGen?: number;
  __psmCronTasks?: cron.ScheduledTask[];
};
const g = global as PsmGlobal;
g.__psmGen = (g.__psmGen ?? 0) + 1;
const MY_GENERATION = g.__psmGen;

// ─── Polling Veo inline: evita di attendere il cron ogni 2 minuti ────────────
// Traccia i job VIDEO con un poller di sfondo attivo
const _inlineVeoPollers = new Set<string>();
let _inlineVeoPollRunning = false; // mutex per evitare esecuzioni parallele

/**
 * Avvia un polling di sfondo per un job VIDEO appena avviato su Veo.
 * Controlla ogni ~20 secondi invece di aspettare il cron ogni 2 minuti.
 * Il cron rimane come fallback di sicurezza per job "orfani".
 */
export function startInlineVeoPolling(jobId: string): void {
  if (_inlineVeoPollers.has(jobId)) return; // già in polling
  _inlineVeoPollers.add(jobId);

  const INITIAL_DELAY_MS = 30_000;
  const FAST_INTERVAL_MS  = 20_000;
  const SLOW_INTERVAL_MS  = 30_000;
  const MAX_RUNTIME_MS = 30 * 60_000;
  const startedAt = Date.now();
  let iteration = 0;

  const tick = async (): Promise<void> => {
    // 0. Hot-reload guard: se questa callback è "stale" (da prima del hot-reload), esci silenziosamente.
    if (MY_GENERATION !== g.__psmGen) {
      return; // stale generation — il nuovo modulo ha già un proprio poller
    }

    // 1. Controlla se il job è ancora in PROCESSING
    let stillActive = false;
    try {
      const count = await gj().count({ where: { id: jobId, status: 'PROCESSING', type: 'VIDEO' } });
      stillActive = count > 0;
    } catch {
      _inlineVeoPollers.delete(jobId);
      return;
    }

    if (!stillActive || Date.now() - startedAt > MAX_RUNTIME_MS) {
      _inlineVeoPollers.delete(jobId);
      if (!stillActive) console.log(`[Veo inline] Job ${jobId} non più PROCESSING — polling terminato`);
      else console.warn(`[Veo inline] Job ${jobId}: timeout raggiunto (${MAX_RUNTIME_MS / 60000} min) — ceduto al cron`);
      return;
    }

    // 2. Esegui il ciclo di polling Veo (con mutex per evitare sovrapposizioni)
    if (!_inlineVeoPollRunning) {
      _inlineVeoPollRunning = true;
      try {
        await pollVeoVideoGenerationJobs();
      } catch (e) {
        console.error('[Veo inline] pollVeoVideoGenerationJobs errore:', e instanceof Error ? e.message : e);
      } finally {
        _inlineVeoPollRunning = false;
      }
    }

    // 3. Schedula prossimo check
    iteration++;
    const delay = iteration <= 50 ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS;
    setTimeout(() => tick().catch(() => _inlineVeoPollers.delete(jobId)), delay);
  };

  console.log(`[Veo inline] Polling avviato per job ${jobId} gen=${MY_GENERATION} (primo check tra ${INITIAL_DELAY_MS / 1000}s)`);
  setTimeout(() => tick().catch(() => _inlineVeoPollers.delete(jobId)), INITIAL_DELAY_MS);
}

// Helper sicuro: agisce su generationJob anche se il Prisma client non è ancora aggiornato
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gj = () => (prisma as any).generationJob;

export function initScheduler() {
  // ── SEMPRE: ferma i vecchi cron task (handles hot-reload in dev) ─────────────
  // I vecchi cron registrati prima del hot-reload usano il codice vecchio (con bug).
  // Li fermiamo prima di registrarne di nuovi con il codice aggiornato.
  if (g.__psmCronTasks && g.__psmCronTasks.length > 0) {
    console.log(`[Scheduler] Fermo ${g.__psmCronTasks.length} vecchi cron task (hot-reload gen ${MY_GENERATION})`);
    g.__psmCronTasks.forEach(t => { try { t.stop(); } catch { /* ignore */ } });
    g.__psmCronTasks = [];
  }

  if (schedulerInitialized) return;
  schedulerInitialized = true;

  const tasks: cron.ScheduledTask[] = [];

  // Ogni minuto: pubblica post schedulati il cui scheduledAt è scaduto
  tasks.push(cron.schedule('* * * * *', async () => {
    await processDuePublications();
  }));

  // Ogni 5 minuti: processa la coda di generazione contenuti (rispetta budget token)
  tasks.push(cron.schedule('*/5 * * * *', async () => {
    await processGenerationQueue();
  }));

  // Ogni 5 minuti: polling Veo FALLBACK per job orfani (es. riavvio server).
  // Il polling in tempo reale è gestito da startInlineVeoPolling()
  tasks.push(cron.schedule('*/5 * * * *', async () => {
    if (!_inlineVeoPollRunning) await pollVeoVideoGenerationJobs();
  }));

  // Ogni 30 minuti: controlla se è il momento di sincronizzare le analytics
  tasks.push(cron.schedule('*/30 * * * *', async () => {
    await maybeRunAnalyticsSync();
  }));

  // Ogni ora: applica le regole di scheduling automatico (crea DRAFT + job in coda)
  tasks.push(cron.schedule('0 * * * *', async () => {
    await processSchedulerRules();
  }));

  // Ogni notte alle 3: pulizia log
  tasks.push(cron.schedule('0 3 * * *', async () => {
    await cleanupOldLogs();
  }));

  // Salva i task nel global per poterli fermare al prossimo hot-reload
  g.__psmCronTasks = tasks;

  console.log(`✅ Pineapple Social Manager scheduler avviato gen=${MY_GENERATION} (pubblicazione + coda generazione)`);
}

// ─── PROCESSORE CODA GENERAZIONE ────────────────────────────────
// Legge i GenerationJob PENDING/FAILED (con retry disponibili) ordinati per
// priorità (0=massima) e scheduledFor (più vicino = prima), rispettando il
// budget token di ciascun tenant.
export async function processGenerationQueue() {
  const now = new Date();

  let jobs: { id: string; type: string; tenantId: string; relatedPostId: string | null; payload: string; attempts: number; maxAttempts: number; relatedPost: unknown }[] = [];
  try {
    jobs = await gj().findMany({
      where: {
        status: { in: ['PENDING', 'WAITING_TOKENS'] },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: [{ priority: 'asc' }, { scheduledFor: 'asc' }, { createdAt: 'asc' }],
      take: 20,
      include: { relatedPost: true },
    });
  } catch {
    return; // Prisma client vecchio, skippa silenziosamente
  }

  // ── Carica limite job simultanei e conteggio PROCESSING per tenant ──────────
  const uniqueTenantIds = [...new Set(jobs.map(j => j.tenantId))];

  // maxConcurrentJobs per tenant (da AIProviderConfig, default 3)
  const tenantMaxConcurrent: Record<string, number> = {};
  // job PROCESSING correnti (es. Veo in corso) per tenant
  const tenantProcessingCount: Record<string, number> = {};

  await Promise.all(uniqueTenantIds.map(async (tenantId) => {
    try {
      const prov = await prisma.aIProviderConfig.findFirst({
        where: { tenantId, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: { maxConcurrentJobs: true },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tenantMaxConcurrent[tenantId] = (prov as any)?.maxConcurrentJobs ?? 3;
    } catch {
      tenantMaxConcurrent[tenantId] = 3;
    }
    try {
      tenantProcessingCount[tenantId] = await gj().count({
        where: { tenantId, status: 'PROCESSING' },
      });
    } catch {
      tenantProcessingCount[tenantId] = 0;
    }
  }));

  for (const job of jobs) {
    // ── Controlla limite job simultanei ──────────────────────────────────────
    const maxConc = tenantMaxConcurrent[job.tenantId] ?? 3;
    const currentProc = tenantProcessingCount[job.tenantId] ?? 0;
    if (currentProc >= maxConc) {
      // Troppi job in elaborazione per questo tenant — salta e riprova al prossimo ciclo
      continue;
    }
    if (job.attempts >= job.maxAttempts) {
      await gj().update({
        where: { id: job.id },
        data: { status: 'FAILED', errorMessage: 'Numero massimo di tentativi raggiunto' },
      });
      continue;
    }

    // Controlla budget token solo per generazione testo (non per immagini)
    if (job.type === 'TEXT') {
      // Legge il provider attivo per il tenant per controllare il budget corretto
      let providerName = 'openai';
      try {
        const prov = await prisma.aIProviderConfig.findFirst({
          where: { tenantId: job.tenantId, isActive: true },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        });
        if (prov) providerName = prov.provider;
      } catch { /* usa fallback openai */ }

      const budget = await checkTokenBudget(job.tenantId, providerName, 1500);
      if (!budget.ok) {
        await gj().update({
          where: { id: job.id },
          data: {
            status: 'WAITING_TOKENS',
            errorMessage: budget.reason,
            nextRetryAt: budget.retryAfter ?? new Date(Date.now() + 60 * 60 * 1000),
          },
        });
        continue; // non bloccare gli altri tenant
      }
    }

    await gj().update({ where: { id: job.id }, data: { status: 'PROCESSING', attempts: job.attempts + 1 } });
    // Incrementa contatore processing per questo tenant (conservativo: valido sia per job sincroni che asincroni)
    tenantProcessingCount[job.tenantId] = (tenantProcessingCount[job.tenantId] ?? 0) + 1;

    try {
      await executeGenerationJob(job);
      // Job sincroni (TEXT/IMAGE) completano immediatamente: decrementa il contatore
      // I job VIDEO restano in PROCESSING fino al polling Veo → il contatore rimane alto
      if (job.type !== 'VIDEO') {
        tenantProcessingCount[job.tenantId] = Math.max(0, (tenantProcessingCount[job.tenantId] ?? 1) - 1);
      }
    } catch (err) {
      // In caso di errore il job non è più in PROCESSING (verrà aggiornato sotto)
      tenantProcessingCount[job.tenantId] = Math.max(0, (tenantProcessingCount[job.tenantId] ?? 1) - 1);
      const nextAttempt = job.attempts + 1;

      // ── Modello non trovato (404) — FAIL immediato, nessun retry ────────────
      if (err instanceof ModelNotFoundError) {
        console.log(`[Queue] Modello non trovato: "${err.model}" → FAILED immediato (nessun retry)`);
        await gj().update({
          where: { id: job.id },
          data: { status: 'FAILED', errorMessage: err.message },
        });
        if (job.relatedPostId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma.scheduledPost.update as any)({
            where: { id: job.relatedPostId },
            data: { mediaReady: 'FAILED' },
          }).catch(() => {});
        }
        continue;
      }

      // ── Modello ritorna testo invece di immagine — FAIL immediato, cambia modello ──
      if (err instanceof NoImageGeneratedError) {
        console.log(`[Queue] NoImageGeneratedError per "${err.model}" (${err.partsCount} parti testo) → FAILED immediato`);
        await gj().update({
          where: { id: job.id },
          data: { status: 'FAILED', errorMessage: err.message },
        });
        if (job.relatedPostId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma.scheduledPost.update as any)({
            where: { id: job.relatedPostId },
            data: { mediaReady: 'FAILED' },
          }).catch(() => {});
        }
        emitJobUpdate({ jobId: job.id, tenantId: job.tenantId, status: 'FAILED', type: job.type });
        continue;
      }

      // ── Quota esaurita (quota immagini giornaliera/settimanale/per-modello) ──────
      if (err instanceof QuotaExceededError) {
        // retryAt è calcolata dalla API (retryDelay nel body), cap a 24h
        const retryAt = err.retryAt;
        const quotaAttempts = job.attempts; // attempts viene già incrementato a PROCESSING

        // Blocco PERMANENTE: modello non disponibile su questo tier (es. Gemini image su free tier)
        // Non ha senso aspettare → fail immediato con messaggio che spiega quale modello usare
        if (err.isPermanentBlock) {
          const failMsg =
            `Il modello "${err.model}" non è accessibile con la tua API key (quota free tier = 0 permanente su questo modello). ` +
            `Vai in Impostazioni → Provider AI e cambia il modello immagini. ` +
            `Modelli disponibili su Livello 1: ` +
            `"gemini-2.5-flash-preview-image-generation" (500 RPM, 2K img/giorno) ⭐, ` +
            `"gemini-3.1-flash-image-preview" (100 RPM, 1K/giorno), ` +
            `"imagen-4.0-generate-001" (10 RPM, 70/giorno). ` +
            `Consulta https://ai.dev/rate-limit per i limiti del tuo piano.`;
          console.log(`[Queue] Blocco PERMANENTE per job ${job.id} — modello "${err.model}" non ha quota su questo tier → FAILED`);
          await gj().update({
            where: { id: job.id },
            data: { status: 'FAILED', errorMessage: failMsg },
          });
          // Anche tutti gli altri job dello stesso tenant + tipo → FAILED con stesso messaggio
          await gj().updateMany({
            where: {
              tenantId: job.tenantId,
              id: { not: job.id },
              status: { in: ['PENDING', 'WAITING_TOKENS'] },
              type: { in: ['IMAGE', 'VIDEO'] },
            },
            data: { status: 'FAILED', errorMessage: failMsg },
          });
          if (job.relatedPostId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (prisma.scheduledPost.update as any)({
              where: { id: job.relatedPostId },
              data: { mediaReady: 'FAILED' },
            }).catch(() => {});
          }
          continue;
        }

        // Protezione loop infinito: dopo 6 errori quota sullo stesso job → FAILED
        if (quotaAttempts >= 6) {
          const failMsg = `${err.message} — Superato il limite di tentativi su errori quota (${quotaAttempts}). Controlla configurazione provider AI.`;
          console.log(`[Queue] Troppe quota-errors per job ${job.id} (${quotaAttempts} tentativi) → FAILED`);
          await gj().update({
            where: { id: job.id },
            data: { status: 'FAILED', errorMessage: failMsg },
          });
          if (job.relatedPostId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (prisma.scheduledPost.update as any)({
              where: { id: job.relatedPostId },
              data: { mediaReady: 'FAILED' },
            }).catch(() => {});
          }
          continue;
        }

        console.log(`[Queue] Quota immagini esaurita per "${err.model}" — job tenant ${job.tenantId} in WAITING_TOKENS fino a ${retryAt.toISOString()} (nota: quota separata dalla quota testo)`);

        // Aggiorna il job corrente (non incrementa attempt oltre quello già fatto)
        await gj().update({
          where: { id: job.id },
          data: {
            status: 'WAITING_TOKENS',
            errorMessage: err.message,
            nextRetryAt: retryAt,
            attempts: job.attempts, // mantiene il conteggio (già incrementato prima)
          },
        });

        // Bulk update: tutti gli altri job IMAGE/VIDEO PENDING/WAITING del tenant
        await gj().updateMany({
          where: {
            tenantId: job.tenantId,
            id: { not: job.id },
            status: { in: ['PENDING', 'WAITING_TOKENS'] },
            type: { in: ['IMAGE', 'VIDEO'] },
          },
          data: {
            status: 'WAITING_TOKENS',
            errorMessage: err.message,
            nextRetryAt: retryAt,
          },
        });

        // Ripristina mediaReady a PENDING per i post collegati
        if (job.relatedPostId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma.scheduledPost.update as any)({
            where: { id: job.relatedPostId },
            data: { mediaReady: 'PENDING' },
          }).catch(() => {});
        }
        continue;
      }

      // ── Timeout API Google — primi 2 timeout: retry breve; dal 3° in poi: FAIL ──
      if (err instanceof ApiTimeoutError) {
        const timeoutAttempts = job.attempts + 1; // già incrementato dal PROCESSING update
        const MAX_TIMEOUT_RETRIES = 2;

        if (timeoutAttempts > MAX_TIMEOUT_RETRIES) {
          // Il modello è costantemente lento → FAIL immediato con messaggio utile
          const failMsg =
            `Timeout ripetuto (${timeoutAttempts}x) per "${err.model}" (${err.timeoutMs / 1000}s). ` +
            `Il modello impiega troppo tempo con regolarità. ` +
            `Vai in Impostazioni → Provider AI e cambia il modello immagini. ` +
            `Modelli più veloci: "gemini-2.5-flash-preview-image-generation" ⭐, "imagen-4.0-generate-001".`;
          console.log(`[Queue] Timeout ripetuto (${timeoutAttempts}x) per job ${job.id} — modello "${err.model}" troppo lento → FAILED`);
          await gj().update({
            where: { id: job.id },
            data: { status: 'FAILED', errorMessage: failMsg },
          });
          if (job.relatedPostId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (prisma.scheduledPost.update as any)({
              where: { id: job.relatedPostId },
              data: { mediaReady: 'FAILED' },
            }).catch(() => {});
          }
          emitJobUpdate({ jobId: job.id, tenantId: job.tenantId, status: 'FAILED', type: job.type });
          continue;
        }

        // Primi 2 timeout: retry breve senza perdere il tentativo
        const retryAt = new Date(Date.now() + 3 * 60_000);
        console.log(`[Queue] Timeout API per "${err.model}" (${err.timeoutMs / 1000}s) — attempt ${timeoutAttempts}/${MAX_TIMEOUT_RETRIES}, riprovo tra 3 minuti.`);
        await gj().update({
          where: { id: job.id },
          data: {
            status: 'PENDING',
            errorMessage: err.message,
            nextRetryAt: retryAt,
            // Mantieni il contatore INCREMENTATO così al prossimo timeout si triggera il FAIL
          },
        });
        if (job.relatedPostId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma.scheduledPost.update as any)({
            where: { id: job.relatedPostId },
            data: { mediaReady: 'PENDING' },
          }).catch(() => {});
        }
        continue;
      }

      // ── Rate limit RPM (troppi req/min) — retry breve, NON va in WAITING_TOKENS ──
      if (err instanceof RateLimitError) {
        const retryAt = new Date(Date.now() + err.retryAfterMs);
        const secs = Math.round(err.retryAfterMs / 1000);
        console.log(`[Queue] Rate limit RPM per "${err.model}" — riprovo tra ${secs}s (${retryAt.toISOString()}). Attempt NON consumato.`);
        await gj().update({
          where: { id: job.id },
          data: {
            status: 'PENDING',
            errorMessage: err.message,
            nextRetryAt: retryAt,
            attempts: job.attempts, // non consumare il tentativo per rate limit temporanei
          },
        });
        if (job.relatedPostId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma.scheduledPost.update as any)({
            where: { id: job.relatedPostId },
            data: { mediaReady: 'PENDING' },
          }).catch(() => {});
        }
        continue;
      }

      // ── Errore di codice (bug) — ReferenceError, TypeError, SyntaxError ────────
      // Questi errori NON sono transitori: non ha senso ritentare.
      // Vanno a FAILED immediatamente per non tenere il job "In attesa" a tempo indefinito.
      const isCodeBug = err instanceof ReferenceError || err instanceof TypeError || err instanceof SyntaxError;
      if (isCodeBug) {
        const bugMsg = `Errore interno [${err.constructor.name}]: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[Queue] BUG nel codice dello scheduler per job ${job.id} → FAILED immediato:`, bugMsg);
        await gj().update({
          where: { id: job.id },
          data: { status: 'FAILED', errorMessage: bugMsg },
        });
        if (job.relatedPostId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma.scheduledPost.update as any)({
            where: { id: job.relatedPostId },
            data: { mediaReady: 'FAILED' },
          }).catch(() => {});
        }
        emitJobUpdate({ jobId: job.id, tenantId: job.tenantId, status: 'FAILED', type: job.type });
        continue;
      }

      // ── Errore generico: retry con backoff esponenziale ──────────────────────
      const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
      const willFail = nextAttempt >= job.maxAttempts;
      await gj().update({
        where: { id: job.id },
        data: {
          status: willFail ? 'FAILED' : 'PENDING',
          errorMessage: msg,
          nextRetryAt: new Date(Date.now() + Math.pow(2, nextAttempt) * 5 * 60 * 1000),
        },
      });
      if (willFail) {
        emitJobUpdate({ jobId: job.id, tenantId: job.tenantId, status: 'FAILED', type: job.type });
      }
      if (willFail && job.relatedPostId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.scheduledPost.update as any)({
          where: { id: job.relatedPostId },
          data: { mediaReady: 'FAILED' },
        });
      }
    }
  }
}

// ── Helper module-level (fuori da executeGenerationJob) ─────────────────────
// Dichiarata qui per evitare TDZ in caso di hot-reload Next.js o ordini
// di esecuzione particolari: le funzioni a livello modulo sono hoistate.
function getAspectRatioDesc(safeAspectRatio: string): string {
  if (safeAspectRatio === '16:9') return 'Horizontal widescreen 16:9 landscape format.';
  if (safeAspectRatio === '9:16') return 'Vertical portrait 9:16 format for mobile stories and reels.';
  return `${safeAspectRatio} aspect ratio.`;
}

// ── Tipi storyboard (inline, senza dipendenze esterne) ────────────────────────
interface _StoryboardScene {
  /** Campo dalle scene AI (nome principale) */
  visual?: string;
  /** Narrazione vocale della scena (campo principale) */
  script?: string;
  /** Testo sovrapposto a schermo (campo principale) */
  onScreenText?: string;
  // Alias legacy (retrocompatibilità con versioni precedenti)
  description?: string;
  voiceOver?: string;
  textOverlay?: string;
  transition?: string;
  maxDurationSeconds?: number;
  /** Durata della scena come stringa (es. "7s") — generata dall'AI */
  duration?: string;
}
interface _StoryboardData {
  hook?: string;
  scenes?: _StoryboardScene[];
  music?: string;
  cta?: string;
  totalDuration?: string;
}

/**
 * Arricchisce un prompt base con le informazioni dello storyboard
 * per una singola clip (caso duration <= VEO_CLIP_MAX).
 */
function enrichPromptWithStoryboard(basePrompt: string, storyboard: _StoryboardData): string {
  const parts: string[] = [basePrompt];
  if (storyboard.hook) parts.push(`Opening: ${storyboard.hook}.`);
  if (storyboard.music) parts.push(`Background music style: ${storyboard.music}.`);
  const scenes = storyboard.scenes ?? [];
  if (scenes.length > 0) {
    const sceneDesc = scenes
      .slice(0, 4)
      .map(s => {
        const sp: string[] = [];
        // Supporta sia i nomi campo AI (visual/script/onScreenText) che quelli legacy (description/voiceOver/textOverlay)
        const visual = s.visual ?? s.description;
        const narration = s.script ?? s.voiceOver;
        const overlay = s.onScreenText ?? s.textOverlay;
        if (visual) sp.push(visual);
        if (narration) sp.push(`Narration: "${narration}"`);
        if (overlay) sp.push(`Text: "${overlay}"`);
        return sp.filter(Boolean).join('. ');
      })
      .filter(Boolean)
      .join(' → ');
    if (sceneDesc) parts.push(`Visual and narration progression: ${sceneDesc}.`);
  }
  if (storyboard.cta) parts.push(`End with: ${storyboard.cta}.`);
  return parts.join(' ');
}

/**
 * Riscrive un prompt video usando l'AI per eliminare i termini che violano
 * le Google Responsible AI policies — in modo dinamico e intelligente,
 * senza sostituzioni statiche hardcoded.
 *
 * Usa OpenAI (preferito) o Google Gemini (fallback con stessa API key di Veo).
 * Se l'AI non è disponibile, genera un prompt minimalista visivo sicuro.
 */
async function aiRewriteVideoPrompt(
  originalPrompt: string,
  sensitiveError: string,
  tenantId: string,
  /** Contesto per generare un prompt di emergenza sicuro se tutto il resto fallisce */
  fallbackContext?: { topic?: string; caption?: string; language?: string; aspectRatio?: string }
): Promise<string> {
  // Trova il miglior provider di testo disponibile per il tenant
  const providers = await prisma.aIProviderConfig.findMany({
    where: { tenantId, isActive: true, provider: { in: ['openai', 'google'] } },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  const openaiProv = providers.find(p => p.provider === 'openai');
  const googleProv = providers.find(p => p.provider === 'google');
  const selectedProv = openaiProv ?? googleProv;

  const langName = fallbackContext?.language === 'en' ? 'English' : 'Italian';

  // Istruzioni molto specifiche basate su ciò che Google Veo effettivamente accetta
  const systemInstruction =
    `You are a Google Veo video prompt specialist. The following prompt was rejected by Google Veo for violating Responsible AI policies.\n\n` +
    `ERROR FROM GOOGLE: "${sensitiveError}"\n\n` +
    `CRITICAL RULES — the rewritten prompt must NEVER contain:\n` +
    `- Surveillance, spying, hacking, cybersecurity, data protection, privacy violations\n` +
    `- Phrases like "your privacy is safe", "nobody spies on you", "protected data", "security camera"\n` +
    `- Words: secrets, espionage, hacking, surveillance, security sensor, violation, threat, fear, danger\n` +
    `- ANY negative concept even if negated ("you won't fear anymore" is still problematic)\n` +
    `- Brand marketing rules, audience targeting, business strategy instructions\n` +
    `- Meta-instructions ("the AI should ask", "make sure that", etc.)\n\n` +
    `THE REWRITTEN PROMPT MUST:\n` +
    `- Describe ONLY positive visual scenes: family warmth, home comfort, daily life, elegant technology as convenience\n` +
    `- Use cinematic language: colors, lighting, emotions, smooth movements, lifestyle\n` +
    `- For smart home devices: describe only comfort and lifestyle (e.g., "lights gently dimming", "warm cozy atmosphere")\n` +
    `- Keep technical parameters: duration hints, aspect ratio, language (${langName}), cinematic style\n` +
    `- Be written in ${langName}\n\n` +
    `Return ONLY the rewritten prompt. No explanations, no comments.`;

  if (selectedProv) {
    try {
      if (selectedProv.provider === 'openai') {
        const { default: OpenAI } = await import('openai');
        const client = new OpenAI({ apiKey: selectedProv.apiKey });
        const response = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `Rewrite this prompt:\n\n${originalPrompt}` },
          ],
          max_tokens: 2500,
          temperature: 0.3,
        });
        const rewritten = response.choices[0]?.message?.content?.trim();
        if (rewritten && rewritten.length > 50) {
          console.log(`[aiRewriteVideoPrompt] Prompt riscritto con OpenAI (${rewritten.length} chars)`);
          return rewritten;
        }
      } else if (selectedProv.provider === 'google') {
        // Usa Gemini Flash per la riscrittura testuale (stesso API key di Veo)
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${selectedProv.apiKey}`;
        const body = {
          contents: [{
            role: 'user',
            parts: [{ text: `${systemInstruction}\n\nRewrite this prompt:\n\n${originalPrompt}` }],
          }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2500 },
        };
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok) {
          const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
          const rewritten = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (rewritten && rewritten.length > 50) {
            console.log(`[aiRewriteVideoPrompt] Prompt riscritto con Gemini Flash (${rewritten.length} chars)`);
            return rewritten;
          }
        } else {
          const errText = await res.text().catch(() => '');
          console.error(`[aiRewriteVideoPrompt] Gemini error ${res.status}: ${errText.slice(0, 200)}`);
        }
      }
    } catch (rewriteErr) {
      console.error('[aiRewriteVideoPrompt] Riscrittura AI fallita:', rewriteErr instanceof Error ? rewriteErr.message : rewriteErr);
    }
  } else {
    console.warn('[aiRewriteVideoPrompt] Nessun provider AI disponibile');
  }

  // ── Fallback sicuro: prompt minimalista visivo senza nessun concetto di sicurezza ─────
  // Generato dal solo topic/caption, focalizzato su lifestyle positivo.
  console.warn('[aiRewriteVideoPrompt] Uso prompt minimalista di emergenza (visivo, sicuro per Veo)');
  const topic = fallbackContext?.topic ?? 'smart home';
  const ar = fallbackContext?.aspectRatio ?? '9:16';
  const arDesc = ar === '9:16' ? 'Vertical portrait 9:16 format for mobile stories.' : 'Horizontal widescreen 16:9 format.';
  const caption = fallbackContext?.caption ? fallbackContext.caption.slice(0, 150) : '';
  return `${arDesc} A warm and modern family home featuring elegant ${topic} technology. ` +
    `Happy family members relaxing in a beautifully lit living room with smart devices blending seamlessly into the stylish decor. ` +
    `Soft ambient lighting adjusts automatically. ` +
    `${caption ? `Context: ${caption}. ` : ''}` +
    `Professional ${langName} lifestyle video, cinematic quality, modern and warm aesthetic. ` +
    `Focus on comfort, elegance, and the joy of intelligent living.`;
}


/**
 * Rileva se un errore Veo è causato da persone/umani nell'immagine di riferimento.
 * In questo caso il fallback corretto è ritentare senza immagine (text-to-video).
 */
function isHumanInImageError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('humans') ||
    msg.includes('people') ||
    msg.includes('person') ||
    msg.includes('image without') ||
    msg.includes('not permitted for video generation') ||
    msg.includes('human') && msg.includes('image')
  );
}

/**
 * Parsa una stringa durata (es. "7s", "7", "7sec") in numero di secondi.
 * Restituisce null se il parsing fallisce o il valore è fuori range (5-8s).
 */
function parseSceneDuration(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = String(raw).match(/^(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const secs = Math.round(parseFloat(match[1]));
  if (secs < 5 || secs > 8) return null;  // fuori range Veo
  return secs;
}

/**
 * Se lo storyboard ha scene con durate esplicite valide (5-8s) che sommano a totalDuration,
 * restituisce quelle durate per usarle come clip durations.
 * Altrimenti restituisce null (usa calculateClipDurations di default).
 */
function extractSceneDurations(storyboard: _StoryboardData, totalDuration: number): number[] | null {
  const scenes = storyboard.scenes ?? [];
  if (scenes.length === 0) return null;
  const parsed = scenes.map(s => parseSceneDuration(s.duration));
  if (parsed.some(d => d === null)) return null; // almeno una durata non valida
  const durations = parsed as number[];
  const sum = durations.reduce((a, b) => a + b, 0);
  // Accetta se la somma è entro ±2s dalla durata totale richiesta
  if (Math.abs(sum - totalDuration) > 2) return null;
  return durations;
}

/*
 * Le scene vengono distribuite proporzionalmente tra le clip.
 * - Clip 0: include hook + prime scene
 * - Clip N (ultima): include le ultime scene + CTA
 * - Clip intermedie: scene centrali
 * Il campo `script` è incluso come narrazione per garantire continuità audio tra le clip.
 */
function buildClipPrompts(
  basePrompt: string,
  storyboard: _StoryboardData,
  numClips: number
): string[] {
  const scenes = storyboard.scenes ?? [];
  if (scenes.length === 0 || numClips <= 0) return Array(numClips).fill(basePrompt);

  const prompts: string[] = [];
  // Musica: inclusa in ogni clip per consistenza audio
  const musicHint = storyboard.music ? `Background music: ${storyboard.music}.` : '';

  for (let clipIdx = 0; clipIdx < numClips; clipIdx++) {
    // Se scene == clip: assegna una scena per clip; altrimenti distribuzione proporzionale
    let clipScenes: _StoryboardScene[];
    if (scenes.length === numClips) {
      clipScenes = [scenes[clipIdx]];
    } else {
      const startScene = Math.floor(clipIdx * scenes.length / numClips);
      const endScene   = Math.floor((clipIdx + 1) * scenes.length / numClips);
      clipScenes = scenes.slice(startScene, endScene);
    }

    const parts: string[] = [basePrompt];

    // Musica: inclusa in ogni clip
    if (musicHint) parts.push(musicHint);

    // Clip 0: aggiungi l'hook
    if (clipIdx === 0 && storyboard.hook) {
      parts.push(`Opening hook: ${storyboard.hook}.`);
    }

    // Scene della clip
    if (clipScenes.length > 0) {
      const sceneText = clipScenes.map(s => {
        const sp: string[] = [];
        const visual    = s.visual    ?? s.description;
        const narration = s.script    ?? s.voiceOver;
        const overlay   = s.onScreenText ?? s.textOverlay;
        if (visual)    sp.push(`Visual: ${visual}`);
        // Narrazione: fondamentale per la continuità audio — indica a Veo cosa "dire" in questa clip
        if (narration) sp.push(`Narration (voiceover): "${narration}"`);
        if (overlay)   sp.push(`On-screen text: "${overlay}"`);
        if (s.transition) sp.push(`Transition: ${s.transition}`);
        return sp.filter(Boolean).join('. ');
      }).filter(Boolean).join(' | ');
      if (sceneText) parts.push(`This clip content: ${sceneText}.`);
    }

    // Ultima clip: aggiungi CTA
    if (clipIdx === numClips - 1 && storyboard.cta) {
      parts.push(`Ending call-to-action: ${storyboard.cta}.`);
    }

    prompts.push(parts.join(' '));
  }
  return prompts;
}

async function executeGenerationJob(job: { id: string; type: string; tenantId: string; relatedPostId: string | null; payload: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: Record<string, any> = JSON.parse(job.payload || '{}');

  if (job.type === 'MANUAL') {
    await gj().update({
      where: { id: job.id },
      data: { status: 'MANUAL_UPLOAD', errorMessage: null },
    });
    return;
  }

  if (job.type === 'TEXT') {
    const result = await generateContent({
      type: payload.aiType ?? 'full_post',
      topic: payload.topic,
      siteContext: payload.siteContext,
      tone: payload.aiTone,
      language: payload.aiLanguage,
      postType: payload.postType,
      platform: payload.platform,
    }, job.tenantId);

    if (job.relatedPostId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.scheduledPost.update as any)({
        where: { id: job.relatedPostId },
        data: {
          caption: result.caption ?? undefined,
          hashtags: result.hashtags ? JSON.stringify(result.hashtags) : undefined,
          aiModel: result.model,
          mediaReady: 'PENDING',
        },
      });
    }
    await gj().update({
      where: { id: job.id },
      data: { status: 'COMPLETED', result: JSON.stringify(result), errorMessage: null },
    });
    emitJobUpdate({ jobId: job.id, tenantId: job.tenantId, status: 'COMPLETED', type: 'TEXT' });
    await trackTokenUsage(job.tenantId, 'openai', result.tokens);
    return;
  }

  if (job.type === 'IMAGE') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: Record<string, any> = JSON.parse(job.payload || '{}');

    // Marca il post come "generazione in corso"
    if (job.relatedPostId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.scheduledPost.update as any)({
        where: { id: job.relatedPostId },
        data: { mediaReady: 'GENERATING' },
      });
    }

    // Leggi il modello immagini configurato per loggerlo nel result del job
    let usedImageModel = 'unknown';
    try {
      const imgProvider = await prisma.aIProviderConfig.findFirst({
        where: { tenantId: job.tenantId, isActive: true, provider: { in: ['openai', 'google'] } },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
      if (imgProvider) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        usedImageModel = (imgProvider as any).imageModel ?? imgProvider.model ?? 'unknown';
      }
    } catch { /* non blocca */ }

    // Dimensione immagine in base al tipo di contenuto (story/reel = verticale)
    const size: '1024x1024' | '1024x1792' =
      p.postType === 'STORY' || p.postType === 'REEL' ? '1024x1792' : '1024x1024';

    // Immagini di riferimento passate dall'utente
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inputMediaRefs: Array<{ url: string; alt?: string | null; description?: string | null; type?: string }> = p.inputMediaRefs ?? [];

    // Costruisce prompt ottimizzato — separa le parti "code-injected" da quelle config-derived
    const codeInjectedParts: string[] = [
      `Professional ${p.platform ?? 'Instagram'} social media image.`,
      'Style: modern, high-quality photography, vivid colors, commercial look.',
    ];
    const configParts: string[] = [];
    if (p.topic)   configParts.push(`Topic: ${p.topic}.`);
    if (p.caption) configParts.push(`Context: ${p.caption.slice(0, 200)}.`);
    // Aggiungi descrizioni reference images al prompt testuale
    const refDescriptions = inputMediaRefs
      .slice(0, 3)
      .map(r => r.description || r.alt)
      .filter(Boolean)
      .join('; ');
    if (refDescriptions) configParts.push(`Visual reference: ${refDescriptions}.`);

    const imagePrompt = p.imagePrompt
      ?? [...codeInjectedParts, ...configParts].join(' ');

    // Carica regole globali per il contenuto IMAGE e applicale al prompt.
    // Il tipo di contenuto considera sia il tipo "IMAGE" (regole visive generiche)
    // che il postType specifico (REEL, STORY, POST) in modo da includere anche
    // le regole visive specifiche del formato richiesto.
    // loadGlobalPromptRules carica SEMPRE le regole globali (tenantId IS NULL)
    // + quelle specifiche del tenant — grazie alle 2 query separate.
    let imageGlobalRules: string[] = [];
    let imageNegativePrompt = '';
    let imagePromptFinal = imagePrompt;
    try {
      // Usa postType se disponibile per un contesto più preciso (es. REEL → regole visive REEL)
      const imageRuleContentType = (p.postType === 'REEL' || p.postType === 'STORY')
        ? p.postType as string
        : 'IMAGE';
      const gr = await loadGlobalPromptRules(job.tenantId, imageRuleContentType);
      imageGlobalRules = gr.positiveRules;
      if (gr.positiveRules.length > 0) {
        // Appende le regole come "style requirements" in inglese — formato ottimale per Imagen/Gemini
        imagePromptFinal = `${imagePrompt}. ${gr.positiveRules.join('. ')}.`;
        console.log(`[Queue IMAGE] Applico ${gr.positiveRules.length} regole positive al prompt immagine (contentType=${imageRuleContentType})`);
      }
      if (gr.negativeRules.length > 0) {
        imageNegativePrompt = gr.negativeRules.join(', ');
        console.log(`[Queue IMAGE] Negative prompt immagine (${gr.negativeRules.length} regole): "${imageNegativePrompt.slice(0, 100)}"`);
      }
    } catch { /* non blocca */ }

    // Genera immagine usando imageModel configurato (separato da videoModel)
    // Passa anche le immagini di riferimento per l'input multimodale (Gemini) o arricchimento prompt (Imagen/OpenAI)
    const saved = await generateImageForTenant(job.tenantId, imagePromptFinal, size, {
      siteId: p.siteId ?? null,
      inputMediaRefs: inputMediaRefs.length > 0 ? inputMediaRefs : undefined,
      negativePrompt: imageNegativePrompt || undefined,
    });

    // Aggiorna il post con l'immagine generata
    if (job.relatedPostId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.scheduledPost.update as any)({
        where: { id: job.relatedPostId },
        data: {
          mediaUrls: JSON.stringify([saved.publicUrl]),
          mediaReady: 'READY',
        },
      });
    }

    // ── Auto-rimozione filigrana se configurata nel payload ──────────────
    let finalMediaUrl = saved.publicUrl;
    if (p.autoRemoveWatermark === true && p.wmPreset && WATERMARK_PRESETS[p.wmPreset as string]) {
      try {
        const region = WATERMARK_PRESETS[p.wmPreset as string].region;
        const method = (['dissolve', 'distorsione', 'taglio'].includes(p.wmMethod as string)
          ? p.wmMethod as RemovalMethod
          : 'taglio') as RemovalMethod;

        // Recupera API key OpenAI se disponibile (per dissolve AI)
        let oaKey: string | undefined;
        let oaModel: string | undefined;
        if (method === 'dissolve') {
          const oaProv = await prisma.aIProviderConfig.findFirst({
            where: { tenantId: job.tenantId, provider: 'openai', isActive: true },
          });
          oaKey = oaProv?.apiKey ?? undefined;
          oaModel = oaProv?.model ?? undefined;
        }

        const wmResult = await removeWatermarkFromImage(
          saved.publicUrl, region, method, job.tenantId, oaKey, oaModel
        );
        finalMediaUrl = wmResult.outputUrl;

        // Aggiorna il post con l'URL del media pulito
        if (job.relatedPostId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma.scheduledPost.update as any)({
            where: { id: job.relatedPostId },
            data: { mediaUrls: JSON.stringify([finalMediaUrl]) },
          });
        }
      } catch (wmErr) {
        // Non blocca il flusso — il media originale rimane valido
        console.error('[scheduler] Auto-watermark removal fallita (IMAGE job):', wmErr);
      }
    }
    // ────────────────────────────────────────────────────────────────────

    await gj().update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        result: JSON.stringify({
          url: finalMediaUrl,               // URL finale (pulita se auto-watermark applicata)
          originalUrl: finalMediaUrl !== saved.publicUrl ? saved.publicUrl : undefined,
          watermarkRemoved: finalMediaUrl !== saved.publicUrl,
          model: usedImageModel,
          width: saved.width,
          height: saved.height,
          size: saved.size,
          mimeType: saved.mimeType,
            promptInfo: {
              globalRules: imageGlobalRules,
              config: {
                platform: p.platform ?? 'Instagram',
                postType: p.postType ?? null,
                size,
                topic: p.topic ?? null,
                captionUsed: p.caption ? p.caption.slice(0, 200) : null,
                siteId: p.siteId ?? null,
                promptSource: p.imagePrompt ? 'payload (personalizzato)' : 'assemblato dal codice',
                inputMediaCount: inputMediaRefs.length > 0 ? inputMediaRefs.length : null,
                globalRulesApplied: imageGlobalRules.length > 0,
              },
              codeRules: p.imagePrompt ? [] : codeInjectedParts,
              finalImagePrompt: imagePromptFinal,
            },
        }),
        errorMessage: null,
      },
    });
    emitJobUpdate({ jobId: job.id, tenantId: job.tenantId, status: 'COMPLETED', type: 'IMAGE' });
    return;
  }

  if (job.type === 'VIDEO') {
    // Job VIDEO: avvia l'operazione Veo asincrona e mantiene il job in PROCESSING.
    // Il completamento viene gestito dal polling pollVeoVideoGenerationJobs() ogni 2 minuti.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: Record<string, any> = JSON.parse(job.payload || '{}');

    if (job.relatedPostId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.scheduledPost.update as any)({
        where: { id: job.relatedPostId },
        data: { mediaReady: 'GENERATING' },
      });
    }

    // Cerca provider video abilitato
    let videoProvider = await prisma.aIProviderConfig.findFirst({
      where: { tenantId: job.tenantId, isActive: true, videoEnabled: true, videoModel: { not: null } },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    if (!videoProvider || !videoProvider.videoModel) {
      throw new Error(
        'Nessun modello Video AI configurato. ' +
        'Vai in Impostazioni → Provider AI e attiva "Modello Video AI" scegliendo un modello Veo ' +
        '(es. veo-3.1-generate-preview). ' +
        'Il job verrà riprovato automaticamente quando il modello sarà configurato.'
      );
    }

    // Override del modello dal payload (impostato manualmente dalla UI della coda)
    // Permette di cambiare il modello per una singola esecuzione senza modificare le impostazioni globali
    if (p.videoModel && typeof p.videoModel === 'string' && p.videoModel !== videoProvider.videoModel) {
      console.log(`[Queue VIDEO] Override modello dal payload: "${p.videoModel}" (provider default: "${videoProvider.videoModel}")`);
      videoProvider = { ...videoProvider, videoModel: p.videoModel };
    }

    // Costruisce il prompt video
    const videoInputMediaRefs: Array<{ url: string; alt?: string | null; description?: string | null }> = p.inputMediaRefs ?? [];

    // Lingua del contenuto (usata nel prompt per guidare Veo su eventuali testi/voci)
    const LANG_NAMES: Record<string, string> = {
      it: 'Italian', en: 'English', es: 'Spanish', fr: 'French', de: 'German',
      pt: 'Portuguese', nl: 'Dutch', pl: 'Polish', ru: 'Russian', zh: 'Chinese', ja: 'Japanese',
    };
    const langCode: string = (p.language as string) ?? 'it';
    const langName: string = LANG_NAMES[langCode] ?? 'Italian';

    // Separa immagini da video tra i media di riferimento
    const imageRefs  = videoInputMediaRefs.filter(r => !isVideoUrl(r.url));
    const videoRefs  = videoInputMediaRefs.filter(r => isVideoUrl(r.url));

    // Descrizione testuale per tutti i ref (usata nel prompt per entrambi i tipi)
    const videoRefDesc = videoInputMediaRefs
      .slice(0, 3)
      .map(r => r.description || r.alt)
      .filter(Boolean)
      .join('; ');

    // Nota esplicita se ci sono video di riferimento (Veo non può usarli come input visivo)
    const videoRefNote = videoRefs.length > 0
      ? `Visual style inspired by: ${videoRefs.map(r => r.description || r.alt || 'reference video').join(', ')}.`
      : '';

    // ── Aspect ratio: calcolato PRIMA di videoPrompt ────────────────────────
    const aspectRatio = p.videoAspectRatio
      ?? p.aspectRatio
      ?? ((p.postType === 'STORY' || p.postType === 'REEL') ? '9:16' : '16:9');
    // Normalizza: Veo non supporta "1:1" — fallback a "16:9"
    const safeAspectRatio = aspectRatio === '1:1' ? '16:9' : aspectRatio;

    // Descrizione orientazione — funzione module-level (immune da TDZ e hot-reload)
    // FONDAMENTALE in modalità image-to-video: Veo tende a ignorare il parametro
    // `aspectRatio` nelle API e a usare l'aspect ratio dell'immagine sorgente.
    const aspectRatioDesc = getAspectRatioDesc(safeAspectRatio);

    const videoPrompt = p.prompt ?? [
      aspectRatioDesc,          // ← primo: forza l'orientazione anche in image-to-video
      `Professional ${p.platform ?? 'Instagram'} social media video clip.`,
      `Language: ${langName}. All on-screen text, if any, must be in ${langName}.`,
      p.topic ? `Topic: ${p.topic}.` : '',
      p.caption ? `Context: ${p.caption.slice(0, 200)}.` : '',
      videoRefDesc ? `Reference visual: ${videoRefDesc}.` : '',
      videoRefNote,
      'Style: modern, dynamic, social media quality. 5 seconds.',
    ].filter(Boolean).join(' ');

    // Durata richiesta dall'utente (può essere fino a 60s — stitching gestirà i clip da 4-8s)
    const rawDuration = typeof p.duration === 'number' ? p.duration : (parseInt(String(p.duration ?? '5'), 10) || 5);
    // Per lo stitching usiamo la durata raw; per singola clip la clamp al range del modello
    const { min: dMin, max: dMax } = getVeoDurationRange(videoProvider.videoModel);
    const safeDuration = Math.max(dMin, Math.min(dMax, Math.round(rawDuration)));
    if (!needsStitching(rawDuration) && safeDuration !== rawDuration) {
      console.warn(`[Queue VIDEO] duration ${rawDuration}s fuori range [${dMin}-${dMax}] per "${videoProvider.videoModel}" → clampato a ${safeDuration}s`);
    }

    // Carica regole globali per il contenuto VIDEO e applicale al prompt
    // ATTENZIONE: le regole vengono filtrate e sanitizzate prima dell'uso:
    // - regole image-only (watermark, "genera l'immagine"...) vengono rimosse
    // - termini sensibili per Google Veo vengono sostituiti
    let videoGlobalRules: string[] = [];
    let videoNegativePrompt = '';
    let videoPromptFinal = videoPrompt;
    try {
      const gr = await loadGlobalPromptRules(job.tenantId, 'VIDEO');
      videoGlobalRules = gr.positiveRules;
      if (gr.positiveRules.length > 0) {
        const videoSafeRules = filterRulesForVideo(gr.positiveRules);
        if (videoSafeRules.length > 0) {
          videoPromptFinal = `${videoPrompt}. ${videoSafeRules.join('. ')}.`;
        }
        console.log(`[Queue VIDEO] Regole positive: ${gr.positiveRules.length} totali → ${filterRulesForVideo(gr.positiveRules).length} applicate al prompt video`);
      }
      if (gr.negativeRules.length > 0) {
        const videoSafeNegatives = filterNegativeRulesForVideo(gr.negativeRules);
        if (videoSafeNegatives.length > 0) {
          videoNegativePrompt = videoSafeNegatives.join(', ');
          console.log(`[Queue VIDEO] Negative prompt video (${videoSafeNegatives.length} regole): "${videoNegativePrompt.slice(0, 100)}"`);
        }
      }
    } catch { /* non blocca */ }

    // Carica la prima IMMAGINE di riferimento come base64 per image-to-video
    // I VIDEO di riferimento non possono essere inviati come input visivo a Veo:
    // contribuiscono solo come testo nel prompt (descrizione/alt).
    let referenceImage: { base64: string; mimeType: string } | undefined;
    if (imageRefs.length > 0) {
      const firstImageRef = imageRefs[0];
      try {
        referenceImage = await loadImageAsBase64(firstImageRef.url);
        console.log(`[Queue VIDEO] Immagine di riferimento caricata per image-to-video: ${firstImageRef.url} (${referenceImage.mimeType})`);
      } catch (e) {
        console.warn(`[Queue VIDEO] Impossibile caricare immagine di riferimento "${firstImageRef.url}":`, e instanceof Error ? e.message : e);
        // Non blocca: fallback a text-to-video
      }
    }
    if (videoRefs.length > 0) {
      console.log(`[Queue VIDEO] ${videoRefs.length} video di riferimento trovati — contribuiscono solo al prompt testuale (Veo non supporta video-to-video via questo endpoint)`);
    }

    if (videoProvider.provider === 'google') {
      // ── Multi-clip stitching? (duration > 8s) ──────────────────────────────
      if (needsStitching(rawDuration)) {
        // Controlla se c'è già uno _stitching valido (es. da retryClip con currentClipIndex > 0)
        const existingSt = p._stitching as StitchingMeta | undefined;
        const canResume = existingSt
          && Array.isArray(existingSt.clips)
          && existingSt.clips.length > 1
          && existingSt.currentClipIndex > 0
          && existingSt.clips[existingSt.currentClipIndex - 1]?.status === 'COMPLETED';

        const startClipIdx = canResume ? existingSt!.currentClipIndex : 0;

        let stitching: StitchingMeta;
        if (canResume) {
          // Riusa lo _stitching esistente (ripresa da clip N dopo retryClip)
          stitching = existingSt!;
          // Reset clip corrente a PENDING (verrà impostata PROCESSING dopo avvio Veo)
          stitching.clips[startClipIdx].status = 'PENDING';
          stitching.clips[startClipIdx].operationName = undefined;
          stitching.clips[startClipIdx].errorMessage = undefined;
          console.log(`[Queue VIDEO] Ripresa stitching da clip ${startClipIdx + 1}/${stitching.clips.length} per job ${job.id}`);
        } else {
          // Determina le clip durations: usa quelle dello storyboard se valide, altrimenti calcola
          let clipDurations: number[];
          let perClipPrompts: string[] | undefined;
          let storyboardForClips: _StoryboardData | null = null;
          try {
            const storyboardRaw = p._storyboard as _StoryboardData | string | undefined;
            storyboardForClips = storyboardRaw
              ? (typeof storyboardRaw === 'string' ? JSON.parse(storyboardRaw) : storyboardRaw)
              : null;
            if (storyboardForClips && (storyboardForClips.scenes?.length ?? 0) > 0) {
              // Issue 2 & 3: usa le durate delle scene dello storyboard se valide e la somma corrisponde
              const sceneDurations = extractSceneDurations(storyboardForClips, rawDuration);
              if (sceneDurations) {
                clipDurations = sceneDurations;
                console.log(`[Queue VIDEO] Scene durations dallo storyboard: [${clipDurations.join(', ')}]s (somma=${clipDurations.reduce((a,b)=>a+b,0)}s)`);
              } else {
                clipDurations = calculateClipDurations(rawDuration);
                console.log(`[Queue VIDEO] Scene durations invalide o assenti — uso calculateClipDurations: [${clipDurations.join(', ')}]s`);
              }
              perClipPrompts = buildClipPrompts(videoPromptFinal, storyboardForClips, clipDurations.length);
              console.log(`[Queue VIDEO] Storyboard trovato: ${storyboardForClips.scenes?.length} scene distribuite su ${clipDurations.length} clip`);
            } else {
              clipDurations = calculateClipDurations(rawDuration);
            }
          } catch (e) {
            console.warn('[Queue VIDEO] Parsing _storyboard fallito:', e instanceof Error ? e.message : e);
            clipDurations = calculateClipDurations(rawDuration);
          }
          // Estrai ttsScripts dallo storyboard subito, prima che i clipPrompts vengano riscritti dall'AI.
          // Garantisce che la narrazione originale sia sempre disponibile per il TTS post-processing,
          // anche per modelli senza audio nativo (veo-2.0, veo-3.0-fast, veo-3.1-*, ecc.).
          let initialTtsScripts: string[] | undefined;
          if (storyboardForClips?.scenes && storyboardForClips.scenes.length > 0) {
            const scripts = storyboardForClips.scenes
              .map(s => (s.script ?? s.voiceOver ?? '').trim())
              .filter(Boolean);
            if (scripts.length > 0) {
              initialTtsScripts = scripts;
              console.log(`[Queue VIDEO] TTS scripts estratti dallo storyboard: ${scripts.length} narrazioni`);
            }
          }
          // Fallback: usa la caption del post come narrazione globale suddivisa per clip
          if (!initialTtsScripts || initialTtsScripts.length === 0) {
            const captionForTts = (p.caption as string | undefined)?.trim();
            if (captionForTts) {
              // Suddividi la caption in frasi e distribiscile per clip (una frase per clip)
              const sentences = captionForTts
                .replace(/#\w+/g, '') // rimuovi hashtag
                .split(/[.!?]+/)
                .map(s => s.trim())
                .filter(s => s.length > 10);
              if (sentences.length > 0) {
                // Distribuisci le frasi tra le clip: se più frasi che clip, raggruppa; se meno, ripeti
                const numClips = clipDurations.length;
                const grouped: string[] = [];
                if (sentences.length >= numClips) {
                  const chunkSize = Math.ceil(sentences.length / numClips);
                  for (let i = 0; i < numClips; i++) {
                    grouped.push(sentences.slice(i * chunkSize, (i + 1) * chunkSize).join('. '));
                  }
                } else {
                  // Meno frasi che clip: assegna la frase più rilevante o ripeti
                  for (let i = 0; i < numClips; i++) {
                    grouped.push(sentences[Math.min(i, sentences.length - 1)]);
                  }
                }
                initialTtsScripts = grouped.filter(Boolean);
                console.log(`[Queue VIDEO] TTS scripts dal fallback caption (${numClips} clip): ${initialTtsScripts.length} segmenti`);
              }
            }
          }

          // Costruisci prompt per-clip dallo storyboard se disponibile
          stitching = {
            totalDuration: rawDuration,
            clips: clipDurations.map((d, i) => ({ index: i, duration: d, status: 'PENDING' as const })),
            currentClipIndex: 0,
            finalPrompt: videoPromptFinal,
            clipPrompts: perClipPrompts,
            ttsScripts: initialTtsScripts,
            aspectRatio: safeAspectRatio,
            negativePrompt: videoNegativePrompt || undefined,
          };
          console.log(`[Queue VIDEO] Stitching NUOVO: ${clipDurations.length} clip per ${rawDuration}s → durate: [${clipDurations.join(', ')}]${perClipPrompts ? ' (prompt per-clip dallo storyboard)' : ''}${initialTtsScripts?.length ? ` + ${initialTtsScripts.length} script TTS` : ' (nessun script TTS — audio non disponibile)'}`);
        }

        // ── FASE 1: Salva _stitching nel DB PRIMA di avviare Veo ──────────────
        // Garantisce che _stitching sia sempre presente nel payload, anche se
        // la fase successiva (avvio Veo) o la scrittura dell'operationName fallisce.
        await gj().update({
          where: { id: job.id },
          data: {
            payload: JSON.stringify({
              ...p,
              provider: videoProvider.provider,
              videoModel: videoProvider.videoModel,
              duration: rawDuration,
              _stitching: stitching,
            }),
            errorMessage: null,
          },
        });
        console.log(`[Queue VIDEO] Stitching salvato in DB (${stitching.clips.length} clip, avvio da clip ${startClipIdx})`);

        // ── Immagine di riferimento per clip > 0 (ultimo frame clip precedente) ─
        let clipStartRefImage = referenceImage;
        if (startClipIdx > 0) {
          const prevClip = stitching.clips[startClipIdx - 1];
          if (prevClip?.videoUrl) {
            try {
              const prevPath = isLocalUrl(prevClip.videoUrl) ? publicUrlToLocalPath(prevClip.videoUrl) : undefined;
              if (prevPath) clipStartRefImage = await extractLastFrame(prevPath);
            } catch { /* nessun frame di riferimento — text-to-video fallback */ }
          }
        }

        // ── FASE 2: Avvia operazione Veo per clip startClipIdx ────────────────
        const clipPromptToUse = canResume
          ? ((stitching.clipPrompts?.[startClipIdx] ?? stitching.finalPrompt))
          : (stitching.clipPrompts?.[startClipIdx] ?? videoPromptFinal);
        const stitchingNegPrompt = stitching.negativePrompt;
        let operationName: string;
        try {
          operationName = await startGoogleVeoOperation(
            videoProvider.apiKey,
            videoProvider.videoModel,
            clipPromptToUse,
            canResume ? (stitching.aspectRatio ?? safeAspectRatio) : safeAspectRatio,
            stitching.clips[startClipIdx].duration,
            clipStartRefImage,
            undefined,
            stitchingNegPrompt ? { negativePrompt: stitchingNegPrompt } : undefined
          );
        } catch (veoErr) {
          if (isHumanInImageError(veoErr) && clipStartRefImage) {
            console.warn(`[Queue VIDEO] Clip ${startClipIdx}: immagine di riferimento contiene persone → retry text-to-video`);
            operationName = await startGoogleVeoOperation(
              videoProvider.apiKey,
              videoProvider.videoModel,
              clipPromptToUse,
              canResume ? (stitching.aspectRatio ?? safeAspectRatio) : safeAspectRatio,
              stitching.clips[startClipIdx].duration,
              undefined, // nessuna immagine di riferimento
              undefined,
              stitchingNegPrompt ? { negativePrompt: stitchingNegPrompt } : undefined
            );
            clipStartRefImage = undefined; // evita futuri errori per questa sessione
          } else {
            throw veoErr;
          }
        }
        stitching.clips[startClipIdx].status = 'PROCESSING';
        stitching.clips[startClipIdx].operationName = operationName;

        // ── FASE 3: Aggiorna payload con operationName + clip PROCESSING ─────
        await gj().update({
          where: { id: job.id },
          data: {
            payload: JSON.stringify({
              ...p,
              operationName,
              provider: videoProvider.provider,
              videoModel: videoProvider.videoModel,
              duration: rawDuration,
              _stitching: stitching,
              _promptInfo: {
                globalRules: videoGlobalRules,
                config: {
                  platform: p.platform ?? 'Instagram',
                  postType: p.postType ?? null,
                  language: langCode,
                  duration: rawDuration,
                  aspectRatio: safeAspectRatio,
                  topic: p.topic ?? null,
                  siteId: p.siteId ?? null,
                  globalRulesApplied: videoGlobalRules.length > 0,
                  imageToVideo: !!clipStartRefImage,
                  referenceImageCount: imageRefs.length,
                  referenceVideoCount: videoRefs.length,
                  stitching: true,
                  totalClips: stitching.clips.length,
                  resumedFromClip: startClipIdx,
                  storyboardScenes: (p._storyboard as _StoryboardData | undefined)?.scenes?.length ?? 0,
                },
                finalVideoPrompt: videoPromptFinal,
                clipPrompts: stitching.clipPrompts,
              },
            }),
            errorMessage: null,
          },
        });
        console.log(`[Queue VIDEO] Stitching avviato: ${stitching.clips.length} clip per ${rawDuration}s (clip ${startClipIdx + 1}: ${stitching.clips[startClipIdx].duration}s, op: ${operationName})`);
        // Avvia polling inline per non aspettare il cron ogni 2 min
        startInlineVeoPolling(job.id);
        return;
      }

      // ── Singola clip (duration <= 8s) ──────────────────────────────────────
      // Lancia operazione Veo asincrona — restituisce subito l'operationName
      // Se referenceImage è presente → image-to-video, altrimenti text-to-video

      // Arricchisci il prompt con lo storyboard se disponibile
      let singleClipPrompt = videoPromptFinal;
      try {
        const storyboardRaw = p._storyboard as _StoryboardData | string | undefined;
        const storyboard: _StoryboardData | null = storyboardRaw
          ? (typeof storyboardRaw === 'string' ? JSON.parse(storyboardRaw) : storyboardRaw)
          : null;
        if (storyboard && (storyboard.scenes?.length ?? 0) > 0) {
          singleClipPrompt = enrichPromptWithStoryboard(videoPromptFinal, storyboard);
          console.log(`[Queue VIDEO] Prompt singola clip arricchito con ${storyboard.scenes?.length} scene dallo storyboard`);
        }
      } catch (e) {
        console.warn('[Queue VIDEO] Parsing _storyboard (singola clip) fallito:', e instanceof Error ? e.message : e);
      }

      let operationName = '';
      try {
        operationName = await startGoogleVeoOperation(
          videoProvider.apiKey,
          videoProvider.videoModel,
          singleClipPrompt,    // prompt arricchito con storyboard
          safeAspectRatio,
          safeDuration,        // durata clampata al range del modello
          referenceImage,      // immagine di riferimento (opzionale)
          undefined,
          videoNegativePrompt ? { negativePrompt: videoNegativePrompt } : undefined
        );
      } catch (veoErr) {
        if (isHumanInImageError(veoErr) && referenceImage) {
          console.warn('[Queue VIDEO] Singola clip: immagine di riferimento contiene persone → retry text-to-video');
          operationName = await startGoogleVeoOperation(
            videoProvider.apiKey,
            videoProvider.videoModel,
            singleClipPrompt,
            safeAspectRatio,
            safeDuration,
            undefined, // nessuna immagine di riferimento
            undefined,
            videoNegativePrompt ? { negativePrompt: videoNegativePrompt } : undefined
          );
        } else {
          throw veoErr;
        }
      }

      // Memorizza operationName + info provider nel payload, lascia il job PROCESSING
      // (processGenerationQueue ha già impostato status=PROCESSING prima di chiamare questa funzione)
      await gj().update({
        where: { id: job.id },
        data: {
          payload: JSON.stringify({
            ...p,
            operationName,
            provider: videoProvider.provider,
            videoModel: videoProvider.videoModel,
            duration: safeDuration,  // aggiorna con la durata effettiva usata
            // Salva promptInfo nel payload per recuperarlo quando il job si completa (pollVeo)
            _promptInfo: {
              globalRules: videoGlobalRules,
              config: {
                platform: p.platform ?? 'Instagram',
                postType: p.postType ?? null,
                language: langCode,
                duration: safeDuration,
                aspectRatio: safeAspectRatio,
                topic: p.topic ?? null,
                siteId: p.siteId ?? null,
                globalRulesApplied: videoGlobalRules.length > 0,
                imageToVideo: !!referenceImage,
                referenceImageCount: imageRefs.length,
                referenceVideoCount: videoRefs.length,
                stitching: false,
                totalClips: 1,
                storyboardScenes: (p._storyboard as _StoryboardData | undefined)?.scenes?.length ?? 0,
              },
              finalVideoPrompt: singleClipPrompt,
            },
          }),
          errorMessage: null,
        },
      });

      console.log(`[Queue VIDEO] Avviata operazione Veo "${operationName}" per job ${job.id} (modello: ${videoProvider.videoModel}${referenceImage ? ', image-to-video' : ', text-to-video'})`);
      // Avvia polling inline per non aspettare il cron ogni 2 min
      startInlineVeoPolling(job.id);
      // Ritorna senza completare il job — pollVeoVideoGenerationJobs() lo completerà
      return;
    } else if (videoProvider.provider === 'openai') {
      // OpenAI — generazione sincrona (placeholder DALL-E come frame video)
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: videoProvider.apiKey });
      const size = safeAspectRatio === '16:9' ? '1792x1024' : safeAspectRatio === '9:16' ? '1024x1792' : '1024x1024';
      const image = await client.images.generate({
        model: 'dall-e-3',
        prompt: `High-quality video frame: ${videoPromptFinal}`,
        size: size as '1024x1024' | '1024x1792' | '1792x1024',
        quality: 'hd', n: 1,
      });
      const videoUrl = image.data?.[0]?.url ?? '';
      await trackTokenUsage(job.tenantId, videoProvider.provider, 1000);

      let persistedUrl = videoUrl;
      if (videoUrl && !isLocalUrl(videoUrl)) {
        try {
          const saved = await saveFileFromUrl(videoUrl, 'video-ai', job.tenantId, { optimize: false, siteId: p.siteId ?? null });
          persistedUrl = saved.publicUrl;
        } catch (e) {
          console.warn('[Queue VIDEO] Persistenza locale fallita (OpenAI):', e instanceof Error ? e.message : e);
        }
      }

      if (job.relatedPostId && persistedUrl) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.scheduledPost.update as any)({
          where: { id: job.relatedPostId },
          data: { mediaUrls: JSON.stringify([persistedUrl]), mediaReady: 'READY' },
        });
      }

      await gj().update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          result: JSON.stringify({
            url: persistedUrl,
            videoUrl: persistedUrl,
            model: 'dall-e-3',
            mimeType: 'image/png',
            tokensConsumed: 1000,
          }),
          errorMessage: null,
        },
      });
      return;
    } else {
      throw new Error(`Provider video ${videoProvider.provider} non supportato`);
    }
  }

  throw new Error(`Tipo job non gestito: ${job.type}`);
}

// ─── Polling operazioni Veo per GenerationJob VIDEO in PROCESSING ────────────
// Chiamato ogni 2 minuti dal cron: verifica le operazioni Veo pendenti.
export async function pollVeoVideoGenerationJobs(): Promise<void> {
  let processingVideoJobs: {
    id: string; tenantId: string; relatedPostId: string | null;
    payload: string; attempts: number; maxAttempts: number; updatedAt: Date;
  }[] = [];

  try {
    processingVideoJobs = await gj().findMany({
      where: { type: 'VIDEO', status: 'PROCESSING' },
      take: 20,
    });
  } catch { return; }

  // ── Timeout: job rimasti bloccati in PROCESSING per > 20 minuti ─────────
  const STALL_TIMEOUT_MS = 20 * 60 * 1000;
  const now = Date.now();
  for (const job of processingVideoJobs) {
    if (job.updatedAt && now - new Date(job.updatedAt).getTime() > STALL_TIMEOUT_MS) {
      console.warn(`[pollVeo] Job ${job.id} bloccato da oltre 25 minuti (updatedAt: ${job.updatedAt}) → FAILED`);
      await gj().update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: 'Timeout: generazione video bloccata per oltre 25 minuti senza risposta da Google Veo.',
        },
      }).catch(() => {});
    }
  }

  // Ricarica solo i job ancora in PROCESSING (esclude quelli appena scaduti)
  const activeJobs = processingVideoJobs.filter(
    j => !j.updatedAt || now - new Date(j.updatedAt).getTime() <= STALL_TIMEOUT_MS
  );

  for (const job of activeJobs) {
    let p: Record<string, unknown> = {};
    try { p = JSON.parse(job.payload || '{}'); } catch { continue; }

    const operationName = p.operationName as string | undefined;
    const provider = p.provider as string | undefined;

    if (!operationName || provider !== 'google') continue;

    const providerConfig = await prisma.aIProviderConfig.findFirst({
      where: { tenantId: job.tenantId, provider: 'google', isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (!providerConfig) continue;

    try {
      const check = await checkGoogleVeoOperation(providerConfig.apiKey, operationName);

      if (!check.done) continue; // ancora in elaborazione

      if (check.error) {
        const isTokenError = check.error.toLowerCase().includes('quota') || check.error.toLowerCase().includes('rate limit');
        const isSensitive = isSensitiveWordsError(check.error);
        const isHumanImg = isHumanInImageError(check.error);

        // ── Retry automatico per "humans in image" ────────────────────────────
        // Google Veo ha completato l'operazione ma rifiuta l'immagine di riferimento
        // perché contiene persone. Riprova in modalità text-to-video (senza immagine).
        if (isHumanImg && !p._humanImageRetried) {
          const stitchingForHuman = p._stitching as StitchingMeta | undefined;
          const clipIdxForHuman = stitchingForHuman?.currentClipIndex ?? 0;
          const rawPromptForHuman =
            stitchingForHuman?.clipPrompts?.[clipIdxForHuman] ??
            stitchingForHuman?.finalPrompt ??
            (p.imagePrompt as string | undefined) ??
            String(p.caption ?? '').slice(0, 600);
          const durationForHuman = stitchingForHuman?.clips?.[clipIdxForHuman]?.duration ??
            (p.duration as number | undefined) ?? 7;
          const aspectForHuman = stitchingForHuman?.aspectRatio ??
            (p.videoAspectRatio as string | undefined) ?? '9:16';

          console.warn(
            `[pollVeo] Job ${job.id} — Clip ${clipIdxForHuman + 1}: errore "humans in image" da Google Veo.\n` +
            `  Errore: ${check.error}\n` +
            `  Retry text-to-video (senza immagine di riferimento)...`
          );

          try {
            const humanRetryOpName = await startGoogleVeoOperation(
              providerConfig.apiKey,
              (p.videoModel as string) ?? providerConfig.videoModel ?? 'veo-3.0-generate-001',
              rawPromptForHuman,
              aspectForHuman,
              durationForHuman,
              undefined, // nessuna immagine di riferimento
              undefined,
              stitchingForHuman?.negativePrompt ? { negativePrompt: stitchingForHuman.negativePrompt } : undefined
            );

            if (stitchingForHuman?.clips?.[clipIdxForHuman]) {
              stitchingForHuman.clips[clipIdxForHuman].operationName = humanRetryOpName;
              stitchingForHuman.clips[clipIdxForHuman].status = 'PROCESSING';
            }

            await gj().update({
              where: { id: job.id },
              data: {
                errorMessage: `[Retry] Clip ${clipIdxForHuman + 1}: rimossa immagine con persone, riprovando in modalità text-to-video...`,
                payload: JSON.stringify({
                  ...p,
                  operationName: humanRetryOpName,
                  _humanImageRetried: true,
                  _stitching: stitchingForHuman ?? p._stitching,
                }),
              },
            });
            emitJobUpdate({ jobId: job.id, tenantId: job.tenantId, status: 'PROCESSING', type: 'VIDEO' });
            if (!_inlineVeoPollers.has(job.id)) startInlineVeoPolling(job.id);
            continue;
          } catch (humanRetryErr) {
            console.error(`[pollVeo] Retry text-to-video fallito per job ${job.id}:`, humanRetryErr instanceof Error ? humanRetryErr.message : humanRetryErr);
            // Cade nel blocco FAILED sotto
          }
        }

        // ── Retry automatico per "sensitive words" ────────────────────────────
        // Invece di sostituzioni statiche, usa l'AI per riscrivere il prompt
        // in modo dinamico, mantenendo l'intenzione visiva originale.
        if (isSensitive && !p._sensitiveWordsRetried) {
          const stitchingForRetry = p._stitching as StitchingMeta | undefined;
          const clipIdxForRetry = stitchingForRetry?.currentClipIndex ?? 0;
          const rawPromptForRetry =
            stitchingForRetry?.clipPrompts?.[clipIdxForRetry] ??
            stitchingForRetry?.finalPrompt ??
            (p.imagePrompt as string | undefined) ??
            String(p.caption ?? '').slice(0, 600);
          const durationForRetry = stitchingForRetry?.clips?.[clipIdxForRetry]?.duration ?? 7;
          const aspectForRetry = stitchingForRetry?.aspectRatio ?? (p.videoAspectRatio as string | undefined) ?? '9:16';

          console.warn(
            `[pollVeo] Job ${job.id} — Clip ${clipIdxForRetry + 1}: errore "sensitive words" da Google Veo.\n` +
            `  Errore: ${check.error}\n` +
            `  Avvio riscrittura AI del prompt (provider intelligente, nessuna sostituzione statica)...`
          );

          try {
            // ── Preserva la narrazione TTS PRIMA della riscrittura AI ────────────
            // Il prompt riscritto potrebbe non contenere più il pattern "Narration (voiceover): ..."
            // Salviamo la narrazione originale in stitching.ttsScripts per garantire continuità audio.
            if (stitchingForRetry) {
              if (!stitchingForRetry.ttsScripts) {
                // Inizializza ttsScripts estraendo la narrazione da TUTTI i clipPrompts originali
                stitchingForRetry.ttsScripts = (stitchingForRetry.clipPrompts ?? []).map(cp => {
                  const m = cp.match(/Narration\s*\(voiceover\)\s*:\s*"([^"]+)"/i);
                  return m?.[1]?.trim() ?? '';
                });
                console.log(`[pollVeo] TTS scripts estratti da clipPrompts prima della riscrittura: ${stitchingForRetry.ttsScripts.filter(Boolean).length} narrazioni`);
              }
            }

            // Chiedi all'AI di riscrivere il prompt in modo da eliminare i termini problematici
            const rewrittenPrompt = await aiRewriteVideoPrompt(rawPromptForRetry, check.error, job.tenantId, {
              topic: (p.topic as string | undefined) ?? undefined,
              caption: (p.caption as string | undefined) ?? undefined,
              language: (p.language as string | undefined) ?? 'it',
              aspectRatio: (stitchingForRetry?.aspectRatio ?? (p.videoAspectRatio as string | undefined) ?? '9:16'),
            });

            const retryOpName = await startGoogleVeoOperation(
              providerConfig.apiKey,
              (p.videoModel as string) ?? providerConfig.videoModel ?? 'veo-3.0-generate-001',
              rewrittenPrompt,
              aspectForRetry,
              durationForRetry,
              undefined,
              undefined,
              stitchingForRetry?.negativePrompt ? { negativePrompt: stitchingForRetry.negativePrompt } : undefined
            );

            // Aggiorna il clipPrompt con la versione riscritta dall'AI nello stitching
            if (stitchingForRetry?.clipPrompts) {
              stitchingForRetry.clipPrompts[clipIdxForRetry] = rewrittenPrompt;
            }
            if (stitchingForRetry?.clips?.[clipIdxForRetry]) {
              stitchingForRetry.clips[clipIdxForRetry].operationName = retryOpName;
              stitchingForRetry.clips[clipIdxForRetry].status = 'PROCESSING';
            }

            await gj().update({
              where: { id: job.id },
              data: {
                // rimane PROCESSING
                errorMessage: `[Retry AI] Clip ${clipIdxForRetry + 1}: prompt riscritto dall'AI per evitare i filtri Google Responsible AI. In generazione...`,
                payload: JSON.stringify({
                  ...p,
                  operationName: retryOpName,
                  _sensitiveWordsRetried: true,
                  _stitching: stitchingForRetry ?? p._stitching,
                }),
              },
            });
            emitJobUpdate({ jobId: job.id, tenantId: job.tenantId, status: 'PROCESSING', type: 'VIDEO' });
            if (!_inlineVeoPollers.has(job.id)) startInlineVeoPolling(job.id);
            continue; // passa al prossimo job
          } catch (retryErr) {
            console.error(`[pollVeo] Retry con riscrittura AI fallito per job ${job.id}:`, retryErr instanceof Error ? retryErr.message : retryErr);
            // Cade nel blocco FAILED sotto
          }
        }

        // ── Gestione errori standard ──────────────────────────────────────────
        if (isTokenError && job.attempts < job.maxAttempts) {
          await gj().update({
            where: { id: job.id },
            data: {
              status: 'WAITING_TOKENS',
              errorMessage: check.error,
              nextRetryAt: new Date(Date.now() + 3_600_000), // retry tra 1 ora
              // Pulisce operationName nel payload per ri-avviare l'operazione al prossimo tentativo
              payload: JSON.stringify({ ...p, operationName: undefined }),
            },
          });
        } else {
          // Arricchisce il messaggio con il numero della clip (se stitching multi-clip)
          const stitchingForErr = p._stitching as StitchingMeta | undefined;
          const clipForErrIdx = stitchingForErr?.currentClipIndex;
          const totalClipsForErr = stitchingForErr?.clips?.length;
          const clipContext = (clipForErrIdx !== undefined && totalClipsForErr)
            ? ` (Clip ${clipForErrIdx + 1}/${totalClipsForErr})`
            : '';
          const sensitiveHint = isSensitive
            ? '\n⚠️ Il prompt contiene parole che violano le Google Responsible AI policies. ' +
              'Usa "Riprova" per un nuovo tentativo con riscrittura AI automatica del prompt.'
            : '';
          const humanHint = isHumanImg
            ? '\n⚠️ L\'immagine di riferimento contiene persone, non permesse da Google Veo nel tuo paese. ' +
              'Usa "Riprova" per riprovare in modalità text-to-video (senza immagine di riferimento).'
            : '';
          await gj().update({
            where: { id: job.id },
            data: {
              status: 'FAILED',
              errorMessage: `${check.error}${clipContext}${sensitiveHint}${humanHint}`,
              payload: JSON.stringify({ ...p, operationName: undefined }),
            },
          });
          if (job.relatedPostId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (prisma.scheduledPost.update as any)({
              where: { id: job.relatedPostId },
              data: { mediaReady: 'FAILED' },
            }).catch(() => {});
          }
          emitJobUpdate({ jobId: job.id, tenantId: job.tenantId, status: 'FAILED', type: 'VIDEO' });
        }
        continue;
      }

      // ── Operazione Veo completata con successo ─────────────────
      await trackTokenUsage(job.tenantId, 'google', check.tokens ?? VIDEO_TOKEN_ESTIMATE);

      // Scarica e persisti la clip corrente localmente
      let clipLocalPath: string | undefined;
      let persistedUrl = check.videoUri!;
      if (check.videoUri && !isLocalUrl(check.videoUri)) {
        try {
          const saved = await persistClipFromUri(check.videoUri, providerConfig.apiKey, job.tenantId, (p.siteId as string | null) ?? null);
          clipLocalPath = saved.localPath;
          persistedUrl = saved.publicUrl;
          console.log(`[pollVeo] Clip persistita localmente: ${persistedUrl}`);
        } catch (e) {
          console.warn('[pollVeo] Persistenza locale fallita:', e instanceof Error ? e.message : e);
        }
      }

      // ── Stitching multi-clip? ─────────────────────────────────
      const stitching = p._stitching as StitchingMeta | undefined;
      const totalDuration = typeof p.duration === 'number' ? p.duration : parseInt(String(p.duration ?? '0'), 10) || 0;
      const isStitchingJob = needsStitching(totalDuration);
      const hasValidSt = stitching && Array.isArray(stitching.clips) && stitching.clips.length > 1;

      console.log(`[pollVeo] Job ${job.id}: duration=${totalDuration}s, _stitching.clips=${stitching?.clips?.length ?? 'N/A'}, hasValidSt=${hasValidSt}, needsStitching=${isStitchingJob}`);

      // ── GUARD ASSOLUTO: se needsStitching=true, SEMPRE nel path stitching ──────
      // Il path singola-clip è irraggiungibile per video > VEO_CLIP_MAX secondi.
      if (isStitchingJob) {
        if (hasValidSt) {
          // ── Path normale: _stitching valido con N clip ─────────────────────────
          const clipIdx = stitching!.currentClipIndex;
          stitching!.clips[clipIdx].status = 'COMPLETED';
          stitching!.clips[clipIdx].videoUrl = persistedUrl;
          stitching!.clips[clipIdx].operationName = undefined;

          const nextIdx = clipIdx + 1;

          if (nextIdx >= stitching!.clips.length) {
            // ── Tutte le clip completate: concatena ──────────────────────────────
            const completedClipUrls = stitching!.clips.map(c => c.videoUrl).filter(Boolean) as string[];
            console.log(`[pollVeo] Job ${job.id}: pronto per stitching — ${completedClipUrls.length}/${stitching!.clips.length} clip con videoUrl:`, completedClipUrls);

            // ── Raccoglie script narrazione per TTS continuo ──────────────────
            // Veo 3.0 genera audio nativo: il TTS post-processing non è necessario
            // perché ogni clip già include audio ambientale/narrativo generato da Veo.
            // NOTA: solo veo-3.0-generate-001 (standard) supporta generateAudio — fast/lite/preview NON lo supportano
            const videoModelForTts = (p.videoModel as string | undefined) ?? providerConfig.videoModel ?? '';
            const isVeo30Standard = videoModelForTts.includes('veo-3.0') && !videoModelForTts.includes('fast') && !videoModelForTts.includes('lite') && !videoModelForTts.includes('preview');

            let ttsOptions: Parameters<typeof stitchClips>[3] | undefined;
            let fallbackTtsOptions: Parameters<typeof stitchClips>[4] | undefined;
            if (isVeo30Standard) {
              console.log('[pollVeo] TTS saltato: veo-3.0-generate-001 genera audio nativo nel video');
            } else {
              try {
                // 1. Priorità massima: ttsScripts salvati nello stitching (preservati da riscrittura AI)
                let ttsScripts: string[] = (stitching!.ttsScripts ?? []).filter(Boolean);

                if (ttsScripts.length > 0) {
                  console.log(`[pollVeo] TTS: usando ${ttsScripts.length} script salvati in stitching.ttsScripts`);
                } else {
                  // 2. Fallback: prova a leggere gli script dallo storyboard (_storyboard nel payload)
                  const storyboardRaw = p._storyboard as _StoryboardData | string | undefined;
                  const storyboard: _StoryboardData | null = storyboardRaw
                    ? (typeof storyboardRaw === 'string' ? JSON.parse(storyboardRaw) : storyboardRaw)
                    : null;
                  ttsScripts = storyboard?.scenes
                    ?.map(s => (s.script ?? s.voiceOver ?? '').trim())
                    .filter(Boolean) ?? [];
                  if (ttsScripts.length > 0) {
                    console.log(`[pollVeo] TTS: estratti ${ttsScripts.length} script dallo storyboard`);
                  }
                }

                // 3. Ultimo fallback: estrai "Narration (voiceover): "..."" dai clipPrompts
                //    (caso in cui _storyboard non è nel payload, es. generazione da QuickCreateModal)
                if (ttsScripts.length === 0 && Array.isArray(stitching!.clipPrompts)) {
                  ttsScripts = stitching!.clipPrompts
                    .map(cp => {
                      const m = cp.match(/Narration\s*\(voiceover\)\s*:\s*"([^"]+)"/i);
                      return m?.[1]?.trim() ?? '';
                    })
                    .filter(Boolean);
                  if (ttsScripts.length > 0) {
                    console.log(`[pollVeo] TTS: estratte ${ttsScripts.length} narrazioni dai clipPrompts (fallback)`);
                  }
                }

                if (ttsScripts.length > 0) {
                  const jobLang = (p.language as string | undefined) ?? 'it';

                  // 4. Selezione provider TTS — stessa logica del resto del sistema:
                  //    prima cerca OpenAI (supporto voce più naturale),
                  //    poi fallback a Google/Gemini (stessa API key del video, zero configurazione extra).
                  //    Entrambi vengono passati a stitchClips: se il primario fallisce, il fallback subentra automaticamente.
                  const openaiProv = await prisma.aIProviderConfig.findFirst({
                    where: { tenantId: job.tenantId, provider: 'openai', isActive: true },
                    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
                  });

                  const googleTtsOpts = {
                    scripts: ttsScripts,
                    apiKey: providerConfig.apiKey,
                    provider: 'google' as const,
                    language: jobLang,
                  };

                  if (openaiProv?.apiKey) {
                    ttsOptions = {
                      scripts: ttsScripts,
                      apiKey: openaiProv.apiKey,
                      provider: 'openai',
                      language: jobLang,
                    };
                    // Google come fallback automatico se OpenAI fallisce
                    fallbackTtsOptions = googleTtsOpts;
                    console.log(`[pollVeo] TTS configurato: provider=openai (fallback=google), ${ttsScripts.length} scene`);
                  } else {
                    // Solo Google disponibile
                    ttsOptions = googleTtsOpts;
                    console.log(`[pollVeo] TTS configurato: provider=google/gemini, ${ttsScripts.length} scene`);
                  }
                } else {
                  console.log('[pollVeo] TTS saltato: nessun script di narrazione trovato nel payload (_storyboard, clipPrompts, ttsScripts)');
                }
              } catch (ttsSetupErr) {
                console.warn('[pollVeo] Setup TTS fallito (non critico):', ttsSetupErr instanceof Error ? ttsSetupErr.message : ttsSetupErr);
              }
            }

            let finalUrl = persistedUrl;
            let stitchingError: string | undefined;
            try {
              const stitchResult = await stitchClips(stitching!, job.tenantId, (p.siteId as string | null) ?? null, ttsOptions, fallbackTtsOptions);
              finalUrl = stitchResult.url;
              if (stitchResult.ttsError) {
                // TTS fallito ma video generato — logga l'errore come warning nel job
                console.error(`[pollVeo] ⚠️ TTS fallito: ${stitchResult.ttsError}`);
                stitchingError = `Video generato senza audio (TTS fallito: ${stitchResult.ttsError})`;
              }
              console.log(`[pollVeo] Stitching completato (${stitching!.clips.length} clip${ttsOptions && !stitchResult.ttsError ? ' + TTS audio' : ''}) → ${finalUrl}`);
            } catch (e) {
              stitchingError = e instanceof Error ? e.message : String(e);
              console.error('[pollVeo] Concatenazione fallita (fallback all\'ultima clip):', stitchingError);
              // Fallback: usa ultima clip disponibile
              finalUrl = completedClipUrls[completedClipUrls.length - 1] ?? persistedUrl;
            }

            const videoModel = (p.videoModel as string) ?? providerConfig.videoModel ?? 'veo-3.0-generate-001';
            const savedPromptInfo = p._promptInfo as object | undefined;

            await gj().update({
              where: { id: job.id },
              data: {
                status: 'COMPLETED',
                result: JSON.stringify({
                  url: finalUrl,
                  videoUrl: finalUrl,
                  mimeType: 'video/mp4',
                  model: videoModel,
                  tokensConsumed: (check.tokens ?? VIDEO_TOKEN_ESTIMATE) * stitching!.clips.length,
                  stitching: {
                    totalDuration: stitching!.totalDuration,
                    clips: stitching!.clips.length,
                    clipUrls: completedClipUrls,
                    stitchingError: stitchingError ?? null,
                  },
                  ...(savedPromptInfo ? { promptInfo: savedPromptInfo } : {}),
                }),
                errorMessage: stitchingError ? `Stitching parziale: ${stitchingError}` : null,
                payload: JSON.stringify({ ...p, operationName: undefined, _promptInfo: undefined, _stitching: { ...stitching } }),
              },
            });

            if (job.relatedPostId && finalUrl) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (prisma.scheduledPost.update as any)({
                where: { id: job.relatedPostId },
                data: { mediaUrls: JSON.stringify([finalUrl]), mediaReady: 'READY' },
              }).catch(() => {});
            }

            emitJobUpdate({ jobId: job.id, tenantId: job.tenantId, status: 'COMPLETED', type: 'VIDEO' });
          } else {
            // ── Avvia la prossima clip ────────────────────────────────────────────
            stitching!.currentClipIndex = nextIdx;
            stitching!.clips[nextIdx].status = 'PROCESSING';

            // Estrai ultimo frame per continuità visiva
            let referenceImage: { base64: string; mimeType: string } | undefined;
            const localPath = clipLocalPath ?? (persistedUrl ? publicUrlToLocalPath(persistedUrl) : undefined);
            if (localPath) {
              try { referenceImage = await extractLastFrame(localPath); } catch { /* no ref — text-to-video fallback */ }
            }

            const nextDuration = stitching!.clips[nextIdx].duration;
            const nextClipPrompt = stitching!.clipPrompts?.[nextIdx] ?? stitching!.finalPrompt;
            const stNegPrompt = stitching!.negativePrompt;
            let newOpName: string;
            try {
              newOpName = await startGoogleVeoOperation(
                providerConfig.apiKey,
                (p.videoModel as string) ?? providerConfig.videoModel ?? 'veo-3.0-generate-001',
                nextClipPrompt,
                stitching!.aspectRatio,
                nextDuration,
                referenceImage,
                undefined,
                stNegPrompt ? { negativePrompt: stNegPrompt } : undefined
              );
            } catch (veoErr) {
              if (isHumanInImageError(veoErr) && referenceImage) {
                console.warn(`[pollVeo] Clip ${nextIdx}: ultimo frame contiene persone → retry text-to-video`);
                newOpName = await startGoogleVeoOperation(
                  providerConfig.apiKey,
                  (p.videoModel as string) ?? providerConfig.videoModel ?? 'veo-3.0-generate-001',
                  nextClipPrompt,
                  stitching!.aspectRatio,
                  nextDuration,
                  undefined, // nessun frame di riferimento
                  undefined,
                  stNegPrompt ? { negativePrompt: stNegPrompt } : undefined
                );
              } else {
                throw veoErr;
              }
            }
            stitching!.clips[nextIdx].operationName = newOpName;

            await gj().update({
              where: { id: job.id },
              data: {
                // rimane PROCESSING
                payload: JSON.stringify({ ...p, operationName: newOpName, _stitching: stitching }),
                errorMessage: null,
              },
            });
            console.log(`[pollVeo] Avviata clip ${nextIdx + 1}/${stitching!.clips.length} per job ${job.id} (op: ${newOpName})`);
            emitJobUpdate({ jobId: job.id, tenantId: job.tenantId, status: 'PROCESSING', type: 'VIDEO' });
            // Il poller inline è già attivo (avviato in executeGenerationJob),
            // ma se il job era orfano (es. riavvio server) riavvio il loop qui.
            if (!_inlineVeoPollers.has(job.id)) startInlineVeoPolling(job.id);
          }
        } else {
          // ── RECOVERY: _stitching assente/invalido ma needsStitching=true ────────
          // Ricostruisce lo stitching trattando la clip appena completata come clip 0.
          const clipDurations = calculateClipDurations(totalDuration);
          console.error(`[pollVeo] RECOVERY: Job ${job.id} ha duration=${totalDuration}s ma _stitching è assente/invalido (clips=${stitching?.clips?.length ?? 0}). Ricostruzione con ${clipDurations.length} clip.`);

          const videoModelR = (p.videoModel as string) ?? providerConfig.videoModel ?? 'veo-3.0-generate-001';
          const finalPromptR = (stitching as StitchingMeta | undefined)?.finalPrompt ??
            (p.prompt as string | undefined) ??
            (p.imagePrompt as string | undefined) ??
            String(p.caption ?? '').slice(0, 500);
          const aspectRatioR = (stitching as StitchingMeta | undefined)?.aspectRatio ??
            (p.videoAspectRatio as string | undefined) ??
            (p.aspectRatio as string | undefined) ?? '16:9';

          if (clipDurations.length <= 1) {
            // Recovery impossibile per singola clip — completa normalmente
            console.warn(`[pollVeo] RECOVERY: Job ${job.id} — clipDurations.length=${clipDurations.length}, completamento come singola clip`);
            const videoModelSingle = (p.videoModel as string) ?? providerConfig.videoModel ?? 'veo-3.0-generate-001';
            const savedPromptInfoSingle = p._promptInfo as object | undefined;
            await gj().update({
              where: { id: job.id },
              data: {
                status: 'COMPLETED',
                result: JSON.stringify({ url: persistedUrl, videoUrl: persistedUrl, mimeType: 'video/mp4', model: videoModelSingle, tokensConsumed: check.tokens ?? VIDEO_TOKEN_ESTIMATE, ...(savedPromptInfoSingle ? { promptInfo: savedPromptInfoSingle } : {}) }),
                errorMessage: null,
                payload: JSON.stringify({ ...p, operationName: undefined, _promptInfo: undefined }),
              },
            });
            if (job.relatedPostId && persistedUrl) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (prisma.scheduledPost.update as any)({
                where: { id: job.relatedPostId },
                data: { mediaUrls: JSON.stringify([persistedUrl]), mediaReady: 'READY' },
              }).catch(() => {});
            }
            emitJobUpdate({ jobId: job.id, tenantId: job.tenantId, status: 'COMPLETED', type: 'VIDEO' });
          } else {
            const reconstructed: StitchingMeta = {
              totalDuration,
              clips: clipDurations.map((d, i) => ({
                index: i,
                duration: d,
                status: (i === 0 ? 'COMPLETED' : 'PENDING') as 'COMPLETED' | 'PENDING',
                ...(i === 0 ? { videoUrl: persistedUrl } : {}),
              })),
              currentClipIndex: 1,
              finalPrompt: finalPromptR,
              aspectRatio: aspectRatioR,
              negativePrompt: (p._stitching as StitchingMeta | undefined)?.negativePrompt,
            };
            reconstructed.clips[1].status = 'PROCESSING';

            let recRefImage: { base64: string; mimeType: string } | undefined;
            const recLocalPath = clipLocalPath ?? (persistedUrl && isLocalUrl(persistedUrl) ? publicUrlToLocalPath(persistedUrl) : undefined);
            if (recLocalPath) {
              try { recRefImage = await extractLastFrame(recLocalPath); } catch { /* no ref — text-to-video fallback */ }
            }

            const recNegPrompt = reconstructed.negativePrompt;
            let recOpName: string;
            try {
              recOpName = await startGoogleVeoOperation(
                providerConfig.apiKey,
                videoModelR,
                reconstructed.clipPrompts?.[1] ?? finalPromptR,
                aspectRatioR,
                reconstructed.clips[1].duration,
                recRefImage,
                undefined,
                recNegPrompt ? { negativePrompt: recNegPrompt } : undefined
              );
            } catch (veoErr) {
              if (isHumanInImageError(veoErr) && recRefImage) {
                console.warn('[pollVeo] RECOVERY clip 2: frame contiene persone → retry text-to-video');
                recOpName = await startGoogleVeoOperation(
                  providerConfig.apiKey,
                  videoModelR,
                  reconstructed.clipPrompts?.[1] ?? finalPromptR,
                  aspectRatioR,
                  reconstructed.clips[1].duration,
                  undefined,
                  undefined,
                  recNegPrompt ? { negativePrompt: recNegPrompt } : undefined
                );
              } else {
                throw veoErr;
              }
            }
            reconstructed.clips[1].operationName = recOpName;

            await gj().update({
              where: { id: job.id },
              data: {
                payload: JSON.stringify({ ...p, operationName: recOpName, _stitching: reconstructed }),
                errorMessage: null,
              },
            });
            console.log(`[pollVeo] RECOVERY completata per job ${job.id}: avviata clip 2/${clipDurations.length} (op: ${recOpName})`);
            emitJobUpdate({ jobId: job.id, tenantId: job.tenantId, status: 'PROCESSING', type: 'VIDEO' });
            if (!_inlineVeoPollers.has(job.id)) startInlineVeoPolling(job.id);
          }
        }
        continue; // GUARD: non raggiunge mai il path singola-clip quando needsStitching=true
      }

      // ── Singola clip: completa normalmente (solo per duration <= VEO_CLIP_MAX) ─
      const videoModel = (p.videoModel as string) ?? providerConfig.videoModel ?? 'veo-3.0-generate-001';
      const savedPromptInfo = p._promptInfo as object | undefined;

      await gj().update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          result: JSON.stringify({
            url: persistedUrl,
            videoUrl: persistedUrl,
            mimeType: 'video/mp4',
            model: videoModel,
            tokensConsumed: check.tokens ?? VIDEO_TOKEN_ESTIMATE,
            ...(savedPromptInfo ? { promptInfo: savedPromptInfo } : {}),
          }),
          errorMessage: null,
          payload: JSON.stringify({ ...p, operationName: undefined, _promptInfo: undefined }),
        },
      });

      if (job.relatedPostId && persistedUrl) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.scheduledPost.update as any)({
          where: { id: job.relatedPostId },
          data: { mediaUrls: JSON.stringify([persistedUrl]), mediaReady: 'READY' },
        }).catch(() => {});
      }

      emitJobUpdate({ jobId: job.id, tenantId: job.tenantId, status: 'COMPLETED', type: 'VIDEO' });
      console.log(`[pollVeo] Completato job ${job.id} → ${persistedUrl}`);

    } catch (err) {
      console.error(`[pollVeo] Polling job ${job.id} fallito:`, err);
      // Non segna come FAILED — riproverà al prossimo ciclo
    }
  }
}
export async function enqueueMediaJob(opts: {
  tenantId: string;
  postId: string;
  type?: 'IMAGE' | 'MANUAL';
  scheduledFor?: Date | null;
  priority?: number;
  payload?: Record<string, unknown>;
}) {
  const type = opts.type ?? 'MANUAL';
  const priority = opts.priority ?? (opts.scheduledFor ? Math.max(0, Math.floor((opts.scheduledFor.getTime() - Date.now()) / (1000 * 60 * 60))) : 50);

  await gj().create({
    data: {
      tenantId: opts.tenantId,
      type,
      status: 'PENDING',
      relatedPostId: opts.postId,
      scheduledFor: opts.scheduledFor,
      priority: Math.min(100, Math.max(0, priority)),
      payload: JSON.stringify(opts.payload ?? {}),
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.scheduledPost.update as any)({
    where: { id: opts.postId },
    data: { mediaReady: 'PENDING' },
  });
}

// ─── Marca un post come "media pronto" ─────────────────────────
export async function markMediaReady(postId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.scheduledPost.update as any)({
    where: { id: postId },
    data: { mediaReady: 'READY' },
  });
  // Completa eventuali job pending collegati
  try {
    await gj().updateMany({
      where: { relatedPostId: postId, status: { in: ['PENDING', 'MANUAL_UPLOAD', 'WAITING_TOKENS'] } },
      data: { status: 'COMPLETED' },
    });
  } catch { /* Prisma client vecchio */ }
}

// ─── PUBBLICAZIONE POST SCHEDULATI ──────────────────────────────
export async function processDuePublications() {
  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const duePosts = await (prisma.scheduledPost.findMany as any)({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { lte: now },
      // Pubblica SOLO se il media è pronto (o non richiesto)
      mediaReady: { in: ['READY', 'NONE'] },
    },
    include: { account: true, facebookAccount: true, tiktokAccount: true },
    take: 10,
  });

  for (const post of duePosts) {
    await publishPost(post.id);
  }
}

// ─── Pubblica un singolo post (routing per piattaforma) ─────────
/**
 * Risolve un URL relativo (/uploads/...) in un URL assoluto pubblicamente accessibile.
 * Richiede APP_BASE_URL in .env.local per funzionare con Instagram/Facebook/TikTok.
 */
function resolvePublicMediaUrl(url: string): string {
  if (!url) return url;
  // Già assoluto
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  // Relativo: usa APP_BASE_URL
  const base = (process.env.APP_BASE_URL ?? '').replace(/\/$/, '');
  if (!base) {
    throw new Error(
      `URL media relativo (${url}) richiede APP_BASE_URL in .env.local. ` +
      `Imposta APP_BASE_URL con l'URL pubblico dell'app (es. ngrok in dev, dominio in prod).`
    );
  }
  const absUrl = `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  // Avviso se localhost (Instagram non può accedere a localhost)
  if (absUrl.includes('localhost') || absUrl.includes('127.0.0.1')) {
    console.warn(
      `[publishPost] ATTENZIONE: URL media punta a localhost (${absUrl}). ` +
      `Instagram/Facebook/TikTok non possono accedere a localhost. ` +
      `Usa ngrok e imposta APP_BASE_URL all'URL ngrok pubblico.`
    );
  }
  return absUrl;
}

export async function publishPost(postId: string): Promise<{ success: boolean; error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const post = await (prisma.scheduledPost.findUnique as any)({
    where: { id: postId },
    include: { account: true, facebookAccount: true, tiktokAccount: true },
  });

  if (!post) return { success: false, error: 'Post non trovato' };

  // Blocca pubblicazione se il media non è pronto
  if (post.mediaReady !== 'READY' && post.mediaReady !== 'NONE') {
    return { success: false, error: `Media non pronto (stato: ${post.mediaReady}). Attendi la generazione AI.` };
  }

  await prisma.scheduledPost.update({
    where: { id: postId },
    data: { status: 'PUBLISHING' },
  });

  const platform = post.platform ?? 'INSTAGRAM';

  try {
    const mediaUrls: string[] = JSON.parse(post.mediaUrls || '[]');
    // Risolvi tutti gli URL relativi in URL assoluti prima di inviare alle API social
    const publicMediaUrls = mediaUrls.map(resolvePublicMediaUrl);
    const coverUrlPublic = post.coverUrl ? resolvePublicMediaUrl(post.coverUrl) : undefined;

    // ── Pre-flight check: URL accessibili da internet? ─────────────────────
    // Instagram/Facebook/TikTok scaricano il media dal server — localhost non è accessibile.
    const appBase = (process.env.APP_BASE_URL ?? '').toLowerCase();
    const isLocalBase = !appBase || appBase.includes('localhost') || appBase.includes('127.0.0.1');
    if (isLocalBase && publicMediaUrls.some(u => u.includes('localhost') || u.includes('127.0.0.1') || u.startsWith('http://localhost') || u.startsWith('http://127'))) {
      throw new Error(
        `Il media non è raggiungibile da Instagram/Facebook: l'URL punta a localhost (${publicMediaUrls[0]}). ` +
        `Per pubblicare devi rendere il server accessibile da internet: ` +
        `1) Installa ngrok  2) Esegui: ngrok http 3010  ` +
        `3) Aggiorna APP_BASE_URL e NEXT_PUBLIC_APP_BASE_URL in .env.local con l'URL ngrok (es. https://abc.ngrok-free.app)  ` +
        `4) Riavvia il server`
      );
    }

    const caption = post.caption
      ? `${post.caption}\n\n${JSON.parse(post.hashtags || '[]').join(' ')}`
      : JSON.parse(post.hashtags || '[]').join(' ');

    const isVideo = post.mediaType === 'VIDEO';
    let platformPostId: string;
    const updateData: Record<string, unknown> = {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      error: null,
    };

    if (platform === 'FACEBOOK') {
      if (!post.facebookAccount) throw new Error('Account Facebook non configurato');
      const { FacebookClient } = await import('./facebook');
      const fbClient = new FacebookClient(post.facebookAccount.accessToken, post.facebookAccount.pageId);
      switch (post.type) {
        case 'POST':
          if (publicMediaUrls.length > 1) platformPostId = await fbClient.createCarouselPost(publicMediaUrls, caption);
          else if (publicMediaUrls.length === 1) {
            platformPostId = isVideo
              ? await fbClient.createVideoPost(publicMediaUrls[0], caption)
              : await fbClient.createPhotoPost(publicMediaUrls[0], caption);
          }
          else platformPostId = await fbClient.createTextPost(caption);
          break;
        case 'STORY': platformPostId = await fbClient.createStory(publicMediaUrls[0], isVideo); break;
        case 'REEL':  platformPostId = await fbClient.createVideoPost(publicMediaUrls[0], caption); break;
        default:      platformPostId = await fbClient.createTextPost(caption);
      }
      updateData.facebookPostId = platformPostId;

    } else if (platform === 'TIKTOK') {
      if (!post.tiktokAccount) throw new Error('Account TikTok non configurato');
      const { TikTokClient } = await import('./tiktok');
      const ttClient = new TikTokClient(post.tiktokAccount.accessToken, post.tiktokAccount.openId);
      switch (post.type) {
        case 'REEL':
        case 'STORY':
          if (!publicMediaUrls[0]) throw new Error('URL video richiesto per TikTok');
          platformPostId = await ttClient.publishVideo(publicMediaUrls[0], caption);
          break;
        default:
          if (!publicMediaUrls.length) throw new Error('URL media richiesto per TikTok post');
          platformPostId = await ttClient.publishPhoto(publicMediaUrls, caption);
      }
      updateData.tiktokPostId = platformPostId;

    } else {
      // Instagram
      if (!post.account) throw new Error('Account Instagram non configurato');
      const { InstagramClient } = await import('./instagram');
      const igClient = new InstagramClient(post.account.accessToken, post.account.businessAccountId);
      switch (post.type) {
        case 'POST':
          if (publicMediaUrls.length > 1) {
            platformPostId = await igClient.createCarouselPost(publicMediaUrls, caption);
          } else if (isVideo) {
            // I video in un POST regolare su Instagram vengono pubblicati come Reel
            platformPostId = await igClient.createReel(publicMediaUrls[0], caption, coverUrlPublic);
          } else {
            platformPostId = await igClient.createImagePost(publicMediaUrls[0], caption);
          }
          break;
        case 'STORY':
          platformPostId = isVideo
            ? await igClient.createVideoStory(publicMediaUrls[0])
            : await igClient.createImageStory(publicMediaUrls[0]);
          break;
        case 'REEL':
          platformPostId = await igClient.createReel(publicMediaUrls[0], caption, coverUrlPublic);
          break;
        default:
          platformPostId = await igClient.createImagePost(publicMediaUrls[0], caption);
      }
      updateData.instagramPostId = platformPostId;
    }

    await prisma.scheduledPost.update({ where: { id: postId }, data: updateData });
    return { success: true };

  } catch (err) {
    const error = err instanceof Error ? err.message : 'Errore sconosciuto';
    const retryCount = (post.retryCount ?? 0) + 1;
    // Errori permanenti (configurazione) → non riprovare automaticamente
    const isPermanentError = error.includes('localhost') || error.includes('ngrok') ||
      error.includes('non configurato') || error.includes('access token');
    await prisma.scheduledPost.update({
      where: { id: postId },
      data: {
        status: (isPermanentError || retryCount >= 3) ? 'FAILED' : 'SCHEDULED',
        error,
        retryCount,
        ...(!isPermanentError && retryCount < 3 && { scheduledAt: new Date(Date.now() + 5 * 60 * 1000) }),
      },
    });
    return { success: false, error };
  }
}

// ─── REGOLE SCHEDULER AUTOMATICO ────────────────────────────────
// ⚠️  CREA BOZZE (non SCHEDULED) + job in coda. Il post verrà schedulato
//    dall'operatore dopo aver verificato il media generato/caricato.
export async function processSchedulerRules() {
  const rules = await prisma.schedulerRule.findMany({ where: { isActive: true } });

  const instagramClient = await createInstagramClient();
  if (!instagramClient) return;

  const account = await prisma.instagramAccount.findFirst({ where: { isActive: true } });
  if (!account) return;

  for (const rule of rules) {
    try {
      const now = new Date();
      const preferredTimes: string[] = JSON.parse(rule.preferredTimes || '[]');
      const activeDays: number[] = JSON.parse(rule.activeDays || '[1,2,3,4,5,6,0]');
      const aiTopics: string[] = JSON.parse(rule.aiTopics || '[]');

      if (!activeDays.includes(now.getDay())) continue;

      const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay   = new Date(now); endOfDay.setHours(23, 59, 59, 999);

      const todayPosts = await prisma.scheduledPost.count({
        where: { accountId: account.id, type: 'POST', status: { in: ['SCHEDULED', 'PUBLISHED', 'DRAFT'] }, scheduledAt: { gte: startOfDay, lte: endOfDay } },
      });
      const todayStories = await prisma.scheduledPost.count({
        where: { accountId: account.id, type: 'STORY', status: { in: ['SCHEDULED', 'PUBLISHED', 'DRAFT'] }, scheduledAt: { gte: startOfDay, lte: endOfDay } },
      });

      if (todayPosts < rule.postsPerDay) {
        await autoCreateDraftPost({ accountId: account.id, type: 'POST', aiTone: rule.aiTone as never, aiLanguage: rule.aiLanguage, aiTopics, siteUrl: rule.siteUrl ?? undefined, preferredTimes, existingCount: todayPosts, tenantId: rule.tenantId ?? '' });
      }
      if (todayStories < rule.storiesPerDay) {
        await autoCreateDraftPost({ accountId: account.id, type: 'STORY', aiTone: rule.aiTone as never, aiLanguage: rule.aiLanguage, aiTopics, siteUrl: rule.siteUrl ?? undefined, preferredTimes, existingCount: todayStories, tenantId: rule.tenantId ?? '' });
      }
    } catch (err) {
      console.error(`Errore regola scheduler ${rule.id}:`, err);
    }
  }
}

interface AutoCreateParams {
  accountId: string;
  tenantId: string;
  type: 'POST' | 'STORY' | 'REEL';
  aiTone: 'professional' | 'friendly' | 'funny' | 'inspirational' | 'luxury' | 'minimal';
  aiLanguage: string;
  aiTopics: string[];
  siteUrl?: string;
  preferredTimes: string[];
  existingCount: number;
}

// ── Crea una BOZZA AI + accoda il job di generazione media ───────
async function autoCreateDraftPost(params: AutoCreateParams) {
  let siteContext = '';
  if (params.siteUrl) {
    const scraped = await scrapeSite(params.siteUrl);
    siteContext = buildSiteContext(scraped);
  }

  const topic = params.aiTopics[Math.floor(Math.random() * params.aiTopics.length)] || 'brand lifestyle';

  const aiResult = await generateContent({
    type: 'full_post',
    topic,
    siteContext,
    tone: params.aiTone,
    language: params.aiLanguage,
    postType: params.type,
  }, params.tenantId || undefined);

  const scheduledAt = getNextAvailableTime(params.preferredTimes, params.existingCount);

  const post = await prisma.scheduledPost.create({
    data: {
      type: params.type,
      status: 'DRAFT',
      caption: aiResult.caption,
      hashtags: JSON.stringify(aiResult.hashtags ?? []),
      mediaUrls: '[]',
      mediaType: 'IMAGE',
      aiGenerated: true,
      aiModel: aiResult.model,
      aiPrompt: topic,
      scheduledAt,
      accountId: params.accountId,
      mediaReady: 'PENDING',
    },
  });

  if (params.tenantId) {
    try {
      const imagePrompt = [
        `Professional Instagram ${params.type.toLowerCase()} image.`,
        `Topic: ${topic}.`,
        aiResult.caption ? `Context: ${aiResult.caption.slice(0, 200)}.` : '',
        'Style: modern, high-quality photography, vivid colors, commercial look.',
      ].filter(Boolean).join(' ');

      await gj().create({
        data: {
          tenantId: params.tenantId,
          type: 'IMAGE',
          status: 'PENDING',
          relatedPostId: post.id,
          scheduledFor: scheduledAt,
          priority: Math.min(100, Math.max(0, Math.floor((scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60)))),
          payload: JSON.stringify({ imagePrompt, topic, postType: params.type, siteUrl: params.siteUrl, caption: aiResult.caption }),
        },
      });
    } catch { /* Prisma client vecchio */ }
  }
}

function getNextAvailableTime(preferredTimes: string[], offset: number): Date {
  const now = new Date();
  const times = preferredTimes.length > 0 ? preferredTimes : ['09:00', '12:00', '18:00', '20:00'];
  const time = times[offset % times.length];
  const [h, m] = time.split(':').map(Number);
  const scheduled = new Date(now);
  scheduled.setHours(h, m, 0, 0);
  if (scheduled <= now) scheduled.setDate(scheduled.getDate() + 1);
  return scheduled;
}

async function cleanupOldLogs() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  await prisma.aIGenerationLog.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } });
  // Pulisci anche i job completati più vecchi di 7 giorni
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    await gj().deleteMany({
      where: { status: 'COMPLETED', updatedAt: { lt: sevenDaysAgo } },
    });
  } catch { /* Prisma client vecchio */ }
}

// ─── AUTO-SYNC ANALYTICS ────────────────────────────────────────
// Controlla se è il momento di fare la sync automatica e la esegue.
// Chiamato ogni 30 minuti dal cron.

const ANALYTICS_CONFIG_KEY = 'analytics_auto_sync';

// ─── Minimal CRON expression matcher ────────────────────────────
// Supporta: * n n,m n-m */n  (5 campi: min ora dom mese dow)

function parseCronField(field: string, min: number, max: number): number[] {
  const values: number[] = [];
  for (const part of field.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) values.push(i);
    } else if (part.startsWith('*/')) {
      const step = parseInt(part.slice(2));
      for (let i = min; i <= max; i += step) values.push(i);
    } else if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      for (let i = a; i <= b; i++) values.push(i);
    } else {
      values.push(parseInt(part));
    }
  }
  return values;
}

/** Verifica se un'espressione CRON standard a 5 campi corrisponde alla data data */
function matchesCron(expr: string, date: Date): boolean {
  try {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return false;
    const [minF, hourF, domF, monF, dowF] = parts;
    const minutes  = parseCronField(minF,  0, 59);
    const hours    = parseCronField(hourF, 0, 23);
    const doms     = parseCronField(domF,  1, 31);
    const months   = parseCronField(monF,  1, 12);
    const dows     = parseCronField(dowF,  0, 6);
    return (
      minutes.includes(date.getMinutes()) &&
      hours.includes(date.getHours()) &&
      doms.includes(date.getDate()) &&
      months.includes(date.getMonth() + 1) &&
      dows.includes(date.getDay())
    );
  } catch { return false; }
}

/** Verifica se l'espressione CRON è "scattata" nella finestra [since, now] */
function cronFiredInWindow(expr: string, since: Date, now: Date): boolean {
  // Itera minuto per minuto nella finestra (max 90 min per sicurezza)
  const windowMs = Math.min(now.getTime() - since.getTime(), 90 * 60 * 1000);
  const steps = Math.ceil(windowMs / 60000);
  for (let i = 0; i <= steps; i++) {
    const t = new Date(now.getTime() - i * 60000);
    t.setSeconds(0, 0);
    if (matchesCron(expr, t)) return true;
  }
  return false;
}

/** Verifica se la piattaforma deve essere sincronizzata ora in base alla configurazione */
function shouldSyncPlatform(
  config: AutoSyncConfig,
  platform: 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK',
  now: Date
): boolean {
  if (!config.platforms.includes(platform)) return false;
  const lastSyncStr = config.lastSync?.[platform];
  const lastSync = lastSyncStr ? new Date(lastSyncStr) : null;

  // ─ Modalità CRON personalizzato ─────────────────────────────
  if (config.mode === 'cron') {
    if (!config.customCron) return false;
    const since = lastSync ?? new Date(0);
    return cronFiredInWindow(config.customCron, since, now);
  }

  // ─ Modalità Preset ──────────────────────────────────────────
  const hours: number[] = (config.hours?.length ? config.hours : [config.hour ?? 2]).sort((a, b) => a - b);
  const weekdays: number[] = config.weekdays ?? [];
  const monthdays: number[] = config.monthdays ?? [];

  // Filtro giorno della settimana
  if (weekdays.length > 0 && !weekdays.includes(now.getDay())) return false;

  // Filtro giorno del mese
  if (monthdays.length > 0 && !monthdays.includes(now.getDate())) return false;

  if (config.frequency === 'hourly') {
    // Ogni ora, minuto 0 → controlla se siamo abbastanza vicini al top dell'ora
    const slotHour = new Date(now); slotHour.setMinutes(0, 0, 0);
    return !lastSync || lastSync < slotHour;
  }

  // Per daily/weekly/monthly: trova l'ultimo slot orario passato oggi
  const passedSlots = hours
    .filter(h => now.getHours() > h || (now.getHours() === h && now.getMinutes() >= 0))
    .map(h => { const d = new Date(now); d.setHours(h, 0, 0, 0); return d; })
    .sort((a, b) => b.getTime() - a.getTime());

  if (!passedSlots.length) return false;
  const latestSlot = passedSlots[0];
  return !lastSync || lastSync < latestSlot;
}

export async function maybeRunAnalyticsSync(): Promise<void> {
  try {
    const row = await prisma.config.findUnique({ where: { key: ANALYTICS_CONFIG_KEY } });
    if (!row) return;
    const config: AutoSyncConfig = JSON.parse(row.value);
    if (!config.enabled) return;

    const now = new Date();
    const toSync = (['INSTAGRAM', 'FACEBOOK', 'TIKTOK'] as const).filter(p =>
      shouldSyncPlatform(config, p, now)
    );
    if (!toSync.length) return;

    console.log(`[Analytics Auto-Sync] Avvio sync per: ${toSync.join(', ')}`);
    const updatedLastSync = { ...(config.lastSync ?? {}) };

    for (const platform of toSync) {
      try {
        if (platform === 'INSTAGRAM') await autoSyncInstagram();
        if (platform === 'FACEBOOK') await autoSyncFacebook();
        if (platform === 'TIKTOK') await autoSyncTikTok();
        updatedLastSync[platform] = new Date().toISOString();
        console.log(`[Analytics Auto-Sync] ✅ ${platform}`);
      } catch (err) {
        console.error(`[Analytics Auto-Sync] ❌ ${platform}:`, err instanceof Error ? err.message : err);
      }
    }

    // Salva lastSync aggiornato
    const updatedConfig: AutoSyncConfig = { ...config, lastSync: updatedLastSync };
    await prisma.config.update({
      where: { key: ANALYTICS_CONFIG_KEY },
      data: { value: JSON.stringify(updatedConfig) },
    });
  } catch (err) {
    console.error('[Analytics Auto-Sync] Errore generale:', err);
  }
}

async function autoSyncInstagram(): Promise<void> {
  const accounts = await prisma.instagramAccount.findMany({ where: { isActive: true } });
  for (const account of accounts) {
    try {
      const { InstagramClient } = await import('./instagram');
      const client = new InstagramClient(account.accessToken, account.businessAccountId);
      const [profile, insights] = await Promise.all([
        client.getProfile(),
        client.getAccountInsights('day').catch(() => [] as Awaited<ReturnType<InstanceType<typeof InstagramClient>['getAccountInsights']>>),
      ]);
      const mm: Record<string, number> = {};
      insights.forEach(m => {
        const v = m.values?.[m.values.length - 1]?.value;
        mm[m.name] = typeof v === 'number' ? v : 0;
      });
      await prisma.instagramMetrics.create({
        data: {
          followersCount: profile.followersCount,
          mediaCount: profile.mediaCount,
          impressions: mm['impressions'] ?? mm['views'] ?? 0,
          reach: mm['reach'] ?? 0,
          profileViews: mm['profile_views'] ?? 0,
          websiteClicks: mm['website_clicks'] ?? 0,
          accountId: account.id,
        },
      });
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: { followersCount: profile.followersCount, postsCount: profile.mediaCount, username: profile.username },
      });
    } catch (err) {
      console.error(`[Auto-Sync IG] account ${account.id}:`, err instanceof Error ? err.message : err);
    }
  }
}

async function autoSyncFacebook(): Promise<void> {
  const accounts = await prisma.facebookAccount.findMany({ where: { isActive: true } });
  for (const account of accounts) {
    try {
      const { FacebookClient } = await import('./facebook');
      const client = new FacebookClient(account.accessToken, account.pageId);
      const [profile, insights] = await Promise.all([
        client.getProfile(),
        client.getPageInsights('day').catch(() => [] as Awaited<ReturnType<InstanceType<typeof FacebookClient>['getPageInsights']>>),
      ]);
      const mm: Record<string, number> = {};
      insights.forEach(m => {
        const v = m.values?.[m.values.length - 1]?.value;
        mm[m.name] = typeof v === 'number' ? v : 0;
      });
      await prisma.facebookMetrics.create({
        data: {
          followersCount: profile.followersCount,
          impressions: mm['page_impressions'] ?? 0,
          reach: mm['page_reach'] ?? 0,
          pageViews: mm['page_views_total'] ?? 0,
          reactions: mm['page_post_engagements'] ?? 0,
          accountId: account.id,
        },
      });
      await prisma.facebookAccount.update({
        where: { id: account.id },
        data: { followersCount: profile.followersCount, pageName: profile.name },
      });
    } catch (err) {
      console.error(`[Auto-Sync FB] account ${account.id}:`, err instanceof Error ? err.message : err);
    }
  }
}

async function autoSyncTikTok(): Promise<void> {
  const accounts = await prisma.tikTokAccount.findMany({ where: { isActive: true } });
  for (const account of accounts) {
    try {
      const { TikTokClient } = await import('./tiktok');
      const client = new TikTokClient(account.accessToken, account.openId);
      const profile = await client.getProfile();
      await prisma.tikTokMetrics.create({
        data: { followersCount: profile.followersCount, accountId: account.id },
      });
      await prisma.tikTokAccount.update({
        where: { id: account.id },
        data: { followersCount: profile.followersCount, displayName: profile.displayName, username: profile.username },
      });
    } catch (err) {
      console.error(`[Auto-Sync TT] account ${account.id}:`, err instanceof Error ? err.message : err);
    }
  }
}

export function restartRuleJob(ruleId: string, cronExpression: string, handler: () => void) {  const existing = activeJobs.get(ruleId);
  if (existing) { existing.stop(); activeJobs.delete(ruleId); }
  if (cron.validate(cronExpression)) {
    const job = cron.schedule(cronExpression, handler);
    activeJobs.set(ruleId, job);
  }
}
