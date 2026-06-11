// src/lib/tiktok.ts
// TikTok Content Posting API v2 client

import { prisma } from './db';
import type { TikTokProfile } from '@/types';

const TIKTOK_API = 'https://open.tiktokapis.com/v2';

export class TikTokClient {
  private accessToken: string;
  private openId: string;

  constructor(accessToken: string, openId: string) {
    this.accessToken = accessToken;
    this.openId = openId;
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'POST',
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = method === 'GET'
      ? `${TIKTOK_API}/${endpoint}`
      : `${TIKTOK_API}/${endpoint}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (method === 'GET' && body) {
      const params = new URLSearchParams();
      Object.entries(body).forEach(([k, v]) => {
        if (v !== undefined) params.set(k, String(v));
      });
      const res = await fetch(`${url}?${params}`, options);
      const data = await res.json();
      if (!res.ok || data.error?.code !== 'ok') {
        throw new Error(data.error?.message ?? `TikTok API error: ${res.status}`);
      }
      return data as T;
    }

    options.body = body ? JSON.stringify(body) : undefined;
    const res = await fetch(url, options);
    const data = await res.json();

    if (!res.ok || (data.error?.code && data.error.code !== 'ok')) {
      throw new Error(data.error?.message ?? `TikTok API error: ${res.status}`);
    }

    return data as T;
  }

  // ─── Profilo utente ───────────────────────────────────────────
  async getProfile(): Promise<TikTokProfile> {
    const data = await this.request<{
      data: {
        user: {
          open_id: string;
          union_id: string;
          avatar_url: string;
          display_name: string;
          bio_description: string;
          profile_deep_link: string;
          is_verified: boolean;
          username: string;
          following_count: number;
          follower_count: number;
          likes_count: number;
          video_count: number;
        };
      };
    }>('user/info/', 'GET', {
      fields: 'open_id,union_id,avatar_url,display_name,username,following_count,follower_count,likes_count,video_count',
    });

    const u = data.data.user;
    return {
      openId: u.open_id,
      username: u.username,
      displayName: u.display_name,
      avatarUrl: u.avatar_url,
      followersCount: u.follower_count ?? 0,
      followingCount: u.following_count ?? 0,
      likesCount: u.likes_count ?? 0,
      videoCount: u.video_count ?? 0,
    };
  }

  // ─── Pubblica video (Direct Post) ────────────────────────────
  async publishVideo(
    videoUrl: string,
    caption: string,
    options?: {
      privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
      disableDuet?: boolean;
      disableComment?: boolean;
      disableStitch?: boolean;
    }
  ): Promise<string> {
    const result = await this.request<{
      data: { publish_id: string };
    }>('post/publish/video/init/', 'POST', {
      post_info: {
        title: caption.slice(0, 150),
        privacy_level: options?.privacyLevel ?? 'PUBLIC_TO_EVERYONE',
        disable_duet: options?.disableDuet ?? false,
        disable_comment: options?.disableComment ?? false,
        disable_stitch: options?.disableStitch ?? false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl,
      },
    });

    return result.data.publish_id;
  }

  // ─── Pubblica foto/immagini ───────────────────────────────────
  async publishPhoto(
    imageUrls: string[],
    caption: string,
    options?: {
      privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
      disableDuet?: boolean;
      disableComment?: boolean;
    }
  ): Promise<string> {
    const result = await this.request<{
      data: { publish_id: string };
    }>('post/publish/content/init/', 'POST', {
      post_info: {
        title: caption.slice(0, 150),
        privacy_level: options?.privacyLevel ?? 'PUBLIC_TO_EVERYONE',
        disable_duet: options?.disableDuet ?? false,
        disable_comment: options?.disableComment ?? false,
        auto_add_music: true,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        photo_cover_index: 0,
        photo_images: imageUrls,
      },
      post_mode: 'DIRECT_POST',
      media_type: 'PHOTO',
    });

    return result.data.publish_id;
  }

  // ─── Stato pubblicazione ─────────────────────────────────────
  async getPublishStatus(publishId: string): Promise<{
    status: string;
    failReason?: string;
    publicationId?: string;
  }> {
    const result = await this.request<{
      data: {
        publish_id: string;
        status: string;
        fail_reason?: string;
        publicaly_available_post_id?: string[];
      };
    }>('post/publish/status/fetch/', 'POST', { publish_id: publishId });

    return {
      status: result.data.status,
      failReason: result.data.fail_reason,
      publicationId: result.data.publicaly_available_post_id?.[0],
    };
  }

  // ─── Verifica token ───────────────────────────────────────────
  async verifyToken(): Promise<boolean> {
    try {
      await this.getProfile();
      return true;
    } catch {
      return false;
    }
  }

  // ─── Scambia authorization code → access token ───────────────
  static async exchangeCode(
    code: string,
    codeVerifier: string,
    redirectUri: string,
    clientKey: string,
    clientSecret: string
  ): Promise<{
    access_token: string;
    refresh_token: string;
    open_id: string;
    expires_in: number;
    refresh_expires_in: number;
  }> {
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error_description ?? 'TikTok OAuth error');
    return data;
  }

  // ─── Refresh access token ─────────────────────────────────────
  static async refreshAccessToken(
    refreshToken: string,
    clientKey: string,
    clientSecret: string
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error_description ?? 'TikTok refresh error');
    return data;
  }
}

// Factory da DB
export async function createTikTokClient(tenantId?: string): Promise<TikTokClient | null> {
  try {
    const where = tenantId
      ? { isActive: true, tenantId }
      : { isActive: true };
    const account = await prisma.tikTokAccount.findFirst({ where });
    if (!account) return null;

    // Controlla se il token è scaduto e prova a rinnovarlo
    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
      const clientKey = process.env.TIKTOK_CLIENT_KEY;
      const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
      if (clientKey && clientSecret && account.refreshToken) {
        try {
          const refreshed = await TikTokClient.refreshAccessToken(
            account.refreshToken,
            clientKey,
            clientSecret
          );
          await prisma.tikTokAccount.update({
            where: { id: account.id },
            data: {
              accessToken: refreshed.access_token,
              refreshToken: refreshed.refresh_token,
              tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
            },
          });
          return new TikTokClient(refreshed.access_token, account.openId);
        } catch {
          console.error('TikTok token refresh failed');
        }
      }
    }

    return new TikTokClient(account.accessToken, account.openId);
  } catch {
    return null;
  }
}

