// src/app/api/media/remove-watermark/route.ts
// ⚠️ SOLO PER USO INTERNO / MOCKUP — NON PER PUBBLICAZIONE COMMERCIALE
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import {
  removeWatermarkFromImage,
  removeWatermarkFromVideo,
  WATERMARK_PRESETS,
  type WatermarkRegion,
  type RemovalMethod,
} from '@/lib/watermark-remover';

// Hash di consenso — deve corrispondere esattamente
const REQUIRED_CONSENT_HASH = 'ACCEPTED_LEGAL_WATERMARK_REMOVAL_2026';

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('pineapple_session')?.value;
    const user = token ? await verifyToken(token) : null;
    if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const body = await req.json();
    const {
      sourceUrl,
      mediaType,            // 'image' | 'video'
      tenantId: bodyTenantId,
      consentHash,          // MUST === REQUIRED_CONSENT_HASH
      preset,               // nome preset oppure 'custom'
      customRegion,         // se preset === 'custom'
      removalMethod,        // 'dissolve' | 'distorsione' | 'taglio'
    } = body;

    const method: RemovalMethod = ['dissolve', 'distorsione', 'taglio'].includes(removalMethod)
      ? removalMethod as RemovalMethod
      : 'dissolve';

    // ── Verifica consenso legale ────────────────────────────────
    if (consentHash !== REQUIRED_CONSENT_HASH) {
      return NextResponse.json({
        success: false,
        error: 'Consenso legale non fornito. Devi accettare i termini prima di procedere.',
      }, { status: 400 });
    }

    if (!sourceUrl) return NextResponse.json({ success: false, error: 'sourceUrl richiesto' }, { status: 400 });
    if (!mediaType) return NextResponse.json({ success: false, error: 'mediaType richiesto' }, { status: 400 });

    const tenantId: string = bodyTenantId ?? user.tenantId ?? '';

    // Determina la regione
    let region: WatermarkRegion;
    if (preset && preset !== 'custom' && WATERMARK_PRESETS[preset]) {
      region = WATERMARK_PRESETS[preset].region;
    } else if (customRegion) {
      region = customRegion as WatermarkRegion;
    } else {
      return NextResponse.json({ success: false, error: 'Specifica un preset o una regione custom' }, { status: 400 });
    }

    // Ottieni chiave AI se disponibile (per DALL-E inpainting immagini)
    let openAIApiKey: string | undefined;
    let openAIModel: string | undefined;
    if (tenantId && mediaType === 'image') {
      const provider = await prisma.aIProviderConfig.findFirst({
        where: { tenantId, provider: 'openai', isActive: true },
      });
      if (provider) {
        openAIApiKey = provider.apiKey;
        openAIModel = provider.model;
      }
    }

    // ── Processa ────────────────────────────────────────────────
    let result: { outputUrl: string; method: string };

    if (mediaType === 'image') {
      result = await removeWatermarkFromImage(sourceUrl, region, method, tenantId, openAIApiKey, openAIModel);
    } else if (mediaType === 'video') {
      result = await removeWatermarkFromVideo(sourceUrl, region, method);
    } else {
      return NextResponse.json({ success: false, error: 'mediaType non valido (image|video)' }, { status: 400 });
    }

    // ── Risposta con warning legale in evidenza ─────────────────
    return NextResponse.json({
      success: true,
      outputUrl: result.outputUrl,
      method: result.method,
      legalWarning: {
        title: '⚠️ ATTENZIONE — USO RISERVATO',
        message: [
          'Il contenuto con filigrana rimossa è disponibile ESCLUSIVAMENTE per:',
          '• Mockup interni da mostrare ai propri clienti come anteprima',
          '• Bozze e concept creativi NON destinati alla pubblicazione',
          '• Uso personale / didattico privato',
          '',
          'È VIETATO E ILLEGALE:',
          '• Pubblicare o diffondere pubblicamente il contenuto',
          '• Utilizzarlo a fini commerciali o pubblicitari',
          '• Spacciarlo come contenuto di proprietà',
          '',
          'La rimozione non autorizzata di filigrana può costituire violazione del diritto d\'autore',
          'ai sensi del D.Lgs. 68/2003 (legge sul diritto d\'autore italiana) e della direttiva EU 2019/790.',
        ].join('\n'),
      },
      publishingBlocked: true,
    });
  } catch (err) {
    console.error('[remove-watermark]', err);
    const msg = err instanceof Error ? err.message : 'Errore interno';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

