// src/app/api/instagram/media-action/route.ts
// Azioni sui media già pubblicati su Instagram: archive (hide) e delete_platform
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createInstagramClient } from '@/lib/instagram';

export const maxDuration = 60;

type MediaAction = 'archive' | 'delete_platform';

export async function POST(req: NextRequest) {
  try {
    const body: { postId?: string; action?: MediaAction } = await req.json();

    if (!body.postId || !body.action) {
      return NextResponse.json(
        { success: false, error: 'Mancano postId o action' },
        { status: 400 }
      );
    }

    const post = await prisma.scheduledPost.findUnique({ where: { id: body.postId } });
    if (!post) {
      return NextResponse.json({ success: false, error: 'Post non trovato' }, { status: 404 });
    }

    if (post.platform !== 'INSTAGRAM') {
      return NextResponse.json(
        { success: false, error: 'Questa azione è supportata solo per post Instagram' },
        { status: 400 }
      );
    }

    const instagramPostId = post.instagramPostId;
    if (!instagramPostId) {
      return NextResponse.json(
        { success: false, error: 'Nessun ID post Instagram associato a questo record' },
        { status: 400 }
      );
    }

    const igClient = await createInstagramClient(post.tenantId ?? undefined);
    if (!igClient) {
      return NextResponse.json(
        { success: false, error: 'Nessun account Instagram configurato per questo tenant' },
        { status: 400 }
      );
    }

    if (body.action === 'archive') {
      // Nasconde il post su Instagram (archiviazione)
      await igClient.hideMedia(instagramPostId);

      // Aggiorna lo stato nel DB
      await prisma.scheduledPost.update({
        where: { id: body.postId },
        data: { status: 'ARCHIVED' },
      });

      return NextResponse.json({ success: true, message: 'Post archiviato su Instagram' });
    }

    if (body.action === 'delete_platform') {
      // Elimina il post da Instagram ma mantiene il record nell'app
      await igClient.deleteMedia(instagramPostId);

      // Ripristina il post come bozza nell'app (content conservato, re-pubblicabile)
      await prisma.scheduledPost.update({
        where: { id: body.postId },
        data: {
          status: 'DRAFT',
          instagramPostId: null,
          publishedAt: null,
          error: null,
          retryCount: 0,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Post eliminato da Instagram. Il contenuto è ora salvato come bozza nell\'app.',
      });
    }

    return NextResponse.json({ success: false, error: 'Azione non riconosciuta' }, { status: 400 });
  } catch (err) {
    console.error('[media-action]', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Errore azione media' },
      { status: 500 }
    );
  }
}

