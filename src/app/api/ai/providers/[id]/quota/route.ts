// src/app/api/ai/providers/[id]/quota/route.ts
// Legge i rate-limit/quota headers dal provider AI con una chiamata minima
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export interface ProviderQuota {
  provider: string;
  // Per-minute (o per-period) rate limit token
  tpmLimit: number | null;
  tpmRemaining: number | null;
  tpmUsed: number | null;
  tpmResetAt: string | null;       // ISO 8601
  // Per-minute request quota
  rpmLimit: number | null;
  rpmRemaining: number | null;
  rpmResetAt: string | null;
  // Per-day (solo se il provider lo espone)
  tpdLimit: number | null;
  tpdRemaining: number | null;
  tpdResetAt: string | null;
  source: 'headers' | 'none';
  fetchedAt: string;               // ISO 8601
}

// ─── Helper: parse stringa relativa OpenAI → ISO ────────────────
function parseOpenAIReset(rel: string | null): string | null {
  if (!rel) return null;
  const m = rel.match(/(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/);
  if (!m) return null;
  const ms =
    (parseInt(m[1] || '0') * 3600 +
      parseInt(m[2] || '0') * 60 +
      parseFloat(m[3] || '0')) *
    1000;
  return new Date(Date.now() + ms).toISOString();
}

// ─── OpenAI ─────────────────────────────────────────────────────
async function fetchOpenAIQuota(apiKey: string, model: string): Promise<ProviderQuota> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'x' }], max_tokens: 1 }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }

  const tpmLimit = parseInt(res.headers.get('x-ratelimit-limit-tokens') ?? '0') || null;
  const tpmRem = parseInt(res.headers.get('x-ratelimit-remaining-tokens') ?? '0');
  const rpmLimit = parseInt(res.headers.get('x-ratelimit-limit-requests') ?? '0') || null;
  const rpmRem = parseInt(res.headers.get('x-ratelimit-remaining-requests') ?? '0');

  return {
    provider: 'openai',
    tpmLimit,
    tpmRemaining: tpmLimit != null ? tpmRem : null,
    tpmUsed: tpmLimit != null ? tpmLimit - tpmRem : null,
    tpmResetAt: parseOpenAIReset(res.headers.get('x-ratelimit-reset-tokens')),
    rpmLimit,
    rpmRemaining: rpmLimit != null ? rpmRem : null,
    rpmResetAt: parseOpenAIReset(res.headers.get('x-ratelimit-reset-requests')),
    tpdLimit: null,
    tpdRemaining: null,
    tpdResetAt: null,
    source: tpmLimit != null ? 'headers' : 'none',
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Anthropic ──────────────────────────────────────────────────
async function fetchAnthropicQuota(apiKey: string, model: string): Promise<ProviderQuota> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'x' }] }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }

  const tpmLimit = parseInt(res.headers.get('anthropic-ratelimit-tokens-limit') ?? '0') || null;
  const tpmRem = parseInt(res.headers.get('anthropic-ratelimit-tokens-remaining') ?? '0');
  const rpmLimit = parseInt(res.headers.get('anthropic-ratelimit-requests-limit') ?? '0') || null;
  const rpmRem = parseInt(res.headers.get('anthropic-ratelimit-requests-remaining') ?? '0');

  return {
    provider: 'anthropic',
    tpmLimit,
    tpmRemaining: tpmLimit != null ? tpmRem : null,
    tpmUsed: tpmLimit != null ? tpmLimit - tpmRem : null,
    tpmResetAt: res.headers.get('anthropic-ratelimit-tokens-reset'),   // già ISO 8601
    rpmLimit,
    rpmRemaining: rpmLimit != null ? rpmRem : null,
    rpmResetAt: res.headers.get('anthropic-ratelimit-requests-reset') ?? null,
    tpdLimit: null,
    tpdRemaining: null,
    tpdResetAt: null,
    source: tpmLimit != null ? 'headers' : 'none',
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Google Gemini ──────────────────────────────────────────────
async function fetchGoogleQuota(apiKey: string, model: string): Promise<ProviderQuota> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'x' }] }] }),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }

  // Google non espone header quota standard — proviamo comunque
  const tpmLimit = parseInt(res.headers.get('x-ratelimit-limit-tokens') ?? '0') || null;
  const tpmRem = parseInt(res.headers.get('x-ratelimit-remaining-tokens') ?? '0');

  return {
    provider: 'google',
    tpmLimit,
    tpmRemaining: tpmLimit != null ? tpmRem : null,
    tpmUsed: tpmLimit != null ? tpmLimit - tpmRem : null,
    tpmResetAt: res.headers.get('x-ratelimit-reset-tokens') ?? null,
    rpmLimit: parseInt(res.headers.get('x-ratelimit-limit-requests') ?? '0') || null,
    rpmRemaining: parseInt(res.headers.get('x-ratelimit-remaining-requests') ?? '0') || null,
    rpmResetAt: null,
    tpdLimit: null,
    tpdRemaining: null,
    tpdResetAt: null,
    source: tpmLimit != null ? 'headers' : 'none',
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Route Handler ──────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

  const config = await prisma.aIProviderConfig.findUnique({ where: { id } });
  if (!config) return NextResponse.json({ success: false, error: 'Provider non trovato' }, { status: 404 });

  try {
    let quota: ProviderQuota;
    if (config.provider === 'openai') quota = await fetchOpenAIQuota(config.apiKey, config.model);
    else if (config.provider === 'anthropic') quota = await fetchAnthropicQuota(config.apiKey, config.model);
    else quota = await fetchGoogleQuota(config.apiKey, config.model);

    return NextResponse.json({ success: true, data: quota });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Errore fetch quota' },
      { status: 502 },
    );
  }
}

