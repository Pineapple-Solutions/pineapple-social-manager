// src/app/api/ai/providers/route.ts — Gestione provider AI per tenant
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken, hasPermission, PERMISSIONS } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('pineapple_session')?.value;
    const user = token ? await verifyToken(token) : null;
    if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const tenantId = req.nextUrl.searchParams.get('tenantId') ?? user.tenantId;
    const videoOnly = req.nextUrl.searchParams.get('videoOnly') === 'true';

    if (!tenantId && user.role !== 'master') {
      return NextResponse.json({ success: false, error: 'Tenant richiesto' }, { status: 400 });
    }

    const where: Record<string, unknown> = tenantId ? { tenantId } : {};
    if (videoOnly) where.videoEnabled = true;

    const providers = await prisma.aIProviderConfig.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: videoOnly ? { tenant: { select: { id: true, name: true } } } : undefined,
    });

    // Tutti i campi (imageModel, imageEnabled, fallbackEnabled) sono ora nel client Prisma
    const enriched = providers;

    // Se videoOnly, restituiamo una struttura diversa con info tenant
    if (videoOnly) {
      const result = enriched.map((p) => ({
        tenantId: p.tenantId,
        tenantName: (p as unknown as { tenant?: { name: string } }).tenant?.name ?? p.tenantId,
        provider: p.provider,
        model: p.model,
        videoModel: p.videoModel,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        imageModel: (p as any).imageModel,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        imageEnabled: (p as any).imageEnabled,
      }));
      return NextResponse.json({ success: true, data: result });
    }

    // Maschera API key
    const masked = enriched.map((p) => ({
      ...p,
      apiKey: p.apiKey ? `${p.apiKey.slice(0, 4)}••••••••${p.apiKey.slice(-4)}` : '',
    }));

    return NextResponse.json({ success: true, data: masked });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || !hasPermission(user, PERMISSIONS.CONFIG_WRITE)) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  const body = await req.json();
  const { provider, apiKey, model, tenantId: bodyTenantId, isDefault,
    maxTokensPerDay, maxConcurrentJobs, videoModel, videoEnabled, fallbackEnabled, usedFor,
    imageModel, imageEnabled } = body;

  if (!provider || !apiKey || !model) {
    return NextResponse.json({ success: false, error: 'provider, apiKey e model sono obbligatori' }, { status: 400 });
  }

  const tenantId = bodyTenantId ?? user.tenantId;
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'tenantId richiesto' }, { status: 400 });
  }

  // Verifica API key prima di salvare
  try {
    await verifyProviderApiKey(provider, apiKey, model);
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: `Chiave API non valida: ${err instanceof Error ? err.message : 'Errore'}`,
    }, { status: 400 });
  }

  // Se è il default, rimuovi default dagli altri
  if (isDefault) {
    await prisma.aIProviderConfig.updateMany({
      where: { tenantId },
      data: { isDefault: false },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upsertData: Record<string, any> = {
    apiKey, model, isDefault: isDefault ?? false,
    maxTokensPerDay: maxTokensPerDay ?? 100000,
    maxConcurrentJobs: maxConcurrentJobs ?? 3,
    videoModel: videoModel ?? null,
    videoEnabled: videoEnabled ?? false,
    fallbackEnabled: fallbackEnabled ?? false,
    imageModel: imageModel ?? null,
    imageEnabled: imageEnabled ?? false,
    usedFor: JSON.stringify(usedFor ?? []),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = await (prisma.aIProviderConfig.upsert as any)({
    where: { tenantId_provider: { tenantId, provider } },
    update: upsertData,
    create: { tenantId, provider, ...upsertData },
  });

  return NextResponse.json({
    success: true,
    data: { ...config, apiKey: `${config.apiKey.slice(0, 4)}••••••••${config.apiKey.slice(-4)}` },
  });
}

// ─── Verifica API key ─────────────────────────────────────────────
async function verifyProviderApiKey(provider: string, apiKey: string, model: string) {
  if (provider === 'openai') {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });
    await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 5,
    });
  } else if (provider === 'anthropic') {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey });
    await client.messages.create({
      model,
      max_tokens: 5,
      messages: [{ role: 'user', content: 'test' }],
    });
  } else if (provider === 'google') {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({ model });
    await genModel.generateContent('test');
  } else {
    throw new Error(`Provider ${provider} non supportato`);
  }
}

