// src/app/api/tenants/route.ts — Gestione tenant (multi-tenancy)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken, hasPermission, PERMISSIONS } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

  // Master → tutti i tenant
  // Altri ruoli → solo i loro tenant (tenantIds dal token)
  if (hasPermission(user, PERMISSIONS.TENANTS_MANAGE)) {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { users: true, posts: true, instagramAccounts: true } },
      },
    });
    return NextResponse.json({ success: true, data: tenants });
  }

  // Utente non-master: restituisce solo i tenant a cui è associato
  const tenantIds = user.tenantIds ?? (user.tenantId ? [user.tenantId] : []);
  if (tenantIds.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  const tenants = await prisma.tenant.findMany({
    where: { id: { in: tenantIds } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({ success: true, data: tenants });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.TENANTS_MANAGE)) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  const body = await req.json();
  const { name, slug, plan, logoUrl } = body;

  if (!name || !slug) {
    return NextResponse.json({ success: false, error: 'Name e slug obbligatori' }, { status: 400 });
  }

  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ success: false, error: 'Slug già in uso' }, { status: 400 });
  }

  const tenant = await prisma.tenant.create({
    data: { name, slug: slug.toLowerCase().replace(/\s+/g, '-'), plan: plan ?? 'free', logoUrl },
  });

  return NextResponse.json({ success: true, data: tenant }, { status: 201 });
}

