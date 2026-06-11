'use client';
// src/app/ai-providers/page.tsx — Configurazione provider AI multi-provider

import { useState, useEffect, useCallback } from 'react';
import { Brain, Plus, Trash2, Check, X, Star, Info, ExternalLink, Pencil, RotateCcw, RefreshCw, AlertCircle, Stethoscope } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTenantFilter } from '@/lib/hooks/useTenantFilter';
import { PROVIDER_INFO, MODEL_LABELS, MODEL_COST, MAX_COST, costBadgeClass, isVideoModel } from '@/lib/ai-models';

interface ProviderQuota {
  provider: string;
  tpmLimit: number | null;
  tpmRemaining: number | null;
  tpmUsed: number | null;
  tpmResetAt: string | null;
  rpmLimit: number | null;
  rpmRemaining: number | null;
  rpmResetAt: string | null;
  tpdLimit: number | null;
  tpdRemaining: number | null;
  tpdResetAt: string | null;
  source: 'headers' | 'none';
  fetchedAt: string;
}

interface QuotaState {
  data: ProviderQuota | null;
  loading: boolean;
  error: string | null;
}

interface AIProvider {
  id: string; provider: string; model: string; apiKey: string;
  isDefault: boolean; isActive: boolean;
  maxTokensPerDay: number; tokensUsedToday: number; tokenResetAt: string | null;
  maxConcurrentJobs: number;
  videoEnabled: boolean; videoModel: string | null;
  imageEnabled: boolean; imageModel: string | null;
  fallbackEnabled: boolean;
  usedFor: string; // JSON array string
  tenantId: string;
}

interface Tenant { id: string; name: string; slug: string; }


// Funzionalità disponibili per l'assegnazione del provider
const FUNCTIONALITIES = [
  { key: 'ai-generator', label: '✨ AI Generator', desc: 'Generazione contenuti libera' },
  { key: 'posts', label: '🖼️ Post Manager', desc: 'Generazione caption e hashtag' },
  { key: 'ideas', label: '💡 Idee Contenuto', desc: 'Suggerimento e brainstorming' },
  { key: 'scheduler', label: '📅 Scheduler', desc: 'Automazione pubblicazioni' },
  { key: 'video', label: '🎬 Video', desc: 'Generazione video AI' },
  { key: 'captions', label: '✍️ Didascalie', desc: 'Riscrittura e miglioramento testi' },
];

// ─── Helpers per reset date ───────────────────────────────────
function getNextInternalReset(tokenResetAt: string | null): Date {
  if (tokenResetAt) {
    const d = new Date(tokenResetAt);
    if (d > new Date()) return d;
  }
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  return midnight;
}

function formatResetDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff <= 0) return 'ora';
  if (diff < 60_000) return `${Math.ceil(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.ceil(diff / 60_000)} min`;
  if (diff < 86_400_000) {
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `oggi ${h}:${m}`;
  }
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Dashboard link per provider
const PROVIDER_DASHBOARD: Record<string, string> = {
  openai: 'https://platform.openai.com/usage',
  anthropic: 'https://console.anthropic.com/settings/limits',
  google: 'https://console.cloud.google.com/apis/dashboard',
};

export default function AIProvidersPage() {
  const { tenants, selectedTenant, setSelectedTenant, currentUser, isMaster, ready } = useTenantFilter();
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [diagnosing, setDiagnosing] = useState<string | null>(null); // id provider in diagnostica
  const [diagResult, setDiagResult] = useState<{ id: string; data: unknown } | null>(null);
  // Quota per provider id
  const [quotaMap, setQuotaMap] = useState<Record<string, QuotaState>>({});
  const [form, setForm] = useState({
    provider: 'openai', apiKey: '', model: 'gpt-4.1',
    maxTokensPerDay: 100000, maxConcurrentJobs: 3, isDefault: false,
    imageModel: '', imageEnabled: false,
    videoModel: '', videoEnabled: false,
    fallbackEnabled: false,
    usedFor: [] as string[],
  });


  const fetchProviders = useCallback(async (tenantId?: string) => {
    setLoading(true);
    try {
      const params = tenantId ? `?tenantId=${tenantId}` : '';
      const res = await fetch(`/api/ai/providers${params}`);
      const json = await res.json();
      if (json.success) setProviders(json.data);
    } finally { setLoading(false); }
  }, []);

  const fetchQuota = useCallback(async (id: string) => {
    setQuotaMap(prev => ({ ...prev, [id]: { data: null, loading: true, error: null } }));
    try {
      const res = await fetch(`/api/ai/providers/${id}/quota`);
      const json = await res.json();
      if (json.success) {
        setQuotaMap(prev => ({ ...prev, [id]: { data: json.data, loading: false, error: null } }));
      } else {
        setQuotaMap(prev => ({ ...prev, [id]: { data: null, loading: false, error: json.error ?? 'Errore' } }));
      }
    } catch {
      setQuotaMap(prev => ({ ...prev, [id]: { data: null, loading: false, error: 'Errore di rete' } }));
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    fetchProviders(selectedTenant || currentUser?.tenantId || undefined);
  }, [selectedTenant, ready, currentUser, fetchProviders]);

  // Auto-fetch quota per ogni provider dopo il caricamento
  useEffect(() => {
    providers.forEach(p => {
      // Salta se già abbiamo dati freschi (< 5 min)
      const existing = quotaMap[p.id];
      if (existing?.data) {
        const age = Date.now() - new Date(existing.data.fetchedAt).getTime();
        if (age < 5 * 60 * 1000) return;
      }
      if (!existing?.loading) fetchQuota(p.id);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers]);

  const handleSubmit = async () => {
    if (!editingId && !form.apiKey) { toast.error('API Key obbligatoria'); return; }
    if (!form.model) { toast.error('Modello obbligatorio'); return; }
    setSaving(true);
    try {
      const tenantId = selectedTenant || currentUser?.tenantId;
      if (!tenantId && !editingId) { toast.error('Seleziona un cliente prima'); setSaving(false); return; }

      if (editingId) {
        // ──── MODIFICA ────
        const payload: Record<string, unknown> = {
          model: form.model,
          maxTokensPerDay: form.maxTokensPerDay,
          maxConcurrentJobs: form.maxConcurrentJobs,
          isDefault: form.isDefault,
          imageModel: form.imageModel || null,
          imageEnabled: form.imageEnabled,
          videoModel: form.videoModel || null,
          videoEnabled: form.videoEnabled,
          fallbackEnabled: form.fallbackEnabled,
          usedFor: form.usedFor,
        };
        // Aggiorna la API key solo se l'utente ha inserito una nuova (non mascherata)
        if (form.apiKey && !form.apiKey.includes('••')) {
          payload.apiKey = form.apiKey;
        }
        const res = await fetch(`/api/ai/providers/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (json.success) {
          toast.success('✅ Provider aggiornato!');
          closeForm();
          fetchProviders(tenantId ?? undefined);
        } else toast.error(json.error ?? 'Errore');
      } else {
        // ──── CREA ────
        const res = await fetch('/api/ai/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, tenantId }),
        });
        const json = await res.json();
        if (json.success) {
          toast.success(`✅ ${PROVIDER_INFO[form.provider as keyof typeof PROVIDER_INFO]?.name ?? form.provider} configurato!`);
          closeForm();
          fetchProviders(tenantId ?? undefined);
        } else toast.error(json.error ?? 'Errore');
      }
    } finally { setSaving(false); }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ provider: 'openai', apiKey: '', model: 'gpt-4.1', maxTokensPerDay: 100000, maxConcurrentJobs: 3, isDefault: false, imageModel: '', imageEnabled: false, videoModel: '', videoEnabled: false, fallbackEnabled: false, usedFor: [] });
  };

  const handleEdit = (p: AIProvider) => {
    const usedFor: string[] = (() => { try { return JSON.parse(p.usedFor || '[]'); } catch { return []; } })();
    setForm({
      provider: p.provider,
      apiKey: '', // lasciamo vuoto — l'utente inserirà una nuova chiave solo se vuole cambiarla
      model: p.model,
      maxTokensPerDay: p.maxTokensPerDay,
      maxConcurrentJobs: p.maxConcurrentJobs ?? 3,
      isDefault: p.isDefault,
      imageModel: p.imageModel ?? '',
      imageEnabled: p.imageEnabled ?? false,
      videoModel: p.videoModel ?? '',
      videoEnabled: p.videoEnabled,
      fallbackEnabled: p.fallbackEnabled ?? false,
      usedFor,
    });
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Rimuovi il provider ${name}?`)) return;
    const res = await fetch(`/api/ai/providers/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) { toast.success('Provider rimosso'); fetchProviders(selectedTenant || currentUser?.tenantId || ''); }
  };

  const runDiagnostics = async (id: string) => {
    setDiagnosing(id);
    setDiagResult(null);
    try {
      const res = await fetch(`/api/ai/providers/${id}/models`);
      const json = await res.json();
      setDiagResult({ id, data: json });
    } catch { toast.error('Errore diagnostica'); }
    finally { setDiagnosing(null); }
  };

  /** Applica un modello scoperto direttamente al provider — imageModel per immagini, videoModel per Veo */
  const applyDiscoveredModel = async (providerId: string, modelName: string) => {
    const isVideo = isVideoModel(modelName);
    const patchData = isVideo
      ? { videoModel: modelName, videoEnabled: true }
      : { imageModel: modelName, imageEnabled: true };
    try {
      const res = await fetch(`/api/ai/providers/${providerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchData),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${isVideo ? '🎬 Modello Video' : '🖼️ Modello Immagini'} impostato: ${modelName}`);
        fetchProviders(selectedTenant || currentUser?.tenantId || '');
        setDiagResult(null);
      } else {
        toast.error(json.error ?? 'Errore durante il salvataggio');
      }
    } catch { toast.error('Errore di rete'); }
  };

  const handleResetTokens = async (id: string) => {    if (!confirm('Azzera il contatore token di oggi per questo provider?')) return;
    const res = await fetch(`/api/ai/providers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetTokens: true }),
    });
    const json = await res.json();
    if (json.success) { toast.success('Contatore token azzerato'); fetchProviders(selectedTenant || currentUser?.tenantId || ''); }
    else toast.error(json.error ?? 'Errore');
  };

  const toggleActive = async (p: AIProvider) => {
    const res = await fetch(`/api/ai/providers/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    const json = await res.json();
    if (json.success) fetchProviders(selectedTenant || currentUser?.tenantId || '');
  };

  const setDefault = async (p: AIProvider) => {
    const res = await fetch(`/api/ai/providers/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    });
    const json = await res.json();
    if (json.success) { toast.success('Provider impostato come default'); fetchProviders(selectedTenant || currentUser?.tenantId || ''); }
  };

  const providerInfo = PROVIDER_INFO[form.provider as keyof typeof PROVIDER_INFO];

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Provider AI</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Configura OpenAI, Claude e Gemini con le tue API key</p>
        </div>
        <button onClick={() => { setEditingId(null); setShowForm(true); }} className="btn-primary">
          <Plus size={16} /> Aggiungi Provider
        </button>
      </div>

      {/* Tenant selector — master vede tutti, altri vedono solo i propri */}
      {tenants.length > 0 && (
        <div className="card p-4">
          <label className="label">Cliente (Tenant)</label>
          <select className="select" value={selectedTenant} onChange={(e) => setSelectedTenant(e.target.value)}>
            {isMaster && <option value="">Tutti i clienti</option>}
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      {/* Provider cards */}
      <div className="grid grid-cols-3 gap-3">
        {(Object.entries(PROVIDER_INFO) as [string, typeof PROVIDER_INFO.openai][]).map(([key, info]) => {
          const active = providers.find(p => p.provider === key);
          return (
            <div key={key} className={`card p-4 ${active ? 'border-gray-300 dark:border-gray-700' : 'opacity-50'}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${info.color}`}>
                <Brain size={16} />
              </div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">{info.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">{info.desc}</div>
              {active ? (
                <div className={`badge mt-2 text-xs ${active.isActive ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>
                  {active.isDefault ? '⭐ Default · ' : ''}{active.isActive ? 'Attivo' : 'Disabilitato'}
                </div>
              ) : (
                <div className="badge mt-2 text-xs bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500">Non configurato</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Form aggiunta */}
      {showForm && (
        <div className="card p-5 border-brand-500/30 bg-brand-500/5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
            {editingId ? '✏️ Modifica Provider AI' : 'Configura Provider AI'}
          </h3>
          <div className="space-y-3">
            <div>
              <label className="label">Provider</label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(PROVIDER_INFO) as [string, typeof PROVIDER_INFO.openai][]).map(([key, info]) => (
                  <button
                    key={key}
                    disabled={!!editingId}
                    onClick={() => !editingId && setForm({ ...form, provider: key, model: info.models[0], imageModel: (info.imageModels as readonly string[])[0] || '', videoModel: (info.videoModels as readonly string[])[0] || '' })}
                    className={`p-3 rounded-xl border text-sm font-medium transition-all ${form.provider === key ? 'border-brand-500 bg-brand-500/10 text-brand-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600'} ${editingId ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {info.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300 flex items-start gap-2">
              <Info size={13} className="flex-shrink-0 mt-0.5" />
              <span>
                Ottieni la tua API key su{' '}
                <a href={providerInfo?.docsUrl} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">
                  {providerInfo?.docsUrl?.replace('https://', '')} <ExternalLink size={10} />
                </a>
              </span>
            </div>
            <div>
              <label className="label">
                API Key {editingId ? <span className="text-gray-500 font-normal">(lascia vuoto per non modificarla)</span> : '*'}
              </label>
              <input type="password" className="input" placeholder={editingId ? '• • • • • •  lascia vuoto per mantenere la chiave attuale' : 'sk-... / sk-ant-... / AI...'}
                value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
            </div>
            <div>
              <label className="label">Modello</label>
              <select className="select" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
                {providerInfo?.models.map(m => {
                  const cost = MODEL_COST[m];
                  const filled = cost ? Math.max(1, Math.round((cost / MAX_COST) * 5)) : 0;
                  const costStr = cost ? ` · ${'◆'.repeat(filled)}${'◇'.repeat(5 - filled)} ${cost}×` : '';
                  return <option key={m} value={m}>{MODEL_LABELS[m] ?? m}{costStr}</option>;
                })}
              </select>
              {/* Badge consumo modello selezionato */}
              {MODEL_COST[form.model] !== undefined && (() => {
                const cost = MODEL_COST[form.model];
                const labels: Record<number, string> = {
                  1: 'Ultra economico  < $0.50', 2: 'Economico  ~$0.50', 3: 'Leggero  ~$1',
                  4: 'Bilanciato  ~$2', 5: 'Medio  ~$3', 6: 'Capace  ~$5',
                  7: 'Avanzato  ~$7', 8: 'Potente  ~$8', 9: 'Alto  ~$10',
                  10: 'Premium  ~$15', 11: 'Elevato  ~$20', 12: 'Intensivo  ~$30',
                  13: 'Pro  ~$50', 14: 'Flagship  ~$75', 15: 'Massima potenza  > $75',
                };
                const filledBlocks = Math.max(1, Math.round((cost / MAX_COST) * 6));
                return (
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-xs font-semibold ${costBadgeClass(cost)}`}>
                      {cost}× consumo
                    </span>
                    <span className="text-xs text-gray-500">{labels[cost] ?? ''}</span>
                    <div className="flex gap-0.5 ml-1">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className={`w-3 h-3 rounded-sm ${i < filledBlocks ? costBadgeClass(cost).split(' ')[0] : 'bg-gray-200 dark:bg-gray-800'}`} />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div>
              <label className="label">Token massimi al giorno</label>
              <input type="number" className="input" value={form.maxTokensPerDay}
                onChange={(e) => setForm({ ...form, maxTokensPerDay: Number(e.target.value) })} />
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Limite per il controllo del budget. Al raggiungimento, i job vengono accodati.</p>
            </div>
            <div>
              <label className="label">Job simultanei massimi (Coda Generazione)</label>
              <input
                type="number" min={1} max={20} className="input"
                value={form.maxConcurrentJobs}
                onChange={(e) => setForm({ ...form, maxConcurrentJobs: Math.max(1, Number(e.target.value)) })}
              />
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Numero massimo di job in elaborazione simultaneamente per questo provider. Limita le richieste concorrenti alle API AI (utile per piani con RPM bassi). Default: 3.
              </p>
            </div>
            {providerInfo?.imageModels && (providerInfo.imageModels as readonly string[]).length > 0 && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 overflow-hidden">
                <div className="flex items-center justify-between p-3">
                  <div>
                    <div className="text-sm font-medium text-emerald-300">🖼️ Modello Immagini AI separato</div>
                    <div className="text-xs text-gray-500 mt-0.5">Attiva per un modello <em>dedicato</em> alla generazione di immagini statiche (Post foto, Story foto, Carousel).</div>
                  </div>
                  <button onClick={() => setForm({ ...form, imageEnabled: !form.imageEnabled })}
                    className={`w-10 h-5 rounded-full transition-all flex-shrink-0 ${form.imageEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full m-0.5 transition-all ${form.imageEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                <div className="mx-3 mb-3 p-2.5 rounded-lg bg-gray-100 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/50 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  <span className="text-gray-700 dark:text-gray-300 font-medium">ℹ️ Come funziona:</span>
                  <ul className="mt-1 space-y-0.5 list-none">
                    <li>• <span className="text-emerald-600 dark:text-emerald-300">Modello Immagini AI</span> → usato <strong className="text-gray-900 dark:text-white">solo</strong> per immagini statiche (Post foto, Story foto, Carousel)</li>
                    <li>• <span className="text-blue-600 dark:text-blue-300">Modello principale</span> (sopra) → testi, caption, hashtag, idee, scheduler</li>
                    <li>• <span className="text-purple-600 dark:text-purple-300">Modello Video AI</span> (sotto) → clip video (Reel, Post video, Story video)</li>
                    <li>• <span className="text-green-600 dark:text-green-300">⭐ Consigliato</span>: <code className="text-gray-900 dark:text-white">gemini-3.1-flash-image-preview</code> o <code className="text-gray-900 dark:text-white">imagen-4.0-generate-001</code></li>
                  </ul>
                </div>
                {form.imageEnabled && (
                  <div className="px-3 pb-3 space-y-2 border-t border-emerald-500/20 pt-3">
                    <label className="label">Modello Immagini AI</label>
                    <select className="select" value={form.imageModel} onChange={(e) => setForm({ ...form, imageModel: e.target.value })}>
                      <option value="">-- Seleziona modello immagini --</option>
                      {(providerInfo.imageModels as readonly string[]).map((m: string) => {
                        const cost = MODEL_COST[m];
                        const filled = cost ? Math.max(1, Math.round((cost / MAX_COST) * 5)) : 0;
                        const costStr = cost ? ` · ${'◆'.repeat(filled)}${'◇'.repeat(5 - filled)} ${cost}×` : '';
                        return <option key={m} value={m}>{MODEL_LABELS[m] ?? m}{costStr}</option>;
                      })}
                    </select>
                    {form.imageModel && MODEL_COST[form.imageModel] !== undefined && (() => {
                      const cost = MODEL_COST[form.imageModel];
                      const labels: Record<number, string> = { 1:'Ultra economico  < $0.50',2:'Economico  ~$0.50',3:'Leggero  ~$1',4:'Bilanciato  ~$2',5:'Medio  ~$3',6:'Capace  ~$5',7:'Avanzato  ~$7',8:'Potente  ~$8',9:'Alto  ~$10',10:'Premium  ~$15',11:'Elevato  ~$20',12:'Intensivo  ~$30',13:'Pro  ~$50',14:'Flagship  ~$75',15:'Massima potenza  > $75' };
                      const filledBlocks = Math.max(1, Math.round((cost / MAX_COST) * 6));
                      return (
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-xs font-semibold ${costBadgeClass(cost)}`}>{cost}× consumo</span>
                          <span className="text-xs text-gray-500">{labels[cost] ?? ''}</span>
                          <div className="flex gap-0.5 ml-1">{Array.from({ length: 6 }).map((_, i) => (<div key={i} className={`w-3 h-3 rounded-sm ${i < filledBlocks ? costBadgeClass(cost).split(' ')[0] : 'bg-gray-200 dark:bg-gray-800'}`} />))}</div>
                        </div>
                      );
                    })()}
                    {form.imageModel?.startsWith('imagen-') && (
                      <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                        ℹ️ I modelli <strong>Imagen 4</strong> richiedono il <strong>Piano AI Pro Google</strong>. Assicurati che la tua API key sia abilitata su <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer" className="underline text-blue-200">Google AI Studio</a>.
                      </div>
                    )}
                    {form.imageModel?.includes('image-generation') && (
                      <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-300">
                        ✅ Questo modello genera <strong>immagini statiche</strong> ed è compatibile con API di Google AI Studio (Gemini 2.x).
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {providerInfo?.videoModels && (providerInfo.videoModels as readonly string[]).length > 0 && (
              <div className="rounded-xl bg-purple-500/10 border border-purple-500/20 overflow-hidden">
                <div className="flex items-center justify-between p-3">
                  <div>
                    <div className="text-sm font-medium text-purple-300">🎬 Modello Video AI separato</div>
                    <div className="text-xs text-gray-500 mt-0.5">Attiva per un modello <em>dedicato</em> alla generazione di clip video AI (Reel, Post video, Story video).</div>
                  </div>
                  <button onClick={() => setForm({ ...form, videoEnabled: !form.videoEnabled })}
                    className={`w-10 h-5 rounded-full transition-all flex-shrink-0 ${form.videoEnabled ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full m-0.5 transition-all ${form.videoEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                <div className="mx-3 mb-3 p-2.5 rounded-lg bg-gray-100 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/50 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  <span className="text-gray-700 dark:text-gray-300 font-medium">ℹ️ Come funziona:</span>
                  <ul className="mt-1 space-y-0.5 list-none">
                    <li>• <span className="text-purple-600 dark:text-purple-300">Modello Video AI</span> → usato <strong className="text-gray-900 dark:text-white">solo</strong> per generare clip video (Reel, Post video, Story video)</li>
                    <li>• Non genera immagini statiche — usa il <span className="text-emerald-600 dark:text-emerald-300">Modello Immagini AI</span> per quelle</li>
                    <li>• Se disattivato, i job VIDEO vengono messi in attesa (nessun fallback automatico)</li>
                    <li>• <span className="text-green-600 dark:text-green-300">⭐ Consigliato per Piano AI Pro Google</span>: <code className="text-gray-900 dark:text-white">veo-3.0-generate-preview</code></li>
                  </ul>
                </div>
                {form.videoEnabled && (
                  <div className="px-3 pb-3 space-y-2 border-t border-purple-500/20 pt-3">
                    <label className="label">Modello Video</label>
                    <select className="select" value={form.videoModel} onChange={(e) => setForm({ ...form, videoModel: e.target.value })}>
                      <option value="">-- Seleziona modello video --</option>
                      {(providerInfo.videoModels as readonly string[]).map((m: string) => {
                        const cost = MODEL_COST[m];
                        const filled = cost ? Math.max(1, Math.round((cost / MAX_COST) * 5)) : 0;
                        const costStr = cost ? ` · ${'◆'.repeat(filled)}${'◇'.repeat(5 - filled)} ${cost}×` : '';
                        return <option key={m} value={m}>{MODEL_LABELS[m] ?? m}{costStr}</option>;
                      })}
                    </select>
                    {form.videoModel && MODEL_COST[form.videoModel] !== undefined && (() => {
                      const cost = MODEL_COST[form.videoModel];
                      const labels: Record<number, string> = { 7:'Avanzato  ~$7',8:'Potente  ~$8',9:'Alto  ~$10',10:'Premium  ~$15',11:'Elevato  ~$20',12:'Intensivo  ~$30',13:'Pro  ~$50',14:'Flagship  ~$75',15:'Massima potenza  > $75' };
                      const filledBlocks = Math.max(1, Math.round((cost / MAX_COST) * 6));
                      return (
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-xs font-semibold ${costBadgeClass(cost)}`}>{cost}× consumo</span>
                          <span className="text-xs text-gray-500">{labels[cost] ?? ''}</span>
                          <div className="flex gap-0.5 ml-1">{Array.from({ length: 6 }).map((_, i) => (<div key={i} className={`w-3 h-3 rounded-sm ${i < filledBlocks ? costBadgeClass(cost).split(' ')[0] : 'bg-gray-200 dark:bg-gray-800'}`} />))}</div>
                        </div>
                      );
                    })()}
                    <div className="mt-3 rounded-lg border border-gray-300 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-900/40 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-medium text-gray-700 dark:text-gray-300">🔄 Fallback automatico modelli</div>
                          <div className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">Se attivo: in caso di errore prova altri modelli disponibili automaticamente.</div>
                        </div>
                        <button type="button" onClick={() => setForm({ ...form, fallbackEnabled: !form.fallbackEnabled })}
                          className={`w-10 h-5 rounded-full transition-all flex-shrink-0 ${form.fallbackEnabled ? 'bg-yellow-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                          <div className={`w-4 h-4 bg-white rounded-full m-0.5 transition-all ${form.fallbackEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                      {form.fallbackEnabled ? (
                        <div className="mt-2 text-xs text-yellow-400/80">⚠️ <strong>Attenzione:</strong> il fallback prova più modelli e può consumare quota extra. Usare solo se il modello principale è instabile.</div>
                      ) : (
                        <div className="mt-1 text-xs text-gray-400 dark:text-gray-600">✅ Modalità consigliata: usa <strong>solo</strong> il modello selezionato. Se la quota è esaurita, il job va in "Attesa token" e riprova automaticamente.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-3">
              <input type="checkbox" id="isDefault" className="w-4 h-4 rounded" checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
              <label htmlFor="isDefault" className="text-sm text-gray-700 dark:text-gray-300">Imposta come provider predefinito</label>
            </div>

            {/* Assegnazione funzionalità */}
            <div>
              <label className="label">Funzionalità assegnate <span className="text-gray-500 font-normal">(opzionale)</span></label>
              <p className="text-xs text-gray-500 mb-2">
                Se non selezioni nulla, il provider verrà usato come <strong className="text-gray-600 dark:text-gray-400">generico</strong> (fallback per tutte le funzionalità).
              </p>
              <div className="grid grid-cols-2 gap-2">
                {FUNCTIONALITIES.map((f) => {
                  const selected = form.usedFor.includes(f.key);
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          usedFor: selected
                            ? form.usedFor.filter((k) => k !== f.key)
                            : [...form.usedFor, f.key],
                        })
                      }
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        selected
                          ? 'border-brand-500 bg-brand-500/10 text-brand-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-400 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-400'
                      }`}
                    >
                      <div className="text-xs font-medium">{f.label}</div>
                      <div className="text-xs opacity-60 mt-0.5">{f.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSubmit} disabled={saving} className="btn-primary">
              <Check size={15} /> {saving ? (editingId ? 'Salvataggio...' : 'Verifica e salva...') : (editingId ? 'Salva modifiche' : 'Verifica e Salva')}
            </button>
            <button onClick={closeForm} className="btn-secondary"><X size={15} /> Annulla</button>
          </div>
        </div>
      )}

      {/* Lista provider configurati */}
      {!loading && providers.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">Provider configurati</h3>
          {providers.map((p) => {
            const info = PROVIDER_INFO[p.provider as keyof typeof PROVIDER_INFO];
            const tenantName = tenants.find(t => t.id === p.tenantId)?.name;
            return (
        <div key={p.id} className="card p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${info?.color ?? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                    <Brain size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900 dark:text-white">{info?.name ?? p.provider}</span>
                      <span className="badge bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs">{p.model}</span>
                      {MODEL_COST[p.model] !== undefined && (() => {
                        const c = MODEL_COST[p.model];
                        const filledB = Math.max(1, Math.round((c / MAX_COST) * 6));
                        return (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-xs font-semibold ${costBadgeClass(c)}`}>
                            {c}×
                            <span className="flex gap-px">
                              {Array.from({ length: 6 }).map((_, i) => (
                                <span key={i} className={`inline-block w-1.5 h-1.5 rounded-sm ${i < filledB ? 'opacity-100' : 'opacity-20'}`}
                                  style={{ background: 'currentColor' }} />
                              ))}
                            </span>
                          </span>
                        );
                      })()}
                      {p.isDefault && <span className="badge bg-yellow-500/10 text-yellow-400 text-xs"><Star size={10} /> Default</span>}
                      {p.imageEnabled && <span className="badge bg-emerald-500/10 text-emerald-400 text-xs">🖼️ Immagini</span>}
                      {p.videoEnabled && <span className="badge bg-purple-500/10 text-purple-400 text-xs">🎬 Video</span>}
                      <span className="badge bg-blue-500/10 text-blue-400 text-xs" title="Job simultanei massimi">⚡ {p.maxConcurrentJobs ?? 3} job</span>
                    </div>
                    {/* Cliente collegato */}
                    {tenantName && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        🏢 <span className="text-gray-400">{tenantName}</span>
                      </div>
                    )}
                    {/* Funzionalità assegnate */}
                    {(() => {
                      const usedFor: string[] = (() => { try { return JSON.parse(p.usedFor || '[]'); } catch { return []; } })();
                      return usedFor.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {usedFor.map((key) => {
                            const f = FUNCTIONALITIES.find((x) => x.key === key);
                            return f ? (
                              <span key={key} className="badge bg-brand-500/10 text-brand-400 text-xs">{f.label}</span>
                            ) : null;
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-600 mt-1">Generico (tutte le funzionalità)</div>
                      );
                    })()}
                    <div className="mt-1.5 space-y-2">
                      {/* ── Barra 1: Budget interno giornaliero ── */}
                      <div>
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 inline-block" />
                            Budget app oggi: <span className="text-gray-700 dark:text-gray-300 font-medium ml-0.5">{p.tokensUsedToday.toLocaleString('it-IT')}</span>
                            <span className="text-gray-600">/</span>
                            <span>{p.maxTokensPerDay.toLocaleString('it-IT')}</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">
                              Reset: <span className="text-gray-400">{formatResetDate(getNextInternalReset(p.tokenResetAt).toISOString())}</span>
                            </span>
                            <span>{(p.maxTokensPerDay > 0 ? (p.tokensUsedToday / p.maxTokensPerDay) * 100 : 0).toFixed(1)}%</span>
                            <button
                              onClick={() => handleResetTokens(p.id)}
                              title="Azzera contatore token di oggi"
                              className="text-gray-600 hover:text-gray-400 transition-colors"
                            >
                              <RotateCcw size={11} />
                            </button>
                          </div>
                        </div>
                        <div className="h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                          {(() => {
                            const usage = p.maxTokensPerDay > 0 ? (p.tokensUsedToday / p.maxTokensPerDay) * 100 : 0;
                            return (
                              <div className={`h-full rounded-full transition-all ${usage > 80 ? 'bg-red-500' : usage > 60 ? 'bg-yellow-500' : 'bg-brand-500'}`}
                                style={{ width: `${Math.min(usage, 100)}%` }} />
                            );
                          })()}
                        </div>
                      </div>

                      {/* ── Barra 2: Quota Provider (TPM dal provider) ── */}
                      {(() => {
                        const qs = quotaMap[p.id];
                        const dashUrl = PROVIDER_DASHBOARD[p.provider];
                        if (qs?.loading) {
                          return (
                            <div className="flex items-center gap-2 text-xs text-gray-600">
                              <RefreshCw size={11} className="animate-spin" />
                              Lettura quota provider…
                            </div>
                          );
                        }
                        if (qs?.error) {
                          return (
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1 text-red-400/70">
                                <AlertCircle size={11} />
                                Quota non disponibile
                              </div>
                              <div className="flex items-center gap-2">
                                {dashUrl && (
                                  <a href={dashUrl} target="_blank" rel="noopener noreferrer"
                                    className="text-gray-600 hover:text-gray-400 underline">
                                    Dashboard
                                  </a>
                                )}
                                <button onClick={() => fetchQuota(p.id)} className="text-gray-600 hover:text-gray-400">
                                  <RefreshCw size={11} />
                                </button>
                              </div>
                            </div>
                          );
                        }
                        if (qs?.data?.source === 'none' || !qs?.data) {
                          return (
                            <div className="flex items-center justify-between text-xs text-gray-600">
                              <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700 inline-block" />
                                Quota provider: <span className="italic text-gray-400 dark:text-gray-700">non esposta dalle API</span>
                              </span>
                              <div className="flex items-center gap-2">
                                {dashUrl && (
                                  <a href={dashUrl} target="_blank" rel="noopener noreferrer"
                                    className="text-gray-400 dark:text-gray-700 hover:text-gray-700 dark:hover:text-gray-500 underline underline-offset-2 flex items-center gap-0.5">
                                    Verifica
                                  </a>
                                )}
                                <button onClick={() => fetchQuota(p.id)} title="Ricarica" className="text-gray-600 hover:text-gray-400">
                                  <RefreshCw size={11} />
                                </button>
                              </div>
                            </div>
                          );
                        }
                        const q = qs.data;
                        // Decidi quale dato mostrare: preferisci TPM se disponibile, altrimenti RPM
                        const limit = q.tpmLimit ?? q.rpmLimit;
                        const used = q.tpmUsed ?? (q.rpmLimit && q.rpmRemaining != null ? q.rpmLimit - q.rpmRemaining : null);
                        const remaining = q.tpmRemaining ?? q.rpmRemaining;
                        const resetAt = q.tpmResetAt ?? q.rpmResetAt;
                        const isTokenBased = q.tpmLimit != null;
                        const pct = limit && used != null ? Math.min((used / limit) * 100, 100) : 0;

                        return (
                          <div>
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                              <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block" />
                                Quota {isTokenBased ? 'token/min' : 'req/min'}:{' '}
                                <span className="text-gray-300 font-medium ml-0.5">
                                  {(used ?? 0).toLocaleString('it-IT')}
                                </span>
                                <span className="text-gray-600">/</span>
                                <span>{(limit ?? 0).toLocaleString('it-IT')}</span>
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500">
                                  Reset: <span className="text-gray-400">{formatResetDate(resetAt)}</span>
                                </span>
                                <span>{pct.toFixed(1)}%</span>
                                <button onClick={() => fetchQuota(p.id)} title="Aggiorna quota" className="text-gray-600 hover:text-gray-400 transition-colors">
                                  <RefreshCw size={11} />
                                </button>
                              </div>
                            </div>
                            <div className="h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-yellow-500' : 'bg-purple-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            {/* Dettaglio extra: RPM se abbiamo entrambi */}
                            {isTokenBased && q.rpmLimit != null && (
                              <div className="flex items-center justify-between text-xs text-gray-600 mt-1">
                                <span>Req/min: {((q.rpmLimit - (q.rpmRemaining ?? 0))).toLocaleString('it-IT')} / {q.rpmLimit.toLocaleString('it-IT')}</span>
                                {dashUrl && (
                                  <a href={dashUrl} target="_blank" rel="noopener noreferrer"
                                    className="text-gray-700 dark:text-gray-300 hover:text-gray-500 underline underline-offset-2 flex items-center gap-0.5">
                                    Dashboard <ExternalLink size={9} />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!p.isDefault && (
                      <button onClick={() => setDefault(p)} className="btn-ghost text-xs px-2 py-1" title="Imposta come default">
                        <Star size={13} className="text-yellow-400" />
                      </button>
                    )}
                    {p.provider === 'google' && (
                      <button
                        onClick={() => runDiagnostics(p.id)}
                        disabled={diagnosing === p.id}
                        className="btn-ghost p-2 text-teal-400 hover:text-teal-300"
                        title="Diagnostica modelli disponibili"
                      >
                        {diagnosing === p.id
                          ? <RefreshCw size={14} className="animate-spin" />
                          : <Stethoscope size={14} />}
                      </button>
                    )}
                    <button onClick={() => handleEdit(p)} className="btn-ghost p-2 text-blue-400 hover:text-blue-300" title="Modifica provider">
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => toggleActive(p)}
                      className={`relative w-9 h-5 rounded-full transition-all ${p.isActive ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${p.isActive ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                    <button onClick={() => handleDelete(p.id, info?.name ?? p.provider)} className="btn-ghost p-2 text-red-400 hover:text-red-300">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* Modal risultati diagnostica */}
      {diagResult && (() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = diagResult.data as any;
        const results = d?.results ?? [];
        // Raccogli tutti i modelli image/video trovati (unione v1beta + v1)
        const allImageModels: string[] = [];
        for (const r of results) {
          for (const m of (r.imageModels ?? [])) {
            if (!allImageModels.includes(m)) allImageModels.push(m);
          }
        }
        // Categorie
        const geminiImageModels = allImageModels.filter(m => m.includes('image-generation') || m.includes('image-preview') || m.includes('image'));
        const imagenModels = allImageModels.filter(m => m.startsWith('imagen-'));
        const videoModels = allImageModels.filter(m => m.startsWith('veo-') || m.includes('video'));
        const otherModels = allImageModels.filter(m => !geminiImageModels.includes(m) && !imagenModels.includes(m) && !videoModels.includes(m));

        // Provider corrente per mostrare il modello attivo
        const currentProvider = providers.find(p => p.id === diagResult.id);

        const ModelBadge = ({ model }: { model: string }) => {
          const isVid = isVideoModel(model);
          const isCurrent = isVid
            ? currentProvider?.videoModel === model
            : currentProvider?.imageModel === model;
          const label = MODEL_LABELS[model];
          return (
            <button
              key={model}
              onClick={() => applyDiscoveredModel(diagResult.id, model)}
              className={`group text-left flex items-start gap-2 rounded-lg px-3 py-2 border transition-all text-xs ${
                isCurrent
                  ? 'bg-brand-500/20 border-brand-500/40 text-brand-300'
                  : 'bg-gray-100 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 hover:bg-teal-500/10 hover:border-teal-500/30 text-gray-700 dark:text-gray-300 hover:text-teal-700 dark:hover:text-teal-200'
              }`}
              title={`Clicca per impostare: ${model}`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[10px] text-gray-900 dark:text-white/80 break-all">{model}</div>
                {label && <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 group-hover:text-teal-600 dark:group-hover:text-teal-400/70">{label}</div>}
              </div>
              {isCurrent
                ? <Check size={12} className="flex-shrink-0 text-brand-400 mt-0.5" />
                : <span className="flex-shrink-0 text-[9px] text-gray-400 dark:text-gray-600 group-hover:text-teal-600 dark:group-hover:text-teal-400 mt-0.5 whitespace-nowrap">Applica →</span>
              }
            </button>
          );
        };

        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setDiagResult(null)}>
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Stethoscope size={16} className="text-teal-400" />
                  Modelli disponibili con questa API key
                </h3>
                <button onClick={() => setDiagResult(null)} className="text-gray-500 hover:text-white"><X size={16} /></button>
              </div>

              {allImageModels.length === 0 ? (
                <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-sm">
                  ⚠️ Nessun modello per generazione immagini/video trovato con questa API key.
                  Verifica che l'API key sia corretta e che il progetto abbia la Generative Language API abilitata.
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-gray-400 dark:text-gray-600">
                    Clicca su un modello per impostarlo come <strong className="text-emerald-300">Modello Immagini</strong> (Gemini/Imagen) o <strong className="text-purple-300">Modello Video</strong> (Veo) del provider.
                    {currentProvider?.imageModel && (
                      <span className="ml-1 text-emerald-400">🖼️ Immagini attuale: <code className="font-mono">{currentProvider.imageModel}</code></span>
                    )}
                    {currentProvider?.videoModel && (
                      <span className="ml-1 text-purple-400"> · 🎬 Video attuale: <code className="font-mono">{currentProvider.videoModel}</code></span>
                    )}
                  </p>

                  {geminiImageModels.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold text-teal-400 uppercase tracking-wider mb-2">
                        🎨 Gemini Image ({geminiImageModels.length})
                      </div>
                      <div className="grid grid-cols-1 gap-1.5">
                        {geminiImageModels.map(m => <ModelBadge key={m} model={m} />)}
                      </div>
                    </div>
                  )}

                  {imagenModels.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider mb-2">
                        🖼️ Imagen ({imagenModels.length})
                      </div>
                      <div className="grid grid-cols-1 gap-1.5">
                        {imagenModels.map(m => <ModelBadge key={m} model={m} />)}
                      </div>
                    </div>
                  )}

                  {videoModels.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold text-violet-400 uppercase tracking-wider mb-2">
                        🎬 Video ({videoModels.length})
                      </div>
                      <div className="grid grid-cols-1 gap-1.5">
                        {videoModels.map(m => <ModelBadge key={m} model={m} />)}
                      </div>
                    </div>
                  )}

                  {otherModels.length > 0 && (
                    <details className="text-xs">
                      <summary className="text-gray-500 cursor-pointer hover:text-gray-300">
                        Altri modelli generativi ({otherModels.length})
                      </summary>
                      <div className="grid grid-cols-1 gap-1.5 mt-2">
                        {otherModels.map(m => <ModelBadge key={m} model={m} />)}
                      </div>
                    </details>
                  )}
                </div>
              )}

              {/* Risultati per versione API */}
              <details className="mt-4 text-xs">
                <summary className="text-gray-500 cursor-pointer hover:text-gray-300">Dettaglio per versione API (v1beta / v1)</summary>
                <div className="mt-2 space-y-2">
                  {results.map((r: { version: string; models: string[]; imageModels: string[]; error?: string }, i: number) => (
                    <div key={i} className="p-2 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      <span className="font-semibold text-gray-900 dark:text-white">{r.version}</span>
                      {r.error
                        ? <span className="text-red-400 ml-2">{r.error}</span>
                        : <span className="ml-2">{r.imageModels.length} image/video, {r.models.length} totali</span>
                      }
                    </div>
                  ))}
                </div>
              </details>

              <button onClick={() => setDiagResult(null)} className="btn-secondary w-full mt-4"><X size={14} /> Chiudi</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
