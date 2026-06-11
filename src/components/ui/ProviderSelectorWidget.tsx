'use client';
// src/components/ui/ProviderSelectorWidget.tsx
// Widget riutilizzabile per selezione provider/modello AI per singola esecuzione (no modifica globale)

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Zap, RotateCcw } from 'lucide-react';
import { PROVIDER_INFO, MODEL_LABELS, MODEL_COST, MAX_COST, costBadgeClass } from '@/lib/ai-models';

// ─── Logo SVG inline per ogni provider ───────────────────────────────────────

function GoogleLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function AnthropicLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zM6.396 3.52L0 20h3.69l1.338-3.424h6.815L13.18 20h3.69L10.474 3.52H6.396zm-.783 10.045 2.29-5.683 2.184 5.683H5.613z" fill="#D97757"/>
    </svg>
  );
}

function OpenAILogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0L4.001 14.2A4.505 4.505 0 0 1 2.34 7.895zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.816 2.8a4.5 4.5 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.393-.676zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.814-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135L6.29 11.695a.076.076 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.71 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" fill="currentColor"/>
    </svg>
  );
}

const PROVIDER_LOGOS: Record<string, React.ElementType> = {
  google: GoogleLogo,
  anthropic: AnthropicLogo,
  openai: OpenAILogo,
};

const PROVIDER_COLORS: Record<string, string> = {
  google: 'text-blue-400 border-blue-500/30 bg-blue-500/8',
  anthropic: 'text-orange-400 border-orange-500/30 bg-orange-500/8',
  openai: 'text-green-400 border-green-500/30 bg-green-500/8',
};
const PROVIDER_ACTIVE_COLORS: Record<string, string> = {
  google: 'text-blue-300 border-blue-400/60 bg-blue-500/20',
  anthropic: 'text-orange-300 border-orange-400/60 bg-orange-500/20',
  openai: 'text-green-300 border-green-400/60 bg-green-500/20',
};
const PROVIDER_NAMES: Record<string, string> = {
  google: 'Google',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
};

// Tipo di lavoro per filtro modelli
type JobType = 'text' | 'image' | 'video';

interface TenantProvider {
  id: string;
  provider: string;
  model: string;
  imageModel?: string | null;
  imageEnabled?: boolean;
  videoModel?: string | null;
  videoEnabled?: boolean;
  isDefault?: boolean;
  isActive?: boolean;
}

interface ProviderSelectorWidgetProps {
  tenantId?: string;
  jobType: JobType;
  /** Modello override correntemente selezionato (null = usa predefinito) */
  value: string | null;
  onChange: (model: string | null) => void;
  className?: string;
  /** Etichetta compatta (opzionale) */
  label?: string;
}

export function ProviderSelectorWidget({
  tenantId,
  jobType,
  value,
  onChange,
  className = '',
  label = 'Provider',
}: ProviderSelectorWidgetProps) {
  const [expanded, setExpanded] = useState(false);
  const [providers, setProviders] = useState<TenantProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Carica provider del tenant
  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    fetch(`/api/ai/providers?tenantId=${tenantId}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          const active = (json.data as TenantProvider[]).filter(p => p.isActive !== false);
          setProviders(active);
          // Auto-seleziona il provider del valore corrente (se c'è)
          if (value) {
            const matchProv = detectProviderFromModel(value);
            if (matchProv) setSelectedProvider(matchProv);
          } else if (active.length > 0) {
            // Usa il provider default
            const def = active.find(p => p.isDefault) ?? active[0];
            setSelectedProvider(def.provider);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // Quando cambia il valore esterno, aggiorna il provider selezionato
  useEffect(() => {
    if (value) {
      const p = detectProviderFromModel(value);
      if (p) setSelectedProvider(p);
    }
  }, [value]);

  // Trova in quale provider si trova un modello
  function detectProviderFromModel(model: string): string | null {
    for (const [key, info] of Object.entries(PROVIDER_INFO)) {
      const allModels = [...info.models, ...info.imageModels, ...info.videoModels];
      if ((allModels as string[]).includes(model)) return key;
    }
    return null;
  }

  // Modelli disponibili per un provider e tipo
  function getModelsForProvider(providerKey: string): string[] {
    const info = PROVIDER_INFO[providerKey as keyof typeof PROVIDER_INFO];
    if (!info) return [];
    if (jobType === 'text') return [...info.models];
    if (jobType === 'image') return [...info.imageModels];
    if (jobType === 'video') return [...info.videoModels];
    return [];
  }

  // Trova il modello "predefinito" configurato per il tenant (per il tipo)
  function getDefaultModelForProvider(providerKey: string): string | null {
    const prov = providers.find(p => p.provider === providerKey);
    if (!prov) return null;
    if (jobType === 'text') return prov.model ?? null;
    if (jobType === 'image') return prov.imageModel ?? null;
    if (jobType === 'video') return prov.videoModel ?? null;
    return null;
  }

  // Provider disponibili (che hanno modelli per questo tipo)
  const availableProviders = Object.keys(PROVIDER_INFO).filter(pk => {
    const models = getModelsForProvider(pk);
    return models.length > 0;
  });

  // Provider configurati per il tenant (intersezione)
  const configuredProviders = providers.map(p => p.provider);

  const currentModel = value;
  const currentCost = currentModel ? MODEL_COST[currentModel] : undefined;
  const currentLabel = currentModel ? (MODEL_LABELS[currentModel] ?? currentModel) : null;
  const currentProviderKey = currentModel ? (detectProviderFromModel(currentModel) ?? '') : '';
  const ProviderIconCurrent = currentProviderKey ? PROVIDER_LOGOS[currentProviderKey] : null;

  // Modelli da mostrare per provider selezionato
  const modelsForSelected = selectedProvider ? getModelsForProvider(selectedProvider) : [];
  const defaultForSelected = selectedProvider ? getDefaultModelForProvider(selectedProvider) : null;

  // Cost bar helper
  function CostBar({ cost }: { cost: number }) {
    const filled = Math.max(1, Math.round((cost / MAX_COST) * 6));
    return (
      <div className="flex gap-px items-center">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`w-1.5 h-1.5 rounded-sm ${i < filled ? costBadgeClass(cost).replace('border-', '').split(' ')[0] : 'bg-gray-700'}`} />
        ))}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-gray-700/60 bg-gray-900/60 ${className}`}>
      {/* Header / trigger */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-800/40 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-2">
          <Zap size={12} className="text-yellow-400/80" />
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
          {loading && <span className="text-[9px] text-gray-600">caricamento...</span>}
        </div>
        <div className="flex items-center gap-2">
          {/* Stato corrente */}
          {currentModel ? (
            <div className="flex items-center gap-1.5">
              {ProviderIconCurrent && (
                <span className={`flex-shrink-0 ${currentProviderKey ? PROVIDER_COLORS[currentProviderKey]?.split(' ')[0] : 'text-gray-400'}`}>
                  <ProviderIconCurrent size={12} />
                </span>
              )}
              <span className="text-[10px] text-yellow-300 font-mono max-w-[150px] truncate" title={currentModel}>
                {currentModel.split('/').pop()}
              </span>
              {currentCost !== undefined && (
                <span className={`text-[9px] px-1 py-px rounded border font-bold ${costBadgeClass(currentCost)}`}>
                  {currentCost}×
                </span>
              )}
            </div>
          ) : (
            <span className="text-[10px] text-gray-500 italic">predefinito</span>
          )}
          {expanded ? <ChevronUp size={12} className="text-gray-500" /> : <ChevronDown size={12} className="text-gray-500" />}
        </div>
      </button>

      {/* Pannello espanso */}
      {expanded && (
        <div className="border-t border-gray-700/40 px-3 pb-3 pt-2 space-y-2.5">

          {/* Provider tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {/* Opzione "predefinito" */}
            <button
              type="button"
              onClick={() => { onChange(null); }}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] transition-all ${
                !currentModel
                  ? 'border-gray-400/50 bg-gray-500/20 text-gray-200 font-semibold'
                  : 'border-gray-700/50 text-gray-500 hover:border-gray-500/50 hover:text-gray-300'
              }`}
            >
              <RotateCcw size={9} />
              Predefinito
            </button>

            {availableProviders.map(pk => {
              const Logo = PROVIDER_LOGOS[pk];
              const isConfigured = configuredProviders.includes(pk);
              const isActive = selectedProvider === pk;
              const color = isActive ? PROVIDER_ACTIVE_COLORS[pk] : PROVIDER_COLORS[pk];
              return (
                <button
                  key={pk}
                  type="button"
                  onClick={() => setSelectedProvider(pk)}
                  disabled={!isConfigured}
                  title={isConfigured ? `Seleziona modelli ${PROVIDER_NAMES[pk]}` : `${PROVIDER_NAMES[pk]} non configurato`}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-medium transition-all ${
                    isConfigured ? `${color} cursor-pointer` : 'border-gray-800 text-gray-700 cursor-not-allowed opacity-40'
                  }`}
                >
                  {Logo && <Logo size={13} />}
                  <span>{PROVIDER_NAMES[pk]}</span>
                  {isConfigured && defaultForSelected && selectedProvider === pk && (
                    <span className="text-[9px] opacity-60">✓config</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Lista modelli per provider selezionato */}
          {selectedProvider && modelsForSelected.length > 0 && (
            <div className="space-y-0.5 max-h-52 overflow-y-auto pr-0.5">
              {modelsForSelected.map(modelName => {
                const isSelected = currentModel === modelName;
                const isDefault = defaultForSelected === modelName;
                const cost = MODEL_COST[modelName];
                const label2 = MODEL_LABELS[modelName];
                const displayName = modelName.split('/').pop() ?? modelName;
                return (
                  <button
                    key={modelName}
                    type="button"
                    onClick={() => { onChange(modelName); }}
                    className={`w-full flex items-start gap-2 justify-between text-left px-2.5 py-1.5 rounded-lg border text-[10px] transition-all ${
                      isSelected
                        ? `${PROVIDER_ACTIVE_COLORS[selectedProvider]} font-semibold`
                        : 'border-transparent hover:border-gray-700/60 hover:bg-gray-800/40 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[10px]">{displayName}</span>
                        {isDefault && (
                          <span className="text-[8px] bg-gray-700 text-gray-400 rounded px-1 py-px">config</span>
                        )}
                        {isSelected && (
                          <span className="text-[8px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded px-1 py-px">✓ selezionato</span>
                        )}
                      </div>
                      {label2 && (
                        <div className="text-[9px] text-gray-600 mt-0.5 truncate">{label2.split(' — ')[1] ?? label2}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                      {cost !== undefined && (
                        <>
                          <span className={`text-[9px] px-1 py-px rounded border font-bold ${costBadgeClass(cost)}`}>
                            {cost}×
                          </span>
                          <CostBar cost={cost} />
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Info consumo modello selezionato */}
          {currentModel && currentCost !== undefined && (
            <div className={`rounded-lg border px-2.5 py-1.5 flex items-center gap-3 ${costBadgeClass(currentCost)}`}>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] uppercase tracking-wide opacity-70 mb-0.5">Consumo relativo</div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[11px]">{currentCost}× del baseline</span>
                  <div className="flex gap-px">
                    {Array.from({ length: 6 }).map((_, i) => {
                      const filled = Math.max(1, Math.round((currentCost / MAX_COST) * 6));
                      return (
                        <div key={i} className={`w-2.5 h-2.5 rounded-sm border border-current/20 ${i < filled ? 'opacity-100' : 'opacity-20'}`}
                          style={{ backgroundColor: i < filled ? 'currentColor' : 'transparent' }} />
                      );
                    })}
                  </div>
                </div>
              </div>
              {currentLabel && (
                <div className="text-[9px] opacity-70 max-w-[120px] truncate text-right">{currentLabel.split(' — ')[0]}</div>
              )}
            </div>
          )}

          {/* Nota */}
          <p className="text-[9px] text-gray-600 leading-relaxed">
            Il provider selezionato viene usato solo per questa esecuzione — non modifica le impostazioni globali del tenant.
          </p>
        </div>
      )}
    </div>
  );
}

