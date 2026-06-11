// src/app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken, hashPassword, hasPermission, PERMISSIONS } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || !hasPermission(user, PERMISSIONS.USERS_MANAGE)) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.name) data.name = body.name;
  if (body.role && body.role !== 'master') data.role = body.role;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  // Tenant primario
  if (body.tenantId !== undefined) {
    data.tenantId = body.tenantId && body.tenantId.trim() !== '' ? body.tenantId.trim() : null;
  }
  if (Array.isArray(body.permissions)) data.permissions = JSON.stringify(body.permissions);
  if (body.password) data.password = await hashPassword(body.password);

  // Aggiorna i tenant multipli se forniti
  if (Array.isArray(body.tenantIds)) {
    const tenantIds: string[] = body.tenantIds.filter(Boolean);
    // Includiamo anche il tenant primario nella lista
    const primaryId = (data.tenantId as string | null | undefined) ?? undefined;
    if (primaryId && !tenantIds.includes(primaryId)) tenantIds.unshift(primaryId);

    // Delete tutti e ricrea
    await prisma.userTenant.deleteMany({ where: { userId: id } });
    if (tenantIds.length > 0) {
      await prisma.userTenant.createMany({
        data: tenantIds.map(tid => ({ userId: id, tenantId: tid })),
      });
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true, email: true, name: true, role: true,
      permissions: true, isActive: true, tenantId: true,
      userTenants: { select: { tenantId: true, tenant: { select: { id: true, name: true, slug: true } } } },
    },
  });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || !hasPermission(user, PERMISSIONS.USERS_MANAGE)) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

