'use client';
// src/components/ui/WatermarkMediaCard.tsx — Widget rimozione filigrana (condiviso)

import { useState } from 'react';
import { ShieldAlert, Sparkles, Maximize2, Scissors, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { WatermarkRemoverModal, type RemovalMethod } from '@/components/ui/WatermarkRemoverModal';

export function WatermarkMediaCard({
  mediaType = 'image',
  tenantId,
  sourceUrl,
  onPublishAllowed,
}: {
  mediaType?: 'image' | 'video';
  tenantId?: string;
  /** URL contestuale (es. mediaUrl dal form). Se omesso, il modal chiede l'URL internamente */
  sourceUrl?: string;
  onPublishAllowed?: (outputUrl: string) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [initialMethod, setInitialMethod] = useState<RemovalMethod | undefined>();

  const openWithMethod = (method: RemovalMethod) => {
    setInitialMethod(method);
    setShowModal(true);
  };

  return (
    <div className="rounded-xl border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-500/5 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldAlert size={14} className="text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
          {mediaType === 'video' ? '🎬' : '🖼️'} Rimuovi Filigrana dal Media
        </span>
      </div>

      {/* Contesto */}
      {sourceUrl ? (
        <p className="text-[11px] text-gray-600 dark:text-gray-400 truncate flex items-center gap-1">
          <span className="text-gray-500 dark:text-gray-600">Media AI:</span> {sourceUrl}
        </p>
      ) : (
        <p className="text-[11px] text-yellow-700 dark:text-yellow-300/60">
          Rimuovi il watermark apposto dal generatore AI (Post Manager, AI Generator o Video AI). Scegli il metodo e nel passaggio successivo potrai indicare il media.
        </p>
      )}

      {/* 3 metodi come chip — sempre abilitati */}
      <div className="grid grid-cols-3 gap-2">
        {([
          { method: 'dissolve' as RemovalMethod, icon: <Sparkles size={13} className="text-yellow-500 dark:text-yellow-400" />, label: 'Dissolvenza', desc: 'AI rigenera la zona' },
          { method: 'distorsione' as RemovalMethod, icon: <Maximize2 size={13} className="text-blue-500 dark:text-blue-400" />, label: 'Distorsione', desc: 'Stira e taglia il bordo' },
          { method: 'taglio' as RemovalMethod, icon: <Scissors size={13} className="text-green-600 dark:text-green-400" />, label: 'Taglio', desc: 'Finestra senza WM' },
        ]).map(({ method, icon, label, desc }) => (
          <button
            key={method}
            type="button"
            onClick={() => openWithMethod(method)}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-yellow-200 dark:border-gray-700 bg-white dark:bg-transparent hover:border-yellow-400 dark:hover:border-yellow-500/40 hover:bg-yellow-50 dark:hover:bg-yellow-500/5 transition-all text-center"
          >
            <div className="w-7 h-7 rounded-lg bg-yellow-100 dark:bg-gray-800 flex items-center justify-center">{icon}</div>
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{label}</span>
            <span className="text-[10px] text-gray-500 dark:text-gray-500 leading-tight">{desc}</span>
          </button>
        ))}
      </div>

      {/* Avviso legale sintetico */}
      <p className="text-[11px] text-red-600 dark:text-red-400/80 flex items-start gap-1.5">
        <Lock size={10} className="flex-shrink-0 mt-0.5" />
        Solo mockup interni (watermark AI generatori). La pubblicazione è bloccata di default —
        verifica la licenza del tuo piano AI prima di pubblicare.
      </p>

      {/* Modal */}
      {showModal && (
        <WatermarkRemoverModal
          sourceUrl={sourceUrl}
          mediaType={mediaType}
          tenantId={tenantId}
          initialMethod={initialMethod}
          onClose={() => { setShowModal(false); setInitialMethod(undefined); }}
          onSuccess={() => toast.success('✅ Filigrana rimossa! Scarica o firma il disclaimer per pubblicare.')}
          onPublishAllowed={onPublishAllowed}
        />
      )}
    </div>
  );
}
