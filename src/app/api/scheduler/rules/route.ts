// src/app/api/scheduler/rules/route.ts — Regole scheduler (tenant-scoped)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getTenantFilter, buildTenantWhere } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const where = buildTenantWhere(scope);
    const rules = await prisma.schedulerRule.findMany({ where, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ success: true, data: rules });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const body = await req.json();
    const tenantId = (body.tenantId && body.tenantId.trim() !== '') ? body.tenantId : scope.tenantId;

    const rule = await prisma.schedulerRule.create({
      data: {
        tenantId: tenantId ?? null,
        name: body.name,
        description: body.description,
        isActive: body.isActive ?? true,
        contentType: body.contentType ?? 'MIXED',
        frequency: body.frequency ?? 'DAILY',
        postsPerDay: body.postsPerDay ?? 1,
        storiesPerDay: body.storiesPerDay ?? 0,
        reelsPerWeek: body.reelsPerWeek ?? 0,
        preferredTimes: JSON.stringify(body.preferredTimes ?? []),
        timezone: body.timezone ?? 'Europe/Rome',
        activeDays: JSON.stringify(body.activeDays ?? [1, 2, 3, 4, 5, 6, 0]),
        contentSource: body.contentSource ?? 'AI',
        siteUrl: body.siteUrl,
        aiTone: body.aiTone ?? 'professional',
        aiLanguage: body.aiLanguage ?? 'it',
        aiTopics: JSON.stringify(body.aiTopics ?? []),
      },
    });

    return NextResponse.json({ success: true, data: rule });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}
