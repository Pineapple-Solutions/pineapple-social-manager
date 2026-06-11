// src/lib/content-scraper.ts
// Scraping contenuti dal sito per alimentare l'AI

import * as cheerio from 'cheerio';

export interface ScrapedContent {
  title?: string;
  description?: string;
  keywords?: string[];
  mainText?: string;
  images?: string[];
  videos?: string[];           // ← NUOVO: URL di file video trovati nel sito
  headlines?: string[];
  products?: { name: string; description?: string; price?: string }[];
  faviconUrl?: string;         // favicon / icona del sito
  url: string;
  scraped: boolean;
  error?: string;
}

export async function scrapeSite(url: string): Promise<ScrapedContent> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Pineapple-Social-Manager/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);


    // Meta
    const title =
      $('title').text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      $('h1').first().text().trim();

    const description =
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      $('p').first().text().trim().slice(0, 200);

    const keywords = ($('meta[name="keywords"]').attr('content') ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    // ─── Favicon / icona del sito ──────────────────────────────────
    let faviconUrl: string | undefined;

    // 1. apple-touch-icon (alta qualità)
    const appleIcon =
      $('link[rel="apple-touch-icon"]').first().attr('href') ||
      $('link[rel="apple-touch-icon-precomposed"]').first().attr('href');

    // 2. <link rel="icon"> o <link rel="shortcut icon">
    //    Ordine preferenza: svg > png > qualsiasi altro (ico)
    let linkIcon: string | undefined;
    $('link').each((_, el) => {
      const rel = ($(el).attr('rel') ?? '').toLowerCase();
      if (!rel.includes('icon')) return;
      const href = $(el).attr('href');
      if (!href || href.startsWith('data:')) return;
      if (!linkIcon) linkIcon = href;
      const type = $(el).attr('type') ?? '';
      if (type.includes('svg') || type.includes('png') || /\.(svg|png)(\?|$)/i.test(href)) {
        linkIcon = href;
        return false as unknown as void; // break cheerio each
      }
    });

    const rawFavicon = appleIcon || linkIcon;
    if (rawFavicon) {
      faviconUrl = rawFavicon.startsWith('http') ? rawFavicon : new URL(rawFavicon, url).toString();
    } else {
      // 3. Prova percorsi comuni con HEAD request (timeout aggressivo)
      const commonPaths = [
        '/favicon.ico',
        '/favicon.png',
        '/favicon.svg',
        '/images/favicon.ico',
        '/images/favicon.png',
        '/img/favicon.ico',
        '/img/favicon.png',
        '/assets/favicon.ico',
        '/assets/favicon.png',
        '/static/favicon.ico',
        '/static/favicon.png',
      ];
      const baseOrigin = new URL(url).origin;
      for (const p of commonPaths) {
        try {
          const probeUrl = `${baseOrigin}${p}`;
          const probe = await fetch(probeUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(3000),
          });
          if (probe.ok) {
            const ct = probe.headers.get('content-type') ?? '';
            if (ct.startsWith('image') || ct.includes('icon') || ct.includes('octet')) {
              faviconUrl = probeUrl;
              break;
            }
          }
        } catch { /* percorso non disponibile */ }
      }

      // 4. Google Favicon Service come fallback finale garantito
      if (!faviconUrl) {
        try {
          const domain = new URL(url).hostname;
          faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        } catch { /* ignora */ }
      }
    }

    // ─── Immagini (fino a 60 candidati, prima di rimuovere elementi) ───────
    // Nota: vanno raccolte PRIMA di rimuovere header/nav/footer perché
    // contengono immagini hero, loghi e banner importanti per il brand.
    const images: string[] = [];
    const seenImgs = new Set<string>();

    $('img').each((_, el) => {
      // Tutti gli attributi lazy-load più comuni (ordinati per priorità)
      const rawSrc =
        $(el).attr('src') ||
        $(el).attr('data-src') ||
        $(el).attr('data-lazy-src') ||
        $(el).attr('data-lazy') ||
        $(el).attr('data-original') ||
        $(el).attr('data-img-src') ||
        $(el).attr('data-source') ||
        // srcset: prendi il primo URL (il più piccolo, solitamente già buono)
        ($(el).attr('data-srcset') || $(el).attr('srcset') || '')
          .split(',')[0]?.trim().split(/\s+/)[0];

      if (!rawSrc || rawSrc.startsWith('data:') || rawSrc.trim() === '') return;
      if (images.length >= 60) return;

      // Escludi icone/favicon/tracciamento (1x1 pixel, sprite, ecc.)
      const w = Number($(el).attr('width') || $(el).attr('data-width') || 0);
      const h = Number($(el).attr('height') || $(el).attr('data-height') || 0);
      if ((w > 0 && w < 20) || (h > 0 && h < 20)) return; // pixel di tracciamento o icone minuscole

      try {
        const absoluteUrl = rawSrc.startsWith('http') ? rawSrc : new URL(rawSrc, url).toString();
        if (!seenImgs.has(absoluteUrl)) {
          seenImgs.add(absoluteUrl);
          images.push(absoluteUrl);
        }
      } catch { /* URL non valido, skip */ }
    });

    // Background-image inlined (utile per siti con hero in CSS)
    $('[style]').each((_, el) => {
      if (images.length >= 60) return;
      const style = $(el).attr('style') ?? '';
      const match = style.match(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/);
      if (!match || !match[1] || match[1].startsWith('data:')) return;
      try {
        const abs = match[1].startsWith('http') ? match[1] : new URL(match[1], url).toString();
        if (!seenImgs.has(abs)) {
          seenImgs.add(abs);
          images.push(abs);
        }
      } catch { /* skip */ }
    });

    // Cerca anche nelle proprietà og:image (utili per rappresentare il brand)
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage && !seenImgs.has(ogImage)) {
      try {
        const abs = ogImage.startsWith('http') ? ogImage : new URL(ogImage, url).toString();
        images.unshift(abs); // priorità massima
      } catch { /* skip */ }
    }

    // ─── Adesso rimuovi elementi di layout per l'estrazione testo ────────
    $('script, style, nav, footer, header').remove();

    // ─── Video (fino a 10) ─────────────────────────────────────────
    const videos: string[] = [];
    const videoExts = /\.(mp4|mov|webm|ogg|avi|mkv)(\?|$)/i;

    // <video src="..."> oppure <video><source src="..."></video>
    $('video').each((_, el) => {
      const src = $(el).attr('src');
      if (src && videos.length < 10) {
        const abs = src.startsWith('http') ? src : new URL(src, url).toString();
        videos.push(abs);
      }
      $(el).find('source').each((_2, src2) => {
        const s = $(src2).attr('src');
        if (s && videos.length < 10) {
          const abs = s.startsWith('http') ? s : new URL(s, url).toString();
          if (!videos.includes(abs)) videos.push(abs);
        }
      });
    });

    // Link diretti a file video (es. download, portfolio)
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      if (videoExts.test(href) && videos.length < 10) {
        const abs = href.startsWith('http') ? href : new URL(href, url).toString();
        if (!videos.includes(abs)) videos.push(abs);
      }
    });

    // Attributi data-video, data-src su elementi generici
    $('[data-video], [data-video-src]').each((_, el) => {
      const src = $(el).attr('data-video') || $(el).attr('data-video-src');
      if (src && videoExts.test(src) && videos.length < 10) {
        const abs = src.startsWith('http') ? src : new URL(src, url).toString();
        if (!videos.includes(abs)) videos.push(abs);
      }
    });

    // Headings
    const headlines: string[] = [];
    $('h1, h2, h3').each((_, el) => {
      const text = $(el).text().trim();
      if (text && headlines.length < 15) headlines.push(text);
    });

    // Testo principale
    const textParts: string[] = [];
    $('p, li').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 30 && textParts.length < 20) textParts.push(text);
    });
    const mainText = textParts.join('\n').slice(0, 2000);

    // Prodotti/servizi (pattern comuni)
    const products: { name: string; description?: string; price?: string }[] = [];
    $('[class*="product"], [class*="service"], [class*="card"]').each((_, el) => {
      const name =
        $(el).find('h2, h3, h4, [class*="title"], [class*="name"]').first().text().trim();
      const description = $(el).find('p, [class*="desc"]').first().text().trim();
      const price = $(el).find('[class*="price"], [class*="costo"]').first().text().trim();
      if (name && products.length < 10) {
        products.push({ name, description: description || undefined, price: price || undefined });
      }
    });

    return { title, description, keywords, mainText, images, videos, headlines, products, faviconUrl, url, scraped: true };
  } catch (err) {
    return {
      url,
      scraped: false,
      error: err instanceof Error ? err.message : 'Errore scraping',
    };
  }
}

export function buildSiteContext(scraped: ScrapedContent): string {
  if (!scraped.scraped) return '';

  const parts = [`Sito: ${scraped.url}`];
  if (scraped.title) parts.push(`Brand/Nome: ${scraped.title}`);
  if (scraped.description) parts.push(`Descrizione: ${scraped.description}`);
  if (scraped.keywords?.length) parts.push(`Keywords: ${scraped.keywords.join(', ')}`);
  if (scraped.headlines?.length) parts.push(`Contenuti principali: ${scraped.headlines.slice(0, 8).join(' | ')}`);
  if (scraped.products?.length) {
    const prods = scraped.products.map((p) => `${p.name}${p.description ? ': ' + p.description.slice(0, 50) : ''}`);
    parts.push(`Prodotti/Servizi: ${prods.join(', ')}`);
  }
  if (scraped.mainText) parts.push(`Testo: ${scraped.mainText.slice(0, 500)}`);

  return parts.join('\n');
}

