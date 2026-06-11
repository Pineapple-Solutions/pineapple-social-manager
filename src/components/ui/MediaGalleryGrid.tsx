'use client';
// src/components/ui/MediaGalleryGrid.tsx
// Galleria inline compatta per liste — gestisce immagini e video, apre il lightbox al click

import { useState } from 'react';
import { Play, ImageIcon, Video } from 'lucide-react';
import { MediaGalleryLightbox, type GalleryMediaItem } from './MediaGalleryLightbox';

/* ── helpers ──────────────────────────────────────────────────────────────── */

export function isVideoUrl(url: string, mimeType?: string): boolean {
  if (mimeType) return mimeType.startsWith('video/');
  return /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
}

export function isImageUrl(url: string, mimeType?: string): boolean {
  if (mimeType) return mimeType.startsWith('image/');
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url);
}

/* ── MediaThumb ───────────────────────────────────────────────────────────── */

interface MediaThumbProps {
  url: string;
  mimeType?: string;
  alt?: string;
  size: number; // px
  onClick: () => void;
  className?: string;
}

function MediaThumb({ url, mimeType, alt, size, onClick, className = '' }: MediaThumbProps) {
  const [imgError, setImgError] = useState(false);
  const vid = isVideoUrl(url, mimeType);
  const isLocal = url.startsWith('/');

  const baseClass = `relative flex-shrink-0 rounded-lg border border-gray-700 overflow-hidden bg-gray-800/80 cursor-pointer hover:border-brand-500/60 hover:opacity-90 transition-all group`;

  if (vid) {
    return (
      <div
        className={`${baseClass} ${className}`}
        style={{ width: size, height: size }}
        onClick={onClick}
        title={alt ?? 'Video — clicca per aprire'}
      >
        {isLocal ? (
          // File locale: prova a mostrare il primo frame del video
          <video
            src={url}
            preload="metadata"
            muted
            playsInline
            className="w-full h-full object-cover"
            style={{ pointerEvents: 'none' }}
          />
        ) : (
          // URL remoto (es. Google Veo): non è accessibile senza auth → placeholder
          <div className="w-full h-full flex items-center justify-center bg-gray-900/80">
            <Video size={size > 40 ? 22 : 14} className="text-violet-400/70" />
          </div>
        )}
        {/* Overlay play icon */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
          <div className="rounded-full bg-black/70 border border-white/20 p-1.5 group-hover:scale-110 transition-transform">
            <Play size={size > 40 ? 14 : 10} className="text-white fill-white ml-0.5" />
          </div>
        </div>
      </div>
    );
  }

  // Immagine
  return (
    <div
      className={`${baseClass} ${className}`}
      style={{ width: size, height: size }}
      onClick={onClick}
      title={alt ?? 'Immagine — clicca per aprire'}
    >
      {!imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt ?? ''}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon size={size > 40 ? 20 : 14} className="text-gray-600" />
        </div>
      )}
    </div>
  );
}

/* ── MediaGalleryGrid (export principale) ─────────────────────────────────── */

export interface MediaGalleryGridItem {
  url: string;
  mimeType?: string;
  alt?: string;
  description?: string;
}

interface MediaGalleryGridProps {
  items: MediaGalleryGridItem[];
  tenantId?: string;
  thumbSize?: number;       // dimensione thumbnail px (default 56)
  maxVisible?: number;      // max visibili prima di "+N" (default 4)
  className?: string;
  onWatermarkSuccess?: (index: number, newUrl: string) => void;
}

export function MediaGalleryGrid({
  items,
  tenantId,
  thumbSize = 56,
  maxVisible = 4,
  className = '',
  onWatermarkSuccess,
}: MediaGalleryGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!items || items.length === 0) return null;

  const visible = items.slice(0, maxVisible);
  const extra = items.length - maxVisible;

  const galleryItems: GalleryMediaItem[] = items.map(it => ({
    url: it.url,
    type: isVideoUrl(it.url, it.mimeType) ? 'video' : 'image',
    mimeType: it.mimeType,
  }));

  return (
    <>
      <div className={`flex flex-wrap gap-1.5 ${className}`}>
        {visible.map((item, i) => (
          <MediaThumb
            key={i}
            url={item.url}
            mimeType={item.mimeType}
            alt={item.alt ?? item.description}
            size={thumbSize}
            onClick={() => setLightboxIndex(i)}
          />
        ))}
        {extra > 0 && (
          <button
            onClick={() => setLightboxIndex(maxVisible - 1)}
            className="flex items-center justify-center rounded-lg border border-gray-700 bg-gray-800/60 text-gray-400 hover:border-gray-500 hover:text-gray-200 transition-all text-sm font-semibold"
            style={{ width: thumbSize, height: thumbSize }}
            title={`${extra} altri media`}
          >
            +{extra}
          </button>
        )}
      </div>

      {lightboxIndex !== null && (
        <MediaGalleryLightbox
          items={galleryItems}
          initialIndex={lightboxIndex}
          tenantId={tenantId}
          onClose={() => setLightboxIndex(null)}
          onWatermarkSuccess={onWatermarkSuccess}
        />
      )}
    </>
  );
}

