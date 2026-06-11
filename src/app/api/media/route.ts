// src/app/api/media/route.ts — Libreria Media (tenant-scoped)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { saveFileFromUrl, isLocalUrl } from '@/lib/file-storage';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get('tenantId') ?? user.tenantId;
  const siteId = req.nextUrl.searchParams.get('siteId'); // Nuovo: filtrare per sito
  const type = req.nextUrl.searchParams.get('type'); // IMAGE | VIDEO | (tutti)
  const usedInAI = req.nextUrl.searchParams.get('usedInAI'); // 'true' = solo quelli attivi per AI

  if (!tenantId) {
    // Master senza tenant → ritorna tutti
    if (user.role !== 'master') {
      return NextResponse.json({ success: false, error: 'Tenant richiesto' }, { status: 400 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const masterWhere: Record<string, any> = { isActive: true };
    if (siteId) masterWhere.siteId = siteId;
    if (type) masterWhere.type = type.toUpperCase();
    if (usedInAI === 'true') masterWhere.usedInAI = true;
    const assets = await prisma.mediaAsset.findMany({
      where: masterWhere,
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, data: assets });
  }

  // Sicurezza: solo master o utenti dello stesso tenant
  if (user.role !== 'master' && user.tenantId !== tenantId) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { tenantId, isActive: true };
  if (siteId) where.siteId = siteId;
  if (type) where.type = type.toUpperCase();
  if (usedInAI === 'true') where.usedInAI = true;

  const assets = await prisma.mediaAsset.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ success: true, data: assets });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

  const body = await req.json();
  const tenantId: string = body.tenantId ?? user.tenantId;

  if (!tenantId) return NextResponse.json({ success: false, error: 'tenantId richiesto' }, { status: 400 });
  if (user.role !== 'master' && user.tenantId !== tenantId) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  const { name, url, type, mimeType, alt, description, tags, source, siteId, usedInAI, width, height, size } = body;

  if (!url) return NextResponse.json({ success: false, error: 'URL obbligatorio' }, { status: 400 });

  // ── Scarica e persiste il file localmente se è un URL remoto ──────────────
  const optimize: boolean = body.optimize !== false; // default true
  let finalUrl = url;
  let finalMimeType = mimeType ?? null;
  let finalWidth = width ?? null;
  let finalHeight = height ?? null;
  let finalSize = size ?? null;

  if (!isLocalUrl(url)) {
    try {
      const saved = await saveFileFromUrl(url, 'media-library', tenantId, {
        optimize,
        imageQuality: 85,
        siteId: siteId ?? null,
      });
      finalUrl = saved.publicUrl;
      finalMimeType = saved.mimeType;
      finalSize = saved.size;
      if (saved.width) finalWidth = saved.width;
      if (saved.height) finalHeight = saved.height;
    } catch (e) {
      // Se il download fallisce, salva comunque l'URL remoto come fallback
      console.warn('[media POST] download fallito, uso URL remoto:', e instanceof Error ? e.message : e);
    }
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      tenantId,
      name: name ?? url,
      url: finalUrl,
      type: (type ?? 'IMAGE').toUpperCase(),
      mimeType: finalMimeType,
      alt: alt ?? null,
      description: description ?? null,
      tags: tags ? JSON.stringify(tags) : '[]',
      source: source ?? 'MANUAL',
      siteId: siteId ?? null,
      usedInAI: usedInAI !== false,
      width: finalWidth,
      height: finalHeight,
      size: finalSize,
    },
  });

  return NextResponse.json({ success: true, data: asset }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ success: false, error: 'ID richiesto' }, { status: 400 });

  const existing = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ success: false, error: 'Asset non trovato' }, { status: 404 });
  if (user.role !== 'master' && user.tenantId !== existing.tenantId) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.alt !== undefined) data.alt = updates.alt;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.tags !== undefined) data.tags = JSON.stringify(updates.tags);
  if (updates.usedInAI !== undefined) data.usedInAI = updates.usedInAI;
  if (updates.isActive !== undefined) data.isActive = updates.isActive;

  const asset = await prisma.mediaAsset.update({ where: { id }, data });
  return NextResponse.json({ success: true, data: asset });
}

