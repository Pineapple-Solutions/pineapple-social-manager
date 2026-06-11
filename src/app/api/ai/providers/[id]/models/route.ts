// src/app/api/ai/providers/[id]/models/route.ts
// Diagnostica: elenca i modelli disponibili per un provider e testa la generazione immagini

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });

  const provider = await prisma.aIProviderConfig.findUnique({ where: { id } });
  if (!provider) return NextResponse.json({ success: false, error: 'Provider non trovato' }, { status: 404 });

  if (provider.provider !== 'google') {
    return NextResponse.json({ success: false, error: 'Diagnostica modelli disponibile solo per Google' }, { status: 400 });
  }

  const apiKey = provider.apiKey;
  const results: { version: string; models: string[]; imageModels: string[]; error?: string }[] = [];

  // Prova v1beta e v1
  for (const ver of ['v1beta', 'v1']) {
    try {
      let allModels: string[] = [];
      let nextPageToken: string | undefined;

      // Pagina finché non ci sono più risultati
      do {
        const url = `https://generativelanguage.googleapis.com/${ver}/models?key=${apiKey}&pageSize=100${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) {
          const e = await resp.text();
          results.push({ version: ver, models: [], imageModels: [], error: `HTTP ${resp.status}: ${e.slice(0, 200)}` });
          break;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await resp.json();
        const page: string[] = (data.models ?? []).map((m: { name: string }) => m.name.replace('models/', ''));
        allModels = [...allModels, ...page];
        nextPageToken = data.nextPageToken;
      } while (nextPageToken);

      const imageModels = allModels.filter((n) => {
        // Escludi esplicitamente modelli non-immagine
        if (n.includes('tts'))        return false; // text-to-speech
        if (n.includes('audio'))      return false; // audio
        if (n.includes('embedding'))  return false; // embedding
        if (n.includes('aqa'))        return false; // question answering
        if (n.includes('retrieval'))  return false; // retrieval
        if (n.includes('robotics'))   return false; // robotics
        if (n.includes('live'))       return false; // live dialog
        if (n.includes('dialog'))     return false; // dialog
        // Includi solo modelli per generazione immagini/video
        return (
          n.includes('-image-generation') ||   // es. gemini-2.0-flash-exp-image-generation
          n.includes('-image-preview') ||       // es. gemini-3.1-flash-image-preview
          n.includes('imagen')          ||      // es. imagen-4.0-generate-001
          n.startsWith('veo-')          ||      // es. veo-3.0-generate-preview
          (n.includes('image') && !n.includes('flash-preview')) // altri modelli image
        );
      });

      results.push({ version: ver, models: allModels, imageModels });
    } catch (e) {
      results.push({ version: ver, models: [], imageModels: [], error: String(e) });
    }
  }

  return NextResponse.json({ success: true, provider: provider.provider, model: provider.model, results });
}

