// src/app/api/ai/generate/route.ts — Generazione AI multi-provider
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { generateContent, GoogleServiceUnavailableError } from '@/lib/ai-client';
import { scrapeSite } from '@/lib/content-scraper';
import type { AIGenerationRequest } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('pineapple_session')?.value;
    const user = token ? await verifyToken(token) : null;

    const body: AIGenerationRequest & { tenantId?: string; scrapeUrl?: string; siteId?: string } = await req.json();
    
    // ── Leggi il siteId dai cookie (filtro globale) ─────────────────────────
    const cookieSiteId = req.cookies.get('psm_site')?.value;
    
    // Usa il siteId dal body se presente, altrimenti leggi dai cookie (filtro globale)
    const siteId = body.siteId ?? cookieSiteId ?? undefined;
    
    // Se siteId è presente (da body o cookie), non usare il fallback a user?.tenantId
    // Lascia che generateContent lo risolva dal sito
    const tenantId = body.tenantId ?? (siteId ? undefined : user?.tenantId) ?? undefined;

    // Accetta sia siteUrl che scrapeUrl (alias dal frontend)
    if (!body.siteUrl && body.scrapeUrl) body.siteUrl = body.scrapeUrl;

    // Se è fornita una siteUrl e non c'è già siteContext, scraping automatico
    if (body.siteUrl && !body.siteContext) {
      try {
        const scraped = await scrapeSite(body.siteUrl);
        if (scraped.scraped) {
          const parts: string[] = [];
          if (scraped.title) parts.push(`Sito: ${scraped.title}`);
          if (scraped.description) parts.push(`Descrizione: ${scraped.description}`);
          if (scraped.keywords?.length) parts.push(`Keywords: ${scraped.keywords.slice(0, 10).join(', ')}`);
          if (scraped.mainText) parts.push(`Contenuto: ${scraped.mainText.slice(0, 500)}`);
          body.siteContext = parts.join('\n');
          if (!body.keywords?.length && scraped.keywords?.length) {
            body.keywords = scraped.keywords.slice(0, 8);
          }
        }
      } catch { /* non bloccare se scraping fallisce */ }
    }

    const result = await generateContent(body, tenantId ?? undefined, siteId ?? undefined);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    // 503 transitorio Google → restituisce 503 con messaggio chiaro + suggerimento retry
    if (err instanceof GoogleServiceUnavailableError) {
      return NextResponse.json(
        { success: false, error: err.message, retryable: true },
        { status: 503 }
      );
    }
    const msg = err instanceof Error ? err.message : 'Errore AI';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
