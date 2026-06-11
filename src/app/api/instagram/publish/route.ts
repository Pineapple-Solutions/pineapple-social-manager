// src/app/api/instagram/publish/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { publishPost } from '@/lib/scheduler';
import { prisma } from '@/lib/db';
import type { PostType, MediaType } from '@/types';

// Estende il timeout della route a 5 minuti (necessario per video Reel che richiedono
// che Instagram processi il video prima che sia pubblicabile)
export const maxDuration = 300;

// Pubblica subito un post
export async function POST(req: NextRequest) {
  try {
    const body: {
      postId?: string;
      forceRetry?: boolean;   // se true, resetta retryCount e ri-pubblica anche se FAILED
      republish?: boolean;    // se true, crea un duplicato del post e lo pubblica (originale resta PUBLISHED)
      type?: PostType;
      caption?: string;
      hashtags?: string[];
      mediaUrls?: string[];
      mediaType?: MediaType;
      coverUrl?: string;
      accountId?: string;
    } = await req.json();

    // Ripubblica: crea un duplicato del post e pubblica il duplicato
    if (body.republish && body.postId) {
      const original = await prisma.scheduledPost.findUnique({ where: { id: body.postId } });
      if (!original) {
        return NextResponse.json({ success: false, error: 'Post originale non trovato' }, { status: 404 });
      }

      // Crea il duplicato come DRAFT
      const duplicate = await prisma.scheduledPost.create({
        data: {
          tenantId:         original.tenantId,
          platform:         original.platform,
          type:             original.type,
          status:           'DRAFT',
          caption:          original.caption,
          hashtags:         original.hashtags,
          mediaUrls:        original.mediaUrls,
          mediaType:        original.mediaType,
          coverUrl:         original.coverUrl,
          aiGenerated:      original.aiGenerated,
          aiPrompt:         original.aiPrompt,
          aiModel:          original.aiModel,
          mediaReady:       original.mediaReady,
          accountId:        original.accountId,
          facebookAccountId: original.facebookAccountId,
          tiktokAccountId:  original.tiktokAccountId,
          siteId:           original.siteId,
          campaignId:       original.campaignId,
          notes:            original.notes,
        },
      });

      const result = await publishPost(duplicate.id);
      return NextResponse.json(result);
    }

    // Se fornito postId, pubblica post esistente
    if (body.postId) {
      // Retry forzato: resetta retryCount e status prima di pubblicare
      if (body.forceRetry) {
        await prisma.scheduledPost.update({
          where: { id: body.postId },
          data: { retryCount: 0, status: 'DRAFT', error: null },
        });
      }
      const result = await publishPost(body.postId);
      return NextResponse.json(result);
    }

    // Altrimenti crea e pubblica al volo
    if (!body.accountId || !body.mediaUrls?.length) {
      return NextResponse.json(
        { success: false, error: 'Mancano accountId o mediaUrls' },
        { status: 400 }
      );
    }

    const post = await prisma.scheduledPost.create({
      data: {
        type: body.type ?? 'POST',
        status: 'SCHEDULED',
        caption: body.caption,
        hashtags: JSON.stringify(body.hashtags ?? []),
        mediaUrls: JSON.stringify(body.mediaUrls),
        mediaType: body.mediaType ?? 'IMAGE',
        coverUrl: body.coverUrl,
        scheduledAt: new Date(), // subito
        accountId: body.accountId,
      },
    });

    const result = await publishPost(post.id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Errore pubblicazione' },
      { status: 500 }
    );
  }
}

