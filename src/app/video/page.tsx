'use client';
// src/app/video/page.tsx — Video AI — anteprima filtrata della Coda Generazione (type=VIDEO)

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import {
  Loader2, XCircle, Clock, CheckCircle2, AlertCircle, RefreshCw,
  Plus, Film, ChevronUp, ChevronDown, Download, Eraser, Maximize2,
  Scissors, Lock, Info, Video, ExternalLink,
} from 'lucide-react';
import { useTenantFilter, type TenantOption } from '@/lib/hooks/useTenantFilter';
import { useSiteFilter, type SiteOption } from '@/lib/hooks/useSiteFilter';
import { TenantSelector } from '@/components/ui/TenantSelector';
import { ScopeBanner } from '@/components/ui/ScopeBanner';
import { BulkScopeModal } from '@/components/ui/BulkScopeModal';
import { WatermarkRemoverModal, type RemovalMethod } from '@/components/ui/WatermarkRemoverModal';
import { WatermarkMediaCard } from '@/components/ui/WatermarkMediaCard';
import { calculateClipDurations } from '@/lib/video-stitching';
import { ProviderSelectorWidget } from '@/components/ui/ProviderSelectorWidget';

// ── Helper client-safe: calcola durate clip senza dipendenze Node.js ──────────
// Replica la logica di calculateClipDurations di video-stitching.ts
// (non possiamo importare quel file su client perché usa sharp/child_process)
function calcClipDurations(totalDuration: number): number[] {
  const VEO_MIN = 5; const VEO_MAX = 8;
  const clamped = Math.max(5, Math.min(60, Math.round(totalDuration)));
  if (clamped <= VEO_MAX) return [clamped];
  const minClips = Math.ceil(clamped / VEO_MAX);
  const maxClips = Math.floor(clamped / VEO_MIN);
  if (maxClips < minClips) return calcClipDurations(minClips * VEO_MIN);
  const baseSize = Math.floor(clamped / minClips);
  const remainder = clamped - baseSize * minClips;
  const clips = Array<number>(minClips).fill(baseSize);
  for (let i = 0; i < remainder; i++) clips[i]++;
  return clips.map(c => Math.max(VEO_MIN, Math.min(VEO_MAX, c)));
}

// ─── Tipi stitching ─────────────────────────────────────────────────────────
interface StitchingClipInfo {
  index: number;
  duration: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  videoUrl?: string;
  operationName?: string;
}

interface StitchingMeta {
  totalDuration: number;
  clips: StitchingClipInfo[];
  currentClipIndex: number;
  finalPrompt?: string;
  aspectRatio?: string;
}

// ─── GenerationJob con type=VIDEO ─────────────────────────────────────────────
interface VideoGenJob {
  id: string;
  tenantId: string;
  type: string;
  status: string;
  payload: string;    // JSON: { prompt, aspectRatio, duration, style, provider, videoModel, siteId }
  result?: string;    // JSON: { url, videoUrl, mimeType, model, tokensConsumed }
  errorMessage?: string | null;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: string | null;
  relatedPostId?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface VideoProvider {
  tenantId: string;
  tenantName: string;
  provider: string;
  model: string;
  videoModel: string | null;
}

// Estra i campi video dal job (payload + result)
function parseVideoJob(job: VideoGenJob) {
  let p: Record<string, unknown> = {};
  let r: Record<string, unknown> = {};
  try { p = JSON.parse(job.payload || '{}'); } catch { /* */ }
  try { r = JSON.parse(job.result || '{}'); } catch { /* */ }

  const stitchingPayload = p._stitching as StitchingMeta | undefined;
  const stitchingResult = r.stitching as { totalDuration?: number; clips?: number; clipUrls?: string[]; stitchingError?: string | null } | undefined;

  return {
    prompt: (p.prompt as string) ?? '',
    aspectRatio: (p.aspectRatio as string) ?? '9:16',
    duration: (p.duration as number) ?? 5,
    style: (p.style as string | null) ?? null,
    provider: (p.provider as string) ?? '',
    videoModel: (p.videoModel as string | null) ?? null,
    siteId: (p.siteId as string | null) ?? null,
    videoUrl: (r.url as string | null) ?? (r.videoUrl as string | null) ?? null,
    thumbnailUrl: (r.thumbnailUrl as string | null) ?? null,
    tokensConsumed: (r.tokensConsumed as number) ?? 0,
    model: (r.model as string | null) ?? null,
    stitchingMeta: stitchingPayload ?? null,
    stitchingResult: stitchingResult ?? null,
    // URLs clip singole disponibili nel result (dopo completamento)
    clipUrls: stitchingResult?.clipUrls ?? stitchingPayload?.clips?.filter(c => c.videoUrl).map(c => c.videoUrl!) ?? [],
    stitchingError: stitchingResult?.stitchingError ?? null,
  };
}

const STATUS_META: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  PENDING:        { color: 'text-blue-400 bg-blue-400/10', icon: Clock, label: 'In attesa' },
  PROCESSING:     { color: 'text-yellow-400 bg-yellow-400/10', icon: Loader2, label: 'In elaborazione (Veo)' },
  COMPLETED:      { color: 'text-green-400 bg-green-400/10', icon: CheckCircle2, label: 'Completato' },
  FAILED:         { color: 'text-red-400 bg-red-400/10', icon: AlertCircle, label: 'Fallito' },
  WAITING_TOKENS: { color: 'text-orange-400 bg-orange-400/10', icon: Clock, label: 'In attesa token' },
  CANCELLED:      { color: 'text-gray-500 bg-gray-700', icon: XCircle, label: 'Annullato' },
};

export default function VideoPage() {
  const [jobs, setJobs] = useState<VideoGenJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [videoProviders, setVideoProviders] = useState<VideoProvider[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [expandedClips, setExpandedClips] = useState<Record<string, boolean>>({});
  const { tenants, selectedTenant, setSelectedTenant, isMaster, showSelector, ready } = useTenantFilter();
  const { selectedSite } = useSiteFilter(selectedTenant);
  // calcNumClips: helper UI per mostrare il numero di clip necessarie
  const calcNumClips = (d: number) => calcClipDurations(d).length;
  const [form, setForm] = useState({
    prompt: '', aspectRatio: '9:16' as '9:16' | '16:9' | '1:1',
    duration: 5, style: '',
  });

  // ─── Storyboard AI ────────────────────────────────────────────
  const [aiTopic, setAiTopic] = useState('');
  const [aiTone, setAiTone] = useState('professional');
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  interface StoryboardScene {
    scene: number; visual?: string; script?: string; onScreenText?: string;
    transition?: string; duration?: string;
  }
  interface Storyboard {
    hook?: string; totalDuration?: string; scenes?: StoryboardScene[];
    music?: string; cta?: string;
  }
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);

   const generateStoryboard = async () => {
     if (!aiTopic.trim()) { toast.error('Inserisci un topic per lo storyboard'); return; }
     const tid = selectedTenant || undefined;
     setGeneratingStoryboard(true);
     try {
       const res = await fetch('/api/ai/generate', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           type: 'reel_script',
           topic: aiTopic,
           tone: aiTone,
           reelDuration: form.duration,
           ...(tid ? { tenantId: tid } : {}),
           // Passa siteId dal filtro globale
           ...(selectedSite ? { siteId: selectedSite } : {}),
         }),
       });
      const json = await res.json();
      if (json.success && json.data?.reelScript) {
        try {
          const raw = typeof json.data.reelScript === 'string'
            ? json.data.reelScript : JSON.stringify(json.data.reelScript);
          const s = raw.indexOf('{'); const e2 = raw.lastIndexOf('}');
          const sb: Storyboard = s !== -1 && e2 > s ? JSON.parse(raw.slice(s, e2 + 1)) : null;
          if (sb) {
            setStoryboard(sb);
            // Auto-popola prompt dal hook + primo visual
            if (!form.prompt.trim()) {
              const autoPrompt = [
                sb.hook,
                sb.scenes?.[0]?.visual,
              ].filter(Boolean).join('. ');
              if (autoPrompt) setForm(f => ({ ...f, prompt: autoPrompt }));
            }
            toast.success(`✅ Storyboard generato: ${sb.scenes?.length ?? 0} scene`);
          }
        } catch { toast.error('Errore parsing storyboard'); }
      } else {
        toast.error(json.error ?? 'Errore generazione storyboard');
      }
    } catch { toast.error('Errore di rete'); }
    finally { setGeneratingStoryboard(false); }
  };

  const [videoProviderId, setVideoProviderId] = useState<string>('');
  // Override modello video per questa singola esecuzione (non modifica impostazioni globali)
  const [videoModelOverride, setVideoModelOverride] = useState<string | null>(null);

  // ─── Watermark remover ──────────────────────────────────────
  const [watermarkJobUrl, setWatermarkJobUrl] = useState<string | null>(null);
  const [watermarkTenantId, setWatermarkTenantId] = useState<string | undefined>();
  const [watermarkMethod, setWatermarkMethod] = useState<RemovalMethod | undefined>();

  const openWatermark = (videoUrl: string, tenantId: string, method: RemovalMethod) => {
    setWatermarkJobUrl(videoUrl);
    setWatermarkTenantId(tenantId);
    setWatermarkMethod(method);
  };

  const fetchJobs = useCallback(async (tenantId?: string) => {
    try {
      const params = tenantId ? `?tenantId=${tenantId}` : '';
      const res = await fetch(`/api/video/jobs${params}`);
      const json = await res.json();
      if (json.success) setJobs(json.data ?? []);
    } finally { setLoading(false); }
  }, []);

  const fetchVideoProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/providers?videoOnly=true');
      const json = await res.json();
      if (json.success) setVideoProviders(json.data ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (ready) {
      setLoading(true);
      fetchJobs(selectedTenant || undefined);
    }
  }, [fetchJobs, ready, selectedTenant]);

  useEffect(() => {
    if (ready && isMaster) fetchVideoProviders();
  }, [ready, isMaster, fetchVideoProviders]);

  // Auto-refresh per job in elaborazione
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'PENDING' || j.status === 'PROCESSING');
    if (!hasActive) return;
    const interval = setInterval(() => fetchJobs(selectedTenant || undefined), 5000);
    return () => clearInterval(interval);
  }, [jobs, selectedTenant, fetchJobs]);

   const createVideoForTenant = async (tenantId?: string): Promise<boolean> => {
     try {
       const res = await fetch('/api/video/generate', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           ...form,
           topic: aiTopic || undefined,
           storyboard: storyboard ?? undefined,
           ...(videoModelOverride ? { videoModel: videoModelOverride } : {}),
           ...(tenantId ? { tenantId } : {}),
           // Passa siteId dal filtro globale
           ...(selectedSite ? { siteId: selectedSite } : {}),
         }),
       });
       const json = await res.json();
       return json.success === true;
     } catch { return false; }
   };

  const handleCreate = async () => {
    if (!form.prompt.trim() && !aiTopic.trim()) { toast.error('Inserisci un prompt o topic per il video'); return; }
    if (!selectedTenant && tenants.length > 1) { setShowBulkModal(true); return; }
    setCreating(true);
    try {
      const ok = await createVideoForTenant(selectedTenant || undefined);
      if (ok) {
        toast.success('🎬 Video aggiunto alla Coda Generazione!');
        setShowForm(false);
        setForm({ prompt: '', aspectRatio: '9:16', duration: 5, style: '' });
        setStoryboard(null);
        setAiTopic('');
        fetchJobs(selectedTenant || undefined);
      } else { toast.error('Errore creazione video'); }
    } finally { setCreating(false); }
  };

  const handleGlobalCreate = async () => {
    setShowBulkModal(false);
    setCreating(true);
    try {
      const ok = await createVideoForTenant(undefined);
      if (ok) {
        toast.success('🎬 Video in coda con config globale!');
        setShowForm(false);
        setForm({ prompt: '', aspectRatio: '9:16', duration: 5, style: '' });
        setStoryboard(null);
        setAiTopic('');
        fetchJobs(undefined);
      } else { toast.error('Errore creazione video'); }
    } finally { setCreating(false); }
  };

  const handleBulkCreate = async () => {
    setShowBulkModal(false);
    const videoTenantIds = videoProviders.length > 0
      ? [...new Set(videoProviders.map(p => p.tenantId))]
      : tenants.map(t => t.id);
    setCreating(true);
    let successCount = 0;
    for (const tid of videoTenantIds) {
      const ok = await createVideoForTenant(tid);
      if (ok) successCount++;
    }
    setCreating(false);
    if (successCount === videoTenantIds.length) {
      toast.success(`🎬 Video in coda per tutti i ${videoTenantIds.length} clienti!`);
    } else {
      toast.error(`Video creati: ${successCount}/${videoTenantIds.length}. Alcuni non riusciti.`);
    }
    setShowForm(false);
    setForm({ prompt: '', aspectRatio: '9:16', duration: 5, style: '' });
    fetchJobs(undefined);
  };

  const handleCancel = async (id: string) => {
    const res = await fetch('/api/generation-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', jobId: id }),
    });
    if ((await res.json()).success) {
      toast.success('Job annullato');
      fetchJobs(selectedTenant || undefined);
    }
  };

  const ASPECT_RATIOS = [
    { value: '9:16', label: '9:16', desc: 'Verticale (Reel/Story)', icon: '📱' },
    { value: '16:9', label: '16:9', desc: 'Orizzontale (Feed)', icon: '🖥️' },
    { value: '1:1', label: '1:1', desc: 'Quadrato', icon: '⬛' },
  ];

  const selectedTenantName = tenants.find(t => t.id === selectedTenant)?.name;
  const tenantVideoProviders = selectedTenant ? videoProviders.filter(p => p.tenantId === selectedTenant) : [];
  const tenantsWithVideoProvider: TenantOption[] = videoProviders.length > 0
    ? tenants.filter(t => videoProviders.some(p => p.tenantId === t.id))
    : tenants;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Video AI</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Generazione video con Google Veo — gestita dalla Coda Generazione
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {ready && showSelector && (
            <TenantSelector tenants={tenants} value={selectedTenant} onChange={setSelectedTenant} isMaster={isMaster} />
          )}
          <button onClick={() => fetchJobs(selectedTenant || undefined)} className="btn-ghost">
            <RefreshCw size={14} /> Aggiorna
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus size={16} /> Genera Video
          </button>
        </div>
      </div>

      {/* Banner scope */}
      {ready && (
        <ScopeBanner
          selectedTenant={selectedTenant}
          tenants={tenants}
          allClientsHint="I video generati verranno accodati per ogni cliente nella Coda Generazione"
          specificClientHint="Il video verrà generato usando la configurazione AI di questo cliente"
        />
      )}

      {/* Info: questa è la vista filtrata della coda */}
      <div className="card p-4 border-purple-500/20 bg-purple-500/5">
        <div className="flex gap-3 items-start">
          <Info size={16} className="text-purple-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-700 dark:text-gray-300 flex-1">
            <strong className="text-gray-900 dark:text-white">Coda Video unificata:</strong> I job video vengono gestiti dalla{' '}
            <Link href="/queue" className="text-purple-400 hover:text-purple-300 underline inline-flex items-center gap-0.5">
              Coda Generazione <ExternalLink size={11} />
            </Link>{' '}
            con tutte le opzioni disponibili (retry, priorità, log). Questa pagina mostra solo un&apos;anteprima filtrata per i video.
          </div>
        </div>
      </div>

      {/* Info provider mancante */}
      {ready && selectedTenant && tenantVideoProviders.length === 0 && videoProviders.length > 0 && (
        <div className="card p-4 border-yellow-500/20 bg-yellow-500/5 flex items-start gap-3">
          <AlertCircle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-700 dark:text-yellow-300">
            <strong className="text-yellow-800 dark:text-yellow-200">Nessun provider video</strong> configurato per <strong>{selectedTenantName}</strong>.
            Vai in <a href="/ai-providers" className="underline hover:text-yellow-200">Provider AI</a> e abilita &quot;Modello Video&quot; per questo cliente.
          </div>
        </div>
      )}

      {/* Quick-select tenant con video provider */}
      {ready && showSelector && !selectedTenant && videoProviders.length > 0 && (
        <div className="card p-4 border-purple-500/20 bg-purple-500/5">
          <div className="flex items-start gap-3">
            <Video size={16} className="text-purple-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-700 dark:text-gray-300 flex-1">
              <strong className="text-gray-900 dark:text-white">Provider video disponibili:</strong>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {videoProviders.slice(0, 6).map((p, i) => (
                  <button key={i} onClick={() => setSelectedTenant(p.tenantId)}
                    className="badge bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 cursor-pointer transition-colors border border-purple-500/20">
                    🎬 {p.tenantName} · {p.provider}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="card p-5 border-purple-500/30 bg-purple-500/5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            Nuovo Video AI
            {selectedTenantName && <span className="badge bg-brand-500/10 text-brand-400 text-xs">📂 {selectedTenantName}</span>}
            {!selectedTenant && isMaster && <span className="badge bg-amber-500/10 text-amber-400 text-xs">🌐 Scope: tutti i clienti</span>}
          </h3>
          <div className="space-y-4">

            {/* ── Generatore storyboard AI ─────────────────────────────── */}
            <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Film size={14} className="text-teal-400" />
                <span className="text-sm font-medium text-teal-300">Genera storyboard con AI (opzionale)</span>
              </div>
              <p className="text-[11px] text-gray-400">
                L&apos;AI genera le scene con durate, narrazione e musica — il video seguirà fedelmente lo storyboard.
                Con più clip viene anche generato l&apos;audio vocale continuo (TTS).
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1 text-sm"
                  placeholder="Topic (es: domotica smart home, offerta summer sale...)"
                  value={aiTopic}
                  onChange={e => setAiTopic(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') generateStoryboard(); }}
                />
                <select
                  className="select text-sm w-36"
                  value={aiTone}
                  onChange={e => setAiTone(e.target.value)}
                >
                  <option value="professional">Professionale</option>
                  <option value="friendly">Amichevole</option>
                  <option value="inspirational">Inspirazionale</option>
                  <option value="luxury">Luxury</option>
                  <option value="funny">Divertente</option>
                </select>
                <button onClick={generateStoryboard} disabled={generatingStoryboard} className="btn-secondary whitespace-nowrap">
                  {generatingStoryboard
                    ? <><Loader2 size={13} className="animate-spin" /> Genero...</>
                    : <><Scissors size={13} /> Genera scene</>
                  }
                </button>
              </div>
              {storyboard && (
                <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-teal-300">
                      ✅ Storyboard pronto — {storyboard.scenes?.length ?? 0} scene · {storyboard.totalDuration}
                    </span>
                    <button onClick={() => setStoryboard(null)} className="text-[10px] text-red-400 hover:text-red-300">✕ rimuovi</button>
                  </div>
                  {storyboard.hook && <p className="text-[11px] text-gray-400"><strong className="text-gray-300">Hook:</strong> {storyboard.hook}</p>}
                  {storyboard.music && <p className="text-[11px] text-gray-400"><strong className="text-gray-300">Musica:</strong> {storyboard.music}</p>}
                  <div className="space-y-1.5">
                    {storyboard.scenes?.slice(0, 6).map((sc, i) => (
                      <div key={i} className="rounded border border-gray-700/40 bg-gray-800/30 px-2.5 py-1.5 text-[11px] space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-teal-400 font-bold">Scena {sc.scene}</span>
                          {sc.duration && <span className="badge bg-gray-700 text-gray-300 text-[10px] px-1.5">{sc.duration}</span>}
                          {sc.transition && <span className="text-gray-500">→ {sc.transition}</span>}
                        </div>
                        {sc.visual && <p className="text-gray-300">🎥 {sc.visual}</p>}
                        {sc.script && <p className="text-gray-400 italic">🎙️ {sc.script}</p>}
                        {sc.onScreenText && <p className="text-blue-400">📝 {sc.onScreenText}</p>}
                      </div>
                    ))}
                  </div>
                  {storyboard.cta && <p className="text-[11px] text-gray-400"><strong className="text-gray-300">CTA:</strong> {storyboard.cta}</p>}
                </div>
              )}
            </div>

            <div>
              <label className="label">Prompt / Descrizione video *</label>
              <textarea className="input min-h-[100px] resize-none" rows={4}
                placeholder="Descrivi il video che vuoi generare. Es: 'Un appartamento moderno con domotica smart home...'"
                value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
            </div>
            <div>
              <label className="label">Formato</label>
              <div className="grid grid-cols-3 gap-2">
                {ASPECT_RATIOS.map((ar) => (
                  <button key={ar.value} onClick={() => setForm({ ...form, aspectRatio: ar.value as '9:16' | '16:9' | '1:1' })}
                    className={`p-3 rounded-xl border text-sm transition-all ${form.aspectRatio === ar.value ? 'border-purple-500 bg-purple-500/10 text-purple-300' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600'}`}>
                    <div className="text-xl mb-1">{ar.icon}</div>
                    <div className="font-medium">{ar.label}</div>
                    <div className="text-xs text-gray-500">{ar.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">
                  Durata — <span className="font-bold text-purple-300">{form.duration}s</span>
                  {form.duration > 8 && (
                    <span className="ml-1.5 text-[10px] text-purple-400 font-normal">
                      ({calcNumClips(form.duration)} clip in sequenza)
                    </span>
                  )}
                </label>
                <div className="space-y-1.5">
                  <input
                    type="range"
                    min={5}
                    max={60}
                    step={1}
                    value={form.duration}
                    onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}
                    className="w-full accent-purple-500"
                  />
                  <div className="flex justify-between text-[10px] text-gray-500">
                    <span>5s</span>
                    <span className="text-purple-400/70">{form.duration > 8 ? `🎬 ${calcNumClips(form.duration)} clip in sequenza` : '🎬 singola clip'}</span>
                    <span>60s</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="label">Stile (opzionale)</label>
                <select className="select" value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })}>
                  <option value="">Automatico</option>
                  <option value="cinematic">🎬 Cinematografico</option>
                  <option value="realistic">📷 Realistico</option>
                  <option value="animated">✨ Animato</option>
                  <option value="minimal">◻️ Minimale</option>
                  <option value="luxury">👑 Luxury</option>
                </select>
              </div>
            </div>
          </div>
          <div className="pt-2">
            <WatermarkMediaCard mediaType="video" tenantId={selectedTenant || undefined} />
          </div>
          {/* Provider selector — override modello video per questa esecuzione */}
          {selectedTenant && (
            <ProviderSelectorWidget
              tenantId={selectedTenant}
              jobType="video"
              value={videoModelOverride}
              onChange={setVideoModelOverride}
              label="Modello Video AI"
            />
          )}
          <div className="flex gap-2 mt-4">
            <button onClick={handleCreate} disabled={creating} className="btn-primary">
              {creating
                ? <><Loader2 size={15} className="animate-spin" /> Creazione in corso...</>
                : <><Video size={15} /> Genera Video{storyboard ? ' con Storyboard' : ''}</>
              }
            </button>
            <button onClick={() => { setShowForm(false); setStoryboard(null); setAiTopic(''); }} className="btn-secondary">Annulla</button>
          </div>
        </div>
      )}

      {/* Jobs list */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="card p-4 h-20 shimmer" />)}</div>
      ) : jobs.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">
          <Video size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nessun video generato ancora{selectedTenantName ? ` per ${selectedTenantName}` : ''}.</p>
          <p className="text-xs mt-1">Configura un provider con video abilitato e inizia a generare!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const meta = STATUS_META[job.status] ?? STATUS_META.PENDING;
            const StatusIcon = meta.icon;
            const v = parseVideoJob(job);
            return (
              <div key={job.id} className="card p-4 hover:border-gray-700 transition-colors">
                <div className="flex items-start gap-4">
                  {/* Thumbnail / placeholder */}
                  <div className={`w-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-800 flex items-center justify-center ${v.aspectRatio === '9:16' ? 'aspect-[9/16]' : v.aspectRatio === '16:9' ? 'aspect-[16/9]' : 'aspect-square'}`}>
                    {v.videoUrl ? (
                      <video src={v.videoUrl} className="w-full h-full object-cover" />
                    ) : (
                      <Video size={20} className="text-gray-400 dark:text-gray-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge text-xs flex items-center gap-1 ${meta.color}`}>
                        <StatusIcon size={11} className={job.status === 'PROCESSING' ? 'animate-spin' : ''} />
                        {meta.label}
                      </span>
                      <span className="badge bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs">{v.aspectRatio}</span>
                      <span className="badge bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs">{v.duration}s</span>
                      {v.provider && <span className="badge bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs">{v.provider}</span>}
                      {v.style && <span className="badge bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs">{v.style}</span>}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1.5 line-clamp-2">{v.prompt}</p>
                    {job.status === 'WAITING_TOKENS' && job.nextRetryAt && (
                      <div className="mt-2 text-xs text-orange-400 flex items-center gap-1">
                        <Clock size={11} /> Retry automatico: {new Date(job.nextRetryAt).toLocaleString('it-IT')}
                      </div>
                    )}
                    {job.errorMessage && (
                      <div className="mt-2 text-xs text-red-400 line-clamp-2">{job.errorMessage}</div>
                    )}
                    {job.status === 'COMPLETED' && v.videoUrl && (
                      <a href={v.videoUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-xs text-brand-400 hover:text-brand-300 underline">
                        Apri video ↗
                      </a>
                    )}

                    {/* ── Clip singole (stitching) ─────────────────────────── */}
                    {(v.stitchingMeta?.clips?.length ?? 0) > 1 && (
                      <div className="mt-2">
                        <button
                          onClick={() => setExpandedClips(prev => ({ ...prev, [job.id]: !prev[job.id] }))}
                          className="inline-flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
                        >
                          <Film size={11} />
                          {v.stitchingMeta!.clips.length} clip sequenziali
                          {expandedClips[job.id] ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        </button>

                        {expandedClips[job.id] && (
                          <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-purple-500/20">
                            {v.stitchingMeta!.clips.map((clip) => {
                              const clipUrl = clip.videoUrl ?? v.clipUrls?.[clip.index];
                              const isActive = clip.index === v.stitchingMeta!.currentClipIndex && job.status === 'PROCESSING';
                              const clipStatusColor =
                                clip.status === 'COMPLETED' ? 'text-green-400' :
                                clip.status === 'PROCESSING' ? 'text-yellow-400' :
                                clip.status === 'FAILED' ? 'text-red-400' : 'text-gray-500';
                              const clipStatusIcon =
                                clip.status === 'COMPLETED' ? <CheckCircle2 size={10} /> :
                                clip.status === 'PROCESSING' ? <Loader2 size={10} className="animate-spin" /> :
                                clip.status === 'FAILED' ? <AlertCircle size={10} /> :
                                <Clock size={10} />;
                              return (
                                <div key={clip.index} className={`flex items-center gap-2 text-[11px] ${isActive ? 'bg-yellow-400/5 rounded px-1.5 py-0.5' : ''}`}>
                                  <span className={`flex items-center gap-0.5 ${clipStatusColor} flex-shrink-0`}>
                                    {clipStatusIcon}
                                    <span className="font-mono">#{clip.index + 1}</span>
                                  </span>
                                  <span className="text-gray-500">{clip.duration}s</span>
                                  <span className={`text-[10px] ${clipStatusColor}`}>{clip.status}</span>
                                  {clipUrl && (
                                    <a href={clipUrl} target="_blank" rel="noopener noreferrer" download
                                      className="ml-auto inline-flex items-center gap-0.5 text-purple-400 hover:text-purple-300 underline flex-shrink-0">
                                      <Download size={9} /> Scarica
                                    </a>
                                  )}
                                </div>
                              );
                            })}
                            {/* Link scarica clip singole da result se stitching fallì */}
                            {v.stitchingError && (
                              <div className="text-[10px] text-orange-400 mt-1 flex items-center gap-1">
                                <AlertCircle size={9} /> Stitching non riuscito: {v.stitchingError}
                              </div>
                            )}
                            {job.status === 'COMPLETED' && v.clipUrls.length > 1 && !v.stitchingError && v.videoUrl && (
                              <div className="text-[10px] text-green-400/70 mt-0.5 flex items-center gap-1">
                                <CheckCircle2 size={9} /> Video unito disponibile sopra
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {/* ─────────────────────────────────────────────────────── */}
                    {/* Rimozione filigrana — solo video completati */}
                    {job.status === 'COMPLETED' && v.videoUrl && (
                      <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] text-yellow-500/70 flex items-center gap-1 mr-1"><Eraser size={10} /> Filigrana:</span>
                        {([
                          { method: 'dissolve' as RemovalMethod, icon: <Eraser size={10} />, label: 'Dissolvi' },
                          { method: 'distorsione' as RemovalMethod, icon: <Maximize2 size={10} />, label: 'Distorci' },
                          { method: 'taglio' as RemovalMethod, icon: <Scissors size={10} />, label: 'Taglia' },
                        ]).map(({ method, icon, label }) => (
                          <button key={method} type="button"
                            onClick={() => openWatermark(v.videoUrl!, job.tenantId, method)}
                            className="inline-flex items-center gap-1 text-[10px] text-yellow-400 hover:text-yellow-300 border border-yellow-500/30 rounded-lg px-2 py-0.5 bg-yellow-500/5 hover:bg-yellow-500/10 transition-all">
                            {icon} {label}
                          </button>
                        ))}
                        <span className="text-[9px] text-red-400/60 flex items-center gap-0.5"><Lock size={8} /> solo mockup</span>
                      </div>
                    )}
                    <div className="text-xs text-gray-400 dark:text-gray-600 mt-1">
                      Tentativi: {job.attempts}/{job.maxAttempts} · {new Date(job.createdAt).toLocaleString('it-IT')}
                      {' · '}
                      <Link href={`/queue`} className="text-purple-400/70 hover:text-purple-300 text-[10px]">
                        Vedi in Coda ↗
                      </Link>
                    </div>
                  </div>
                  {['PENDING', 'WAITING_TOKENS'].includes(job.status) && (
                    <button onClick={() => handleCancel(job.id)} className="btn-ghost p-2 text-red-400 text-xs flex-shrink-0">
                      <XCircle size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Link alla coda completa */}
      {jobs.length > 0 && (
        <div className="text-center pt-2">
          <Link href="/queue?type=VIDEO" className="inline-flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors">
            <ExternalLink size={14} /> Vai alla Coda Generazione per gestione completa (retry, priorità, log dettagliato)
          </Link>
        </div>
      )}

      {/* Bulk scope modal */}
      {showBulkModal && (
        <BulkScopeModal
          tenants={tenantsWithVideoProvider.length > 0 ? tenantsWithVideoProvider : tenants}
          onGlobal={handleGlobalCreate}
          onBulk={handleBulkCreate}
          onCancel={() => setShowBulkModal(false)}
          globalLabel="Usa configurazione globale"
          globalDescription="Il video sarà generato con le API globali (configurazione condivisa)"
          bulkLabel={tenantsWithVideoProvider.length > 0
            ? `Genera per tutti i clienti con video provider (${tenantsWithVideoProvider.length})`
            : `Genera per tutti i clienti (${tenants.length})`}
          bulkWarning={`Verranno avviati ${tenantsWithVideoProvider.length || tenants.length} job video separati, uno per ogni cliente.`}
          bulkConfirmLabel={`🎬 Genera per ${tenantsWithVideoProvider.length || tenants.length} clienti`}
        />
      )}

      {/* Modal rimozione filigrana */}
      {watermarkJobUrl && (
        <WatermarkRemoverModal
          sourceUrl={watermarkJobUrl}
          mediaType="video"
          tenantId={watermarkTenantId}
          initialMethod={watermarkMethod}
          onClose={() => { setWatermarkJobUrl(null); setWatermarkTenantId(undefined); setWatermarkMethod(undefined); }}
          onSuccess={(url) => toast.success(`✅ Video processato! Scaricalo from ${url}`)}
        />
      )}
    </div>
  );
}
