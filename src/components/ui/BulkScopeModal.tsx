'use client';
// src/components/ui/BulkScopeModal.tsx — Modal scelta scope bulk riutilizzabile

import { useState } from 'react';
import { Check, AlertTriangle, Users } from 'lucide-react';
import type { TenantOption } from '@/lib/hooks/useTenantFilter';

interface BulkScopeModalProps {
  tenants: TenantOption[];
  onGlobal: () => void;
  onBulk: () => void;
  onCancel: () => void;
  /** Label dell'opzione "globale" */
  globalLabel?: string;
  /** Descrizione dell'opzione "globale" */
  globalDescription?: string;
  /** Label dell'opzione "bulk" (default: "Crea per tutti i clienti (N)") */
  bulkLabel?: string;
  /** Descrizione dell'opzione "bulk" (default: lista nomi tenants) */
  bulkDescription?: React.ReactNode;
  /** Testo avvertimento bulk (default: messaggio generico) */
  bulkWarning?: string;
  /** Label bottone conferma bulk (default: "Crea per N clienti") */
  bulkConfirmLabel?: string;
}

export function BulkScopeModal({
  tenants,
  onGlobal,
  onBulk,
  onCancel,
  globalLabel = 'Salva senza cliente (globale)',
  globalDescription = 'Il contenuto non sarà associato a nessun cliente',
  bulkLabel,
  bulkDescription,
  bulkWarning,
  bulkConfirmLabel,
}: BulkScopeModalProps) {
  const [mode, setMode] = useState<'global' | 'bulk'>('global');

  const defaultBulkLabel = `Crea per tutti i clienti (${tenants.length})`;
  const defaultBulkDescription = (
    <>
      Verrà creata una bozza separata per:{' '}
      <span className="text-gray-300">{tenants.map(t => t.name).join(', ')}</span>
    </>
  );
  const defaultBulkWarning = `Verranno create ${tenants.length} operazioni separate, una per ogni cliente. Potrai gestirle individualmente.`;
  const defaultBulkConfirmLabel = `👥 Crea per ${tenants.length} clienti`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md animate-slide-up">
        <div className="p-6 space-y-5">

          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Users size={20} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Nessun cliente selezionato</h3>
              <p className="text-sm text-gray-400 mt-0.5">
                Non hai selezionato un cliente specifico. Come vuoi procedere?
              </p>
            </div>
          </div>

          {/* Opzioni */}
          <div className="space-y-2">
            {/* Globale */}
            <button
              onClick={() => setMode('global')}
              className={`w-full p-4 rounded-xl border text-left transition-all ${
                mode === 'global'
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🌐</span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">{globalLabel}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{globalDescription}</div>
                </div>
                {mode === 'global' && <Check size={16} className="text-brand-400 flex-shrink-0" />}
              </div>
            </button>

            {/* Bulk */}
            <button
              onClick={() => setMode('bulk')}
              className={`w-full p-4 rounded-xl border text-left transition-all ${
                mode === 'bulk'
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">👥</span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">
                    {bulkLabel ?? defaultBulkLabel}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {bulkDescription ?? defaultBulkDescription}
                  </div>
                </div>
                {mode === 'bulk' && <Check size={16} className="text-amber-400 flex-shrink-0" />}
              </div>
            </button>
          </div>

          {/* Avvertimento bulk */}
          {mode === 'bulk' && (
            <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-300">
              <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
              <span>{bulkWarning ?? defaultBulkWarning}</span>
            </div>
          )}

          {/* Azioni */}
          <div className="flex gap-3 pt-1">
            <button onClick={onCancel} className="btn-secondary flex-1">
              Annulla
            </button>
            <button
              onClick={mode === 'bulk' ? onBulk : onGlobal}
              className={`flex-1 ${
                mode === 'bulk'
                  ? 'bg-amber-500 hover:bg-amber-400 text-white font-medium py-2 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm'
                  : 'btn-primary'
              }`}
            >
              {mode === 'bulk'
                ? (bulkConfirmLabel ?? defaultBulkConfirmLabel)
                : '🌐 Procedi in globale'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

