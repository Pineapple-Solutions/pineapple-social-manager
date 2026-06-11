// src/lib/file-storage.ts
// Persistenza locale di file media (immagini e video)
// Struttura cartelle (tutte le categorie organizzate per tenant + sito):
//   public/uploads/media-library/{tenantId}/{siteId|"manual"}/{YYYYMM}/{uuid}.webp|mp4|...
//   public/uploads/video-ai/{tenantId}/{siteId|"no-site"}/{YYYYMM}/{uuid}.mp4
//   public/uploads/content-studio/{tenantId}/{siteId|"no-site"}/{YYYYMM}/{uuid}.webp|mp4

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export type StorageCategory = 'media-library' | 'video-ai' | 'content-studio';

export interface SaveOptions {
  /** Ottimizza il file per il web (default: true) */
  optimize?: boolean;
  /** Qualità WebP per immagini (0-100, default: 85) */
  imageQuality?: number;
  /** Estensione forzata (es. 'mp4') */
  forceExt?: string;
  /**
   * Sottocartella sito per media-library.
   * Passa il siteId (verrà usato così com'è come nome cartella).
   * Se omesso → 'manual'
   */
  siteId?: string | null;
  /**
   * Header HTTP aggiuntivi da inviare durante il download del file remoto.
   * Utile per URL che richiedono autenticazione (es. Google Veo file URI).
   */
  extraHeaders?: Record<string, string>;
}

export interface SaveResult {
  /** URL pubblico servito da Next.js ES: /uploads/media-library/... */
  publicUrl: string;
  /** Path assoluto su filesystem */
  localPath: string;
  /** Dimensione file in byte */
  size: number;
  /** MIME type rilevato */
  mimeType: string;
  /** true se il file è stato ottimizzato */
  optimized: boolean;
  /** Larghezza immagine in px (solo immagini ottimizzate) */
  width?: number;
  /** Altezza immagine in px (solo immagini ottimizzate) */
  height?: number;
}

// ─── utility path ─────────────────────────────────────────────────────────────

/** Root assoluto della cartella public/uploads */
const UPLOADS_ROOT = path.join(process.cwd(), 'public', 'uploads');

/**
 * Costruisce il path locale e la URL pubblica.
 * Struttura uniforme per tutte le categorie:
 *  - media-library  → uploads/media-library/{tenantId}/{siteId|"manual"}/{YYYYMM}/
 *  - video-ai       → uploads/video-ai/{tenantId}/{siteId|"no-site"}/{YYYYMM}/
 *  - content-studio → uploads/content-studio/{tenantId}/{siteId|"no-site"}/{YYYYMM}/
 */
function buildPaths(
  category: StorageCategory,
  tenantId: string,
  filename: string,
  siteId?: string | null
) {
  const now = new Date();
  const month = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Fallback diverso per media-library (compatibilità precedente) vs altri
  const fallbackSite = category === 'media-library' ? 'manual' : 'no-site';
  const siteSegment = siteId ? siteId : fallbackSite;
  const segments = [category, tenantId, siteSegment, month];

  const dir = path.join(UPLOADS_ROOT, ...segments);
  fs.mkdirSync(dir, { recursive: true });
  const localPath = path.join(dir, filename);
  const publicUrl = `/uploads/${segments.join('/')}/${filename}`;
  return { dir, localPath, publicUrl };
}

/** Guess extension from URL and content-type */
function guessExt(url: string, contentType: string): string {
  const ctMap: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
    'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/webm': 'webm',
    'video/quicktime': 'mov', 'video/x-msvideo': 'avi', 'video/ogg': 'ogv',
  };
  const fromCt = ctMap[contentType.split(';')[0].trim().toLowerCase()];
  if (fromCt) return fromCt;
  const fromUrl = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  const allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv'];
  return allowed.includes(fromUrl) ? fromUrl : 'bin';
}

function isImageExt(ext: string) {
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext.toLowerCase());
}

function isVideoExt(ext: string) {
  return ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv'].includes(ext.toLowerCase());
}

// ─── Ottimizzazione immagini con sharp ────────────────────────────────────────

async function optimizeImage(
  inputBuffer: Buffer,
  quality = 85
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const sharp = (await import('sharp')).default;
  // Salva come JPEG (non WebP) per compatibilità con Instagram, Facebook e TikTok:
  // le API di pubblicazione social non accettano image/webp come media type.
  const result = await sharp(inputBuffer)
    .jpeg({ quality, progressive: true })
    .toBuffer({ resolveWithObject: true });
  return {
    buffer: result.data,
    width: result.info.width,
    height: result.info.height,
  };
}

// ─── Ottimizzazione video con ffmpeg ─────────────────────────────────────────

async function optimizeVideo(inputPath: string, outputPath: string): Promise<void> {
  const ffmpegStatic = (await import('ffmpeg-static')).default;
  const ffmpeg = (await import('fluent-ffmpeg')).default;

  if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v libx264',      // codec H.264 universale
        '-crf 23',           // qualità costante (0=lossless, 51=worst) — 23 è il default, ottimo
        '-preset medium',    // bilanciamento velocità/qualità
        '-c:a aac',          // audio AAC
        '-b:a 128k',         // bitrate audio
        '-movflags +faststart', // streaming web-friendly (moov atom in testa)
        '-vf scale=\'min(1920,iw):-2\'', // max 1920px larghezza, mantieni aspect ratio
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

// ─── Scarica e salva un file da URL ─────────────────────────────────────────

/**
 * Scarica un file da un URL remoto, lo ottimizza (opzionale) e lo salva localmente.
 * Restituisce la URL pubblica e i metadati del file.
 */
export async function saveFileFromUrl(
  remoteUrl: string,
  category: StorageCategory,
  tenantId: string,
  opts: SaveOptions = {}
): Promise<SaveResult> {
  const { optimize = true, imageQuality = 85, forceExt } = opts;

  // Scarica il file (timeout esteso a 120s per video potenzialmente grandi)
  const response = await fetch(remoteUrl, {
    headers: {
      'User-Agent': 'Pineapple-Social-Manager/1.0',
      ...(opts.extraHeaders ?? {}),
    },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Download fallito: HTTP ${response.status} — ${remoteUrl}`);

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  const ext = forceExt ?? guessExt(remoteUrl, contentType);
  const mimeType = contentType.split(';')[0].trim();

  const rawBuffer = Buffer.from(await response.arrayBuffer());
  const uuid = uuidv4().replace(/-/g, '').slice(0, 16);

  // ── Immagini ──────────────────────────────────────────────────────────────
  if (isImageExt(ext) && optimize) {
    try {
      const { buffer, width, height } = await optimizeImage(rawBuffer, imageQuality);
      // Estensione .jpg — JPEG è richiesto da Instagram/Facebook/TikTok per la pubblicazione
      const filename = `${uuid}.jpg`;
      const { localPath, publicUrl } = buildPaths(category, tenantId, filename, opts.siteId);
      fs.writeFileSync(localPath, buffer);
      return {
        publicUrl,
        localPath,
        size: buffer.length,
        mimeType: 'image/jpeg',
        optimized: true,
        width,
        height,
      };
    } catch {
      // Se sharp fallisce, salva l'originale
    }
  }

  if (isImageExt(ext) && !optimize) {
    const filename = `${uuid}.${ext}`;
    const { localPath, publicUrl } = buildPaths(category, tenantId, filename, opts.siteId);
    fs.writeFileSync(localPath, rawBuffer);
    return { publicUrl, localPath, size: rawBuffer.length, mimeType, optimized: false };
  }

  // ── Video ─────────────────────────────────────────────────────────────────
  if (isVideoExt(ext)) {
    const rawFilename = `${uuid}_raw.${ext}`;
    const { localPath: rawPath } = buildPaths(category, tenantId, rawFilename, opts.siteId);
    fs.writeFileSync(rawPath, rawBuffer);

    if (optimize) {
      const optFilename = `${uuid}.mp4`;
      const { localPath: optPath, publicUrl } = buildPaths(category, tenantId, optFilename, opts.siteId);
      try {
        await optimizeVideo(rawPath, optPath);
        fs.unlinkSync(rawPath); // rimuovi file grezzo
        const size = fs.statSync(optPath).size;
        return { publicUrl, localPath: optPath, size, mimeType: 'video/mp4', optimized: true };
      } catch {
        // Se ffmpeg fallisce, tieni il grezzo rinominato
        const cleanFilename = `${uuid}.${ext}`;
        const { localPath: cleanPath, publicUrl: cleanUrl } = buildPaths(category, tenantId, cleanFilename, opts.siteId);
        fs.renameSync(rawPath, cleanPath);
        const size = fs.statSync(cleanPath).size;
        return { publicUrl: cleanUrl, localPath: cleanPath, size, mimeType, optimized: false };
      }
    } else {
      // Non ottimizzare — rinomina senza _raw
      const cleanFilename = `${uuid}.${ext}`;
      const { localPath: cleanPath, publicUrl } = buildPaths(category, tenantId, cleanFilename, opts.siteId);
      fs.renameSync(rawPath, cleanPath);
      return { publicUrl, localPath: cleanPath, size: rawBuffer.length, mimeType, optimized: false };
    }
  }

  // ── Fallback generico ─────────────────────────────────────────────────────
  const filename = `${uuid}.${ext}`;
  const { localPath, publicUrl } = buildPaths(category, tenantId, filename, opts.siteId);
  fs.writeFileSync(localPath, rawBuffer);
  return { publicUrl, localPath, size: rawBuffer.length, mimeType, optimized: false };
}

// ─── Salva un buffer direttamente (per contenuti già in memoria) ──────────────

export async function saveBufferToStorage(
  buffer: Buffer,
  category: StorageCategory,
  tenantId: string,
  ext: string,
  opts: SaveOptions = {}
): Promise<SaveResult> {
  const { optimize = true, imageQuality = 85 } = opts;
  const mimeType = ext === 'webp' ? 'image/webp' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'mp4' ? 'video/mp4' : 'application/octet-stream';
  const uuid = uuidv4().replace(/-/g, '').slice(0, 16);

  if (isImageExt(ext) && optimize) {
    try {
      const { buffer: optBuf, width, height } = await optimizeImage(buffer, imageQuality);
      // .jpg — JPEG richiesto dalle API social (Instagram/Facebook/TikTok non accettano WebP)
      const filename = `${uuid}.jpg`;
      const { localPath, publicUrl } = buildPaths(category, tenantId, filename, opts.siteId);
      fs.writeFileSync(localPath, optBuf);
      return { publicUrl, localPath, size: optBuf.length, mimeType: 'image/jpeg', optimized: true, width, height };
    } catch { /* fallback */ }
  }

  const filename = `${uuid}.${ext}`;
  const { localPath, publicUrl } = buildPaths(category, tenantId, filename, opts.siteId);
  fs.writeFileSync(localPath, buffer);
  return { publicUrl, localPath, size: buffer.length, mimeType, optimized: false };
}

// ─── Elimina un file locale ───────────────────────────────────────────────────

/**
 * Elimina il file fisico a partire dalla publicUrl (/uploads/...).
 * Non lancia eccezioni se il file non esiste.
 */
export function deleteLocalFile(publicUrl: string | null | undefined): void {
  if (!publicUrl || !publicUrl.startsWith('/uploads/')) return;
  try {
    const localPath = path.join(process.cwd(), 'public', publicUrl);
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  } catch { /* ignora */ }
}

// ─── Controlla se un URL è già locale ────────────────────────────────────────

export function isLocalUrl(url: string): boolean {
  return url.startsWith('/uploads/');
}
