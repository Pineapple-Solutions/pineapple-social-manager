// src/app/api/auth/login/route.ts — Login endpoint

import { NextRequest, NextResponse } from 'next/server';
import { loginUser } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Email e password obbligatori' }, { status: 400 });
    }

    const result = await loginUser(email.trim().toLowerCase(), password);

    if ('error' in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 401 });
    }

    const res = NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        tenantId: result.user.tenantId,
        tenantSlug: result.user.tenantSlug,
      },
    });

    res.cookies.set('pineapple_session', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 giorni
      path: '/',
    });

    return res;
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore server' }, { status: 500 });
  }
}

