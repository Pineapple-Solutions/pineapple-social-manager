// src/lib/ai-client.ts — Client AI unificato (OpenAI, Claude, Gemini)

import fs from 'fs';
import pathModule from 'path';
import { prisma } from './db';
import type { AIGenerationRequest, AIGenerationResult, ContentIdeaData, PostType } from '@/types';

// ─── Errori specifici per la gestione della coda ────────────────

/**
 * Sollevato quando la richiesta supera il timeout verso l'API Google.
 * Il job deve restare PENDING e riprovare dopo qualche minuto (non esponenziale).
 */
export class ApiTimeoutError extends Error {
  constructor(public readonly model: string, public readonly timeoutMs: number) {
    super(`Timeout generazione immagine per "${model}" (${timeoutMs / 1000}s). L'API Google sta impiegando troppo tempo — riprovo tra pochi minuti.`);
    this.name = 'ApiTimeoutError';
  }
}

/**
 * Sollevato per HTTP 429 da RATE LIMIT RPM (richieste al minuto).
 * Il job deve restare PENDING e riprovare dopo pochi secondi, senza sprecare tentativi.
 */
export class RateLimitError extends Error {
  constructor(
    public readonly model: string,
    public readonly retryAfterMs: number
  ) {
    const secs = Math.round(retryAfterMs / 1000);
    super(`Limite richieste al minuto raggiunto per "${model}". Riprovo tra ${secs}s.`);
    this.name = 'RateLimitError';
  }
}

/**
 * Sollevato quando il modello non restituisce immagini (risponde con solo testo).
 * Non è un errore transitorio: non ha senso ritentare — il job va in FAILED immediato
 * con un messaggio che suggerisce di cambiare modello.
 */
export class NoImageGeneratedError extends Error {
  constructor(public readonly model: string, public readonly partsCount: number) {
    super(
      `Il modello "${model}" ha risposto con ${partsCount} parte/i di testo ma nessuna immagine. ` +
      `Questo modello probabilmente non supporta la generazione di immagini con la configurazione attuale. ` +
      `Vai in Impostazioni → Provider AI e cambia il modello immagini. ` +
      `Modelli consigliati: "gemini-2.5-flash-preview-image-generation" ⭐, "imagen-4.0-generate-001".`
    );
    this.name = 'NoImageGeneratedError';
  }
}

/**
 * Sollevato quando il modello non esiste (HTTP 404).
 * Il job va in FAILED immediatamente — non ha senso riprovare.
 */
export class ModelNotFoundError extends Error {
  constructor(public readonly model: string) {
    super(
      `Il modello "${model}" non esiste nell'API Google (404). ` +
      `Vai in Impostazioni → Provider AI → clicca 🔬 Diagnostica sul provider Google ` +
      `per scoprire i nomi API reali dei modelli disponibili con la tua chiave, poi selezionane uno.`
    );
    this.name = 'ModelNotFoundError';
  }
}

/**
 * Sollevato per HTTP 429 da QUOTA ESAURITA (giornaliera/settimanale/per-modello).
 * Il job va in WAITING_TOKENS fino al reset della quota.
 * Nota: la quota immagini AI è separata dalla quota testo — non visibile nel dashboard
 * generale di Google AI Studio (che mostra solo i token testo).
 */
export class QuotaExceededError extends Error {
  public readonly retryAt: Date;
  /** true quando la quota è permanentemente 0 (modello non disponibile su questo tier) */
  public readonly isPermanentBlock: boolean;
  constructor(
    public readonly model: string,
    retryAt: Date,
    detail?: string,
    isPermanentBlock = false
  ) {
    const now = Date.now();
    const diffMs = Math.max(0, retryAt.getTime() - now);
    const mins = Math.round(diffMs / 60000);
    const timeStr = retryAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    // Evita duplicazione del testo "quota esaurita" nel messaggio
    const detailClean = detail?.replace(/quota api esaurita[^))]*/i, '').replace(/^\s*\(?\s*\)?\s*$/i, '').trim();
    super(
      `Quota immagini AI esaurita per "${model}" (questa quota è separata dalla quota testo). ` +
      (mins > 0
        ? `Prossimo tentativo alle ${timeStr} (tra ~${mins} min).`
        : `Riprovo a breve.`) +
      (detailClean ? ` Dettaglio: ${detailClean}` : '')
    );
    this.name = 'QuotaExceededError';
    this.retryAt = retryAt;
    this.isPermanentBlock = isPermanentBlock;
  }
}

/**
 * Analizza una risposta 429 di Google e stabilisce se è un rate limit RPM
 * o una vera quota esaurita, estraendo il delay di retry corretto.
 *
 * Distinzione:
 *  - RPM (Rate Limit): ErrorInfo.reason === "RATE_LIMIT_EXCEEDED"
 *    oppure messaggio "Resource has been exhausted" → retry breve (60-300s)
 *  - Quota: QuotaFailure violations, messaggio "current quota", retryDelay lungo
 *    → WAITING_TOKENS fino al reset quota (max 24h cap)
 *  - FreeTierBlock: metrica free_tier con limit: 0 → modello non disponibile su quel tier
 *    su piano gratuito, richiede piano a pagamento → retry 24h + messaggio billing
 */
function classifyGoogle429(resp: Response, rawText: string): {
  isRpmLimit: boolean;
  retryMs: number;
  isFreeTierBlock: boolean;
  isPermanentBlock: boolean;
} {
  console.log('[Google 429] Risposta completa:', rawText.slice(0, 600));

  let body: Record<string, unknown> | null = null;
  try { body = JSON.parse(rawText); } catch { /* non JSON */ }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const errData = (body?.error ?? {}) as Record<string, any>;
  const msg: string = errData?.message ?? '';
  const details: Array<Record<string, unknown>> = errData?.details ?? [];

  // ── Detect free_tier con limit: 0 ───────────────────────────────────────────
  // Su piani a pagamento (AI Pro ecc.) il limite free-tier è SEMPRE 0 per design:
  // la quota effettiva è quella paid-tier (visibile nel dashboard come "0% in uso").
  // Su piano GRATUITO: se limit: 0 il modello non è proprio disponibile su quel tier
  // (es. gemini-3.1-flash-image ha RPM/RPD = 0 su free tier → usa Imagen 4 invece).
  const isFreeTierBlock = /free_tier[^,\n]{0,60},\s*limit:\s*0/i.test(rawText);
  if (isFreeTierBlock) {
    // Controlla se ci sono anche violazioni paid-tier nel body → quota paid esaurita
    const hasPaidTierViolation = rawText.includes('paid_tier') &&
      /paid_tier[^,\n]{0,60},\s*limit:\s*[1-9]/i.test(rawText);
    const retryHours = hasPaidTierViolation ? 12 : 6;
    // "isPermanentBlock" = solo free_tier violations con limit: 0, nessuna paid_tier
    // Significa che il modello non ha quota su questo tier e non cambierà con il tempo
    const isPermanentBlock = !hasPaidTierViolation;
    console.log(`[Google 429] FREE TIER BLOCK (limit: 0${isPermanentBlock ? ', PERMANENTE — cambia modello in imagen-4.0-generate-001' : ' su piano paid'}). Retry tra ${retryHours}h.`);
    return { isRpmLimit: false, retryMs: retryHours * 3600_000, isFreeTierBlock: true, isPermanentBlock };
  }

  // ── Detect RPM (rate limit al minuto) ────────────────────────────────────────
  // 1. ErrorInfo con reason = RATE_LIMIT_EXCEEDED
  const hasRateLimitReason = details.some(d =>
    d['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo' &&
    (d.reason === 'RATE_LIMIT_EXCEEDED' || String(d.reason ?? '').toLowerCase().includes('rate_limit'))
  );
  // 2. Messaggio "Resource has been exhausted" (vs "current quota" che è quota esaurita)
  const isExhaustedMsg = msg.toLowerCase().includes('resource has been exhausted') &&
    !msg.toLowerCase().includes('current quota');

  const isRpmLimit = hasRateLimitReason || isExhaustedMsg;
  console.log(`[Google 429] Tipo: ${isRpmLimit ? 'RPM rate-limit' : 'quota esaurita'} | Msg: ${msg.slice(0, 120)}`);

  // ── Header Retry-After ────────────────────────────────────────────────────────
  const retryAfterHeader = resp.headers.get('Retry-After') ?? resp.headers.get('retry-after');
  if (retryAfterHeader) {
    const secs = parseInt(retryAfterHeader, 10);
    if (!isNaN(secs) && secs > 0) {
      const ms = secs * 1000;
      if (isRpmLimit) return { isRpmLimit: true, retryMs: Math.max(60_000, Math.min(ms, 300_000)), isFreeTierBlock: false, isPermanentBlock: false };
      // Quota: ignora valori < 90s (inaffidabili → cade nel fallback quotaId)
      if (ms >= 90_000) return { isRpmLimit: false, retryMs: Math.min(ms, 24 * 3600_000), isFreeTierBlock: false, isPermanentBlock: false };
    }
  }

  // ── RetryInfo.retryDelay dal body ─────────────────────────────────────────────
  for (const d of details) {
    if (d?.retryDelay) {
      const match = String(d.retryDelay).match(/^(\d+(?:\.\d+)?)s?$/);
      if (match) {
        const ms = parseFloat(match[1]) * 1000;
        if (isRpmLimit) {
          const clamped = Math.max(60_000, Math.min(ms, 300_000));
          console.log(`[Google 429] RPM retryDelay: ${ms / 1000}s → clampato a ${clamped / 1000}s`);
          return { isRpmLimit: true, retryMs: clamped, isFreeTierBlock: false, isPermanentBlock: false };
        }
        // Quota: ignora retryDelay < 90s (Google a volte invia valori brevi su quota=0)
        if (ms >= 90_000) {
          const capped = Math.min(ms, 24 * 3600_000);
          console.log(`[Google 429] Quota retryDelay: ${ms / 1000}s (${Math.round(ms / 60000)} min) → cap 24h = ${capped / 1000}s`);
          return { isRpmLimit: false, retryMs: capped, isFreeTierBlock: false, isPermanentBlock: false };
        }
        console.log(`[Google 429] Quota retryDelay: ${ms / 1000}s IGNORATO (< 90s, inaffidabile per quota) → uso finestra quota`);
      }
    }
  }

  // ── Fallback quota: calcola in base a quotaId (finestra quota) ────────────────
  if (!isRpmLimit) {
    for (const d of details) {
      const violations = d?.violations as Array<Record<string, unknown>> | undefined;
      if (!violations) continue;
      for (const v of violations) {
        const qid = String(v?.quotaId ?? '').toLowerCase();
        const nowMs = Date.now();
        if (qid.includes('day') || qid.includes('86400') || qid.includes('1440')) {
          const midnight = new Date(nowMs);
          midnight.setUTCDate(midnight.getUTCDate() + 1);
          midnight.setUTCHours(0, 0, 0, 0);
          return { isRpmLimit: false, retryMs: midnight.getTime() - nowMs, isFreeTierBlock: false, isPermanentBlock: false };
        }
        if (qid.includes('6h') || qid.includes('21600')) {
          const next6h = new Date(Math.ceil(nowMs / (6 * 3600_000)) * (6 * 3600_000));
          return { isRpmLimit: false, retryMs: next6h.getTime() - nowMs, isFreeTierBlock: false, isPermanentBlock: false };
        }
        if (qid.includes('hour') || qid.includes('3600')) {
          return { isRpmLimit: false, retryMs: 3600_000 - (nowMs % 3600_000), isFreeTierBlock: false, isPermanentBlock: false };
        }
      }
    }
    console.log('[Google 429] Nessuna info di reset → fallback quota 6 ore');
    return { isRpmLimit: false, retryMs: 6 * 3600_000, isFreeTierBlock: false, isPermanentBlock: false };
  }

  // RPM senza retryDelay esplicito → default 90 secondi
  console.log('[Google 429] RPM senza retryDelay → default 90s');
  return { isRpmLimit: true, retryMs: 90_000, isFreeTierBlock: false, isPermanentBlock: false };
}

/** Converte un errore HTTP Google in messaggio leggibile (senza JSON grezzo). */
function parseGoogleError(status: number, rawText: string, model?: string): string {
  let msg = rawText;
  try { msg = (JSON.parse(rawText)?.error?.message ?? rawText); } catch { /* usa raw */ }
  // Pulisce il testo: rimuove escape e tronca
  msg = msg.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  const modelPart = model ? ` [${model}]` : '';
  switch (status) {
    case 400:
      if (msg.includes('only available on paid') || msg.includes('upgrade'))
        return `Imagen richiede upgrade a pagamento su https://ai.dev/projects${modelPart}`;
      if (msg.includes('Unknown name') || msg.includes('Invalid JSON'))
        return `Formato richiesta non supportato da questo modello${modelPart}`;
      return `Richiesta non valida${modelPart}: ${msg}`;
    case 403:
      return `API key non autorizzata per questo modello${modelPart}`;
    case 404:
      return `Modello non trovato${modelPart} — controlla il nome in Impostazioni Provider AI`;
    case 429:
      // Il messaggio di errore completo viene costruito da RateLimitError / QuotaExceededError
      return msg.slice(0, 120) || `Limite raggiunto${modelPart}`;
    case 500: case 503:
      return `Errore server Google${modelPart} — riprova tra qualche minuto`;
    default:
      return `Errore HTTP ${status}${modelPart}: ${msg}`;
  }
}

// ─── Token tracking ─────────────────────────────────────────────
export async function trackTokenUsage(tenantId: string, provider: string, tokens: number) {
  try {
    const prov = await prisma.aIProviderConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    if (!prov) return;

    const now = new Date();
    const resetAt = prov.tokenResetAt;
    let usedToday = prov.tokensUsedToday;

    // Reset giornaliero
    if (!resetAt || now > resetAt) {
      usedToday = 0;
      await prisma.aIProviderConfig.update({
        where: { tenantId_provider: { tenantId, provider } },
        data: {
          tokensUsedToday: tokens,
          tokenResetAt: new Date(now.setHours(24, 0, 0, 0)),
        },
      });
    } else {
      await prisma.aIProviderConfig.update({
        where: { tenantId_provider: { tenantId, provider } },
        data: { tokensUsedToday: usedToday + tokens },
      });
    }
  } catch { /* non-blocking */ }
}

export async function checkTokenBudget(
  tenantId: string,
  provider: string,
  estimatedTokens = 1000
): Promise<{ ok: boolean; reason?: string; retryAfter?: Date }> {
  try {
    const prov = await prisma.aIProviderConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    if (!prov) return { ok: false, reason: 'Provider non configurato' };
    if (!prov.isActive) return { ok: false, reason: 'Provider disabilitato' };

    const now = new Date();
    // Reset se necessario
    if (!prov.tokenResetAt || now > prov.tokenResetAt) {
      return { ok: true };
    }

    const remaining = prov.maxTokensPerDay - prov.tokensUsedToday;
    if (remaining < estimatedTokens) {
      return {
        ok: false,
        reason: `Token giornalieri esauriti (${prov.tokensUsedToday}/${prov.maxTokensPerDay}). Si ripristinano a mezzanotte.`,
        retryAfter: prov.tokenResetAt,
      };
    }
    return { ok: true };
  } catch {
    return { ok: true }; // non bloccare per errori di tracking
  }
}

// ─── Carica regole prompt globali ───────────────────────────────
/** Normalizza il contentType in ingresso ai valori ammessi nella tabella DB */
function normalizeContentType(contentType: string): string {
  const ct = String(contentType ?? '').toUpperCase();
  switch (ct) {
    case 'FULL_POST':
    case 'IDEAS':
    case 'IMAGE':
    case 'POST':
      return 'POST';
    case 'STORY_TEXT':
    case 'STORY':
      return 'STORY';
    case 'REEL_SCRIPT':
    case 'REEL':
      return 'REEL';
    case 'VIDEO':
      return 'VIDEO';
    case 'CAPTION':
      return 'CAPTION';
    case 'HASHTAGS':
      return 'HASHTAGS';
    case 'ALL':
    default:
      return 'ALL';
  }
}

/**
 * Carica le regole prompt per il tenant specificato.
 * STRATEGIA a 2 query separate (fix affidabilità MySQL/Prisma con NULL in OR):
 *  1. Regole GLOBALI   (tenantId IS NULL)       — sempre caricate
 *  2. Regole SPECIFICHE (tenantId = X)           — caricate solo se tenantId fornito
 * Le regole vengono unite e ordinate per priorità DESC.
 *
 * Restituisce regole positive e negative separatamente:
 * - `rules` / `positiveRules`: regole positive (da iniettare nel prompt)
 * - `negativeRules`: regole negative (da inviare come negative prompt ai provider che lo supportano)
 * - `text`: testo formattato regole positive per il system prompt LLM
 * - `negativeText`: testo formattato regole negative (per LLM: sezione "EVITA SEMPRE")
 *
 * @param tenantId  ID tenant corrente (string) oppure null/undefined per caricare solo le globali
 * @param contentType Tipo di contenuto (es. 'REEL', 'full_post', 'IMAGE' …)
 */
export async function loadGlobalPromptRules(
  tenantId: string | null | undefined,
  contentType: string,
): Promise<{ text: string; rules: string[]; positiveRules: string[]; negativeRules: string[]; negativeText: string }> {
  try {
    const normalized = normalizeContentType(contentType);

    // Filtro contentType per le regole GLOBALI: 'ALL' ritorna TUTTE le regole "generiche";
    // altri tipi ritornano le regole 'ALL' + quelle specifiche del tipo.
    // ⚠️ Questo filtro NON si applica alle regole tenant-specific:
    //    le regole di brand di un tenant devono applicarsi SEMPRE a tutti i tipi di contenuto.
    const globalCtFilter = normalized === 'ALL'
      ? { isActive: true }                                    // nessun filtro contentType → tutte
      : { isActive: true, contentType: { in: ['ALL', normalized] } };

    // ── Query 1: regole GLOBALI (tenantId IS NULL) — filtrate per contentType ──
    const globalRecords = await prisma.globalPromptRule.findMany({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: { tenantId: null as any, ...globalCtFilter },
      orderBy: { priority: 'desc' },
    });

    // ── Query 2: regole specifiche TENANT — TUTTE le attive, senza filtro contentType ──
    // Le regole di brand si applicano sempre indipendentemente dal tipo di contenuto.
    const tenantRecords = tenantId
      ? await prisma.globalPromptRule.findMany({
          where: { tenantId, isActive: true },
          orderBy: { priority: 'desc' },
        })
      : [];

    const totalFound = globalRecords.length + tenantRecords.length;
    if (totalFound === 0) {
      console.log(`[loadGlobalPromptRules] Nessuna regola per tenantId=${tenantId ?? 'N/A'} contentType=${normalized}`);
      return { text: '', rules: [], positiveRules: [], negativeRules: [], negativeText: '' };
    }

    // Unisci e riordina per priorità DESC
    const allRecords = [...globalRecords, ...tenantRecords]
      .sort((a, b) => b.priority - a.priority);

    // Separa regole positive e negative
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const positiveRules = allRecords.filter((r) => !(r as any).isNegativePrompt).map((r) => r.rule);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const negativeRules = allRecords.filter((r) => !!(r as any).isNegativePrompt).map((r) => r.rule);

    console.log(
      `[loadGlobalPromptRules] ${globalRecords.length} globali (filtrate per ${normalized}) + ${tenantRecords.length} tenant (TUTTE attive)` +
      ` = ${allRecords.length} totali (${positiveRules.length} positive, ${negativeRules.length} negative)` +
      ` | tenantId=${tenantId ?? 'N/A'} | contentType richiesto=${normalized}`,
    );

    // ── Testo per LLM: positive → "REGOLE OBBLIGATORIE", negative → "EVITA SEMPRE" ──
    const positiveText = positiveRules.length > 0
      ? `\n\n### REGOLE OBBLIGATORIE — APPLICARE SEMPRE, SENZA ECCEZIONI:\n${positiveRules.map((r) => `- ${r}`).join('\n')}`
      : '';
    const negativeText = negativeRules.length > 0
      ? `\n\n### EVITA SEMPRE — NON FARE MAI QUESTE COSE:\n${negativeRules.map((r) => `- ${r}`).join('\n')}`
      : '';

    return {
      text: positiveText,
      rules: positiveRules,          // backward-compat: solo positive
      positiveRules,
      negativeRules,
      negativeText,
    };
  } catch (err) {
    console.error('[loadGlobalPromptRules] Errore:', err instanceof Error ? err.message : err);
    return { text: '', rules: [], positiveRules: [], negativeRules: [], negativeText: '' };
  }
}

// ─── Provider selector ──────────────────────────────────────────
async function getActiveProvider(tenantId: string) {
  const providers = await prisma.aIProviderConfig.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  if (!providers.length) throw new Error('Nessun provider AI configurato. Vai in Configurazione → Provider AI.');
  return providers[0];
}

/** Ritorna il provider migliore per generazione IMMAGINI (solo openai o google). */
async function getProviderForImages(tenantId: string) {
  // Cerca provider con 'image' in usedFor, altrimenti prende il default tra openai/google
  const imageProviders = await prisma.aIProviderConfig.findMany({
    where: { tenantId, isActive: true, provider: { in: ['openai', 'google'] } },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });

  if (!imageProviders.length) {
    // Controlla se c'è solo anthropic → messaggio utile
    const allActive = await prisma.aIProviderConfig.findMany({ where: { tenantId, isActive: true } });
    if (allActive.some((p) => p.provider === 'anthropic')) {
      throw new Error(
        'Claude (Anthropic) non supporta la generazione di immagini. ' +
        'Aggiungi un provider OpenAI o Google in Impostazioni → Provider AI per generare immagini con AI.'
      );
    }
    throw new Error('Nessun provider AI supportato per la generazione immagini. Configura OpenAI o Google in Provider AI.');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasImageModel = (p: any) => !!(p.imageEnabled || p.imageModel);

  // 1. Preferisci provider con imageEnabled=true o imageModel configurato + 'image' in usedFor
  const withImageModelAndUsedFor = imageProviders.find((p) => {
    if (!hasImageModel(p)) return false;
    try { const f: string[] = JSON.parse(p.usedFor || '[]'); return f.includes('image'); } catch { return false; }
  });
  if (withImageModelAndUsedFor) return withImageModelAndUsedFor;

  // 2. Provider con imageEnabled/imageModel configurato (senza vincolo usedFor)
  const withImageModel = imageProviders.find(hasImageModel);
  if (withImageModel) return withImageModel;

  // 3. Provider con 'image' in usedFor (retrocompat. — non ha ancora imageModel impostato)
  const withUsedFor = imageProviders.find((p) => {
    try { const f: string[] = JSON.parse(p.usedFor || '[]'); return f.includes('image'); } catch { return false; }
  });
  if (withUsedFor) return withUsedFor;

  // 4. Ultimo fallback: primo provider openai/google disponibile
  return imageProviders[0];
}

/** Ritorna il provider per generazione VIDEO (priorità: videoEnabled, poi 'video' in usedFor). */
async function getProviderForVideo(tenantId: string) {
  // Prima cerca provider con videoEnabled=true
  const videoProviders = await prisma.aIProviderConfig.findMany({
    where: { tenantId, isActive: true, videoEnabled: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  if (videoProviders.length) return videoProviders[0];

  // Fallback: cerca provider con 'video' in usedFor
  const allActive = await prisma.aIProviderConfig.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  const withVideo = allActive.find((p) => {
    try { const f: string[] = JSON.parse(p.usedFor || '[]'); return f.includes('video'); } catch { return false; }
  });
  if (withVideo) return withVideo;

  // Ultimo fallback: un provider qualsiasi (google o openai)
  const fallback = allActive.find((p) => p.provider === 'google' || p.provider === 'openai');
  if (fallback) return fallback;

  throw new Error('Nessun provider video configurato. Abilita "Video" in un provider Google/OpenAI in Provider AI.');
}

// ─── OpenAI ─────────────────────────────────────────────────────
async function callOpenAI(apiKey: string, model: string, systemPrompt: string, userPrompt: string, maxTokens = 1500) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.8,
    max_tokens: maxTokens,
  });
  return {
    text: completion.choices[0]?.message?.content ?? '',
    tokens: completion.usage?.total_tokens ?? 0,
  };
}

// ─── Anthropic (Claude) ──────────────────────────────────────────
async function callAnthropic(apiKey: string, model: string, systemPrompt: string, userPrompt: string, maxTokens = 1500) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
  return {
    text,
    tokens: (msg.usage?.input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0),
  };
}

// ─── Google Gemini ───────────────────────────────────────────────

/** Errore 503 transitorio da Google ("high demand"). */
export class GoogleServiceUnavailableError extends Error {
  constructor(model: string) {
    super(
      `Il modello "${model}" è temporaneamente sovraccarico (503 Service Unavailable). ` +
      `Google AI Studio sta ricevendo troppo traffico in questo momento — riprova tra qualche secondo.`
    );
    this.name = 'GoogleServiceUnavailableError';
  }
}

const GOOGLE_503_RETRY_DELAYS_MS = [2_000, 6_000, 15_000]; // 3 tentativi: 2s, 6s, 15s

async function callGoogle(apiKey: string, model: string, systemPrompt: string, userPrompt: string) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt });

  let lastErr: unknown;
  for (let attempt = 0; attempt <= GOOGLE_503_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const result = await genModel.generateContent(userPrompt);
      const text = result.response.text();
      const meta = result.response.usageMetadata;
      const tokens =
        meta?.totalTokenCount ??
        ((meta?.promptTokenCount ?? 0) + ((meta as Record<string, number> | undefined)?.candidatesTokenCount ?? 0));
      return { text, tokens };
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const is503 = msg.includes('503') || msg.toLowerCase().includes('service unavailable') || msg.toLowerCase().includes('high demand');
      if (!is503) throw err; // errore non-503 → rilancia subito

      const delayMs = GOOGLE_503_RETRY_DELAYS_MS[attempt];
      if (delayMs === undefined) break; // esauriti i tentativi
      console.warn(`[callGoogle] 503 dal modello "${model}" (attempt ${attempt + 1}/${GOOGLE_503_RETRY_DELAYS_MS.length + 1}) — riprovo tra ${delayMs / 1000}s`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  // Tutti i tentativi esauriti
  throw new GoogleServiceUnavailableError(model);
}

// ─── Dispatcher ─────────────────────────────────────────────────
async function dispatch(
  provider: { provider: string; apiKey: string; model: string },
  system: string,
  user: string,
  maxTokens = 1500
): Promise<{ text: string; tokens: number }> {
  switch (provider.provider) {
    case 'openai':
      return callOpenAI(provider.apiKey, provider.model, system, user, maxTokens);
    case 'anthropic':
      return callAnthropic(provider.apiKey, provider.model, system, user, maxTokens);
    case 'google':
      return callGoogle(provider.apiKey, provider.model, system, user);
    default:
      throw new Error(`Provider non supportato: ${provider.provider}`);
  }
}

// ─── Helper: estrai JSON ────────────────────────────────────────
function extractJSON(text: string): string {
  // 1. Blocco markdown ```json ... ```
  const jsonBlock = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlock?.[1]) return jsonBlock[1].trim();

  // 2. Blocco markdown generico ``` ... ```
  const codeBlock = text.match(/```\s*([\s\S]*?)\s*```/);
  if (codeBlock?.[1]?.trim().startsWith('{')) return codeBlock[1].trim();

  // 3. Cerca il primo '{' e l'ultimo '}' (oggetto JSON)
  const startObj = text.indexOf('{');
  const endObj = text.lastIndexOf('}');
  if (startObj !== -1 && endObj > startObj) {
    return text.slice(startObj, endObj + 1);
  }

  // 4. Cerca il primo '[' e l'ultimo ']' (array JSON)
  const startArr = text.indexOf('[');
  const endArr = text.lastIndexOf(']');
  if (startArr !== -1 && endArr > startArr) {
    return text.slice(startArr, endArr + 1);
  }

  return text;
}

// ─── TONE MAP ──────────────────────────────────────────────────
const TONE_DESCRIPTIONS: Record<string, string> = {
  professional: 'tono professionale, autorevole e competente',
  friendly: 'tono amichevole, caldo e vicino al pubblico',
  funny: 'tono ironico, simpatico e divertente con qualche emoji',
  inspirational: 'tono ispirazionale, motivante e positivo',
  luxury: 'tono elegante, raffinato e premium',
  minimal: 'tono essenziale, diretto e pulito senza emoji eccessive',
  auto: 'tono scelto autonomamente in base al contesto del brand, del topic e della piattaforma',
};

// ─── GENERATE CONTENT (main entry point) ─────────────────────────
export async function generateContent(
  request: AIGenerationRequest,
  tenantId?: string,
  siteId?: string
): Promise<AIGenerationResult> {
  const start = Date.now();

  // Se siteId è fornito ma tenantId non lo è, carica il tenantId dal sito
  let finalTenantId = tenantId;
  if (siteId && !finalTenantId) {
    try {
      const site = await prisma.connectedSite.findUnique({
        where: { id: siteId },
        select: { tenantId: true },
      });
      if (site?.tenantId) {
        finalTenantId = site.tenantId;
      }
    } catch (err) {
      console.warn(`[generateContent] Errore nel caricamento del sito ${siteId}:`, err instanceof Error ? err.message : err);
    }
  }

  // Carica provider
  let providerConfig;
  if (finalTenantId) {
    providerConfig = await getActiveProvider(finalTenantId);
    // Override del modello per questa singola esecuzione (non modifica impostazioni globali)
    if (request.overrideModel && typeof request.overrideModel === 'string') {
      providerConfig = { ...providerConfig, model: request.overrideModel };
    }
  } else {
    // Fallback: usa env var per OpenAI (retrocompatibilità)
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('Nessun provider AI configurato');
    providerConfig = { provider: 'openai', apiKey, model: process.env.OPENAI_MODEL ?? 'gpt-4o' };
  }

  // Check token budget
  if (finalTenantId) {
    const budget = await checkTokenBudget(finalTenantId, providerConfig.provider, 1500);
    if (!budget.ok) throw new Error(budget.reason ?? 'Token esauriti');
  }

  const tone = request.tone ?? 'professional';
  const language = request.language ?? 'it';
  const isAutoTone = tone === 'auto';
  const toneDesc = isAutoTone
    ? 'tono scelto autonomamente in base al contesto del brand, del topic e della piattaforma'
    : (TONE_DESCRIPTIONS[tone] ?? TONE_DESCRIPTIONS.professional);

  // Carica regole globali — usa postType come contesto più preciso per i REEL
  // Es: full_post con postType=REEL → usa regole tipo 'REEL', non 'POST'
  // NOTA: loadGlobalPromptRules accetta tenantId null/undefined e carica SEMPRE le regole
  // globali (tenantId IS NULL nel DB) + quelle specifiche del tenant se tenantId è fornito.
  const ruleContentType = (request.postType === 'REEL' && request.type === 'full_post')
    ? 'REEL'
    : (request.postType === 'STORY' && request.type === 'full_post')
      ? 'STORY'
      : request.type;
  // Sempre carica le regole (anche senza tenantId, per includere almeno le globali)
  const { text: globalRulesText, rules: globalRulesArr, negativeText: globalNegativeText } = await loadGlobalPromptRules(finalTenantId, ruleContentType);

  const platformName = request.platform === 'FACEBOOK' ? 'Facebook' : request.platform === 'TIKTOK' ? 'TikTok' : 'Instagram';

  // ── Le regole vengono inserite SUBITO DOPO la definizione del ruolo ──────────
  // Posizionarle in apertura del system prompt assicura che l'AI le recepisca
  // con la massima priorità, senza il rischio che vengano trascurate a causa
  // della lunghezza del contesto.
  let systemPrompt = `Sei un esperto social media manager specializzato in ${platformName} con anni di esperienza nel creare contenuti virali e ad alto engagement.
${isAutoTone
  ? `Scegli autonomamente il tono comunicativo più appropriato basandoti sul contesto del brand, del topic e della piattaforma. Sii coerente: usa lo stesso tono per tutti i contenuti generati in questa sessione.`
  : `Il tuo stile è: ${toneDesc}. RISPETTA SEMPRE questo tono per ogni contenuto generato — caption, titoli, descrizioni devono riflettere ESATTAMENTE questo stile senza deviazioni.`
}
Scrivi sempre in ${language === 'it' ? 'italiano' : language === 'en' ? 'inglese' : language}.
Per gli hashtag usa # prima di ogni tag senza spazi.
Ottimizza sempre per l'algoritmo di ${platformName}.`;

  // ── Inserisci le regole obbligatorie subito dopo il ruolo (massima priorità) ─
  if (globalRulesText) systemPrompt += globalRulesText;
  // ── Inserisci le regole negative (EVITA SEMPRE) subito dopo le positive ──────
  if (globalNegativeText) systemPrompt += globalNegativeText;

  systemPrompt += `

REGOLA IMPORTANTE — DOMANDE DI CHIARIMENTO:
Se il topic è ambiguo e hai bisogno di un'informazione cruciale per creare contenuto di qualità (es. target di riferimento, segmento di mercato, angolo comunicativo), puoi chiedere UNA SOLA domanda.
In questo caso rispondi ESCLUSIVAMENTE con questo JSON (nessun testo aggiuntivo):
{"needsClarification":true,"question":"La tua domanda breve e chiara","options":[{"label":"Nome opzione A","description":"Breve contesto A"},{"label":"Nome opzione B","description":"Breve contesto B"}]}
Fornisci sempre 2-4 opzioni pre-compilate e ragionevoli. Non chiedere mai in formato testo libero.
Se invece hai abbastanza contesto, genera il contenuto direttamente senza domande.`;

  if (request.siteContext) systemPrompt += `\n\nContesto del brand/sito: ${request.siteContext}`;
  if (request.targetAudience) systemPrompt += `\nTarget audience: ${request.targetAudience}`;
  if (request.additionalContext) systemPrompt += `\n\nRisposta dell'utente alla domanda di chiarimento: ${request.additionalContext}\nOra genera il contenuto richiesto direttamente senza ulteriori domande.`;

  // Aggiungi contesto dei media selezionati dall'utente
  if (request.mediaRefs?.length) {
    const mediaList = request.mediaRefs
      .map((m, i) => {
        const parts = [`${i + 1}. [${m.type ?? 'IMMAGINE'}] ${m.url}`];
        if (m.alt) parts.push(`   Alt: ${m.alt}`);
        if (m.description) parts.push(`   Descrizione: ${m.description}`);
        return parts.join('\n');
      })
      .join('\n');
    systemPrompt += `\n\nMedia di riferimento forniti dall'utente (usa questi per contestualizzare il contenuto):\n${mediaList}`;
  }

  // (le regole sono già state inserite all'inizio del prompt — NON aggiungere di nuovo qui)

  // ── Raccogli "Regole iniettate dal codice" per il debug ──────────────────────
  const codeRules: string[] = [
    `Ruolo: esperto social media manager per ${platformName}`,
    `Stile di scrittura: ${toneDesc}`,
    `Lingua di output: ${language === 'it' ? 'italiano' : language === 'en' ? 'inglese' : language}`,
    `Ottimizzazione algoritmo: ${platformName}`,
    'Formato hashtag: # davanti a ogni tag senza spazi',
    `Tipo di contenuto richiesto: ${request.type}`,
  ];
  if (request.siteContext) codeRules.push(`Contesto brand iniettato (${request.siteContext.slice(0, 80).trim()}…)`);
  if (request.targetAudience) codeRules.push(`Target audience: ${request.targetAudience}`);
  if (request.mediaRefs?.length) codeRules.push(`${request.mediaRefs.length} media di riferimento allegati`);
  if (request.callToAction) codeRules.push(`Call to action: ${request.callToAction}`);
  if (request.imageDescription) codeRules.push(`Descrizione immagine: ${request.imageDescription.slice(0, 100)}`);
  if (request.additionalContext) codeRules.push('Risposta utente a domanda di chiarimento inclusa nel system prompt');

  let userPrompt = '';
  const isLargeOutput = ['ideas', 'reel_script', 'full_post'].includes(request.type);
  const maxTokens = isLargeOutput ? 4000 : 1200;

  switch (request.type) {
    case 'caption':
      userPrompt = `Genera una caption coinvolgente per un post ${platformName}.
Topic: ${request.topic ?? 'contenuto del brand'}
${request.imageDescription ? `Descrizione immagine: ${request.imageDescription}` : ''}
${request.keywords?.length ? `Keywords: ${request.keywords.join(', ')}` : ''}
${request.callToAction ? `Call to action: ${request.callToAction}` : ''}
Tipo post: ${request.postType ?? 'POST'}
La caption deve: essere ottimizzata per l'engagement, avere una prima frase che cattura l'attenzione, includere emoji in modo strategico, terminare con una domanda o CTA, essere massimo 300 parole, NON includere hashtag.
Rispondi SOLO con la caption, nessun testo aggiuntivo.`;
      break;

    case 'hashtags':
      userPrompt = `Genera i migliori hashtag per questo post Instagram.
Topic: ${request.topic ?? 'contenuto del brand'}
${request.existingCaption ? `Caption: ${request.existingCaption}` : ''}
Niche: ${request.siteContext?.slice(0, 200) ?? 'business'}
Genera: 5 hashtag molto popolari (>1M posts), 10 hashtag medi (100K-1M posts), 10 hashtag di nicchia (<100K posts).
Totale: 25 hashtag. Formato: uno per riga con # davanti. Rispondi SOLO con gli hashtag.`;
      break;

    case 'ideas':
      userPrompt = `Genera 10 idee creative per contenuti ${platformName}.
${request.topic ? `Topic/argomento principale: ${request.topic}` : ''}
${request.siteContext ? `Contesto brand/sito:\n${request.siteContext}` : ''}
${request.keywords?.length ? `Temi aggiuntivi: ${request.keywords.join(', ')}` : ''}

REQUISITO TONO OBBLIGATORIO: ${isAutoTone
  ? 'Scegli il tono più adatto al brand e al topic, poi applicalo in modo UNIFORME a TUTTE le 10 idee (caption, titoli, descrizioni). Indica il tono scelto nel campo "category" della prima idea (es. "category": "Tono: Inspirazionale").'
  : `Tutte e 10 le idee DEVONO usare ESCLUSIVAMENTE il tono "${tone.toUpperCase()}" (${toneDesc}). Caption, titoli e descrizioni devono riflettere questo stile in modo coerente e riconoscibile. NON mischiare stili diversi.`
}

Rispondi SOLO con il JSON, senza testo aggiuntivo né markdown:
{"ideas":[{"title":"...","description":"...","type":"POST|STORY|REEL","caption":"...","hashtags":["#tag1","#tag2"],"imagePrompt":"...","videoPrompt":"...","category":"...","priority":1}]}

IMPORTANTE: genera esattamente 10 idee nell'array, con priority da 1 a 10.`;
      break;

    case 'story_text':
      userPrompt = `Crea il testo e la struttura per una ${platformName} Story.
Topic: ${request.topic ?? 'contenuto brand'}
Fornisci SOLO in JSON (nessun testo aggiuntivo): {"slides":[{"slide":1,"type":"text|question|poll","headline":"...","subtext":"...","cta":"...","backgroundColor":"#hex","sticker":"emoji"}]}`;
      break;

    case 'reel_script': {
      const rsTotal = request.reelDuration ?? 30;
      const rsClipDurs = (() => {
        const d = Math.max(5, Math.min(60, rsTotal));
        if (d <= 8) return [d];
        const n = Math.ceil(d / 8);
        const base = Math.floor(d / n);
        const rem = d - base * n;
        return Array(n).fill(base).map((v: number, i: number) => i < rem ? v + 1 : v);
      })();
      const rsSceneList = rsClipDurs.map((dur, i) => `{"scene":${i+1},"duration":"${dur}s","visual":"...","script":"...","onScreenText":"...","transition":"..."}`).join(',');
      userPrompt = `Crea uno script completo per un ${platformName} Reel/Video.
Topic: ${request.topic ?? 'contenuto brand'}
Durata totale OBBLIGATORIA: ${rsTotal}s (${rsClipDurs.length} scene da ${rsClipDurs.join('/')+'s'} — rispettare ESATTAMENTE queste durate).
${request.callToAction ? `CTA: ${request.callToAction}` : ''}
Genera ${rsClipDurs.length} scene, ciascuna con una voce narrante diversa e progressiva (non ripetere la stessa frase).
Fornisci SOLO in JSON (nessun testo aggiuntivo): {"hook":"...","totalDuration":"${rsTotal}s","scenes":[${rsSceneList}],"music":"...","caption":"...","hashtags":["#tag1"],"cta":"..."}`;
      break;
    }

    case 'full_post':
      if (request.postType === 'REEL') {
        const fpTotal = request.reelDuration ?? 15;
        const fpClipDurs = (() => {
          const d = Math.max(5, Math.min(60, fpTotal));
          if (d <= 8) return [d];
          const n = Math.ceil(d / 8);
          const base = Math.floor(d / n);
          const rem = d - base * n;
          return Array(n).fill(base).map((v: number, i: number) => i < rem ? v + 1 : v);
        })();
        const fpSceneList = fpClipDurs.map((dur, i) => `{"scene":${i+1},"duration":"${dur}s","visual":"...","script":"...","onScreenText":"...","transition":"..."}`).join(',');
        userPrompt = `Crea un Reel ${platformName} completo: testo per il post E storyboard di produzione video.
Topic: ${request.topic ?? 'contenuto del brand'}
${request.imageDescription ? `Descrizione visiva: ${request.imageDescription}` : ''}
${request.callToAction ? `Call to action: ${request.callToAction}` : ''}
Durata totale OBBLIGATORIA: ${fpTotal}s — genera ESATTAMENTE ${fpClipDurs.length} scene (durate: ${fpClipDurs.join('/')+'s'}).
Ogni scena deve avere una narrazione vocale DIVERSA e progressiva (la storia avanza tra le scene, NON ripetere le stesse frasi).
Includi una musica di sottofondo coerente con il tono del brand.
Genera un JSON unico con caption/hashtag per il post E lo storyboard per le riprese.
Rispondi SOLO in JSON senza testo aggiuntivo:
{"caption":"...","hashtags":["#tag1","#tag2"],"altText":"...","bestTimeToPost":"HH:MM","expectedEngagement":"low|medium|high","tips":["..."],"storyboard":{"hook":"...","totalDuration":"${fpTotal}s","scenes":[${fpSceneList}],"music":"..."}}`;
      } else if (request.postType === 'STORY') {
        userPrompt = `Crea un post ${platformName} completo con testo E struttura Story.
Topic: ${request.topic ?? 'contenuto del brand'}
${request.imageDescription ? `Immagine: ${request.imageDescription}` : ''}
${request.callToAction ? `Call to action: ${request.callToAction}` : ''}
Genera un JSON unico con caption/hashtag per il post E le slide della Story.
Rispondi SOLO in JSON senza testo aggiuntivo:
{"caption":"...","hashtags":["#tag1","#tag2"],"altText":"...","bestTimeToPost":"HH:MM","expectedEngagement":"low|medium|high","tips":["..."],"slides":[{"slide":1,"type":"text|question|poll","headline":"...","subtext":"...","cta":"...","backgroundColor":"#hex","sticker":"emoji"}]}`;
      } else {
        userPrompt = `Crea un post ${platformName} completo e pronto per la pubblicazione.
Topic: ${request.topic ?? 'contenuto del brand'}
${request.imageDescription ? `Immagine: ${request.imageDescription}` : ''}
${request.callToAction ? `Call to action: ${request.callToAction}` : ''}
Tipo post: ${request.postType ?? 'POST'}
Rispondi SOLO in JSON senza testo aggiuntivo: {"caption":"...","hashtags":["#tag1","#tag2"],"altText":"...","bestTimeToPost":"HH:MM","expectedEngagement":"low|medium|high","tips":["..."]}`;
      }
      break;

    default:
      userPrompt = `Genera contenuto per ${platformName}. Topic: ${request.topic ?? 'brand content'}`;
  }

   const response = await dispatch(providerConfig, systemPrompt, userPrompt, maxTokens);
   const duration = Date.now() - start;

   // Track tokens
   if (finalTenantId) await trackTokenUsage(finalTenantId, providerConfig.provider, response.tokens);

   // Log
   try {
     await prisma.aIGenerationLog.create({
       data: {
         tenantId: finalTenantId ?? null,
         type: request.type.toUpperCase(),
         provider: providerConfig.provider,
         model: providerConfig.model,
         prompt: userPrompt.slice(0, 1000),
         response: response.text.slice(0, 2000),
         tokens: response.tokens,
         durationMs: duration,
         success: true,
       },
     });
   } catch { /* non-blocking */ }

  // Parse result
  const result: AIGenerationResult = { tokens: response.tokens, model: providerConfig.model };

  // ── Salva promptInfo per il debug UI ────────────────────────────────────────
  result.promptInfo = {
    globalRules: globalRulesArr,
    config: {
      type: request.type,
      tone,
      language,
      platform: request.platform ?? null,
      postType: request.postType ?? null,
      topic: request.topic ?? null,
      targetAudience: request.targetAudience ?? null,
      siteUrl: request.siteUrl ?? null,
      siteId: siteId ?? null,
      tenantId: finalTenantId ?? null,
      ruleContentType,
      globalRulesApplied: globalRulesArr.length > 0,
    },
    codeRules,
    systemPrompt: systemPrompt.slice(0, 4000), // cap per non saturare il DB
    userPrompt: userPrompt.slice(0, 3000),
  };

  // ── Controlla prima se l'AI ha risposto con una domanda di chiarimento ──────
  if (response.text.includes('"needsClarification"')) {
    try {
      const parsed = JSON.parse(extractJSON(response.text));
      if (parsed.needsClarification === true) {
        result.needsClarification = true;
        result.clarificationQuestion = parsed.question ?? 'Hai bisogno di chiarire qualcosa?';
        result.clarificationOptions = Array.isArray(parsed.options) ? parsed.options : [];
        return result;
      }
    } catch { /* non è JSON valido, continua con parsing normale */ }
  }

  if (request.type === 'caption') {
    result.caption = response.text.trim();
  } else if (request.type === 'hashtags') {
    result.hashtags = response.text
      .split('\n')
      .map((h) => h.trim())
      .filter((h) => h.startsWith('#'))
      .map((h) => h.replace(/\s.*$/, ''));
  } else if (request.type === 'story_text') {
    try {
      const parsed = JSON.parse(extractJSON(response.text));
      result.storyText = response.text;
      result.caption = parsed.slides?.[0]?.headline;
    } catch { result.storyText = response.text; }
  } else if (request.type === 'reel_script') {
    try {
      const parsed = JSON.parse(extractJSON(response.text));
      result.reelScript = response.text;
      result.caption = parsed.caption;
      result.hashtags = parsed.hashtags ?? [];
    } catch { result.reelScript = response.text; }
  } else if (request.type === 'ideas') {
    try {
      const raw = extractJSON(response.text);
      let parsed = JSON.parse(raw);
      // Supporta sia {"ideas":[...]} sia array diretto [...]
      const ideasArray: ContentIdeaData[] = Array.isArray(parsed) ? parsed : (parsed.ideas ?? []);
      result.ideas = ideasArray.map((idea: ContentIdeaData & { hashtags?: string[] }, idx: number) => ({
        id: `idea-${idx}`,
        title: idea.title,
        description: idea.description,
        type: (['POST', 'STORY', 'REEL', 'CAROUSEL'].includes(idea.type) ? idea.type : 'POST') as PostType,
        status: 'PENDING' as const,
        caption: idea.caption,
        hashtags: idea.hashtags,
        imagePrompt: idea.imagePrompt,
        videoPrompt: ((idea as unknown) as Record<string, unknown>).videoPrompt as string | undefined,
        category: idea.category,
        priority: typeof idea.priority === 'number' ? idea.priority : 5,
        createdAt: new Date(),
      }));
    } catch (parseErr) {
      console.error('[AI ideas] JSON parse error:', parseErr);
      console.error('[AI ideas] Raw response (first 500 chars):', response.text.slice(0, 500));
      result.ideas = [];
    }
  } else if (request.type === 'full_post') {
    try {
      const parsed = JSON.parse(extractJSON(response.text));
      result.caption = parsed.caption;
      result.hashtags = parsed.hashtags ?? [];
      result.altText = parsed.altText;
      // REEL → storyboard annidato estratto in reelScript
      if (parsed.storyboard) {
        result.reelScript = JSON.stringify(parsed.storyboard);
      }
      // STORY → slides estratte in storyText
      if (parsed.slides) {
        result.storyText = JSON.stringify(parsed.slides);
      }
    } catch {
      result.caption = response.text;
      result.hashtags = [];
    }
  }

  return result;
}

// ─── Generazione immagine con il provider configurato per il tenant ──────────
/**
 * Converte un URL immagine (locale o remoto) in base64 per input multimodale Gemini.
 * - URL locali (/uploads/...): legge dal filesystem
 * - URL remoti (https://...): scarica via fetch
 * Restituisce null in caso di errore o se il file supera i 4 MB.
 */
async function imageUrlToBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    let buf: Buffer;
    let mimeType: string;
    if (url.startsWith('/uploads/') || url.startsWith('/watermark')) {
      // File locale nella cartella public/
      const localPath = pathModule.join(process.cwd(), 'public', url);
      if (!fs.existsSync(localPath)) return null;
      buf = fs.readFileSync(localPath);
      const ext = pathModule.extname(localPath).toLowerCase().replace('.', '');
      mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    } else {
      // URL remoto
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      buf = Buffer.from(ab);
      mimeType = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim() || 'image/jpeg';
    }
    // Limita a 4 MB per non sovraccaricare l'API
    if (buf.length > 4 * 1024 * 1024) {
      console.warn(`[imageUrlToBase64] File troppo grande (${Math.round(buf.length / 1024)} KB) per: ${url.slice(0, 80)}`);
      return null;
    }
    return { data: buf.toString('base64'), mimeType };
  } catch (e) {
    console.warn('[imageUrlToBase64] Fallimento per', url.slice(0, 80), '—', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * Genera un'immagine usando il provider AI del tenant.
 * - Se fallbackEnabled=false (default): usa SOLO il videoModel configurato.
 * - Se fallbackEnabled=true: in caso di fallimento prova altri modelli disponibili.
 * - Se quota esaurita (429): lancia QuotaExceededError → lo scheduler mette in WAITING_TOKENS.
 */
export async function generateImageForTenant(
  tenantId: string,
  prompt: string,
  size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024',
  storageOpts: {
    siteId?: string | null;
    /** Immagini di riferimento da passare all'AI come contesto (multimodale Gemini / descrizioni testo Imagen) */
    inputMediaRefs?: Array<{ url: string; alt?: string | null; description?: string | null; type?: string }>;
    /** Negative prompt: inviato come parametro nativo ai provider che lo supportano (Imagen, Gemini) */
    negativePrompt?: string;
  } = {}
): Promise<import('./file-storage').SaveResult> {
  const provider = await getProviderForImages(tenantId);
  const { saveFileFromUrl, saveBufferToStorage } = await import('./file-storage');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fallbackEnabled: boolean = (provider as any).fallbackEnabled ?? false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageModel: string | null = (provider as any).imageModel ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageEnabled: boolean = (provider as any).imageEnabled ?? false;

  console.log(`[Google Image] ── generateImageForTenant ──────────────────────────`);
  console.log(`[Google Image] tenant=${tenantId} | provider=${provider.provider} | imageModel=${imageModel ?? 'N/A'} | imageEnabled=${imageEnabled} | videoModel=${provider.videoModel ?? 'N/A'} (VIDEO ONLY) | fallbackEnabled=${fallbackEnabled}`);
  console.log(`[Google Image] size=${size} | promptLen=${prompt.length} | prompt (100 chars): ${prompt.slice(0, 100)}`);

  // ── Pre-elabora immagini di riferimento ───────────────────────────────────
  const inputMediaRefsArr = storageOpts.inputMediaRefs ?? [];
  const negativePromptStr = storageOpts.negativePrompt?.trim() ?? '';
  // Descrizioni testo per modelli solo-testo (Imagen, OpenAI, fallback)
  const refDescriptions = inputMediaRefsArr
    .slice(0, 3)
    .map(r => r.description || r.alt)
    .filter((d): d is string => !!d)
    .join('; ');
  // Prompt arricchito per OpenAI (nessun supporto negative prompt nativo)
  const enhancedTextPrompt = refDescriptions
    ? `${prompt}. Reference style and subject: ${refDescriptions}${negativePromptStr ? `. Avoid: ${negativePromptStr}` : ''}`
    : `${prompt}${negativePromptStr ? `. Avoid: ${negativePromptStr}` : ''}`;
  // Carica le immagini come base64 per input multimodale Gemini (max 3, skip video)
  const refImageParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
  if (inputMediaRefsArr.length > 0) {
    console.log(`[Google Image] Carico ${Math.min(3, inputMediaRefsArr.length)} immagini di riferimento per input multimodale…`);
    for (const ref of inputMediaRefsArr.slice(0, 3)) {
      if (ref.type === 'VIDEO') continue;
      const img = await imageUrlToBase64(ref.url);
      if (img) {
        refImageParts.push({ inlineData: img });
        console.log(`[Google Image] Ref image caricata: ${ref.url.slice(0, 60)} (${img.mimeType}, ${Math.round(img.data.length * 0.75 / 1024)} KB)`);
      }
    }
  }

  // ── OpenAI → DALL-E 3 / gpt-image-1 ────────────────────────────────────────
  if (provider.provider === 'openai') {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: provider.apiKey });
    // Usa imageModel configurato (nuovo campo), poi default dall-e-3. NON usare videoModel qui.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const openaiImageModel = imageModel ?? 'dall-e-3';
    console.log(`[OpenAI Image] model=${openaiImageModel} | size=${size}`);
    try {
      const response = await client.images.generate({
        model: openaiImageModel,
        prompt: enhancedTextPrompt,  // usa prompt arricchito con descrizioni reference
        n: 1,
        size,
        quality: 'standard',
        style: 'vivid',
      });
      const url = (response.data ?? [])[0]?.url;
      if (!url) throw new Error('OpenAI non ha restituito nessun URL immagine');
      return saveFileFromUrl(url, 'content-studio', tenantId, { siteId: storageOpts.siteId });
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (e as any)?.status ?? (e as any)?.response?.status;
      if (status === 429) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const retryAfter = (e as any)?.headers?.['retry-after'];
        const retryMs = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000, 5 * 60_000) : 90_000;
        throw new RateLimitError(openaiImageModel, retryMs);
      }
      throw e;
    }
  }

  // ── Google → generazione immagine ───────────────────────────────────────────
  if (provider.provider === 'google') {
    const aspectRatio = size === '1024x1792' ? '9:16' : size === '1792x1024' ? '16:9' : '1:1';
    const apiKey = provider.apiKey;

    // Timeout aumentato a 150s — Imagen/Gemini image può impiegare 2+ min su reti lente
    const IMAGE_FETCH_TIMEOUT_MS = 150_000;

    /** Tenta generateContent su un modello Gemini image. Lancia RateLimitError o QuotaExceededError su 429. */
    async function tryGeminiImage(model: string): Promise<Buffer> {
      const bodyVariants = [
        { generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } },
        { generationConfig: { responseModalities: ['IMAGE'] } },
        {},
      ];
      let lastError = '';

      // Prova prima v1beta, poi v1 (alcuni modelli preview sono solo su v1)
      const apiVersions = ['v1beta', 'v1'];

      for (const apiVer of apiVersions) {
        const base = `https://generativelanguage.googleapis.com/${apiVer}/models`;
        let gotFatal = false;

        for (const [varIdx, extra] of bodyVariants.entries()) {
          // Costruisce le parti multimodali: immagini reference + testo prompt
          const geminiParts: Array<unknown> = refImageParts.length > 0
            ? [
                ...refImageParts,
                { text: refDescriptions
                    ? `Use the provided reference image(s) for visual context, style and subject. Generate: ${prompt}${negativePromptStr ? ` Do NOT include: ${negativePromptStr}` : ''}`
                    : `${prompt}${negativePromptStr ? ` Do NOT include: ${negativePromptStr}` : ''}` },
              ]
            : [{ text: `${prompt}${negativePromptStr ? ` Do NOT include: ${negativePromptStr}` : ''}` }];
          const reqBodyObj = { contents: [{ parts: geminiParts }], ...extra };

          const url = `${base}/${model}:generateContent?key=***`;
          const logParts = [{ text: prompt.slice(0, 80) + (prompt.length > 80 ? '…' : ''), ...(refImageParts.length ? { refImages: refImageParts.length } : {}) }];
          const reqBodyLog = { contents: [{ parts: logParts }], ...extra };
          console.log(`[Google Image][Gemini][${apiVer}][variant ${varIdx + 1}/${bodyVariants.length}] → POST ${url}`);
          console.log(`[Google Image][Gemini] Request body:`, JSON.stringify(reqBodyLog));
          if (refImageParts.length > 0) {
            console.log(`[Google Image][Gemini] Input multimodale: ${refImageParts.length} ref image(s) incluse nel request`);
          }

          const startTs = Date.now();
          let resp: Response;
          try {
            resp = await fetch(`${base}/${model}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(reqBodyObj),
              signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
            });
          } catch (fetchErr) {
            const elapsed = Date.now() - startTs;
            // Timeout o rete interrotta — lancia ApiTimeoutError per retry breve
            const isTimeout = (fetchErr instanceof Error) && (
              fetchErr.name === 'TimeoutError' ||
              fetchErr.name === 'AbortError' ||
              fetchErr.message.toLowerCase().includes('aborted') ||
              fetchErr.message.toLowerCase().includes('timeout')
            );
            console.error(`[Google Image][Gemini][${apiVer}][variant ${varIdx + 1}] ✗ FETCH ERROR dopo ${elapsed}ms — name="${(fetchErr as Error).name}" msg="${(fetchErr as Error).message}"`);
            if (isTimeout) throw new ApiTimeoutError(model, IMAGE_FETCH_TIMEOUT_MS);
            throw fetchErr;
          }

          const elapsed = Date.now() - startTs;
          console.log(`[Google Image][Gemini][${apiVer}][variant ${varIdx + 1}] ← HTTP ${resp.status} in ${elapsed}ms | Content-Type: ${resp.headers.get('content-type') ?? 'n/a'}`);

          if (!resp.ok) {
            const raw = await resp.text().catch(() => '');
            console.warn(`[Google Image][Gemini][${apiVer}][variant ${varIdx + 1}] ✗ HTTP ${resp.status} — body (500 chars): ${raw.slice(0, 500)}`);
            if (resp.status === 429) {
              const { isRpmLimit, retryMs, isFreeTierBlock, isPermanentBlock } = classifyGoogle429(resp, raw);
              if (isRpmLimit) throw new RateLimitError(model, retryMs);
              const detail = isFreeTierBlock
                ? 'Quota generazione immagini esaurita (separata dalla quota testo). Vedi https://ai.dev/rate-limit per i limiti del tuo piano'
                : undefined;
              throw new QuotaExceededError(model, new Date(Date.now() + retryMs), detail, isPermanentBlock);
            }
            const msg = parseGoogleError(resp.status, raw, model);
            if (resp.status === 404) {
              // 404 su questa versione API → prova la prossima versione
              lastError = msg;
              gotFatal = true;
              break; // esci dal loop bodyVariants, prova prossimo apiVer
            }
            lastError = msg; // 400 = formato sbagliato → prova prossima variante
            continue;
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data: any = await resp.json();
          const candidate = data?.candidates?.[0];
          const finishReason = candidate?.finishReason ?? 'N/A';
          const partsCount = candidate?.content?.parts?.length ?? 0;
          console.log(`[Google Image][Gemini][${apiVer}][variant ${varIdx + 1}] ✓ finishReason=${finishReason} | parti=${partsCount} | chiavi candidato=${Object.keys(candidate ?? {}).join(',')}`);

          if (candidate?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)) {
            console.warn(`[Google Image][Gemini][${apiVer}][variant ${varIdx + 1}] ✗ Generazione bloccata: ${candidate.finishReason}`);
            lastError = `Generazione bloccata: ${candidate.finishReason}`; continue;
          }
          const parts: Array<{ inlineData?: { data?: string; mimeType?: string }; text?: string }> = candidate?.content?.parts ?? [];
          console.log(`[Google Image][Gemini][${apiVer}][variant ${varIdx + 1}] Parti ricevute:`, parts.map((p, i) => `[${i}] ${p.inlineData ? `inlineData(mimeType=${p.inlineData.mimeType}, bytes=${p.inlineData.data?.length ?? 0})` : p.text !== undefined ? `text(${p.text?.length ?? 0} chars)` : 'unknown'}`).join(', '));

          const imgPart = parts.find((p) => p.inlineData?.data);
          if (!imgPart?.inlineData?.data) {
            console.warn(`[Google Image][Gemini][${apiVer}][variant ${varIdx + 1}] ✗ Nessuna immagine inline nelle ${parts.length} parti`);
            lastError = `NO_IMAGE:${parts.length}`; continue;
          }
          console.log(`[Google Image][Gemini][${apiVer}][variant ${varIdx + 1}] ✅ Immagine ricevuta — ${Math.round(imgPart.inlineData.data.length * 0.75 / 1024)} KB`);
          return Buffer.from(imgPart.inlineData.data, 'base64');
        }
        if (!gotFatal) break; // se non è stato un 404, non cambiare versione API
      }
      // Se tutti gli endpoint hanno restituito 404 → modello non esiste
      if (lastError.includes('non trovato') || lastError.includes('404')) {
        throw new ModelNotFoundError(model);
      }
      // Se tutti i tentativi hanno restituito testo senza immagine → modello incompatibile
      if (lastError.startsWith('NO_IMAGE:')) {
        const partsCount = parseInt(lastError.split(':')[1] ?? '0', 10);
        throw new NoImageGeneratedError(model, partsCount);
      }
      throw new Error(`${model}: ${lastError || 'Nessun formato supportato'}`);
    }

    /** Tenta predict su un modello Imagen. Lancia RateLimitError o QuotaExceededError su 429. */
    async function tryImagenPredict(model: string): Promise<Buffer> {
      const base = `https://generativelanguage.googleapis.com/v1beta/models`;
      // Imagen supporta negativePrompt come parametro nativo
      const negParams = negativePromptStr ? { negativePrompt: negativePromptStr } : {};
      const bodies = [
        { instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio, ...negParams } },
        { instances: [{ prompt }], parameters: { sampleCount: 1, ...negParams } },
        { instances: [{ prompt }] },
      ];
      let lastError = '';
      for (const [bodyIdx, body] of bodies.entries()) {
        const url = `${base}/${model}:predict?key=***`;
        console.log(`[Google Image][Imagen][variant ${bodyIdx + 1}/${bodies.length}] → POST ${url}`);
        console.log(`[Google Image][Imagen] Request body:`, JSON.stringify({ ...body, instances: [{ prompt: body.instances[0].prompt.slice(0, 80) + '…' }] }));

        const startTs = Date.now();
        let resp: Response;
        try {
          resp = await fetch(`${base}/${model}:predict?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
          });
        } catch (fetchErr) {
          const elapsed = Date.now() - startTs;
          const isTimeout = (fetchErr instanceof Error) && (
            fetchErr.name === 'TimeoutError' ||
            fetchErr.name === 'AbortError' ||
            fetchErr.message.toLowerCase().includes('aborted') ||
            fetchErr.message.toLowerCase().includes('timeout')
          );
          console.error(`[Google Image][Imagen][variant ${bodyIdx + 1}] ✗ FETCH ERROR dopo ${elapsed}ms — name="${(fetchErr as Error).name}" msg="${(fetchErr as Error).message}"`);
          if (isTimeout) throw new ApiTimeoutError(model, IMAGE_FETCH_TIMEOUT_MS);
          throw fetchErr;
        }

        const elapsed = Date.now() - startTs;
        console.log(`[Google Image][Imagen][variant ${bodyIdx + 1}] ← HTTP ${resp.status} in ${elapsed}ms | Content-Type: ${resp.headers.get('content-type') ?? 'n/a'}`);

        if (!resp.ok) {
          const raw = await resp.text().catch(() => '');
          console.warn(`[Google Image][Imagen][variant ${bodyIdx + 1}] ✗ HTTP ${resp.status} — body (500 chars): ${raw.slice(0, 500)}`);
          if (resp.status === 429) {
            const { isRpmLimit, retryMs, isFreeTierBlock, isPermanentBlock } = classifyGoogle429(resp, raw);
            if (isRpmLimit) throw new RateLimitError(model, retryMs);
            const detail = isFreeTierBlock
              ? 'Quota generazione immagini esaurita (separata dalla quota testo). Vedi https://ai.dev/rate-limit per i limiti del tuo piano'
              : undefined;
            throw new QuotaExceededError(model, new Date(Date.now() + retryMs), detail, isPermanentBlock);
          }
          const msg = parseGoogleError(resp.status, raw, model);
          if (resp.status === 404 || resp.status === 403) throw new Error(msg);
          if (resp.status === 400 && (raw.includes('only available on paid') || raw.includes('upgrade'))) {
            throw new Error(parseGoogleError(400, raw, model)); // billing: non ritentare
          }
          lastError = msg; continue;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await resp.json();
        const pred = data?.predictions?.[0];
        const predKeys = Object.keys(pred ?? {}).join(',');
        console.log(`[Google Image][Imagen][variant ${bodyIdx + 1}] ✓ predictions[0] chiavi: ${predKeys || 'nessuna'}`);
        const b64: string | undefined =
          pred?.bytesBase64Encoded ?? pred?.imageBytes ?? pred?.image?.bytesBase64Encoded;
        if (!b64) {
          console.warn(`[Google Image][Imagen][variant ${bodyIdx + 1}] ✗ Nessun campo immagine base64 in predictions[0]. Body integrale (1000 chars): ${JSON.stringify(data).slice(0, 1000)}`);
          lastError = `Risposta senza immagine`; continue;
        }
        console.log(`[Google Image][Imagen][variant ${bodyIdx + 1}] ✅ Immagine ricevuta — ${Math.round(b64.length * 0.75 / 1024)} KB`);
        return Buffer.from(b64, 'base64');
      }
      throw new Error(`${model}: ${lastError || 'predict fallito'}`);
    }

    async function saveBuf(buf: Buffer) {
      return saveBufferToStorage(buf, 'content-studio', tenantId, 'png', { siteId: storageOpts.siteId });
    }

    async function tryModel(model: string): Promise<Buffer> {
      return model.startsWith('imagen-') ? tryImagenPredict(model) : tryGeminiImage(model);
    }

    // ── Modalità STRICT (fallbackEnabled=false, default): solo il imageModel ──
    if (!fallbackEnabled) {
      // imageModel = modello dedicato immagini. NON usare mai videoModel per le immagini.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const modelToUse = imageModel;
      if (!modelToUse) {
        throw new Error(
          'Nessun modello immagini configurato. ' +
          'Vai in Impostazioni → Provider AI, attiva "Modello Immagini AI" e scegli un modello. ' +
          'Modelli consigliati su Livello 1: ' +
          '"gemini-2.5-flash-preview-image-generation" (500 RPM, 2K img/giorno) ⭐, ' +
          '"gemini-3.1-flash-image-preview" (100 RPM, 1K img/giorno), ' +
          '"imagen-4.0-generate-001" (10 RPM, 70/giorno).'
        );
      }
      // Protezione: se il modello scelto è un Veo (video), errore chiaro
      if (modelToUse.startsWith('veo-')) {
        throw new ModelNotFoundError(modelToUse + ' [ERRORE: questo è un modello VIDEO Veo, non genera immagini. Vai in Provider AI → Modello Immagini e scegli gemini-3.1-flash-image-preview o imagen-4.0-generate-001]');
      }
      // Un solo tentativo, nessun fallback
      return await saveBuf(await tryModel(modelToUse));
    }

    // ── Modalità FALLBACK (fallbackEnabled=true): discovery + chain completa ──
    const fallbackErrors: string[] = [];

    // STEP 1: usa imageModel configurato (se presente). NON usare videoModel come fallback per immagini.
    const primaryImageModel = imageModel;
    if (primaryImageModel) {
      try {
        return await saveBuf(await tryModel(primaryImageModel));
      } catch (e) {
        if (e instanceof QuotaExceededError) throw e;
        fallbackErrors.push(`[${primaryImageModel}] ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // STEP 2: scopri modelli disponibili via ListModels
    let availableImageModels: string[] = [];
    try {
      const listResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (listResp.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const listData: any = await listResp.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        availableImageModels = (listData.models ?? []).map((m: any) => (m.name as string).replace('models/', ''))
          .filter((n: string) => {
            if (n.includes('tts') || n.includes('embedding') || n.includes('aqa') || n.includes('retrieval')) return false;
            return n.includes('image') || n.includes('imagen');
          });
        console.log('[Google Image][fallback] Modelli scoperti:', availableImageModels.join(', ') || 'nessuno');
      }
    } catch { /* ignora */ }

    for (const model of availableImageModels) {
      if (model === provider.videoModel) continue;
      try {
        return await saveBuf(await tryModel(model));
      } catch (e) {
        if (e instanceof QuotaExceededError) throw e;
        fallbackErrors.push(`[${model}] ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // STEP 3: fallback statico — modelli verificati su Livello 1 (ordinati per RPD decrescente)
    const staticCandidates = [
      // Gemini image — Livello 1 (500/100/20 RPM, 2K/1K/250 RPD)
      'gemini-2.5-flash-preview-image-generation', // Nano Banana — 500 RPM, 2K/giorno ⭐
      'gemini-3.1-flash-image-preview',            // Nano Banana 2 — 100 RPM, 1K/giorno
      'gemini-3-pro-image-preview',                // Nano Banana Pro — 20 RPM, 250/giorno
      // Imagen 4 — Livello 1 (10/10/5 RPM, 70/70/30 RPD)
      'imagen-4.0-generate-001',
      'imagen-4.0-fast-generate-001',
      'imagen-4.0-ultra-generate-001',
      // Legacy
      'gemini-2.0-flash-preview-image-generation',
      'gemini-2.0-flash-exp-image-generation',
    ];
    for (const model of staticCandidates) {
      if (model === provider.videoModel || availableImageModels.includes(model)) continue;
      try {
        return await saveBuf(await tryModel(model));
      } catch (e) {
        if (e instanceof QuotaExceededError) throw e;
        fallbackErrors.push(`[${model}] ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    throw new Error(`Generazione immagine fallita con tutti i modelli. Errori: ${fallbackErrors.slice(0, 4).join(' | ')}`);
  }

  throw new Error(
    `Il provider "${provider.provider}" non supporta la generazione di immagini. ` +
    'Configura OpenAI o Google in Impostazioni → Provider AI.'
  );
}

// ─── Suggest best times ─────────────────────────────────────────
export async function suggestBestTimes(
  niche?: string,
  timezone = 'Europe/Rome',
  tenantId?: string
): Promise<string[]> {
  let providerConfig;
  try {
    if (tenantId) {
      providerConfig = await getActiveProvider(tenantId);
    } else {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return ['09:00', '12:00', '18:00', '20:00', '21:00'];
      providerConfig = { provider: 'openai', apiKey, model: 'gpt-4o-mini' };
    }
  } catch {
    return ['09:00', '12:00', '18:00', '20:00', '21:00'];
  }

  const userPrompt = `Quali sono i 5 orari migliori per pubblicare su Instagram per un brand nel settore: ${niche ?? 'general'}?
Timezone: ${timezone}. Rispondi SOLO con gli orari in formato HH:MM, uno per riga.`;

  try {
    const response = await dispatch(providerConfig, 'Sei un esperto di social media analytics.', userPrompt, 100);
    return response.text
      .split('\n')
      .map((t) => t.trim())
      .filter((t) => /^\d{2}:\d{2}$/.test(t))
      .slice(0, 5);
  } catch {
    return ['09:00', '12:00', '18:00', '20:00', '21:00'];
  }
}

/** Ritorna tutti i provider attivi per il tenant, filtrati per tipo (image/video/text). */
export async function getAllProvidersForTenantAndType(
  tenantId: string,
  type: 'image' | 'video' | 'text'
) {
  const allProviders = await prisma.aIProviderConfig.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });

  return allProviders.filter(p => {
    if (type === 'image') {
      return p.imageEnabled || (p.usedFor && JSON.parse(p.usedFor).includes('image'));
    } else if (type === 'video') {
      return p.videoEnabled || (p.usedFor && JSON.parse(p.usedFor).includes('video'));
    } else if (type === 'text') {
      // Per il testo, includi tutti i provider che non sono specificamente solo per immagini/video
      return !p.imageEnabled && !p.videoEnabled || (p.usedFor && JSON.parse(p.usedFor).includes('text'));
    }
    return false; // Non dovrebbe succedere
  });
}
