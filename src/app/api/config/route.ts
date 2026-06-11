// src/app/api/config/route.ts — Configurazione per tenant + globale (senza tenantId)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken, hasPermission, PERMISSIONS } from '@/lib/auth';

const TENANT_CONFIG_KEYS = [
  'timezone', 'defaultLanguage', 'defaultTone',
  'autoPublish', 'notificationsEnabled',
];

// ── Helpers TenantConfig (per tenant specifico) ──────────────────
async function getTenantConfig(tenantId: string): Promise<Record<string, string>> {
  const configs = await prisma.tenantConfig.findMany({ where: { tenantId } });
  return Object.fromEntries(configs.map((c) => [c.key, c.value]));
}
async function setTenantConfig(tenantId: string, key: string, value: string) {
  await prisma.tenantConfig.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: { value },
    create: { tenantId, key, value },
  });
}

// ── Helpers Config globale (senza tenantId) ──────────────────────
async function getGlobalConfig(): Promise<Record<string, string>> {
  const configs = await prisma.config.findMany();
  return Object.fromEntries(configs.map((c) => [c.key, c.value]));
}
async function setGlobalConfig(key: string, value: string) {
  await prisma.config.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('pineapple_session')?.value;
    const user = token ? await verifyToken(token) : null;
    if (!user) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    // tenantId dalla query: null/vuoto oppure ?global=1 = config globale
    const rawTenantId = req.nextUrl.searchParams.get('tenantId');
    const forceGlobal = req.nextUrl.searchParams.get('global') === '1';
    const tenantId = forceGlobal ? null : (rawTenantId ?? user.tenantId);
    const isGlobal = !tenantId;

    let config: Record<string, string> = {};
    let account = null;
    let facebookAccount = null;
    let tiktokAccount = null;
    let aiProviders: unknown[] = [];

    if (isGlobal) {
      // ── Configurazione globale ──
      config = await getGlobalConfig();

      // Account globali (tenantId = null)
      account = await prisma.instagramAccount.findFirst({
        where: { tenantId: null, isActive: true },
      });
      facebookAccount = await prisma.facebookAccount.findFirst({
        where: { tenantId: null, isActive: true },
        select: { id: true, pageName: true, followersCount: true, pageId: true },
      });
      tiktokAccount = await prisma.tikTokAccount.findFirst({
        where: { tenantId: null, isActive: true },
        select: { id: true, username: true, displayName: true, followersCount: true, openId: true },
      });
    } else {
      config = await getTenantConfig(tenantId);

      account = await prisma.instagramAccount.findFirst({
        where: { tenantId, isActive: true },
      });
      facebookAccount = await prisma.facebookAccount.findFirst({
        where: { tenantId, isActive: true },
        select: { id: true, pageName: true, followersCount: true, pageId: true },
      });
      tiktokAccount = await prisma.tikTokAccount.findFirst({
        where: { tenantId, isActive: true },
        select: { id: true, username: true, displayName: true, followersCount: true, openId: true },
      });
      aiProviders = await prisma.aIProviderConfig.findMany({
        where: { tenantId },
        select: {
          id: true, provider: true, model: true,
          isDefault: true, isActive: true,
          maxTokensPerDay: true, tokensUsedToday: true, tokenResetAt: true,
          videoEnabled: true, videoModel: true,
          apiKey: false,
        },
      });
    }

    return NextResponse.json({ success: true, data: { config, account, facebookAccount, tiktokAccount, aiProviders, isGlobal } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('pineapple_session')?.value;
    const user = token ? await verifyToken(token) : null;
    if (!user || !hasPermission(user, PERMISSIONS.CONFIG_WRITE)) {
      return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
    }

    const body: Record<string, string | boolean> = await req.json();
    // tenantId vuoto/assente oppure isGlobal:true = configurazione globale
    const rawTenantId = (body.tenantId as string) || user.tenantId || null;
    const bodyGlobal = (body.isGlobal as boolean) === true;
    const tenantId = bodyGlobal ? null : rawTenantId;
    const isGlobal = !tenantId;

    // ── Salva config generali ─────────────────────────────────────
    for (const [key, value] of Object.entries(body)) {
      if (TENANT_CONFIG_KEYS.includes(key) && value !== undefined && value !== null) {
        if (isGlobal) {
          await setGlobalConfig(key, String(value));
        } else {
          await setTenantConfig(tenantId!, key, String(value));
        }
      }
    }

    // ── Instagram ─────────────────────────────────────────────────
    if (body.instagramAccessToken && body.instagramBusinessAccountId) {
      // Rimuove tutti i whitespace
      let igToken = String(body.instagramAccessToken).replace(/\s+/g, '');
      let accountId = String(body.instagramBusinessAccountId).replace(/\s+/g, '');
      const appId = body.instagramAppId ? String(body.instagramAppId).replace(/\s+/g, '') : '';
      const appSecret = body.instagramAppSecret ? String(body.instagramAppSecret).replace(/\s+/g, '') : '';

      // Determina tipo API in base al prefisso del token
      const isNewIgApi = igToken.startsWith('IGAA'); // nuova Instagram API (graph.instagram.com)
      const isOldFbApi = igToken.startsWith('EAA');  // vecchia Graph API (graph.facebook.com)

      if (!isNewIgApi && !isOldFbApi) {
        return NextResponse.json({
          success: false,
          error: `Token non riconosciuto (prefisso: "${igToken.substring(0, 6)}"). Deve iniziare con IGAA (nuova Instagram API) oppure EAA (vecchia Graph API con Facebook Login). Segui la guida nella sezione Account Instagram.`,
        }, { status: 400 });
      }

      // Scambio token short-lived → long-lived se App ID + Secret sono forniti
      if (appId && appSecret) {
        if (!/^\d+$/.test(appId)) {
          return NextResponse.json({
            success: false,
            error: "App ID non valido: deve essere solo numeri (es: 1311665224243327), non il nome dell'app.",
          }, { status: 400 });
        }
        try {
          let exchangeUrl: URL;
          if (isNewIgApi) {
            // Nuova IG API: exchange endpoint su graph.instagram.com
            exchangeUrl = new URL('https://graph.instagram.com/access_token');
            exchangeUrl.searchParams.set('grant_type', 'ig_exchange_token');
            exchangeUrl.searchParams.set('client_id', appId);
            exchangeUrl.searchParams.set('client_secret', appSecret);
            exchangeUrl.searchParams.set('access_token', igToken);
          } else {
            // Vecchia Graph API
            exchangeUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
            exchangeUrl.searchParams.set('grant_type', 'fb_exchange_token');
            exchangeUrl.searchParams.set('client_id', appId);
            exchangeUrl.searchParams.set('client_secret', appSecret);
            exchangeUrl.searchParams.set('fb_exchange_token', igToken);
          }
          const exRes = await fetch(exchangeUrl.toString());
          const exJson = await exRes.json();
          if (exJson.access_token) {
            igToken = exJson.access_token;
            console.info('Token scambiato con long-lived, scade in:', exJson.expires_in, 's');
          } else {
            console.warn('Token exchange skippato (token già long-lived o mismatch):', exJson.error?.message);
          }
        } catch (exErr) {
          console.warn('Errore rete token exchange:', exErr);
        }
      }

      const { InstagramClient } = await import('@/lib/instagram');
      const client = new InstagramClient(igToken, accountId);

      try {
        const profile = await client.getProfile();
        // Per la nuova IG API l'id del profilo IS il businessAccountId reale
        const resolvedAccountId = isNewIgApi ? profile.id : accountId;
        await prisma.instagramAccount.upsert({
          where: { businessAccountId: resolvedAccountId },
          update: {
            accessToken: igToken,
            username: profile.username,
            followersCount: profile.followersCount,
            postsCount: profile.mediaCount,
            profilePicture: profile.profilePictureUrl,
            isActive: true,
            tenantId: isGlobal ? null : tenantId,
          },
          create: {
            businessAccountId: resolvedAccountId,
            accessToken: igToken,
            username: profile.username,
            followersCount: profile.followersCount,
            postsCount: profile.mediaCount,
            profilePicture: profile.profilePictureUrl,
            isActive: true,
            tenantId: isGlobal ? null : tenantId,
          },
        });
      } catch (igErr) {
        return NextResponse.json({
          success: false,
          error: `Credenziali Instagram non valide: ${igErr instanceof Error ? igErr.message : 'Errore'}`,
        }, { status: 400 });
      }
    }

    // ── Facebook ──────────────────────────────────────────────────
    if (body.facebookPageAccessToken && body.facebookPageId) {
      const fbToken = String(body.facebookPageAccessToken);
      const pageId = String(body.facebookPageId);

      const { FacebookClient } = await import('@/lib/facebook');
      const fbClient = new FacebookClient(fbToken, pageId);

      try {
        const profile = await fbClient.getProfile();
        await prisma.facebookAccount.upsert({
          where: { pageId },
          update: {
            accessToken: fbToken,
            pageName: profile.name,
            followersCount: profile.followersCount,
            profilePicture: profile.profilePictureUrl,
            isActive: true,
            tenantId: isGlobal ? null : tenantId,
          },
          create: {
            pageId,
            pageName: profile.name,
            accessToken: fbToken,
            followersCount: profile.followersCount,
            profilePicture: profile.profilePictureUrl,
            isActive: true,
            tenantId: isGlobal ? null : tenantId,
          },
        });
      } catch (fbErr) {
        return NextResponse.json({
          success: false,
          error: `Credenziali Facebook non valide: ${fbErr instanceof Error ? fbErr.message : 'Errore'}`,
        }, { status: 400 });
      }
    }

    // ── TikTok ────────────────────────────────────────────────────
    if (body.tiktokAccessToken && body.tiktokOpenId) {
      const ttToken = String(body.tiktokAccessToken);
      const openId = String(body.tiktokOpenId);
      const refreshToken = body.tiktokRefreshToken ? String(body.tiktokRefreshToken) : null;

      const { TikTokClient } = await import('@/lib/tiktok');
      const ttClient = new TikTokClient(ttToken, openId);

      try {
        const profile = await ttClient.getProfile();
        await prisma.tikTokAccount.upsert({
          where: { openId },
          update: {
            accessToken: ttToken,
            refreshToken,
            username: profile.username,
            displayName: profile.displayName,
            followersCount: profile.followersCount,
            avatarUrl: profile.avatarUrl,
            isActive: true,
            tenantId: isGlobal ? null : tenantId,
          },
          create: {
            openId,
            accessToken: ttToken,
            refreshToken,
            username: profile.username,
            displayName: profile.displayName,
            followersCount: profile.followersCount,
            avatarUrl: profile.avatarUrl,
            isActive: true,
            tenantId: isGlobal ? null : tenantId,
          },
        });
      } catch (ttErr) {
        return NextResponse.json({
          success: false,
          error: `Credenziali TikTok non valide: ${ttErr instanceof Error ? ttErr.message : 'Errore'}`,
        }, { status: 400 });
      }
    }

    return NextResponse.json({
      success: true,
      message: isGlobal ? 'Configurazione globale salvata' : 'Configurazione salvata',
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const token = req.cookies.get('pineapple_session')?.value;
    const user = token ? await verifyToken(token) : null;
    if (!user || !hasPermission(user, PERMISSIONS.CONFIG_WRITE)) {
      return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
    }

    const type = req.nextUrl.searchParams.get('type'); // 'instagram' | 'facebook' | 'tiktok'
    const rawTenantId = req.nextUrl.searchParams.get('tenantId');
    const forceGlobal = req.nextUrl.searchParams.get('global') === '1';
    const tenantId = forceGlobal ? null : (rawTenantId ?? user.tenantId);

    if (type === 'instagram') {
      await prisma.instagramAccount.updateMany({
        where: { tenantId: tenantId ?? null, isActive: true },
        data: { isActive: false },
      });
    } else if (type === 'facebook') {
      await prisma.facebookAccount.updateMany({
        where: { tenantId: tenantId ?? null, isActive: true },
        data: { isActive: false },
      });
    } else if (type === 'tiktok') {
      await prisma.tikTokAccount.updateMany({
        where: { tenantId: tenantId ?? null, isActive: true },
        data: { isActive: false },
      });
    } else {
      return NextResponse.json({ success: false, error: 'Tipo account non valido' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

