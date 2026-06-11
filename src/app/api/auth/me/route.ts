// src/app/api/auth/me/route.ts — Utente corrente
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ success: false, error: 'Token non valido' }, { status: 401 });

  return NextResponse.json({ success: true, data: user });
}

