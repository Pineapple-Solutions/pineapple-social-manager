// src/app/api/facebook/publish/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { publishPost } from '@/lib/scheduler';
import { prisma } from '@/lib/db';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Ripubblica: crea un duplicato del post e lo pubblica
    if (body.republish && body.postId) {
      const original = await prisma.scheduledPost.findUnique({ where: { id: body.postId } });
      if (!original) return NextResponse.json({ success: false, error: 'Post non trovato' }, { status: 404 });

      const duplicate = await prisma.scheduledPost.create({
        data: {
          tenantId: original.tenantId, platform: original.platform, type: original.type,
          status: 'DRAFT', caption: original.caption, hashtags: original.hashtags,
          mediaUrls: original.mediaUrls, mediaType: original.mediaType, coverUrl: original.coverUrl,
          aiGenerated: original.aiGenerated, aiPrompt: original.aiPrompt, aiModel: original.aiModel,
          mediaReady: original.mediaReady, accountId: original.accountId,
          facebookAccountId: original.facebookAccountId, tiktokAccountId: original.tiktokAccountId,
          siteId: original.siteId, campaignId: original.campaignId, notes: original.notes,
        },
      });

      const result = await publishPost(duplicate.id);
      return NextResponse.json(result);
    }

    if (body.postId) {
      if (body.forceRetry) {
        await prisma.scheduledPost.update({
          where: { id: body.postId },
          data: { retryCount: 0, status: 'DRAFT', error: null },
        });
      }
      const result = await publishPost(body.postId);
      return NextResponse.json(result);
    }
    return NextResponse.json({ success: false, error: 'postId richiesto' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}
