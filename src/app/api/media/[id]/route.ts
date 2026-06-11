// src/app/api/media/[id]/route.ts — Delete / Get singolo asset
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { deleteLocalFile } from '@/lib/file-storage';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

  const { id } = await params;
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) return NextResponse.json({ success: false, error: 'Asset non trovato' }, { status: 404 });

  if (user.role !== 'master' && user.tenantId !== asset.tenantId) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  // Elimina il file locale se presente
  deleteLocalFile(asset.url);

  await prisma.mediaAsset.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

  const { id } = await params;
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) return NextResponse.json({ success: false, error: 'Asset non trovato' }, { status: 404 });
  if (user.role !== 'master' && user.tenantId !== asset.tenantId) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }
  return NextResponse.json({ success: true, data: asset });
}
