// src/lib/watermark-remover.ts
// Rimozione filigrana da immagini e video
// ⚠️ USO CONSENTITO SOLO PER MOCKUP/BOZZE INTERNE — NON PER PUBBLICAZIONE COMMERCIALE

import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';

export type RemovalMethod = 'dissolve' | 'distorsione' | 'taglio';

export interface WatermarkRegion {
  xPct: number;   // 0–100: % del bordo sinistro
  yPct: number;   // 0–100: % del bordo superiore
  wPct: number;   // 0–100: % della larghezza totale
  hPct: number;   // 0–100: % dell'altezza totale
}

// Preset comuni per posizione filigrana
export const WATERMARK_PRESETS: Record<string, { label: string; region: WatermarkRegion }> = {
  center:         { label: 'Centro (Shutterstock, iStock)', region: { xPct: 20, yPct: 30, wPct: 60, hPct: 40 } },
  'bottom-right': { label: 'Angolo basso destra (Adobe Stock)', region: { xPct: 55, yPct: 75, wPct: 45, hPct: 25 } },
  'bottom-left':  { label: 'Angolo basso sinistra', region: { xPct: 0, yPct: 75, wPct: 45, hPct: 25 } },
  'top-right':    { label: 'Angolo alto destra', region: { xPct: 55, yPct: 0, wPct: 45, hPct: 25 } },
  'top-left':     { label: 'Angolo alto sinistra', region: { xPct: 0, yPct: 0, wPct: 45, hPct: 25 } },
  full:           { label: "Tutta l'immagine (sovrapposto)", region: { xPct: 0, yPct: 0, wPct: 100, hPct: 100 } },
};

// ─── Directory output ─────────────────────────────────────────
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'watermark-removed');

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

// ─── Download sorgente ────────────────────────────────────────
async function downloadToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Download fallito: HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

// ─── RIMOZIONE DA IMMAGINE ────────────────────────────────────
export async function removeWatermarkFromImage(
  sourceUrl: string,
  region: WatermarkRegion,
  removalMethod: RemovalMethod = 'dissolve',
  tenantId?: string,
  openAIApiKey?: string,
  openAIModel?: string
): Promise<{ outputUrl: string; method: string }> {
  await ensureOutputDir();

  const buffer = await downloadToBuffer(sourceUrl);
  const sharp = (await import('sharp')).default;

  const meta = await sharp(buffer).metadata();
  const imgW = meta.width ?? 1024;
  const imgH = meta.height ?? 1024;

  // Coordinate pixel dalla percentuale
  const x = Math.max(0, Math.floor(imgW * region.xPct / 100));
  const y = Math.max(0, Math.floor(imgH * region.yPct / 100));
  const w = Math.min(imgW - x, Math.max(1, Math.floor(imgW * region.wPct / 100)));
  const h = Math.min(imgH - y, Math.max(1, Math.floor(imgH * region.hPct / 100)));
  const bounds = { x, y, w, h, imgW, imgH };

  const filename = `img_${randomUUID()}.png`;
  const outPath = path.join(OUTPUT_DIR, filename);

  let result: Buffer;
  let methodName: string;

  if (removalMethod === 'distorsione') {
    result = await removeWithDistortion(buffer, bounds);
    methodName = 'distorsione-stretch';
  } else if (removalMethod === 'taglio') {
    result = await removeWithSmartCrop(buffer, bounds);
    methodName = 'taglio-smart-crop';
  } else {
    // dissolve: DALL-E se disponibile, altrimenti sharp blur
    if (openAIApiKey) {
      try {
        result = await removeWithDALLE(buffer, bounds, openAIApiKey);
        methodName = 'dissolve-dalle-inpaint';
      } catch {
        result = await removeWithSharp(buffer, bounds);
        methodName = 'dissolve-sharp-inpaint';
      }
    } else {
      result = await removeWithSharp(buffer, bounds);
      methodName = 'dissolve-sharp-inpaint';
    }
  }

  await fs.writeFile(outPath, result);
  return { outputUrl: `/watermark-removed/${filename}`, method: methodName };
}

// ─── DALL-E 2 inpainting ──────────────────────────────────────
async function removeWithDALLE(
  imgBuffer: Buffer,
  bounds: { x: number; y: number; w: number; h: number; imgW: number; imgH: number },
  apiKey: string
): Promise<Buffer> {
  const { default: OpenAI } = await import('openai');
  const sharp = (await import('sharp')).default;

  // DALL-E 2 edit vuole PNG rgba 1024x1024
  const resized = await sharp(imgBuffer)
    .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // Scala le coordinate alla risoluzione 1024x1024
  const scaleX = 1024 / bounds.imgW;
  const scaleY = 1024 / bounds.imgH;
  const mx = Math.floor(bounds.x * scaleX);
  const my = Math.floor(bounds.y * scaleY);
  const mw = Math.min(1024 - mx, Math.floor(bounds.w * scaleX));
  const mh = Math.min(1024 - my, Math.floor(bounds.h * scaleY));

  // Crea maschera: tutto bianco (opaco) tranne la zona da rigenerare (trasparente)
  const maskBuffer = await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } },
  })
    .composite([{
      input: await sharp({
        create: { width: mw, height: mh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      }).png().toBuffer(),
      left: mx,
      top: my,
    }])
    .png()
    .toBuffer();

  const client = new OpenAI({ apiKey });
  const resp = await client.images.edit({
    image: new File([new Uint8Array(resized)], 'image.png', { type: 'image/png' }),
    mask: new File([new Uint8Array(maskBuffer)], 'mask.png', { type: 'image/png' }),
    prompt: 'Fill this area naturally continuing the surrounding background texture and colors, removing any text or logo watermark.',
    n: 1,
    size: '1024x1024',
    response_format: 'b64_json',
  });

  const b64 = resp.data?.[0]?.b64_json;
  if (!b64) throw new Error('DALL-E non ha restituito immagine');
  return Buffer.from(b64, 'base64');
}

// ─── Sharp inpainting (campionamento colori bordi) ─────────────
async function removeWithSharp(
  imgBuffer: Buffer,
  bounds: { x: number; y: number; w: number; h: number; imgW: number; imgH: number }
): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const { x, y, w, h } = bounds;

  // Sfoca pesantemente la zona del watermark e campiona il colore
  const watermarkZone = await sharp(imgBuffer)
    .extract({ left: x, top: y, width: w, height: h })
    .blur(25)
    .modulate({ brightness: 1.05 })
    .toBuffer();

  // Seconda passata di media gaussiana
  const blurredTwice = await sharp(watermarkZone)
    .resize(Math.max(1, Math.floor(w / 4)), Math.max(1, Math.floor(h / 4)))
    .resize(w, h, { kernel: 'mitchell' })
    .blur(8)
    .toBuffer();

  return sharp(imgBuffer)
    .composite([{ input: blurredTwice, left: x, top: y, blend: 'over' }])
    .png()
    .toBuffer();
}

// ─── DISTORSIONE: scala+sposta per spingere la filigrana fuori ──
// Ingrandisce l'immagine nella direzione in cui si trova la filigrana
// in modo che la zona con watermark esca dal bordo, poi ritaglia
// all'area originale. Il contenuto risulta leggermente "stirato".
async function removeWithDistortion(
  imgBuffer: Buffer,
  bounds: { x: number; y: number; w: number; h: number; imgW: number; imgH: number }
): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const { x, y, w, h, imgW, imgH } = bounds;

  // Calcola la distanza di ogni bordo della filigrana dai bordi dell'immagine
  const distLeft   = x;
  const distRight  = imgW - (x + w);
  const distTop    = y;
  const distBottom = imgH - (y + h);
  const minDist    = Math.min(distLeft, distRight, distTop, distBottom);

  let scaledW: number, scaledH: number;
  let cropLeft: number, cropTop: number, cropW: number, cropH: number;

  if (minDist === distBottom) {
    // Filigrana in basso: scala verticalmente, poi ritaglia dal basso
    const safeH = Math.max(4, y);
    const scale = imgH / safeH;
    scaledH = Math.ceil(safeH * scale);
    scaledW = Math.ceil(imgW * scale);
    cropLeft = Math.floor((scaledW - imgW) / 2);
    cropTop  = 0;
    cropW    = imgW;
    cropH    = imgH;
  } else if (minDist === distTop) {
    // Filigrana in alto: scala, poi ritaglia dall'alto
    const safeStart = y + h;
    const safeH = Math.max(4, imgH - safeStart);
    const scale = imgH / safeH;
    scaledH = Math.ceil(safeH * scale);
    scaledW = Math.ceil(imgW * scale);
    cropLeft = Math.floor((scaledW - imgW) / 2);
    cropTop  = Math.max(0, scaledH - imgH);
    cropW    = imgW;
    cropH    = imgH;
  } else if (minDist === distRight) {
    // Filigrana a destra: scala orizzontalmente, poi ritaglia da destra
    const safeW = Math.max(4, x);
    const scale = imgW / safeW;
    scaledW = Math.ceil(safeW * scale);
    scaledH = Math.ceil(imgH * scale);
    cropLeft = 0;
    cropTop  = Math.floor((scaledH - imgH) / 2);
    cropW    = imgW;
    cropH    = imgH;
  } else {
    // Filigrana a sinistra: scala, poi ritaglia da sinistra
    const safeStart = x + w;
    const safeW = Math.max(4, imgW - safeStart);
    const scale = imgW / safeW;
    scaledW = Math.ceil(safeW * scale);
    scaledH = Math.ceil(imgH * scale);
    cropLeft = Math.max(0, scaledW - imgW);
    cropTop  = Math.floor((scaledH - imgH) / 2);
    cropW    = imgW;
    cropH    = imgH;
  }

  // Clampa i valori per evitare estrazione fuori dai limiti
  cropLeft = Math.max(0, Math.min(cropLeft, scaledW - 1));
  cropTop  = Math.max(0, Math.min(cropTop,  scaledH - 1));
  cropW    = Math.min(cropW, scaledW - cropLeft);
  cropH    = Math.min(cropH, scaledH - cropTop);

  return sharp(imgBuffer)
    .resize(scaledW, scaledH, { fit: 'fill' })
    .extract({ left: cropLeft, top: cropTop, width: Math.max(1, cropW), height: Math.max(1, cropH) })
    .resize(imgW, imgH, { fit: 'fill' })
    .png()
    .toBuffer();
}

// ─── TAGLIO SMART: trova la finestra più ampia senza filigrana ──
// Individua la più grande area rettangolare dell'immagine che non
// contiene la filigrana, preserva le proporzioni originali,
// poi ridimensiona all'area originale.
async function removeWithSmartCrop(
  imgBuffer: Buffer,
  bounds: { x: number; y: number; w: number; h: number; imgW: number; imgH: number }
): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const { x, y, w, h, imgW, imgH } = bounds;

  const aspectRatio = imgW / imgH;

  // 4 possibili fasce sicure (ai 4 lati della filigrana)
  const candidates = [
    { left: 0,     top: 0,     width: x,               height: imgH          }, // a sinistra
    { left: x + w, top: 0,     width: imgW - (x + w),   height: imgH          }, // a destra
    { left: 0,     top: 0,     width: imgW,              height: y             }, // sopra
    { left: 0,     top: y + h, width: imgW,              height: imgH - (y + h) }, // sotto
  ].filter(c => c.width > 10 && c.height > 10);

  if (candidates.length === 0) {
    // Fallback: ritorna l'originale se non esiste area sicura
    return imgBuffer;
  }

  // Ordina per area totale (più grande prima)
  candidates.sort((a, b) => (b.width * b.height) - (a.width * a.height));
  const safe = candidates[0];

  // Massimo rettangolo con le stesse proporzioni dell'originale, centrato nell'area sicura
  let cropW: number, cropH: number;
  if (safe.width / safe.height > aspectRatio) {
    cropH = safe.height;
    cropW = Math.floor(safe.height * aspectRatio);
  } else {
    cropW = safe.width;
    cropH = Math.floor(safe.width / aspectRatio);
  }

  // Centra nell'area sicura
  const cropLeft = safe.left + Math.floor((safe.width  - cropW) / 2);
  const cropTop  = safe.top  + Math.floor((safe.height - cropH) / 2);

  return sharp(imgBuffer)
    .extract({
      left:   Math.max(0, cropLeft),
      top:    Math.max(0, cropTop),
      width:  Math.max(1, cropW),
      height: Math.max(1, cropH),
    })
    .resize(imgW, imgH, { fit: 'fill' })
    .png()
    .toBuffer();
}

// ─── RIMOZIONE DA VIDEO ───────────────────────────────────────
export async function removeWatermarkFromVideo(
  sourceUrl: string,
  region: WatermarkRegion,
  removalMethod: RemovalMethod = 'dissolve'
): Promise<{ outputUrl: string; method: string }> {
  await ensureOutputDir();

  const tmpDir = path.join(OUTPUT_DIR, 'tmp');
  await fs.mkdir(tmpDir, { recursive: true });

  const inputFile     = path.join(tmpDir, `in_${randomUUID()}.mp4`);
  const outputFilename = `vid_${randomUUID()}.mp4`;
  const outputFile    = path.join(OUTPUT_DIR, outputFilename);

  try {
    const videoBuffer = await downloadToBuffer(sourceUrl);
    await fs.writeFile(inputFile, videoBuffer);

    let methodName: string;
    if (removalMethod === 'distorsione') {
      await processVideoDistortion(inputFile, outputFile, region);
      methodName = 'video-distorsione';
    } else if (removalMethod === 'taglio') {
      await processVideoSmartCrop(inputFile, outputFile, region);
      methodName = 'video-taglio';
    } else {
      await processVideoDelogo(inputFile, outputFile, region);
      methodName = 'video-dissolve-delogo';
    }

    return { outputUrl: `/watermark-removed/${outputFilename}`, method: methodName };
  } finally {
    await fs.unlink(inputFile).catch(() => {});
  }
}

// ─── Video: Dissolve — ffmpeg delogo ──────────────────────────
function processVideoDelogo(
  inputPath: string,
  outputPath: string,
  region: WatermarkRegion
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const ffmpeg = (await import('fluent-ffmpeg')).default;
    const ffmpegStatic = (await import('ffmpeg-static')).default;
    if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

    const delogoX = `iw*${region.xPct / 100}`;
    const delogoY = `ih*${region.yPct / 100}`;
    const delogoW = `iw*${region.wPct / 100}`;
    const delogoH = `ih*${region.hPct / 100}`;

    ffmpeg(inputPath)
      .videoFilter(`delogo=x=${delogoX}:y=${delogoY}:w=${delogoW}:h=${delogoH}:show=0`)
      .outputOptions(['-c:a copy', '-movflags +faststart'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`ffmpeg delogo error: ${err.message}`)))
      .run();
  });
}

// ─── Video: Distorsione — zoom + ritaglia il bordo con WM ─────
// Scala il video in modo da spingere la filigrana fuori dal frame,
// poi ritaglia all'area originale (con leggera distorsione).
function processVideoDistortion(
  inputPath: string,
  outputPath: string,
  region: WatermarkRegion
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const ffmpeg = (await import('fluent-ffmpeg')).default;
    const ffmpegStatic = (await import('ffmpeg-static')).default;
    if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

    const xPct = region.xPct / 100;
    const yPct = region.yPct / 100;
    const wPct = region.wPct / 100;
    const hPct = region.hPct / 100;

    // Determina il bordo dominante e calcola il fattore di scala
    // La filigrana si trova da (xPct,yPct) a (xPct+wPct, yPct+hPct)
    const distRight  = 1 - (xPct + wPct);
    const distBottom = 1 - (yPct + hPct);
    const distLeft   = xPct;
    const distTop    = yPct;
    const minDist    = Math.min(distLeft, distRight, distTop, distBottom);

    let scaleFilter: string;
    let cropFilter: string;

    if (minDist === distBottom) {
      // WM in basso: scala iw:ih/(yPct), poi crop in alto
      const sh = Math.max(0.1, yPct);
      const scale = 1 / sh;
      scaleFilter = `scale=iw:ih*${scale.toFixed(4)}`;
      cropFilter  = `crop=iw:ih/${scale.toFixed(4)}:0:0`;
    } else if (minDist === distTop) {
      const sh = Math.max(0.1, 1 - (yPct + hPct));
      const scale = 1 / sh;
      scaleFilter = `scale=iw:ih*${scale.toFixed(4)}`;
      cropFilter  = `crop=iw:ih/${scale.toFixed(4)}:0:ih-ih/${scale.toFixed(4)}`;
    } else if (minDist === distRight) {
      const sw = Math.max(0.1, xPct);
      const scale = 1 / sw;
      scaleFilter = `scale=iw*${scale.toFixed(4)}:ih`;
      cropFilter  = `crop=iw/${scale.toFixed(4)}:ih:0:0`;
    } else {
      const sw = Math.max(0.1, 1 - (xPct + wPct));
      const scale = 1 / sw;
      scaleFilter = `scale=iw*${scale.toFixed(4)}:ih`;
      cropFilter  = `crop=iw/${scale.toFixed(4)}:ih:iw-iw/${scale.toFixed(4)}:0`;
    }

    ffmpeg(inputPath)
      .videoFilter([scaleFilter, cropFilter, 'scale=iw:ih'])
      .outputOptions(['-c:a copy', '-movflags +faststart'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`ffmpeg distorsione error: ${err.message}`)))
      .run();
  });
}

// ─── Video: Taglio smart — finestra più ampia senza WM ────────
// Trova l'area più grande senza filigrana, preserva l'aspect ratio,
// poi ridimensiona al formato originale.
function processVideoSmartCrop(
  inputPath: string,
  outputPath: string,
  region: WatermarkRegion
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const ffmpeg = (await import('fluent-ffmpeg')).default;
    const ffmpegStatic = (await import('ffmpeg-static')).default;
    if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

    const xPct = region.xPct / 100;
    const yPct = region.yPct / 100;
    const wPct = region.wPct / 100;
    const hPct = region.hPct / 100;

    // 4 aree candidate (strisce sicure intorno alla filigrana)
    const candidates = [
      { area: xPct * 1,              crop: `crop=iw*${xPct.toFixed(4)}:ih:0:0` },
      { area: (1-(xPct+wPct)) * 1,  crop: `crop=iw*${(1-xPct-wPct).toFixed(4)}:ih:iw*(${(xPct+wPct).toFixed(4)}):0` },
      { area: 1 * yPct,              crop: `crop=iw:ih*${yPct.toFixed(4)}:0:0` },
      { area: 1 * (1-yPct-hPct),    crop: `crop=iw:ih*${(1-yPct-hPct).toFixed(4)}:0:ih*(${(yPct+hPct).toFixed(4)})` },
    ].filter(c => c.area > 0.05);

    if (candidates.length === 0) {
      // Fallback a delogo
      return processVideoDelogo(inputPath, outputPath, region).then(resolve).catch(reject);
    }

    candidates.sort((a, b) => b.area - a.area);
    const best = candidates[0];

    // Crop → scale back to original size
    ffmpeg(inputPath)
      .videoFilter([best.crop, 'scale=iw:ih', `scale=trunc(iw/2)*2:trunc(ih/2)*2`])
      .outputOptions(['-c:a copy', '-movflags +faststart'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`ffmpeg taglio error: ${err.message}`)))
      .run();
  });
}

// ─── Cleanup file vecchi (opzionale) ────────────────────────────
export async function cleanupOldFiles(maxAgeHours = 24): Promise<void> {
  try {
    const files = await fs.readdir(OUTPUT_DIR);
    const now = Date.now();
    for (const f of files) {
      if (f === 'tmp') continue;
      const filePath = path.join(OUTPUT_DIR, f);
      const stat = await fs.stat(filePath);
      const ageHours = (now - stat.mtimeMs) / 3600000;
      if (ageHours > maxAgeHours) {
        await fs.unlink(filePath).catch(() => {});
      }
    }
  } catch { /* non-blocking */ }
}

