// src/lib/video-stitching.ts
// Stitching multi-clip per superare il limite 4-8s delle API Veo
// Strategia: divide la durata totale in clip da 4-8s, genera sequenzialmente
// usando l'ultimo frame di ogni clip come primo frame del successivo, poi concatena.

import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

// ─── Risoluzione path ffmpeg (robusto contro il bundling di Next.js) ──────────
/**
 * Restituisce il path assoluto del binario ffmpeg.
 * Priorità: FFMPEG_PATH env var → node_modules hardcoded → ffmpeg-static require.
 */
async function resolveFfmpegPath(): Promise<string> {
  // Tentativo 0: variabile d'ambiente FFMPEG_PATH (impostata in .env.local)
  if (process.env.FFMPEG_PATH) {
    try {
      await fs.access(process.env.FFMPEG_PATH);
      return process.env.FFMPEG_PATH;
    } catch { /* continua */ }
  }

  // Tentativo 1: path assoluto in node_modules (non dipende da bundling)
  const candidates = [
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),   // Windows
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),       // Linux/Mac
    path.join(process.cwd(), 'node_modules', '.bin', 'ffmpeg'),                // npm bin link
  ];
  for (const c of candidates) {
    try { await fs.access(c); return c; } catch { /* continua */ }
  }

  // Tentativo 2: ffmpeg-static via dynamic import (funziona se è in serverExternalPackages)
  try {
    const mod = await import('ffmpeg-static');
    const p = (mod.default ?? mod) as string;
    if (p && typeof p === 'string' && !p.includes('.next') && !p.includes('vendor-chunks')) {
      return p;
    }
  } catch { /* continua */ }

  // Tentativo 3: require() diretto (CommonJS)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require('ffmpeg-static') as string;
    if (p && typeof p === 'string' && !p.includes('.next') && !p.includes('vendor-chunks')) {
      return p;
    }
  } catch { /* continua */ }

  throw new Error(
    'ffmpeg non trovato. Imposta FFMPEG_PATH in .env.local oppure assicurati che ffmpeg-static sia in serverExternalPackages in next.config.mjs'
  );
}

// ─── Costanti API Veo ────────────────────────────────────────────────────────
export const VEO_CLIP_MIN = 5; // secondi per clip (min API)
export const VEO_CLIP_MAX = 8; // secondi per clip (max API)
export const VIDEO_DURATION_MIN = 5;  // min durata utente
export const VIDEO_DURATION_MAX = 60; // max durata utente

// ─── Tipi ────────────────────────────────────────────────────────────────────
export interface StitchingClip {
  index: number;
  duration: number; // secondi per questa clip (VEO_CLIP_MIN..VEO_CLIP_MAX)
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  operationName?: string; // Veo long-running operation name
  videoUrl?: string;      // URL locale dopo download
  errorMessage?: string;
}

export interface StitchingMeta {
  totalDuration: number;  // durata totale richiesta dall'utente
  clips: StitchingClip[];
  currentClipIndex: number; // indice clip attualmente in esecuzione
  finalPrompt: string;      // prompt base con regole globali (fallback per ogni clip)
  clipPrompts?: string[];   // prompt specifici per clip (basati sullo storyboard), se disponibili
  ttsScripts?: string[];    // script narrazione TTS per ogni clip — preservati anche dopo riscrittura AI del prompt visivo
  aspectRatio: string;
  /** Negative prompt globale (regole negative) — inviato come negativePrompt nativo a Veo */
  negativePrompt?: string;
}

// ─── Calcolo clip durations ────────────────────────────────────────────────
/**
 * Ritorna true se la durata richiede stitching (> VEO_CLIP_MAX).
 */
export function needsStitching(totalDuration: number): boolean {
  return totalDuration > VEO_CLIP_MAX;
}

/**
 * Calcola la distribuzione delle durate delle clip in modo intelligente.
 * Garantisce che ogni clip sia tra VEO_CLIP_MIN e VEO_CLIP_MAX secondi
 * e che la somma corrisponda esattamente alla durata richiesta.
 *
 * Algoritmo:
 *  - minClips = ceil(total / VEO_CLIP_MAX): minimo di clip per non superare il max
 *  - maxClips = floor(total / VEO_CLIP_MIN): massimo di clip per non scendere sotto il min
 *  - Se maxClips < minClips: c'è un "gap impossibile" (es. 9s non è divisibile
 *    in clip da 5-8s senza andare fuori range) → si arrotonda alla durata valida
 *    più vicina superiore (minClips * VEO_CLIP_MIN).
 *  - Altrimenti: distribuzione uniforme con baseSize + remainder sui primi slot.
 *
 * Esempi:
 *   5s  → [5]
 *   8s  → [8]
 *   9s  → impossibile (gap) → arrotonda a 10s → [5, 5]
 *   10s → [5, 5]
 *   15s → [8, 7]
 *   16s → [8, 8]
 *   17s → [6, 6, 5]
 *   20s → [7, 7, 6]
 *   30s → [8, 8, 7, 7]
 *   60s → [8, 8, 8, 8, 7, 7, 7, 7]
 */
export function calculateClipDurations(totalDuration: number): number[] {
  const clamped = Math.max(VIDEO_DURATION_MIN, Math.min(VIDEO_DURATION_MAX, Math.round(totalDuration)));

  // Singola clip — nessuno stitching necessario
  if (clamped <= VEO_CLIP_MAX) return [clamped];

  // Numero minimo di clip: garantisce che nessuna superi VEO_CLIP_MAX
  const minClips = Math.ceil(clamped / VEO_CLIP_MAX);
  // Numero massimo di clip: garantisce che nessuna scenda sotto VEO_CLIP_MIN
  const maxClips = Math.floor(clamped / VEO_CLIP_MIN);

  if (maxClips < minClips) {
    // Gap impossibile: non esiste una distribuzione valida per questa durata.
    // Arrotonda alla prima durata valida superiore: minClips * VEO_CLIP_MIN.
    // (L'unico caso reale con i limiti attuali è 9s → 10s)
    const adjustedTotal = minClips * VEO_CLIP_MIN;
    console.warn(
      `[calculateClipDurations] Durata ${clamped}s non divisibile in clip da ` +
      `${VEO_CLIP_MIN}-${VEO_CLIP_MAX}s (minClips=${minClips}, maxClips=${maxClips}). ` +
      `Arrotondamento automatico a ${adjustedTotal}s.`
    );
    return calculateClipDurations(adjustedTotal);
  }

  // Usa il numero minimo di clip per minimizzare le richieste API
  const numClips = minClips;
  const baseSize = Math.floor(clamped / numClips);
  const remainder = clamped - baseSize * numClips;

  const clips = Array<number>(numClips).fill(baseSize);
  // Le prime `remainder` clip prendono +1 secondo per raggiungere esattamente `clamped`
  for (let i = 0; i < remainder; i++) clips[i]++;

  // Verifica di sicurezza — non dovrebbe mai scattare con il controllo gap sopra
  return clips.map(c => Math.max(VEO_CLIP_MIN, Math.min(VEO_CLIP_MAX, c)));
}

/**
 * Restituisce la durata effettiva che verrà generata per un dato input.
 * Uguale a totalDuration nella maggior parte dei casi; può differire solo
 * per il gap impossibile (es. 9s → 10s).
 */
export function getEffectiveDuration(totalDuration: number): number {
  return calculateClipDurations(totalDuration).reduce((sum, d) => sum + d, 0);
}

// ─── Utility path ─────────────────────────────────────────────────────────
/** Converte una URL pubblica (/uploads/...) nel path assoluto locale */
export function publicUrlToLocalPath(publicUrl: string): string {
  // Rimuove eventuale dominio se presente
  const idx = publicUrl.indexOf('/uploads/');
  const relative = idx >= 0 ? publicUrl.slice(idx) : publicUrl;
  return path.join(process.cwd(), 'public', relative);
}

/** Costruisce il path per un video stitched nel folder video-ai del tenant */
export function buildStitchedOutputPath(tenantId: string, siteId?: string | null): string {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const sitePart = siteId ?? 'no-site';
  const dir = path.join(process.cwd(), 'public', 'uploads', 'video-ai', tenantId, sitePart, yyyymm);
  return path.join(dir, `stitched_${uuidv4()}.mp4`);
}

export function localPathToPublicUrl(localPath: string): string {
  const idx = localPath.indexOf(`${path.sep}uploads${path.sep}`);
  if (idx < 0) return localPath;
  return localPath.slice(idx).replace(/\\/g, '/');
}

// ─── Estrazione ultimo frame con ffmpeg ───────────────────────────────────
/**
 * Estrae l'ultimo frame di un video locale e lo restituisce come base64.
 * Usato per il "first frame" della clip successiva (continuità visiva).
 */
export async function extractLastFrame(
  localVideoPath: string
): Promise<{ base64: string; mimeType: string }> {
  const ffmpegPath = await resolveFfmpegPath();
  const { default: Ffmpeg } = await import('fluent-ffmpeg');
  Ffmpeg.setFfmpegPath(ffmpegPath);

  const tempPath = path.join(os.tmpdir(), `frame_${Date.now()}_${uuidv4().slice(0, 8)}.jpg`);

  await new Promise<void>((resolve, reject) => {
    Ffmpeg(localVideoPath)
      .inputOptions(['-sseof', '-0.5'])   // ultimi 0.5s del video
      .outputOptions(['-vframes', '1', '-q:v', '2'])
      .output(tempPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`extractLastFrame: ${err.message}`)))
      .run();
  });

  const buffer = await fs.readFile(tempPath);
  await fs.unlink(tempPath).catch(() => {});
  return { base64: buffer.toString('base64'), mimeType: 'image/jpeg' };
}

// ─── Concatenazione video con ffmpeg ─────────────────────────────────────
/**
 * Concatena più file video locali in un unico output MP4.
 * Usa prima il concat demuxer (stream copy) e se fallisce ri-codifica con libx264.
 * I path vengono normalizzati con forward-slash per compatibilità ffmpeg su Windows.
 */
export async function concatenateVideos(
  localInputPaths: string[],
  outputPath: string
): Promise<void> {
  if (localInputPaths.length === 0) throw new Error('concatenateVideos: nessun input');
  if (localInputPaths.length === 1) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.copyFile(localInputPaths[0], outputPath);
    return;
  }

  const ffmpegPath = await resolveFfmpegPath();
  const { default: Ffmpeg } = await import('fluent-ffmpeg');
  Ffmpeg.setFfmpegPath(ffmpegPath);

  // Normalizza i path con forward-slash (ffmpeg li accetta su Windows)
  const normalizedPaths = localInputPaths.map(p => p.replace(/\\/g, '/'));

  // Verifica esistenza file prima di procedere
  for (const np of normalizedPaths) {
    try { await fs.access(np.replace(/\//g, path.sep)); }
    catch { throw new Error(`concatenateVideos: file non trovato: ${np}`); }
  }

  // Crea file di lista temporaneo
  const listPath = path.join(os.tmpdir(), `concat_${Date.now()}.txt`);
  // Usa forward-slash e non serve escaping per filename mp4 standard
  const listContent = normalizedPaths.map(p => `file '${p}'`).join('\n');
  await fs.writeFile(listPath, listContent, 'utf8');

  // Assicura che la cartella di output esista
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // Tentativo 1: stream copy (veloce, nessuna ricodifica)
  const outputNorm = outputPath.replace(/\\/g, '/');
  try {
    await new Promise<void>((resolve, reject) => {
      Ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy'])
        .output(outputNorm)
        .on('end', () => resolve())
        .on('error', (err) => reject(new Error(`concat_copy: ${err.message}`)))
        .run();
    });
    await fs.unlink(listPath).catch(() => {});
    return;
  } catch (copyErr) {
    console.warn('[concatenateVideos] Stream copy fallita, tento ricodifica:', copyErr instanceof Error ? copyErr.message : copyErr);
    // Elimina output parziale se esiste
    await fs.unlink(outputNorm.replace(/\//g, path.sep)).catch(() => {});
  }

  // Tentativo 2: ricodifica con libx264 (più lento ma più compatibile)
  try {
    await new Promise<void>((resolve, reject) => {
      Ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart'])
        .output(outputNorm)
        .on('end', () => resolve())
        .on('error', (err) => reject(new Error(`concat_reencode: ${err.message}`)))
        .run();
    });
    await fs.unlink(listPath).catch(() => {});
  } catch (reencodeErr) {
    await fs.unlink(listPath).catch(() => {});
    throw reencodeErr;
  }
}

// ─── Helper: scarica + salva una clip dalla URI Veo ──────────────────────
/**
 * Scarica la clip dall'URI Veo e la persiste localmente.
 * Ritorna il path locale assoluto + la public URL.
 */
export async function persistClipFromUri(
  veoUri: string,
  apiKey: string,
  tenantId: string,
  siteId?: string | null
): Promise<{ localPath: string; publicUrl: string }> {
  const { saveFileFromUrl } = await import('./file-storage');

  const downloadUrl = veoUri.includes('?')
    ? `${veoUri}&key=${apiKey}`
    : `${veoUri}?key=${apiKey}`;

  const saved = await saveFileFromUrl(downloadUrl, 'video-ai', tenantId, {
    optimize: false,
    forceExt: 'mp4',
    siteId: siteId ?? null,
  });

  return { localPath: saved.localPath, publicUrl: saved.publicUrl };
}

// ─── TTS audio per narrazione continua ───────────────────────────────────
/**
 * Genera un file audio TTS dalla narrazione combinata di tutte le scene.
 * Provider supportati:
 *  - 'openai'  → OpenAI tts-1 (qualità alta, richiede API key OpenAI)
 *  - 'google'  → Gemini TTS via generativelanguage.googleapis.com
 *                Usa la STESSA API key di Veo — zero configurazione extra.
 *                Fallback su Cloud Text-to-Speech se Gemini TTS non disponibile.
 * Restituisce il path locale del file audio MP3 generato.
 */
export async function generateTTSFromScripts(
  scripts: string[],
  apiKey: string,
  voice: string = 'alloy',
  provider: 'openai' | 'google' = 'openai',
  language = 'it'
): Promise<string> {
  const fullScript = scripts.filter(Boolean).join('. ');
  if (!fullScript.trim()) throw new Error('Nessun testo di narrazione disponibile per TTS');

  const ttsPath = path.join(os.tmpdir(), `tts_${Date.now()}_${uuidv4().slice(0, 8)}.mp3`);

  if (provider === 'google') {
    // ── Gemini TTS API ──────────────────────────────────────────────────────
    // Usa la stessa API key configurata per Veo (generativelanguage.googleapis.com).
    // Il modello gemini-2.5-flash-preview-tts supporta più lingue automaticamente.
    // OUTPUT: audio PCM 24kHz mono → convertiamo in MP3 via ffmpeg.
    const geminiTtsUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

    // Mappa voce: per Gemini TTS usiamo voci naturali; la lingua è auto-rilevata dal testo
    const geminiVoiceMap: Record<string, string> = {
      alloy: 'Charon', echo: 'Orus', fable: 'Kore', onyx: 'Fenrir',
      nova: 'Aoede', shimmer: 'Leda',
    };
    const geminiVoice = geminiVoiceMap[voice] ?? 'Charon';

    const geminiBody = {
      contents: [{ parts: [{ text: fullScript }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: geminiVoice },
          },
        },
      },
    };

    let geminiOk = false;
    try {
      const res = await fetch(geminiTtsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
        signal: AbortSignal.timeout(45_000),
      });

      if (res.ok) {
        type GeminiTTSResponse = { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }> };
        const data = await res.json() as GeminiTTSResponse;
        const pcmBase64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (pcmBase64) {
          // Salva PCM raw e converti in MP3 via ffmpeg
          const pcmPath = path.join(os.tmpdir(), `tts_pcm_${Date.now()}.pcm`);
          await fs.writeFile(pcmPath, Buffer.from(pcmBase64, 'base64'));

          const ffmpegPath = await resolveFfmpegPath();
          const { default: Ffmpeg } = await import('fluent-ffmpeg');
          Ffmpeg.setFfmpegPath(ffmpegPath);

          await new Promise<void>((resolve, reject) => {
            Ffmpeg()
              .input(pcmPath)
              .inputOptions(['-f', 's16le', '-ar', '24000', '-ac', '1'])
              .outputOptions(['-codec:a', 'libmp3lame', '-qscale:a', '3'])
              .output(ttsPath)
              .on('end', () => resolve())
              .on('error', (err) => reject(new Error(`Gemini TTS ffmpeg: ${err.message}`)))
              .run();
          });
          await fs.unlink(pcmPath).catch(() => {});
          console.log(`[TTS/Gemini] Audio generato: ${ttsPath} (voice=${geminiVoice}, lang=auto, ${scripts.length} scene)`);
          geminiOk = true;
        } else {
          const errBody = JSON.stringify(data).slice(0, 300);
          console.warn(`[TTS/Gemini] Risposta senza audioContent: ${errBody}`);
        }
      } else {
        const errText = await res.text().catch(() => '');
        console.warn(`[TTS/Gemini] HTTP ${res.status}: ${errText.slice(0, 200)} — fallback su Cloud TTS`);
      }
    } catch (geminiErr) {
      console.warn('[TTS/Gemini] Errore:', geminiErr instanceof Error ? geminiErr.message : geminiErr, '— fallback su Cloud TTS');
    }

    if (!geminiOk) {
      // ── Fallback: Google Cloud Text-to-Speech ──────────────────────────────
      // Richiede che l'API "Cloud Text-to-Speech" sia abilitata nel progetto Google Cloud.
      const langCodeMap: Record<string, string> = {
        it: 'it-IT', en: 'en-US', es: 'es-ES', fr: 'fr-FR',
        de: 'de-DE', pt: 'pt-PT', nl: 'nl-NL',
      };
      const languageCode = langCodeMap[language] ?? 'it-IT';

      const cloudTtsUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
      const cloudBody = {
        input: { text: fullScript },
        voice: { languageCode, ssmlGender: 'NEUTRAL' },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95, pitch: 0 },
      };

      const res2 = await fetch(cloudTtsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cloudBody),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res2.ok) {
        const errText = await res2.text().catch(() => '');
        let errMsg = `Google Cloud TTS error ${res2.status}`;
        try { errMsg += `: ${JSON.parse(errText)?.error?.message ?? errText}`; } catch { if (errText) errMsg += `: ${errText}`; }
        throw new Error(errMsg);
      }
      const data2 = await res2.json() as { audioContent?: string };
      if (!data2.audioContent) throw new Error('Google Cloud TTS: nessun audioContent nella risposta');

      const buffer = Buffer.from(data2.audioContent, 'base64');
      await fs.writeFile(ttsPath, buffer);
      console.log(`[TTS/CloudTTS] Audio generato: ${ttsPath} (${buffer.length} bytes, lang=${languageCode})`);
    }

  } else {
    // ── OpenAI TTS ───────────────────────────────────────────────────────────
    const validVoice = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].includes(voice)
      ? (voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer')
      : 'alloy';

    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });

    const mp3 = await client.audio.speech.create({
      model: 'tts-1',
      voice: validVoice,
      input: fullScript,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.writeFile(ttsPath, buffer);
    console.log(`[TTS/OpenAI] Audio generato: ${ttsPath} (${buffer.length} bytes, ${scripts.length} scene)`);
  }

  return ttsPath;
}

/**
 * Sovrappone una traccia audio TTS a un video, sostituendo l'audio originale.
 * L'audio TTS viene troncato/ripetuto in base alla durata del video.
 */
async function mixTTSWithVideo(
  videoPath: string,
  ttsAudioPath: string,
  outputPath: string
): Promise<void> {
  const ffmpegPath = await resolveFfmpegPath();
  const { default: Ffmpeg } = await import('fluent-ffmpeg');
  Ffmpeg.setFfmpegPath(ffmpegPath);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const videoNorm = videoPath.replace(/\\/g, '/');
  const audioNorm = ttsAudioPath.replace(/\\/g, '/');
  const outputNorm = outputPath.replace(/\\/g, '/');

  await new Promise<void>((resolve, reject) => {
    Ffmpeg(videoNorm)
      .input(audioNorm)
      .outputOptions([
        '-map', '0:v',       // video track dall'input 0
        '-map', '1:a',       // audio track dall'input 1 (TTS)
        '-c:v', 'copy',      // copia video senza ricodifica
        '-c:a', 'aac',       // codifica audio AAC
        '-shortest',          // durata = traccia più corta (video o TTS)
        '-movflags', '+faststart',
      ])
      .output(outputNorm)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`mixTTSWithVideo: ${err.message}`)))
      .run();
  });
}

// ─── Stitching finale: concatena clip e restituisce URL pubblica ─────────
/**
 * Concatena tutte le clip completate e restituisce l'URL pubblica del video finale.
 * Se ttsOptions è fornito, genera TTS dall'audio narrativo e lo mescola nel video finale.
 * Richiede che tutte le clip abbiano videoUrl locali (/uploads/...).
 * Restituisce { url, ttsError? } — ttsError è valorizzato se il TTS fallisce ma il video è comunque presente.
 */
type TtsOptions = {
  scripts: string[];
  /** API key del provider TTS */
  apiKey: string;
  /** Provider da usare: 'openai' (default) o 'google' */
  provider?: 'openai' | 'google';
  voice?: string;
  /** Lingua per Google TTS (es: 'it', 'en') */
  language?: string;
};

export async function stitchClips(
  stitching: StitchingMeta,
  tenantId: string,
  siteId?: string | null,
  ttsOptions?: TtsOptions,
  /** Provider TTS alternativo: se il primario fallisce, viene usato automaticamente */
  fallbackTtsOptions?: TtsOptions
): Promise<{ url: string; ttsError?: string }> {
  const clipUrls = stitching.clips.map(c => c.videoUrl).filter(Boolean) as string[];
  if (clipUrls.length === 0) throw new Error('Nessuna clip da concatenare');

  // Valida che tutti gli URL siano locali
  for (const u of clipUrls) {
    if (!u.startsWith('/uploads/')) {
      throw new Error(`URL clip non locale (non ancora scaricata?): ${u.slice(0, 80)}`);
    }
  }

  if (clipUrls.length === 1 && !ttsOptions?.scripts?.length) return { url: clipUrls[0] };

  const localPaths = clipUrls.map(u => publicUrlToLocalPath(u));
  const outputPath = buildStitchedOutputPath(tenantId, siteId);

  console.log('[stitchClips] localPaths:', localPaths);
  await concatenateVideos(localPaths, outputPath);

  // ── TTS: genera narrazione continua e sovrapponi al video concatenato ──────
  let ttsError: string | undefined;

  // Helper: applica TTS al video già concatenato (restituisce true se riuscito)
  const applyTts = async (opts: TtsOptions): Promise<boolean> => {
    const validScripts = opts.scripts.filter(Boolean);
    if (validScripts.length === 0) return false;
    let ttsPath: string | null = null;
    try {
      const ttsProvider = opts.provider ?? 'openai';
      console.log(`[stitchClips] Generazione TTS (${ttsProvider}) per ${validScripts.length} scene...`);
      ttsPath = await generateTTSFromScripts(
        validScripts,
        opts.apiKey,
        opts.voice ?? 'alloy',
        ttsProvider,
        opts.language ?? 'it'
      );
      const ttsOutputPath = outputPath.replace('.mp4', '_tts.mp4');
      await mixTTSWithVideo(outputPath, ttsPath, ttsOutputPath);
      await fs.unlink(outputPath).catch(() => {});
      await fs.rename(ttsOutputPath, outputPath);
      console.log(`[stitchClips] TTS (${ttsProvider}) applicato con successo al video finale`);
      return true;
    } catch (err) {
      ttsError = err instanceof Error ? err.message : String(err);
      console.error(`[stitchClips] TTS (${opts.provider ?? 'openai'}) fallita:`, ttsError);
      return false;
    } finally {
      if (ttsPath) await fs.unlink(ttsPath).catch(() => {});
    }
  };

  if (ttsOptions?.scripts?.length && ttsOptions.apiKey) {
    const ok = await applyTts(ttsOptions);
    if (!ok && fallbackTtsOptions?.scripts?.length && fallbackTtsOptions.apiKey) {
      // Provider primario fallito → riprova con il fallback
      console.warn(`[stitchClips] Provider TTS primario (${ttsOptions.provider ?? 'openai'}) fallito → retry con ${fallbackTtsOptions.provider ?? 'google'}`);
      ttsError = undefined; // reset: se il fallback riesce, nessun errore
      const fallbackOk = await applyTts(fallbackTtsOptions);
      if (!fallbackOk) {
        console.error('[stitchClips] Anche il provider TTS di fallback ha fallito — video senza audio');
      }
    }
  }

  return { url: localPathToPublicUrl(outputPath), ttsError };
}

