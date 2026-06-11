// src/app/api/media/upload/route.ts — Upload diretto file multipart
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { saveBufferToStorage } from '@/lib/file-storage';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ success: false, error: 'Formato richiesta non valido' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ success: false, error: 'File obbligatorio' }, { status: 400 });

  const tenantId: string = (formData.get('tenantId') as string) ?? user.tenantId ?? '';
  if (!tenantId) return NextResponse.json({ success: false, error: 'tenantId richiesto' }, { status: 400 });

  if (user.role !== 'master' && user.tenantId !== tenantId) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  const name = (formData.get('name') as string) || file.name;
  const alt = (formData.get('alt') as string) || null;
  const description = (formData.get('description') as string) || null;
  const siteId = (formData.get('siteId') as string) || null;
  const usedInAI = formData.get('usedInAI') !== 'false'; // default true

  const mimeType = file.type || 'application/octet-stream';
  const isVideo = mimeType.startsWith('video/');
  const mediaType = isVideo ? 'VIDEO' : 'IMAGE';

  // Estrai estensione dal nome file
  const nameParts = file.name.split('.');
  const ext = nameParts.length > 1 ? nameParts.pop()!.toLowerCase() : 'bin';

  const buffer = Buffer.from(await file.arrayBuffer());

  let result;
  try {
    result = await saveBufferToStorage(buffer, 'media-library', tenantId, ext, {
      optimize: true,
      imageQuality: 85,
      siteId,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: `Errore salvataggio file: ${e instanceof Error ? e.message : e}` },
      { status: 500 }
    );
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      tenantId,
      name,
      url: result.publicUrl,
      type: mediaType,
      mimeType: result.mimeType,
      alt,
      description,
      tags: '[]',
      source: 'MANUAL',
      siteId,
      usedInAI,
      width: result.width ?? null,
      height: result.height ?? null,
      size: result.size,
    },
  });

  return NextResponse.json({ success: true, data: asset }, { status: 201 });
}

