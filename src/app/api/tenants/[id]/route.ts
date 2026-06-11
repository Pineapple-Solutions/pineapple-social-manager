// src/app/api/tenants/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken, hasPermission, PERMISSIONS } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || !hasPermission(user, PERMISSIONS.TENANTS_MANAGE)) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  const body = await req.json();
  const tenant = await prisma.tenant.update({
    where: { id },
    data: {
      name: body.name,
      logoUrl: body.logoUrl,
      plan: body.plan,
      isActive: body.isActive,
    },
  });
  return NextResponse.json({ success: true, data: tenant });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || !hasPermission(user, PERMISSIONS.TENANTS_MANAGE)) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  await prisma.tenant.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

