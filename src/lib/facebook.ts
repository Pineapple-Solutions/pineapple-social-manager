// src/lib/facebook.ts
// Facebook Graph API client (Page Management)

import { prisma } from './db';
import type { FacebookProfile } from '@/types';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

export class FacebookClient {
  private accessToken: string;
  private pageId: string;

  constructor(accessToken: string, pageId: string) {
    this.accessToken = accessToken;
    this.pageId = pageId;
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = new URL(`${GRAPH_API}/${endpoint}`);

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
    } else {
      options.body = JSON.stringify({ ...body, access_token: this.accessToken });
    }

    const res = await fetch(url.toString(), options);
    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error?.message ?? `Facebook API error: ${res.status}`);
    }

    return data as T;
  }

  // ─── Profilo pagina ───────────────────────────────────────────
  async getProfile(): Promise<FacebookProfile> {
    const data = await this.request<{
      id: string; name: string;
      picture?: { data?: { url?: string } };
      followers_count?: number;
      fan_count?: number;
    }>(`${this.pageId}`, 'GET', {
      fields: 'id,name,picture,followers_count,fan_count',
    });

    return {
      id: data.id,
      name: data.name,
      profilePictureUrl: data.picture?.data?.url,
      followersCount: data.followers_count ?? 0,
      likesCount: data.fan_count ?? 0,
    };
  }

  // ─── Post testo/link ─────────────────────────────────────────
  async createTextPost(message: string, link?: string): Promise<string> {
    const body: Record<string, unknown> = { message };
    if (link) body.link = link;

    const result = await this.request<{ id: string }>(
      `${this.pageId}/feed`,
      'POST',
      body
    );
    return result.id;
  }

  // ─── Post con foto ────────────────────────────────────────────
  async createPhotoPost(imageUrl: string, caption: string): Promise<string> {
    const result = await this.request<{ id: string }>(
      `${this.pageId}/photos`,
      'POST',
      { url: imageUrl, caption }
    );
    return result.id;
  }

  // ─── Post con video / Reel ───────────────────────────────────
  async createVideoPost(videoUrl: string, description: string, title?: string): Promise<string> {
    const body: Record<string, unknown> = {
      file_url: videoUrl,
      description,
    };
    if (title) body.title = title;

    const result = await this.request<{ id: string }>(
      `${this.pageId}/videos`,
      'POST',
      body
    );
    return result.id;
  }

  // ─── Post Carosello (multi-foto) ─────────────────────────────
  async createCarouselPost(imageUrls: string[], caption: string): Promise<string> {
    // Step 1: Upload ogni foto come "unpublished"
    const photoIds = await Promise.all(
      imageUrls.map((url) =>
        this.request<{ id: string }>(`${this.pageId}/photos`, 'POST', {
          url,
          published: false,
        }).then((r) => r.id)
      )
    );

    // Step 2: Crea post con le foto
    const result = await this.request<{ id: string }>(
      `${this.pageId}/feed`,
      'POST',
      {
        message: caption,
        attached_media: photoIds.map((id) => ({ media_fbid: id })),
      }
    );
    return result.id;
  }

  // ─── Story (via photo/video già caricati) ────────────────────
  async createStory(mediaUrl: string, isVideo = false): Promise<string> {
    if (isVideo) {
      const result = await this.request<{ id: string }>(
        `${this.pageId}/video_stories`,
        'POST',
        { file_url: mediaUrl }
      );
      return result.id;
    } else {
      const result = await this.request<{ id: string }>(
        `${this.pageId}/photo_stories`,
        'POST',
        { url: mediaUrl }
      );
      return result.id;
    }
  }

  // ─── Insights pagina ─────────────────────────────────────────
  async getPageInsights(
    period: 'day' | 'week' | 'days_28' = 'day'
  ) {
    // Metriche supportate dalla Graph API v21.0
    // Rimosse: page_positive_feedback_by_type (dep.), page_fan_count (non è un insight)
    const data = await this.request<{
      data: Array<{ name: string; values: Array<{ value: number; end_time: string }> }>;
    }>(`${this.pageId}/insights`, 'GET', {
      metric: 'page_impressions,page_reach,page_views_total,page_post_engagements',
      period,
    });
    return data.data ?? [];
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
}

// Factory da DB
export async function createFacebookClient(tenantId?: string): Promise<FacebookClient | null> {
  try {
    const where = tenantId
      ? { isActive: true, tenantId }
      : { isActive: true };
    const account = await prisma.facebookAccount.findFirst({ where });
    if (!account) return null;
    return new FacebookClient(account.accessToken, account.pageId);
  } catch {
    return null;
  }
}

