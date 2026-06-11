// src/lib/auth.ts — Autenticazione JWT + OTP

import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { prisma } from './db';

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? 'pineapple-fallback-secret-change-me'
);

export const PERMISSIONS = {
  POSTS_READ:     'posts:read',
  POSTS_WRITE:    'posts:write',
  POSTS_PUBLISH:  'posts:publish',
  ANALYTICS_READ: 'analytics:read',
  CAMPAIGNS_WRITE:'campaigns:write',
  CONFIG_WRITE:   'config:write',
  USERS_MANAGE:   'users:manage',
  TENANTS_MANAGE: 'tenants:manage',
  AI_USE:         'ai:use',
  VIDEO_GENERATE: 'video:generate',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  master: Object.values(PERMISSIONS) as Permission[],
  admin:  ['posts:read','posts:write','posts:publish','analytics:read','campaigns:write','config:write','ai:use','video:generate'],
  editor: ['posts:read','posts:write','analytics:read','campaigns:write','ai:use','video:generate'],
  viewer: ['posts:read','analytics:read'],
};

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: Permission[];
  tenantId: string | null;       // tenant primario (sessione corrente)
  tenantSlug: string | null;
  tenantIds: string[];           // tutti i tenant a cui l'utente ha accesso
}

// ─── Hashing ───────────────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── JWT ────────────────────────────────────────────────────────
export async function createToken(user: AuthUser): Promise<string> {
  return new SignJWT({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: user.permissions,
    tenantId: user.tenantId,
    tenantSlug: user.tenantSlug,
    tenantIds: user.tenantIds,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const tenantId = (payload.tenantId as string) ?? null;
    // Backward compat: vecchi token senza tenantIds
    const tenantIds: string[] = Array.isArray(payload.tenantIds)
      ? (payload.tenantIds as string[])
      : tenantId ? [tenantId] : [];
    return {
      id: payload.userId as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as string,
      permissions: (payload.permissions ?? []) as Permission[],
      tenantId,
      tenantSlug: (payload.tenantSlug as string) ?? null,
      tenantIds,
    };
  } catch {
    return null;
  }
}

// ─── Master user (da .env.local) ───────────────────────────────
export function getMasterUser(): AuthUser {
  return {
    id: 'master',
    email: process.env.MASTER_EMAIL ?? 'admin@pineapplehome.it',
    name: 'Master Admin',
    role: 'master',
    permissions: Object.values(PERMISSIONS) as Permission[],
    tenantId: null,
    tenantSlug: null,
    tenantIds: [],
  };
}

// ─── Login ──────────────────────────────────────────────────────
export async function loginUser(
  email: string,
  password: string
): Promise<{ user: AuthUser; token: string } | { error: string }> {

  const masterEmail = process.env.MASTER_EMAIL ?? 'admin@pineapplehome.it';
  const masterPassword = process.env.MASTER_PASSWORD ?? 'Admin123!';

  // Master user da env
  if (email === masterEmail) {
    if (password !== masterPassword) return { error: 'Credenziali non valide' };
    const user = getMasterUser();
    const token = await createToken(user);
    return { user, token };
  }

  // Utenti DB
  const dbUser = await prisma.user.findUnique({
    where: { email },
    include: {
      tenant: true,
      userTenants: { select: { tenantId: true } },
    },
  });

  if (!dbUser || !dbUser.isActive) return { error: 'Credenziali non valide' };

  const valid = await verifyPassword(password, dbUser.password);
  if (!valid) return { error: 'Credenziali non valide' };

  const rolePerms = ROLE_PERMISSIONS[dbUser.role] ?? [];
  const extraPerms: Permission[] = [];
  try {
    const parsed = JSON.parse(dbUser.permissions ?? '[]');
    if (Array.isArray(parsed)) extraPerms.push(...parsed);
  } catch {}

  // Costruisce lista completa tenant: includi tenantId primario + tutti i UserTenant
  const tenantIdsSet = new Set<string>();
  if (dbUser.tenantId) tenantIdsSet.add(dbUser.tenantId);
  dbUser.userTenants.forEach(ut => tenantIdsSet.add(ut.tenantId));

  const user: AuthUser = {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    permissions: [...new Set([...rolePerms, ...extraPerms])],
    tenantId: dbUser.tenantId,
    tenantSlug: dbUser.tenant?.slug ?? null,
    tenantIds: [...tenantIdsSet],
  };

  const token = await createToken(user);
  return { user, token };
}

// ─── Verifica permesso ──────────────────────────────────────────
export function hasPermission(user: AuthUser, permission: Permission): boolean {
  return user.role === 'master' || user.permissions.includes(permission);
}

// ─── Helper: estrai utente dalla request ────────────────────────
import { type NextRequest } from 'next/server';

export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  const token = req.cookies.get('pineapple_session')?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Restituisce il filtro tenantId da applicare alle query Prisma.
 * - master senza ?tenantId → vede tutto (no where)
 * - master con ?tenantId=xxx → filtra per quel tenant
 * - non-master con 1 tenant → filtra sempre per il suo tenantId
 * - non-master con più tenant, nessun param → filtra per tutti i suoi tenant (tenantIds)
 * - non-master con più tenant, ?tenantId=xxx valido → filtra per quel tenant
 * Restituisce null se l'utente non è autenticato.
 */
export async function getTenantFilter(
  req: NextRequest
): Promise<{ tenantId?: string | null; tenantIds?: string[]; user: AuthUser } | null> {
  const user = await getAuthUser(req);
  if (!user) return null;

  if (user.role === 'master') {
    const tid = req.nextUrl.searchParams.get('tenantId');
    return { tenantId: tid ? tid : undefined, user };
  }

  // Costruisce la lista completa dei tenant dell'utente
  const allTenantIds = user.tenantIds.length > 0
    ? user.tenantIds
    : (user.tenantId ? [user.tenantId] : []);

  if (allTenantIds.length > 1) {
    const tid = req.nextUrl.searchParams.get('tenantId');
    if (tid && allTenantIds.includes(tid)) {
      // Tenant specifico valido richiesto dal frontend
      return { tenantId: tid, user };
    }
    // Nessun filtro o filtro non valido → mostra tutti i suoi tenant
    return { tenantIds: allTenantIds, user };
  }

  return { tenantId: user.tenantId, user };
}

/**
 * Costruisce la clausola where Prisma per il filtraggio per tenant.
 * Gestisce i 3 casi: tenant singolo, multi-tenant, master senza filtro.
 */
export function buildTenantWhere(
  scope: { tenantId?: string | null; tenantIds?: string[] }
): Record<string, unknown> {
  if (scope.tenantIds && scope.tenantIds.length > 0) {
    return { tenantId: { in: scope.tenantIds } };
  }
  if (scope.tenantId !== undefined) {
    return { tenantId: scope.tenantId };
  }
  return {}; // master senza filtro → vede tutto
}

