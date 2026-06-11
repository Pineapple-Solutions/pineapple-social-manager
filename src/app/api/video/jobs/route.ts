// src/app/api/video/jobs/route.ts — Lista job video (legge da GenerationJob type=VIDEO)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gj = () => (prisma as any).generationJob;

export async function GET(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get('tenantId') ?? user.tenantId;
  const status = req.nextUrl.searchParams.get('status');

  const where: Record<string, unknown> = { type: 'VIDEO' };
  if (tenantId) where.tenantId = tenantId;
  if (status) where.status = status;

  try {
    const jobs = await gj().findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        relatedPost: { select: { id: true, type: true, status: true, platform: true, caption: true } },
      },
    });

    return NextResponse.json({ success: true, data: jobs });
  } catch {
    return NextResponse.json({ success: true, data: [] });
  }
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

  const { id } = await req.json();
  try {
    await gj().update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}
