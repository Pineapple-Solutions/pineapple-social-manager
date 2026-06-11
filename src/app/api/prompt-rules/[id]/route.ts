// src/app/api/prompt-rules/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken, hasPermission, PERMISSIONS } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || !hasPermission(user, PERMISSIONS.CONFIG_WRITE)) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  try {
    // Verifica che il record esista prima di aggiornare
    const existing = await prisma.globalPromptRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Regola non trovata' }, { status: 404 });
    }

    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.contentType !== undefined) data.contentType = body.contentType;
    if (body.rule !== undefined) data.rule = body.rule;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.priority !== undefined) data.priority = body.priority;

    // Aggiorna i campi standard via Prisma
    const updated = await prisma.globalPromptRule.update({
      where: { id },
      data,
    });

    // Gestisci isNegativePrompt separatamente via raw SQL
    // (il client Prisma potrebbe non avere ancora rigenerato il campo)
    if (body.isNegativePrompt !== undefined) {
      const isNegVal = body.isNegativePrompt === true ? 1 : 0;
      await prisma.$executeRawUnsafe(
        `UPDATE GlobalPromptRule SET isNegativePrompt = ? WHERE id = ?`,
        isNegVal,
        id
      );
      // Ritorna il record con il flag aggiornato
      Object.assign(updated, { isNegativePrompt: isNegVal === 1 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('[prompt-rules PATCH]', id, err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Errore interno del server' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || !hasPermission(user, PERMISSIONS.CONFIG_WRITE)) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  try {
    await prisma.globalPromptRule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[prompt-rules DELETE]', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Errore interno del server' },
      { status: 500 }
    );
  }
}

