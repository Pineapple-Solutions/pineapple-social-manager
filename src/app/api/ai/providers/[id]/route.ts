// src/app/api/ai/providers/[id]/route.ts
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

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.model !== undefined) data.model = body.model;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.isDefault !== undefined) data.isDefault = body.isDefault;
  if (body.maxTokensPerDay !== undefined) data.maxTokensPerDay = body.maxTokensPerDay;
  if (body.maxConcurrentJobs !== undefined) data.maxConcurrentJobs = Number(body.maxConcurrentJobs);
  if (body.videoModel !== undefined) data.videoModel = body.videoModel;
  if (body.videoEnabled !== undefined) data.videoEnabled = body.videoEnabled;
  if (body.usedFor !== undefined) data.usedFor = JSON.stringify(body.usedFor);
  if (body.apiKey && !body.apiKey.includes('••')) data.apiKey = body.apiKey;
  // Campi immagine e fallback — ora nativi nel client Prisma
  if (body.imageModel !== undefined) data.imageModel = body.imageModel;
  if (body.imageEnabled !== undefined) data.imageEnabled = body.imageEnabled;
  if (body.fallbackEnabled !== undefined) data.fallbackEnabled = body.fallbackEnabled;
  // Reset manuale contatore token
  if (body.resetTokens === true) {
    data.tokensUsedToday = 0;
    data.tokenResetAt = new Date(new Date().setHours(24, 0, 0, 0));
  }
  // Se isDefault viene impostato a true, prima rimuovi default dagli altri dello stesso tenant
  if (body.isDefault === true) {
    const current = await prisma.aIProviderConfig.findUnique({ where: { id }, select: { tenantId: true } });
    if (current) {
      await prisma.aIProviderConfig.updateMany({
        where: { tenantId: current.tenantId, id: { not: id } },
        data: { isDefault: false },
      });
    }
  }

  const updated = await prisma.aIProviderConfig.update({ where: { id }, data });
  return NextResponse.json({
    success: true,
    data: { ...updated, apiKey: `${updated.apiKey.slice(0, 4)}••••${updated.apiKey.slice(-4)}` },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || !hasPermission(user, PERMISSIONS.CONFIG_WRITE)) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  await prisma.aIProviderConfig.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
