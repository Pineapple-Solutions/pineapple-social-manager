// src/app/api/media/extract/route.ts
// Estrae immagini OPPURE video da un sito collegato
// mediaType=IMAGE → max 30 | mediaType=VIDEO → max 5
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { scrapeSite } from '@/lib/content-scraper';
import { saveFileFromUrl } from '@/lib/file-storage';

// ─── Limiti per tipo ───────────────────────────────────────────
const MAX_IMAGES = 30;
const MAX_VIDEOS = 5;

// ─── AI: genera alt text / descrizione per il media ───────────
async function generateMediaDescription(
  providerConfig: { provider: string; apiKey: string; model: string },
  mediaUrl: string,
  mediaType: 'IMAGE' | 'VIDEO',
  siteContext: string
): Promise<string> {
  const prompt = mediaType === 'IMAGE'
    ? `Scrivi un alt text SEO-friendly in italiano per questa immagine del sito "${siteContext}". URL: ${mediaUrl}. Rispondi con SOLO l'alt text, max 120 caratteri.`
    : `Scrivi una breve descrizione in italiano per questo video del sito "${siteContext}". URL: ${mediaUrl}. Rispondi con SOLO la descrizione, max 120 caratteri.`;

  try {
    switch (providerConfig.provider) {
      case 'openai': {
        const { default: OpenAI } = await import('openai');
        const client = new OpenAI({ apiKey: providerConfig.apiKey });
        const res = await client.chat.completions.create({
          model: providerConfig.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 80,
        });
        return res.choices[0]?.message?.content?.trim() ?? '';
      }
      case 'anthropic': {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey: providerConfig.apiKey });
        const msg = await client.messages.create({
          model: providerConfig.model,
          max_tokens: 80,
          messages: [{ role: 'user', content: prompt }],
        });
        return msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '';
      }
      case 'google': {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(providerConfig.apiKey);
        const model = genAI.getGenerativeModel({ model: providerConfig.model });
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
      }
      default:
        return '';
    }
  } catch {
    return '';
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('pineapple_session')?.value;
    const user = token ? await verifyToken(token) : null;
    if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const body = await req.json();
    const tenantId: string = body.tenantId ?? user.tenantId ?? '';
    const siteId: string = body.siteId ?? '';
    const mediaType: 'IMAGE' | 'VIDEO' = body.mediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE';
    const enrichWithAI: boolean = body.enrichWithAI === true;

    // Limiti differenziati per tipo
    const hardLimit = mediaType === 'VIDEO' ? MAX_VIDEOS : MAX_IMAGES;
    const requestedMax = Number(body.maxItems ?? body.maxImages ?? hardLimit);
    const maxItems = Math.min(requestedMax, hardLimit);

    if (!tenantId) return NextResponse.json({ success: false, error: 'tenantId richiesto' }, { status: 400 });
    if (!siteId) return NextResponse.json({ success: false, error: 'siteId richiesto' }, { status: 400 });

    // Sicurezza
    if (user.role !== 'master' && user.tenantId !== tenantId) {
      return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
    }

    // Carica il sito
    const site = await prisma.connectedSite.findUnique({ where: { id: siteId } });
    if (!site) return NextResponse.json({ success: false, error: 'Sito non trovato' }, { status: 404 });
    if (site.tenantId !== tenantId && user.role !== 'master') {
      return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
    }

    // Scraping
    const scraped = await scrapeSite(site.url);
    if (!scraped.scraped) {
      return NextResponse.json({
        success: false,
        error: scraped.error ?? 'Impossibile fare scraping del sito.',
      }, { status: 422 });
    }

    // Seleziona i media in base al tipo richiesto
    // Per le IMMAGINI: accetta tutti gli URL trovati dallo scraper (già da tag <img> e CSS)
    // escludendo solo favicon/icone dal nome evidente — il filtro a estensione
    // è troppo restrittivo per siti moderni (Next.js, CDN senza ext, ecc.)
    const EXCLUDE_IMG = /\/(favicon|icon-\d+|sprite|pixel|tracking|beacon|clarity)\b/i;

    const rawMedia = mediaType === 'VIDEO'
      ? (scraped.videos ?? [])
      : (scraped.images ?? []).filter(
          (u) => u.length > 0 && !EXCLUDE_IMG.test(u)
        );

    if (!rawMedia.length) {
      const label = mediaType === 'VIDEO' ? 'video' : 'immagini';
      return NextResponse.json({
        success: false,
        error: `Nessun ${label} trovato nel sito. ${mediaType === 'VIDEO' ? 'I siti che non ospitano file video direttamente (es. YouTube embed) non possono essere estratti.' : ''}`.trim(),
      }, { status: 422 });
    }

    // Filtra già presenti in libreria (stesso sito + stesso tipo)
    // Usa sia url (locale) sia originalUrl (remoto) per evitare re-import duplicati
    const existing = await prisma.mediaAsset.findMany({
      where: { tenantId, siteId, type: mediaType },
      select: { url: true, originalUrl: true },
    });
    const existingUrls = new Set([
      ...existing.map((a: { url: string; originalUrl: string | null }) => a.url),
      ...existing.map((a: { url: string; originalUrl: string | null }) => a.originalUrl).filter(Boolean),
    ] as string[]);

    const newMedia = rawMedia
      .filter((url) => !existingUrls.has(url))
      .slice(0, maxItems);

    if (!newMedia.length) {
      return NextResponse.json({
        success: true,
        data: [],
        message: `Nessun nuovo ${mediaType === 'VIDEO' ? 'video' : 'immagine'} trovato (tutti già importati).`,
      });
    }

    // Provider AI opzionale
    let providerConfig: { provider: string; apiKey: string; model: string } | null = null;
    if (enrichWithAI) {
      const p = await prisma.aIProviderConfig.findFirst({
        where: { tenantId, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
      if (p) providerConfig = { provider: p.provider, apiKey: p.apiKey, model: p.model };
    }

    const siteLabel = site.name ?? site.url;
    const created: { id: string; url: string; alt: string | null; name: string }[] = [];

    // Limite AI: per immagini max 10, per video max 5 (tutti)
    const aiLimit = mediaType === 'VIDEO' ? 5 : 10;

    // Ottimizzazione web — default true
    const optimize: boolean = body.optimize !== false;

    for (let i = 0; i < newMedia.length; i++) {
      const mediaUrl = newMedia[i];
      let alt: string | null = null;

      if (enrichWithAI && providerConfig && i < aiLimit) {
        alt = await generateMediaDescription(providerConfig, mediaUrl, mediaType, siteLabel);
      }

      const filename = mediaUrl.split('/').pop()?.split('?')[0] ?? `${mediaType.toLowerCase()}-${i + 1}`;
      const name = alt?.slice(0, 60) || filename;

      // ── Scarica e persiste il file localmente ─────────────────────────────
      let localUrl = mediaUrl;
      let savedMime: string | null = null;
      let savedSize: number | null = null;
      let savedWidth: number | null = null;
      let savedHeight: number | null = null;
      try {
        const saved = await saveFileFromUrl(mediaUrl, 'media-library', tenantId, {
          optimize,
          imageQuality: 85,
          siteId: siteId ?? null,
        });
        localUrl = saved.publicUrl;
        savedMime = saved.mimeType;
        savedSize = saved.size;
        if (saved.width) savedWidth = saved.width;
        if (saved.height) savedHeight = saved.height;
      } catch (e) {
        console.warn(`[extract] download fallito per ${mediaUrl}:`, e instanceof Error ? e.message : e);
        // usa URL remoto come fallback
      }

      const asset = await prisma.mediaAsset.create({
        data: {
          tenantId,
          siteId,
          name,
          url: localUrl,
          // Salva l'URL remoto originale per la deduplicazione nelle estrazioni successive
          originalUrl: localUrl !== mediaUrl ? mediaUrl : null,
          type: mediaType,
          mimeType: savedMime,
          alt,
          width: savedWidth,
          height: savedHeight,
          size: savedSize,
          source: 'SITE_EXTRACTED',
          usedInAI: true,
          tags: JSON.stringify([site.niche ?? '', siteLabel].filter(Boolean)),
        },
      });

      created.push({ id: asset.id, url: asset.url, alt: asset.alt, name: asset.name });
    }

    const label = mediaType === 'VIDEO' ? 'video' : 'immagini';
    return NextResponse.json({
      success: true,
      data: created,
      message: `${created.length} ${label} estratt${mediaType === 'VIDEO' ? 'i' : 'e'} dal sito.`,
    });
  } catch (err) {
    console.error('[media extract]', err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Errore interno',
    }, { status: 500 });
  }
}


// Dispatcher AI minimale per generare alt text
async function generateAltText(
  providerConfig: { provider: string; apiKey: string; model: string },
  imageUrl: string,
  siteContext: string
): Promise<string> {
  const prompt = `Scrivi un alt text SEO-friendly in italiano per questa immagine del sito ${siteContext}. URL immagine: ${imageUrl}. Rispondi con SOLO l'alt text, max 120 caratteri.`;

  try {
    switch (providerConfig.provider) {
      case 'openai': {
        const { default: OpenAI } = await import('openai');
        const client = new OpenAI({ apiKey: providerConfig.apiKey });
        const res = await client.chat.completions.create({
          model: providerConfig.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 80,
        });
        return res.choices[0]?.message?.content?.trim() ?? '';
      }
      case 'anthropic': {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey: providerConfig.apiKey });
        const msg = await client.messages.create({
          model: providerConfig.model,
          max_tokens: 80,
          messages: [{ role: 'user', content: prompt }],
        });
        return msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '';
      }
      case 'google': {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(providerConfig.apiKey);
        const model = genAI.getGenerativeModel({ model: providerConfig.model });
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
      }
      default:
        return '';
    }
  } catch {
    return '';
  }
}


