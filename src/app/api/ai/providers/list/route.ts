import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getAllProvidersForTenantAndType } from '@/lib/ai-client';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('pineapple_session')?.value;
    const user = token ? await verifyToken(token) : null;

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId') ?? user?.tenantId ?? undefined;
    const type = searchParams.get('type') as 'image' | 'video' | 'text' | null;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant ID non fornito' }, { status: 400 });
    }
    if (!type) {
      return NextResponse.json({ success: false, error: 'Tipo di contenuto non fornito (image, video, text)' }, { status: 400 });
    }

    const providers = await getAllProvidersForTenantAndType(tenantId, type);

    // Recupera il provider di default del tenant per il tipo specifico
    const defaultProviderConfig = providers.find(p => p.isDefault);

    return NextResponse.json({ success: true, data: { providers, defaultProvider: defaultProviderConfig } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Errore nel recupero dei provider AI';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

