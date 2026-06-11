'use client';
// src/components/ui/MediaGalleryLightbox.tsx
// Lightbox gallery per media multipli (immagini + video) con navigazione e rimozione filigrana

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Download, Loader2, ShieldAlert } from 'lucide-react';
import { WatermarkRemoverModal } from './WatermarkRemoverModal';

export interface GalleryMediaItem {
  url: string;
  /** Se non fornito, viene rilevato dall'estensione URL o mimeType */
  type?: 'image' | 'video';
  /** MIME type opzionale per rilevamento più preciso */
  mimeType?: string;
  /** Etichetta opzionale mostrata nell'header */
  label?: string;
}

interface MediaGalleryLightboxProps {
  items: GalleryMediaItem[];
  initialIndex?: number;
  onClose: () => void;
  tenantId?: string;
  /** Chiamato quando watermark rimosso con successo: (indice media, nuova URL pulita) */
  onWatermarkSuccess?: (index: number, newUrl: string) => void;
}

function isVideoItem(item: GalleryMediaItem): boolean {
  if (item.type === 'video') return true;
  if (item.type === 'image') return false;
  if (item.mimeType) return item.mimeType.startsWith('video/');
  return /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(item.url);
}

export function MediaGalleryLightbox({
  items,
  initialIndex = 0,
  onClose,
  tenantId,
  onWatermarkSuccess,
}: MediaGalleryLightboxProps) {
  const [current, setCurrent] = useState(Math.max(0, Math.min(initialIndex, items.length - 1)));
  const [showWatermark, setShowWatermark] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const item = items[current];
  const isVideo = item ? isVideoItem(item) : false;
  const hasMultiple = items.length > 1;

  const prev = useCallback(() => {
    setCurrent(i => (i > 0 ? i - 1 : items.length - 1));
  }, [items.length]);

  const next = useCallback(() => {
    setCurrent(i => (i < items.length - 1 ? i + 1 : 0));
  }, [items.length]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasMultiple) prev();
      if (e.key === 'ArrowRight' && hasMultiple) next();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, prev, next, hasMultiple]);

  // Blocca scroll body
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleDownload = async () => {
    if (!item) return;
    setDownloading(true);
    try {
      const res = await fetch(item.url);
      const blob = await res.blob();
      const ext = isVideo ? 'mp4' : 'png';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `media_${Date.now()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silenzioso
    } finally {
      setDownloading(false);
    }
  };

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-black/97"
      style={{ backdropFilter: 'blur(4px)' }}
    >
      {/* ── Header ───────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-950/90 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{isVideo ? '🎬 Video' : '🖼️ Immagine'}</span>
          {item.label && (
            <span className="text-xs text-gray-300 truncate max-w-[300px]" title={item.label}>{item.label}</span>
          )}
          {hasMultiple && (
            <span className="text-xs text-gray-400 bg-gray-800/80 border border-gray-700 px-2 py-0.5 rounded-full">
              {current + 1} / {items.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60"
          >
            {downloading
              ? <Loader2 size={12} className="animate-spin" />
              : <Download size={12} />}
            {downloading ? 'Download…' : 'Scarica'}
          </button>
          <button
            onClick={() => setShowWatermark(true)}
            className="flex items-center gap-1.5 text-xs text-yellow-300 hover:text-yellow-200 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 rounded-lg px-3 py-1.5 transition-colors"
          >
            <ShieldAlert size={12} /> Rimuovi filigrana
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors ml-1"
            title="Chiudi (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── Media area ────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden px-16 py-4">
        {/* Prev */}
        {hasMultiple && (
          <button
            onClick={prev}
            className="absolute left-3 z-10 p-2.5 rounded-full bg-black/70 hover:bg-black text-white border border-gray-700/60 transition-all hover:scale-105 flex-shrink-0"
            title="Precedente (←)"
          >
            <ChevronLeft size={22} />
          </button>
        )}

        {/* Media */}
        {isVideo ? (
          <video
            key={item.url}
            src={item.url}
            controls
            className="rounded-xl shadow-2xl max-w-full"
            style={{ maxHeight: 'calc(100vh - 160px)' }}
            autoPlay={false}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={item.url}
            src={item.url}
            alt={`Media ${current + 1}`}
            className="rounded-xl shadow-2xl object-contain max-w-full select-none"
            style={{ maxHeight: 'calc(100vh - 160px)' }}
            draggable={false}
          />
        )}

        {/* Next */}
        {hasMultiple && (
          <button
            onClick={next}
            className="absolute right-3 z-10 p-2.5 rounded-full bg-black/70 hover:bg-black text-white border border-gray-700/60 transition-all hover:scale-105 flex-shrink-0"
            title="Successivo (→)"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {/* ── Dots ─────────────────────────────────────── */}
      {hasMultiple && (
        <div className="flex items-center justify-center gap-2 py-3 bg-gray-950/80 border-t border-gray-800 flex-shrink-0">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`rounded-full transition-all ${
                i === current
                  ? 'w-5 h-2 bg-white'
                  : 'w-2 h-2 bg-gray-600 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>
      )}

      {/* ── Watermark modal ───────────────────────────── */}
      {showWatermark && (
        <WatermarkRemoverModal
          sourceUrl={item.url}
          mediaType={isVideo ? 'video' : 'image'}
          tenantId={tenantId}
          onClose={() => setShowWatermark(false)}
          onSuccess={(outputUrl) => {
            onWatermarkSuccess?.(current, outputUrl);
            setShowWatermark(false);
          }}
        />
      )}
    </div>
  );
}

