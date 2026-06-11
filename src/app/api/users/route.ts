// src/app/api/users/route.ts — Gestione utenti (dipendenti)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken, hashPassword, hasPermission, PERMISSIONS, ROLE_PERMISSIONS } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.USERS_MANAGE)) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  const where = user.role !== 'master' && user.tenantId
    ? { tenantId: user.tenantId }
    : {};

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true, email: true, name: true, role: true,
      permissions: true, isActive: true, otpEnabled: true,
      tenantId: true, tenant: { select: { name: true, slug: true } },
      userTenants: { select: { tenantId: true, tenant: { select: { id: true, name: true, slug: true } } } },
      createdAt: true, updatedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ success: true, data: users });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.USERS_MANAGE)) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  const body = await req.json();
  const { email, password, name, role, tenantId, tenantIds, permissions: extraPermissions } = body;

  if (!email || !password || !name) {
    return NextResponse.json({ success: false, error: 'email, password e name sono obbligatori' }, { status: 400 });
  }

  if (role === 'master') {
    return NextResponse.json({ success: false, error: 'Il ruolo master non può essere assegnato' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ success: false, error: 'Email già registrata' }, { status: 400 });
  }

  // tenantId primario
  const rawTenantId = tenantId && tenantId.trim() !== '' ? tenantId.trim() : null;
  const assignedTenantId = user.role !== 'master' ? user.tenantId : rawTenantId;

  // Lista completa tenant da associare (array)
  const rawTenantIds: string[] = Array.isArray(tenantIds) ? tenantIds.filter(Boolean) : [];
  // Assicura che il tenant primario sia incluso
  const allTenantIds = [...new Set([
    ...(assignedTenantId ? [assignedTenantId] : []),
    ...rawTenantIds,
  ])];

  const hashedPassword = await hashPassword(password);
  const rolePerms = ROLE_PERMISSIONS[role ?? 'viewer'] ?? [];
  const extraPerms = Array.isArray(extraPermissions) ? extraPermissions : [];
  const allPermissions = [...new Set([...rolePerms, ...extraPerms])];

  const newUser = await prisma.user.create({
    data: {
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      name,
      role: role ?? 'viewer',
      permissions: JSON.stringify(allPermissions),
      tenantId: assignedTenantId,
      // Crea le associazioni UserTenant
      userTenants: allTenantIds.length > 0
        ? { create: allTenantIds.map(tid => ({ tenantId: tid })) }
        : undefined,
    },
    select: {
      id: true, email: true, name: true, role: true,
      permissions: true, isActive: true, tenantId: true,
      userTenants: { select: { tenantId: true, tenant: { select: { id: true, name: true, slug: true } } } },
      createdAt: true,
    },
  });

  return NextResponse.json({ success: true, data: newUser }, { status: 201 });
}

