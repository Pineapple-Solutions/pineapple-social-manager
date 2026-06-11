// src/app/api/prompt-rules/route.ts — Regole prompt globali per tenant
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken, hasPermission, PERMISSIONS } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get('tenantId') ?? user.tenantId;

  try {
    // Master senza filtro tenant → ritorna tutte le regole (globali + di ogni tenant)
    if (!tenantId && user.role === 'master') {
      const rules = await prisma.globalPromptRule.findMany({
        include: { tenant: { select: { id: true, name: true } } },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
      return NextResponse.json({ success: true, data: rules });
    }

    if (!tenantId) {
      // Nessun tenant → mostra solo regole globali
      const rules = await prisma.globalPromptRule.findMany({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        where: { tenantId: null as any },
        include: { tenant: { select: { id: true, name: true } } },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
      return NextResponse.json({ success: true, data: rules });
    }

    // Regole del tenant specificato + regole globali (tenantId = null)
    const rules = await prisma.globalPromptRule.findMany({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: { OR: [{ tenantId }, { tenantId: null as any }] },
      include: { tenant: { select: { id: true, name: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    return NextResponse.json({ success: true, data: rules });
  } catch (err) {
    console.error('[prompt-rules GET]', err);
    return NextResponse.json({ success: false, error: 'Errore interno del server' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || !hasPermission(user, PERMISSIONS.CONFIG_WRITE)) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, description, contentType, rule, priority, tenantId: bodyTenantId, isNegativePrompt } = body;

    if (!name || !rule) {
      return NextResponse.json({ success: false, error: 'name e rule sono obbligatori' }, { status: 400 });
    }

    // 'global' o stringa vuota → regola globale (tenantId = null), solo master possono creare globali
    const isGlobal = bodyTenantId === 'global' || bodyTenantId === null || bodyTenantId === '';
    if (isGlobal && user.role !== 'master') {
      return NextResponse.json({ success: false, error: 'Solo il master può creare regole globali' }, { status: 403 });
    }

    const tenantId = isGlobal ? null : (bodyTenantId ?? user.tenantId);
    if (!tenantId && !isGlobal) {
      return NextResponse.json({ success: false, error: 'tenantId richiesto' }, { status: 400 });
    }

    // Crea la regola senza isNegativePrompt (campo nuovo non ancora nel client Prisma rigenerato)
    const newRule = await prisma.globalPromptRule.create({
      data: {
        tenantId: tenantId ?? null,
        name, description,
        contentType: contentType ?? 'ALL',
        rule,
        priority: priority ?? 0,
      },
      include: { tenant: { select: { id: true, name: true } } },
    });

    // Imposta isNegativePrompt via raw SQL (il client Prisma potrebbe non essere ancora rigenerato)
    const isNegVal = isNegativePrompt === true;
    if (isNegVal) {
      await prisma.$executeRawUnsafe(
        `UPDATE GlobalPromptRule SET isNegativePrompt = 1 WHERE id = ?`,
        newRule.id
      );
    }

    return NextResponse.json({ success: true, data: { ...newRule, isNegativePrompt: isNegVal } }, { status: 201 });
  } catch (err) {
    console.error('[prompt-rules POST]', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Errore interno del server' },
      { status: 500 }
    );
  }
}
