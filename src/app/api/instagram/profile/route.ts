// src/app/api/instagram/profile/route.ts
import { NextResponse } from 'next/server';
import { createInstagramClient, createInstagramClientFromEnv } from '@/lib/instagram';

export async function GET() {
  try {
    const client = (await createInstagramClient()) ?? createInstagramClientFromEnv();
    if (!client) {
      return NextResponse.json({ success: false, error: 'Account Instagram non configurato' }, { status: 400 });
    }

    const profile = await client.getProfile();
    return NextResponse.json({ success: true, data: profile });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Errore' },
      { status: 500 }
    );
  }
}

