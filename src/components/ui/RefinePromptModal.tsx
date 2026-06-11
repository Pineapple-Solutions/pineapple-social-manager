'use client';
// src/components/ui/RefinePromptModal.tsx
// Modal che chiede un prompt aggiuntivo opzionale prima di avviare il job "Migliora media"

import { useState, useEffect, useRef } from 'react';
import { X, Wand2, Sparkles } from 'lucide-react';

interface RefinePromptModalProps {
  /** Se `jobId` è fornito usa quello, altrimenti `postId` */
  jobId?: string;
  postId?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RefinePromptModal({ jobId, postId, onClose, onSuccess }: RefinePromptModalProps) {
  const [additionalPrompt, setAdditionalPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea all'apertura
  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  // Chiudi con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { action: 'refineJob' };
      if (jobId) body.jobId = jobId;
      if (postId) body.postId = postId;
      if (additionalPrompt.trim()) body.additionalPrompt = additionalPrompt.trim();

      const res = await fetch('/api/generation-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        onSuccess?.();
        onClose();
      } else {
        alert(json.error ?? 'Errore durante il miglioramento');
      }
    } catch {
      alert('Errore di rete');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70"
      style={{ backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <Wand2 size={18} className="text-violet-400" />
            <div>
              <div className="text-sm font-semibold text-white">Migliora media AI</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Reinvia lo stesso prompt con il media generato come riferimento</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
            title="Chiudi"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Info box */}
          <div className="flex items-start gap-2.5 text-xs rounded-xl bg-violet-500/8 border border-violet-500/20 px-3 py-2.5 text-violet-300">
            <Sparkles size={13} className="flex-shrink-0 mt-0.5 text-violet-400" />
            <span>Verrà creato un nuovo job che usa il media precedentemente generato come immagine di riferimento, mantenendo lo stesso stile e soggetto.</span>
          </div>

          {/* Prompt aggiuntivo */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Istruzioni aggiuntive <span className="text-gray-600 font-normal">(opzionale)</span>
            </label>
            <textarea
              ref={textareaRef}
              value={additionalPrompt}
              onChange={(e) => setAdditionalPrompt(e.target.value)}
              placeholder="es. Aumenta la nitidezza, rendi il prodotto più prominente, usa colori più vivaci..."
              className="input w-full text-sm resize-none"
              rows={3}
              disabled={loading}
            />
            <p className="text-[10px] text-gray-600 mt-1">
              Se vuoto, verrà usato solo il prompt originale con la richiesta di migliorare qualità e dettagli.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-800 bg-gray-900/50">
          <button
            onClick={onClose}
            disabled={loading}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            Annulla
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary text-sm flex items-center gap-2"
          >
            <Wand2 size={14} className={loading ? 'animate-pulse' : ''} />
            {loading ? 'Creando job…' : '✨ Migliora'}
          </button>
        </div>
      </div>
    </div>
  );
}

