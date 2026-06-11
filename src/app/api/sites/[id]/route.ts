// src/app/api/sites/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getTenantFilter, hasPermission, PERMISSIONS } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await getTenantFilter(req);
  if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  if (!hasPermission(scope.user, PERMISSIONS.CONFIG_WRITE) && !hasPermission(scope.user, PERMISSIONS.POSTS_WRITE)) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  // Verifica che il sito appartenga al tenant dell'utente (se non master)
  if (scope.user.role !== 'master' && scope.tenantId) {
    const existing = await prisma.connectedSite.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== scope.tenantId) {
      return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
    }
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.url !== undefined) data.url = body.url;
  if (body.description !== undefined) data.description = body.description;
  if (body.niche !== undefined) data.niche = body.niche;
  if (body.language !== undefined) data.language = body.language;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.logoUrl !== undefined) data.logoUrl = body.logoUrl;

  const updated = await prisma.connectedSite.update({ where: { id }, data });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await getTenantFilter(req);
  if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  if (!hasPermission(scope.user, PERMISSIONS.CONFIG_WRITE) && !hasPermission(scope.user, PERMISSIONS.POSTS_WRITE)) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  if (scope.user.role !== 'master' && scope.tenantId) {
    const existing = await prisma.connectedSite.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== scope.tenantId) {
      return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
    }
  }

  await prisma.connectedSite.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

