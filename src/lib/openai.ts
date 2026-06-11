// src/lib/openai.ts
// OpenAI client per generazione contenuti AI

import OpenAI from 'openai';
import { prisma } from './db';
import type { AIGenerationRequest, AIGenerationResult, AITone, ContentIdeaData, PostType } from '@/types';

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY non configurata');
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

const TONE_DESCRIPTIONS: Record<AITone, string> = {
  auto: 'tono adattivo, scelto automaticamente in base al contesto',
  professional: 'tono professionale, autorevole e competente',
  friendly: 'tono amichevole, caldo e vicino al pubblico',
  funny: 'tono ironico, simpatico e divertente con qualche emoji',
  inspirational: 'tono ispirazionale, motivante e positivo',
  luxury: 'tono elegante, raffinato e premium',
  minimal: 'tono essenziale, diretto e pulito senza emoji eccessive',
};

export async function generateContent(request: AIGenerationRequest): Promise<AIGenerationResult> {
  const client = getClient();
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o';
  const start = Date.now();

  const tone = request.tone ?? 'professional';
  const language = request.language ?? 'it';
  const toneDesc = TONE_DESCRIPTIONS[tone];

  let systemPrompt = `Sei un esperto social media manager per Instagram con anni di esperienza nel creare contenuti virali e ad alto engagement. 
Il tuo stile è: ${toneDesc}.
Scrivi sempre in ${language === 'it' ? 'italiano' : language === 'en' ? 'inglese' : language}.
Per gli hashtag usa # prima di ogni tag senza spazi.
Ottimizza sempre per l'algoritmo di Instagram.`;

  if (request.siteContext) {
    systemPrompt += `\n\nContesto del brand/sito: ${request.siteContext}`;
  }
  if (request.targetAudience) {
    systemPrompt += `\nTarget audience: ${request.targetAudience}`;
  }

  let userPrompt = '';
  let responseText = '';
  let tokens = 0;

  switch (request.type) {
    case 'caption': {
      userPrompt = `Genera una caption coinvolgente per un post Instagram.
Topic: ${request.topic ?? 'contenuto del brand'}
${request.imageDescription ? `Descrizione immagine: ${request.imageDescription}` : ''}
${request.keywords?.length ? `Keywords: ${request.keywords.join(', ')}` : ''}
${request.callToAction ? `Call to action: ${request.callToAction}` : ''}
Tipo post: ${request.postType ?? 'POST'}

La caption deve:
- Essere ottimizzata per l'engagement
- Avere una prima frase che cattura l'attenzione
- Includere emoji in modo strategico
- Terminare con una domanda o CTA
- Essere massimo 300 parole
- NON includere hashtag (li genererò separatamente)

Rispondi SOLO con la caption, nessun testo aggiuntivo.`;
      break;
    }

    case 'hashtags': {
      userPrompt = `Genera i migliori hashtag per questo post Instagram.
Topic: ${request.topic ?? 'contenuto del brand'}
${request.existingCaption ? `Caption: ${request.existingCaption}` : ''}
Niche: ${request.siteContext?.slice(0, 200) ?? 'business'}

Genera:
- 5 hashtag molto popolari (>1M posts)
- 10 hashtag medi (100K-1M posts)
- 10 hashtag di nicchia (<100K posts)

Totale: 25 hashtag
Formato: uno per riga, con # davanti
Ordina dal più al meno rilevante
Rispondi SOLO con gli hashtag, uno per riga.`;
      break;
    }

    case 'ideas': {
      userPrompt = `Genera 10 idee creative per contenuti Instagram per questo brand.
${request.siteContext ? `Brand/Sito: ${request.siteContext}` : ''}
${request.keywords?.length ? `Temi preferiti: ${request.keywords.join(', ')}` : ''}

Per ogni idea fornisci in JSON:
{
  "ideas": [
    {
      "title": "Titolo breve",
      "description": "Descrizione dettagliata dell'idea",
      "type": "POST|STORY|REEL",
      "caption": "Caption pronta all'uso",
      "hashtags": ["tag1", "tag2"],
      "imagePrompt": "Descrizione dell'immagine ideale (per DALL-E)",
      "category": "categoria (es: behind_the_scenes, product, tips, testimonial)",
      "priority": 1-10
    }
  ]
}

Varia i tipi di contenuto (post, reel, storie). Sii creativo e pratico.`;
      break;
    }

    case 'story_text': {
      userPrompt = `Crea il testo e la struttura per una Instagram Story.
Topic: ${request.topic ?? 'contenuto brand'}
${request.siteContext ? `Brand: ${request.siteContext}` : ''}

Fornisci in JSON:
{
  "slides": [
    {
      "slide": 1,
      "type": "text|question|poll|countdown",
      "headline": "Testo principale (max 40 caratteri)",
      "subtext": "Testo secondario (max 80 caratteri)",
      "cta": "Testo del CTA o swipe up",
      "backgroundColor": "#colore_hex_o_gradient_name",
      "sticker": "emoji o tipo sticker suggerito"
    }
  ],
  "totalSlides": 3-5
}`;
      break;
    }

    case 'reel_script': {
      userPrompt = `Crea uno script completo per un Instagram Reel di 30-60 secondi.
Topic: ${request.topic ?? 'contenuto brand'}
${request.siteContext ? `Brand: ${request.siteContext}` : ''}
${request.callToAction ? `CTA finale: ${request.callToAction}` : ''}

Fornisci in JSON:
{
  "hook": "Frase hook dei primi 3 secondi",
  "totalDuration": "45s",
  "scenes": [
    {
      "scene": 1,
      "duration": "5s",
      "visual": "Descrizione visiva dettagliata",
      "script": "Testo parlato/voiceover",
      "onScreenText": "Testo a schermo",
      "transition": "tipo transizione"
    }
  ],
  "music": "Tipo di musica/mood consigliato",
  "caption": "Caption per il reel",
  "hashtags": ["tag1", "tag2"],
  "cta": "Call to action finale"
}`;
      break;
    }

    case 'full_post': {
      userPrompt = `Crea un post Instagram completo e pronto alla pubblicazione.
Topic: ${request.topic ?? ''}
${request.imageDescription ? `Immagine: ${request.imageDescription}` : ''}
${request.siteContext ? `Brand: ${request.siteContext}` : ''}
${request.callToAction ? `CTA: ${request.callToAction}` : ''}
Tipo: ${request.postType ?? 'POST'}

Rispondi in JSON:
{
  "caption": "Caption completa con emoji",
  "hashtags": ["tag1","tag2",...],
  "altText": "Alt text accessibile per l'immagine",
  "bestTimeToPost": "HH:MM",
  "expectedEngagement": "low|medium|high",
  "tips": ["consiglio1", "consiglio2"]
}`;
      break;
    }
  }

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.8,
    max_tokens: request.type === 'ideas' || request.type === 'reel_script' ? 3000 : 1000,
  });

  responseText = completion.choices[0]?.message?.content ?? '';
  tokens = completion.usage?.total_tokens ?? 0;
  const duration = Date.now() - start;

  // Log in DB
  try {
    await prisma.aIGenerationLog.create({
      data: {
        type: request.type.toUpperCase(),
        model,
        prompt: userPrompt.slice(0, 1000),
        response: responseText.slice(0, 2000),
        tokens,
        durationMs: duration,
        success: true,
      },
    });
  } catch { /* non-blocking */ }

  // Parsing risposta
  const result: AIGenerationResult = { tokens, model };

  if (request.type === 'caption') {
    result.caption = responseText.trim();
  } else if (request.type === 'hashtags') {
    result.hashtags = responseText
      .split('\n')
      .map((h) => h.trim())
      .filter((h) => h.startsWith('#'))
      .map((h) => h.replace(/\s.*$/, ''));
  } else if (request.type === 'story_text') {
    try {
      const parsed = JSON.parse(extractJSON(responseText));
      result.storyText = responseText;
      result.caption = parsed.slides?.[0]?.headline;
    } catch {
      result.storyText = responseText;
    }
  } else if (request.type === 'reel_script') {
    try {
      const parsed = JSON.parse(extractJSON(responseText));
      result.reelScript = responseText;
      result.caption = parsed.caption;
      result.hashtags = parsed.hashtags ?? [];
    } catch {
      result.reelScript = responseText;
    }
  } else if (request.type === 'ideas') {
    try {
      const parsed = JSON.parse(extractJSON(responseText));
      result.ideas = (parsed.ideas ?? []).map((idea: ContentIdeaData & { hashtags?: string[] | string }, idx: number) => ({
        id: `idea-${idx}`,
        title: idea.title,
        description: idea.description,
        type: idea.type as PostType,
        status: 'PENDING' as const,
        caption: idea.caption,
        hashtags: idea.hashtags,
        imagePrompt: idea.imagePrompt,
        category: idea.category,
        priority: idea.priority ?? 5,
        createdAt: new Date(),
      }));
    } catch {
      result.ideas = [];
    }
  } else if (request.type === 'full_post') {
    try {
      const parsed = JSON.parse(extractJSON(responseText));
      result.caption = parsed.caption;
      result.hashtags = parsed.hashtags ?? [];
      result.altText = parsed.altText;
    } catch {
      result.caption = responseText;
      result.hashtags = [];
    }
  }

  return result;
}

function extractJSON(text: string): string {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/) ?? text.match(/({[\s\S]*})/);
  return match?.[1] ?? text;
}

// ─── Generazione immagine con DALL-E 3 ───────────────────────────────────────

/**
 * Genera un'immagine con DALL-E 3 e restituisce l'URL temporaneo.
 * ⚠️  L'URL scade dopo ~1 ora — scaricalo subito con saveFileFromUrl().
 */
export async function generateImage(
  prompt: string,
  size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024'
): Promise<string> {
  const client = getClient();
  const response = await client.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size,
    quality: 'standard',
    style: 'vivid',
  });
  const url = (response.data ?? [])[0]?.url;
  if (!url) throw new Error('DALL-E non ha restituito nessun URL immagine');
  return url;
}

// Suggerisce i best times to post basandosi sul niche
export async function suggestBestTimes(niche?: string, timezone = 'Europe/Rome'): Promise<string[]> {
  const client = getClient();

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: `Quali sono i 5 orari migliori per pubblicare su Instagram per un brand nel settore: ${niche ?? 'general'}?
Timezone: ${timezone}
Considera i pattern di engagement italiani/europei.
Rispondi SOLO con gli orari in formato HH:MM, uno per riga, dal migliore al meno buono.`,
      },
    ],
    temperature: 0.3,
    max_tokens: 100,
  });

  const response = completion.choices[0]?.message?.content ?? '';
  return response
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => /^\d{2}:\d{2}$/.test(t))
    .slice(0, 5);
}

