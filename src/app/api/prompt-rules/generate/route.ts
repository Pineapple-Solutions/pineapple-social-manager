// src/app/api/prompt-rules/generate/route.ts
// Genera regole prompt suggerite dall'AI in base ai contenuti del sito del tenant
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { scrapeSite, buildSiteContext } from '@/lib/content-scraper';

// ─── Dispatcher AI (copia locale leggera) ────────────────────────
async function callAI(
  provider: { provider: string; apiKey: string; model: string },
  system: string,
  user: string,
  maxTokens = 2000
): Promise<string> {
  switch (provider.provider) {
    case 'openai': {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: provider.apiKey });
      const completion = await client.chat.completions.create({
        model: provider.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
      });
      return completion.choices[0]?.message?.content ?? '';
    }
    case 'anthropic': {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: provider.apiKey });
      const msg = await client.messages.create({
        model: provider.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      });
      return msg.content[0]?.type === 'text' ? msg.content[0].text : '';
    }
    case 'google': {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(provider.apiKey);
      const genModel = genAI.getGenerativeModel({ model: provider.model, systemInstruction: system });
      const result = await genModel.generateContent(user);
      return result.response.text();
    }
    default:
      throw new Error(`Provider non supportato: ${provider.provider}`);
  }
}

function extractJSON(text: string): string {
  // Prova prima il blocco ```json ... ```
  const mdMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (mdMatch?.[1]) return mdMatch[1];
  // Altrimenti trova il primo '[' e restituisci da lì
  const start = text.indexOf('[');
  if (start >= 0) return text.slice(start);
  return text;
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('pineapple_session')?.value;
    const user = token ? await verifyToken(token) : null;
    if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const body = await req.json();
    const tenantId: string | undefined = body.tenantId;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Seleziona un cliente per generare le regole con AI.' },
        { status: 400 }
      );
    }

    // Verifica che l'utente possa accedere al tenant
    if (user.role !== 'master' && user.tenantId !== tenantId) {
      return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
    }

    // Ottieni provider AI attivo del tenant
    const providerConfig = await prisma.aIProviderConfig.findFirst({
      where: { tenantId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    if (!providerConfig) {
      return NextResponse.json(
        { success: false, error: 'Nessun provider AI configurato per questo cliente. Vai in Configurazione → Provider AI.' },
        { status: 400 }
      );
    }

    // Ottieni i siti del tenant
    const sites = await prisma.connectedSite.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    // Costruisci il contesto dai siti
    let siteContext = '';
    if (sites.length > 0) {
      const scraped = await Promise.allSettled(
        sites.map((s) => scrapeSite(s.url))
      );
      const contexts = scraped
        .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof scrapeSite>>> => r.status === 'fulfilled' && r.value.scraped)
        .map((r) => buildSiteContext(r.value));
      siteContext = contexts.join('\n\n---\n\n');
    }

    // Se non ci sono siti, usa il nome del tenant come fallback
    if (!siteContext) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
      siteContext = `Cliente/Brand: ${tenant?.name ?? tenantId}`;
    }

    // Ottieni le regole esistenti per non dupplicarle
    const existingRules = await prisma.globalPromptRule.findMany({
      where: { tenantId },
      select: { name: true, rule: true },
    });
    const existingInfo = existingRules.length
      ? `\n\nREGOLE GIÀ PRESENTI (non duplicare):\n${existingRules.map((r) => `- ${r.name}: ${r.rule}`).join('\n')}`
      : '';

    const systemPrompt = `Sei un esperto di social media marketing. Analizza i contenuti di un sito web e genera regole di prompt AI per guidare la creazione di contenuti social (Instagram, Facebook, TikTok).
Le regole devono essere istruzioni chiare, specifiche e azionabili per l'AI che genera post, caption, hashtag e reel.`;

    const userPrompt = `Analizza questo sito/brand e genera 5-8 regole prompt AI per il social media manager automatico.
${existingInfo}

CONTESTO SITO:
${siteContext.slice(0, 3000)}

Genera regole che riguardino: tono di voce, stile comunicativo, argomenti da evidenziare, hashtag specifici, lingua, emoji, prodotti/servizi da promuovere, pubblico target, tabù/cosa evitare.

Rispondi SOLO con un array JSON:
[
  {
    "name": "Nome breve della regola",
    "description": "Breve descrizione del perché è utile",
    "contentType": "ALL|POST|STORY|REEL|VIDEO|CAPTION|HASHTAGS",
    "rule": "Istruzione precisa e dettagliata per l'AI (2-4 frasi)",
    "priority": 0
  }
]`;

    const rawResponse = await callAI(providerConfig, systemPrompt, userPrompt, 2000);

    let suggestions: Array<{
      name: string;
      description: string;
      contentType: string;
      rule: string;
      priority: number;
    }> = [];

    try {
      const parsed = JSON.parse(extractJSON(rawResponse));
      if (Array.isArray(parsed)) {
        suggestions = parsed.slice(0, 10).map((s) => ({
          name: String(s.name ?? '').slice(0, 100),
          description: String(s.description ?? '').slice(0, 200),
          contentType: ['ALL', 'POST', 'STORY', 'REEL', 'VIDEO', 'CAPTION', 'HASHTAGS'].includes(s.contentType)
            ? s.contentType
            : 'ALL',
          rule: String(s.rule ?? '').slice(0, 1000),
          priority: typeof s.priority === 'number' ? s.priority : 0,
        }));
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'Errore nel parsing della risposta AI. Riprova.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: suggestions });
  } catch (err) {
    console.error('[prompt-rules generate]', err);
    const msg = err instanceof Error ? err.message : 'Errore interno';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}




