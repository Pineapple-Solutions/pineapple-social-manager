// src/app/api/auth/otp/setup/route.ts — Setup TOTP
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.id === 'master') {
    return NextResponse.json({ success: false, error: 'Non applicabile al master user' }, { status: 403 });
  }

  try {
    // Genera un nuovo secret
    const secret = speakeasy.generateSecret({ name: `Pineapple Social Manager (${user.email})`, length: 20 });
    const otpAuthUrl = secret.otpauth_url ?? '';
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    // Salva il secret temporaneamente (non attivare ancora)
    await prisma.user.update({
      where: { id: user.id },
      data: { otpSecret: secret.base32 },
    });

    return NextResponse.json({
      success: true,
      data: { secret: secret.base32, qrCode: qrCodeDataUrl, otpAuthUrl },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get('pineapple_session')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.id === 'master') {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { otpEnabled: false, otpSecret: null },
  });

  return NextResponse.json({ success: true, message: 'OTP disabilitato' });
}

