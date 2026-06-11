// src/app/api/auth/otp/verify/route.ts — Verifica e attiva OTP
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import speakeasy from 'speakeasy';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.id === 'master') {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  try {
    const { code } = await req.json();
    if (!code) return NextResponse.json({ success: false, error: 'Codice richiesto' }, { status: 400 });

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser?.otpSecret) {
      return NextResponse.json({ success: false, error: 'OTP non configurato. Esegui prima il setup.' }, { status: 400 });
    }

    const isValid = speakeasy.totp.verify({
      secret: dbUser.otpSecret,
      encoding: 'base32',
      token: code,
      window: 1,
    });
    if (!isValid) {
      return NextResponse.json({ success: false, error: 'Codice non valido' }, { status: 400 });
    }

    // Attiva OTP
    await prisma.user.update({
      where: { id: user.id },
      data: { otpEnabled: true },
    });

    return NextResponse.json({ success: true, message: 'OTP attivato con successo' });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

