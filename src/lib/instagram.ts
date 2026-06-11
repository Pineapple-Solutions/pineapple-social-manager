// src/lib/instagram.ts
// Instagram API client — supporta sia la nuova Instagram API (IGAA, graph.instagram.com)
// che la vecchia Graph API con Facebook Login (EAA, graph.facebook.com)

import { prisma } from './db';
import type { InstagramPost, InstagramProfile } from '@/types';

const GRAPH_FB  = 'https://graph.facebook.com/v21.0';
const GRAPH_IG  = 'https://graph.instagram.com/v21.0';

/** Rileva il tipo di token e restituisce la base URL corretta */
function getApiBase(token: string): string {
  return token.startsWith('IGAA') ? GRAPH_IG : GRAPH_FB;
}

interface MediaContainer {
  id: string;
}

export class InstagramClient {
  private accessToken: string;
  private businessAccountId: string;
  private apiBase: string;

  constructor(accessToken: string, businessAccountId: string) {
    this.accessToken = accessToken;
    this.businessAccountId = businessAccountId;
    this.apiBase = getApiBase(accessToken);
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = new URL(`${this.apiBase}/${endpoint}`);

    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (method === 'GET') {
      url.searchParams.set('access_token', this.accessToken);
      if (body) {
        Object.entries(body).forEach(([k, v]) => {
          if (v !== undefined) url.searchParams.set(k, String(v));
        });
      }
    } else if (method === 'DELETE') {
      url.searchParams.set('access_token', this.accessToken);
    } else {
      options.body = JSON.stringify({ ...body, access_token: this.accessToken });
    }

    const res = await fetch(url.toString(), options);
    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error?.message ?? `Instagram API error: ${res.status}`);
    }

    return data as T;
  }

  // --- Profilo ---
  async getProfile(): Promise<InstagramProfile> {
    // Nuova Instagram API: usa /me per ottenere il profilo direttamente
    // Vecchia Graph API: usa /{businessAccountId}
    const isNewApi = this.accessToken.startsWith('IGAA');
    const endpoint = isNewApi ? 'me' : this.businessAccountId;

    const data = await this.request<{
      id: string; username: string; name: string;
      biography: string; website: string;
      profile_picture_url: string;
      followers_count: number; follows_count: number; media_count: number;
    }>(endpoint, 'GET', {
      fields: 'id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count',
    });

    return {
      id: data.id,
      username: data.username,
      name: data.name,
      biography: data.biography,
      website: data.website,
      profilePictureUrl: data.profile_picture_url,
      followersCount: data.followers_count ?? 0,
      followingCount: data.follows_count ?? 0,
      mediaCount: data.media_count ?? 0,
    };
  }

  // --- Post immagine singola ---
  async createImagePost(imageUrl: string, caption: string): Promise<string> {
    const container = await this.request<MediaContainer>(
      `${this.businessAccountId}/media`,
      'POST',
      { image_url: imageUrl, caption }
    );

    // Attendi che il container sia pronto (evita "Media ID is not available")
    await this.waitForMediaReady(container.id);

    const result = await this.request<{ id: string }>(
      `${this.businessAccountId}/media_publish`,
      'POST',
      { creation_id: container.id }
    );

    return result.id;
  }

  // --- Carousel post ---
  async createCarouselPost(imageUrls: string[], caption: string): Promise<string> {
    const itemContainers = await Promise.all(
      imageUrls.map((url) =>
        this.request<MediaContainer>(`${this.businessAccountId}/media`, 'POST', {
          image_url: url,
          is_carousel_item: true,
        })
      )
    );

    const carousel = await this.request<MediaContainer>(
      `${this.businessAccountId}/media`,
      'POST',
      {
        media_type: 'CAROUSEL',
        children: itemContainers.map((c) => c.id).join(','),
        caption,
      }
    );

    // Attendi che il carousel container sia pronto
    await this.waitForMediaReady(carousel.id);

    const result = await this.request<{ id: string }>(
      `${this.businessAccountId}/media_publish`,
      'POST',
      { creation_id: carousel.id }
    );

    return result.id;
  }

  // --- Story immagine ---
  async createImageStory(imageUrl: string): Promise<string> {
    const container = await this.request<MediaContainer>(
      `${this.businessAccountId}/media`,
      'POST',
      { image_url: imageUrl, media_type: 'STORIES' }
    );

    // Attendi che il container sia pronto
    await this.waitForMediaReady(container.id);

    const result = await this.request<{ id: string }>(
      `${this.businessAccountId}/media_publish`,
      'POST',
      { creation_id: container.id }
    );

    return result.id;
  }

  // --- Story video ---
  async createVideoStory(videoUrl: string): Promise<string> {
    const container = await this.request<MediaContainer>(
      `${this.businessAccountId}/media`,
      'POST',
      { video_url: videoUrl, media_type: 'STORIES' }
    );

    await this.waitForMediaReady(container.id);

    const result = await this.request<{ id: string }>(
      `${this.businessAccountId}/media_publish`,
      'POST',
      { creation_id: container.id }
    );

    return result.id;
  }

  // --- Reel ---
  async createReel(videoUrl: string, caption: string, coverUrl?: string, shareToFeed = true): Promise<string> {
    const container = await this.request<MediaContainer>(
      `${this.businessAccountId}/media`,
      'POST',
      {
        media_type: 'REELS',
        video_url: videoUrl,
        caption,
        share_to_feed: shareToFeed,
        ...(coverUrl && { cover_url: coverUrl }),
      }
    );

    await this.waitForMediaReady(container.id);

    const result = await this.request<{ id: string }>(
      `${this.businessAccountId}/media_publish`,
      'POST',
      { creation_id: container.id }
    );

    return result.id;
  }

  // --- Attendi che il media sia pronto (per video) ---
  // maxAttempts=100 → ~5 minuti. I Reel possono richiedere fino a 5 minuti di processing.
  async waitForMediaReady(containerId: string, maxAttempts = 100): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.request<{ status_code: string; id: string }>(
        containerId,
        'GET',
        { fields: 'status_code,id' }
      );

      console.log(`[Instagram] Container ${containerId} status [${i + 1}/${maxAttempts}]: ${status.status_code}`);

      if (status.status_code === 'FINISHED') return;
      if (status.status_code === 'ERROR') {
        throw new Error(`Instagram: processing del media fallito (container: ${containerId}). Verifica che il video URL sia accessibile pubblicamente.`);
      }
      if (status.status_code === 'EXPIRED') {
        throw new Error(`Instagram: container media scaduto (${containerId}). Riprova con una nuova pubblicazione.`);
      }

      // Backoff progressivo: i primi 10 tentativi ogni 3s, poi ogni 6s
      const delay = i < 10 ? 3000 : 6000;
      await new Promise((r) => setTimeout(r, delay));
    }
    throw new Error(`Instagram: timeout attesa processing media (${containerId}) — ${maxAttempts} tentativi. Il video potrebbe richiedere più tempo o l'URL non è accessibile da Instagram.`);
  }

  // --- Ultimi media ---
  async getMedia(limit = 20): Promise<InstagramPost[]> {
    const data = await this.request<{
      data: Array<{
        id: string; caption?: string; media_url?: string;
        thumbnail_url?: string; timestamp: string;
        media_type: string; like_count?: number; comments_count?: number;
      }>;
    }>(`${this.businessAccountId}/media`, 'GET', {
      fields: 'id,caption,media_url,thumbnail_url,timestamp,media_type,like_count,comments_count',
      limit: String(limit),
    });

    return (data.data ?? []).map((m) => ({
      id: m.id,
      caption: m.caption,
      mediaUrl: m.media_url,
      thumbnailUrl: m.thumbnail_url,
      timestamp: m.timestamp,
      mediaType: m.media_type as 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM',
      likeCount: m.like_count ?? 0,
      commentsCount: m.comments_count ?? 0,
    }));
  }

  // --- Insights post singolo ---
  async getPostInsights(mediaId: string) {
    const data = await this.request<{
      data: Array<{ name: string; values?: Array<{ value: number }>; value?: number }>;
    }>(`${mediaId}/insights`, 'GET', {
      metric: 'impressions,reach,likes,comments,shares,saved,engagement',
    });

    const metrics: Record<string, number> = {};
    (data.data ?? []).forEach((m) => {
      metrics[m.name] = m.value ?? m.values?.[0]?.value ?? 0;
    });
    return metrics;
  }

  // --- Insights account ---
  async getAccountInsights(period: 'day' | 'week' | 'days_28' = 'day') {
    const isNewApi = this.accessToken.startsWith('IGAA');
    // La nuova Instagram API (IGAA / graph.instagram.com) non supporta 'impressions':
    // usa 'views' al suo posto. Endpoint: me/insights
    // La vecchia Graph API (EAA / graph.facebook.com) usa 'impressions'.
    // Endpoint: {businessAccountId}/insights
    const metricsParam = isNewApi
      ? 'views,reach,profile_views,website_clicks'
      : 'impressions,reach,profile_views,website_clicks';
    const endpoint = isNewApi ? 'me/insights' : `${this.businessAccountId}/insights`;

    const data = await this.request<{
      data: Array<{ name: string; values: Array<{ value: number; end_time: string }> }>;
    }>(endpoint, 'GET', {
      metric: metricsParam,
      period,
    });

    return data.data ?? [];
  }

  // --- Archivia (nascondi) un media su Instagram ---
  // Usa il parametro hide=true della Graph API (disponibile per i media IG)
  async hideMedia(mediaId: string): Promise<void> {
    await this.request<{ success: boolean }>(
      `${mediaId}`,
      'POST',
      { hide: true }
    );
  }

  // --- Elimina un media su Instagram ---
  async deleteMedia(mediaId: string): Promise<void> {
    await this.request<{ success: boolean }>(
      `${mediaId}`,
      'DELETE'
    );
  }

  // --- Verifica token ---
  async verifyToken(): Promise<boolean> {
    try {
      await this.getProfile();
      return true;
    } catch {
      return false;
    }
  }
}

// Factory: crea client dalle credenziali DB (opzionalmente filtrato per tenant)
export async function createInstagramClient(tenantId?: string): Promise<InstagramClient | null> {
  try {
    const where = tenantId
      ? { isActive: true, tenantId }
      : { isActive: true };
    const account = await prisma.instagramAccount.findFirst({ where });
    if (!account) return null;
    return new InstagramClient(account.accessToken, account.businessAccountId);
  } catch {
    return null;
  }
}

// Factory: crea client dalle env vars (fallback)
export function createInstagramClientFromEnv(): InstagramClient | null {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!token || !accountId) return null;
  return new InstagramClient(token, accountId);
}
