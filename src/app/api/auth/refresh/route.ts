// src/app/api/auth/refresh/route.ts
// Rilegge l'utente dal DB e ri-emette il JWT con i dati aggiornati (tenantIds, permessi, ecc.)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  verifyToken, createToken, getMasterUser,
  ROLE_PERMISSIONS, type AuthUser, type Permission,
} from '@/lib/auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

  const current = await verifyToken(token);
  if (!current) return NextResponse.json({ success: false, error: 'Token non valido' }, { status: 401 });

  // ─── Master hard-coded (non ha record in DB) ────────────────
  if (current.role === 'master') {
    const masterUser = getMasterUser();
    // Ri-emette il token per rinnovare la scadenza
    const newToken = await createToken(masterUser);
    const res = NextResponse.json({ success: true, data: masterUser, changed: false });
    res.cookies.set('pineapple_session', newToken, cookieOpts());
    return res;
  }

  // ─── Utente DB: rilegge con tenantIds freschi ───────────────
  const dbUser = await prisma.user.findUnique({
    where: { id: current.id },
    include: {
      tenant: true,
      userTenants: { select: { tenantId: true } },
    },
  });

  if (!dbUser || !dbUser.isActive) {
    // Utente disabilitato o eliminato → invalida la sessione
    const res = NextResponse.json(
      { success: false, error: 'Sessione non più valida' },
      { status: 401 },
    );
    res.cookies.delete('pineapple_session');
    return res;
  }

  // Costruisce AuthUser aggiornato
  const rolePerms = (ROLE_PERMISSIONS[dbUser.role] ?? []) as Permission[];
  const extraPerms: Permission[] = [];
  try {
    const parsed = JSON.parse(dbUser.permissions ?? '[]');
    if (Array.isArray(parsed)) extraPerms.push(...parsed);
  } catch {}

  const tenantIdsSet = new Set<string>();
  if (dbUser.tenantId) tenantIdsSet.add(dbUser.tenantId);
  dbUser.userTenants.forEach((ut) => tenantIdsSet.add(ut.tenantId));

  const freshUser: AuthUser = {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    permissions: [...new Set([...rolePerms, ...extraPerms])],
    tenantId: dbUser.tenantId,
    tenantSlug: dbUser.tenant?.slug ?? null,
    tenantIds: [...tenantIdsSet],
  };

  // Rileva se ci sono cambiamenti rispetto al token precedente
  const prevIds = [...(current.tenantIds ?? [])].sort().join(',');
  const nextIds = [...tenantIdsSet].sort().join(',');
  const changed =
    prevIds !== nextIds ||
    current.role !== freshUser.role ||
    current.tenantId !== freshUser.tenantId;

  const newToken = await createToken(freshUser);
  const res = NextResponse.json({ success: true, data: freshUser, changed });
  res.cookies.set('pineapple_session', newToken, cookieOpts());
  return res;
}

function cookieOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 giorni
    path: '/',
  };
}

