'use client';
// src/app/queue/page.tsx — Coda Generazione Media

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, AlertTriangle, Clock, CheckCircle2, XCircle,
  RotateCcw, Ban, ImageIcon, Video, FileText, UploadCloud,
  ChevronDown, Filter, Zap, CheckCheck, Unlock, Settings, ExternalLink, Search, FastForward,
  Eye, Download, Bug, Trash2, CheckSquare, Square, Wand2,
  ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import Link from 'next/link';
import { MediaGalleryLightbox, type GalleryMediaItem } from '@/components/ui/MediaGalleryLightbox';
import { MediaGalleryGrid } from '@/components/ui/MediaGalleryGrid';
import { RefinePromptModal } from '@/components/ui/RefinePromptModal';
import toast from 'react-hot-toast';
import { useTenantFilter } from '@/lib/hooks/useTenantFilter';
import { TenantSelector } from '@/components/ui/TenantSelector';

/**
 * Calcola il numero di clip necessarie per una data durata video.
 * Ogni clip deve essere tra 5s (min) e 8s (max) per le API Veo.
 * Replica la logica server-side di calculateClipDurations senza dipendenze Node.js.
 */
function calcNumClips(totalSeconds: number): number {
  const d = Math.max(5, Math.min(60, Math.round(totalSeconds)));
  if (d <= 8) return 1;
  const minClips = Math.ceil(d / 8);
  const maxClips = Math.floor(d / 5);
  if (maxClips < minClips) return calcNumClips(minClips * 5); // gap → arrotonda
  return minClips;
}

import { formatRelativeTime, formatDateTime } from '@/lib/utils';
import { MODEL_LABELS, MODEL_COST, MAX_COST, costBadgeClass, categorizeModel } from '@/lib/ai-models';

// ─── TIPI ────────────────────────────────────────────────────────────────────

interface PromptInfo {
  globalRules?: string[];
  config?: Record<string, string | number | boolean | null | undefined>;
  codeRules?: string[];
  systemPrompt?: string;
  userPrompt?: string;
  finalImagePrompt?: string;
  finalVideoPrompt?: string;
}

interface RelatedPost {
  id: string;
  type: string;
  status: string;
  platform: string;
  caption?: string;
  scheduledAt?: string;
  mediaReady: string;
  site?: { name: string; url: string };
}

interface GenerationJob {
  id: string;
  tenantId: string;
  type: string;         // TEXT | IMAGE | VIDEO | MANUAL
  status: string;       // PENDING | PROCESSING | COMPLETED | FAILED | WAITING_TOKENS | CANCELLED | MANUAL_UPLOAD
  relatedPostId?: string;
  relatedPost?: RelatedPost;
  payload: string;
  result?: string;
  priority: number;
  scheduledFor?: string;
  errorMessage?: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: string;
  createdAt: string;
  updatedAt: string;
  tenant?: { id: string; name: string; slug: string };
}

interface Summary {
  PENDING: number;
  PROCESSING: number;
  WAITING_TOKENS: number;
  MANUAL_UPLOAD: number;
  FAILED: number;
  COMPLETED_TODAY: number;
  CANCELLED: number;
}

// ─── COSTANTI ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; bg: string }> = {
  PENDING:        { label: 'In attesa',        color: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/20',  icon: <Clock size={13} /> },
  PROCESSING:     { label: 'Generando...',     color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20',      icon: <div className="w-3 h-3 border border-blue-400/40 border-t-blue-400 rounded-full animate-spin" /> },
  WAITING_TOKENS: { label: 'Attesa token',     color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/20',  icon: <AlertTriangle size={13} /> },
  MANUAL_UPLOAD:  { label: 'Upload manuale',   color: 'text-purple-400',  bg: 'bg-purple-500/10 border-purple-500/20',  icon: <UploadCloud size={13} /> },
  COMPLETED:      { label: 'Completato',       color: 'text-green-400',   bg: 'bg-green-500/10 border-green-500/20',    icon: <CheckCircle2 size={13} /> },
  FAILED:         { label: 'Fallito',          color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20',        icon: <XCircle size={13} /> },
  CANCELLED:      { label: 'Annullato',        color: 'text-gray-400',    bg: 'bg-gray-500/10 border-gray-500/20',      icon: <Ban size={13} /> },
};

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  TEXT:   { label: 'Testo AI',      icon: <FileText size={13} />,   color: 'text-sky-400' },
  IMAGE:  { label: 'Immagine AI',   icon: <ImageIcon size={13} />,  color: 'text-emerald-400' },
  VIDEO:  { label: 'Video AI',      icon: <Video size={13} />,      color: 'text-violet-400' },
  MANUAL: { label: 'Manuale',       icon: <UploadCloud size={13} />,color: 'text-amber-400' },
};

const PLATFORM_ICON: Record<string, string> = {
  INSTAGRAM: '📸', FACEBOOK: '🔵', TIKTOK: '🎵',
};

const TYPE_ICON: Record<string, string> = {
  POST: '🖼️', STORY: '📱', REEL: '🎬', CAROUSEL: '🎠',
};

const MEDIA_READY_BADGE: Record<string, { label: string; color: string }> = {
  NONE:       { label: 'Solo testo',    color: 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700' },
  PENDING:    { label: 'AI in coda',    color: 'text-purple-400 bg-purple-500/10' },
  GENERATING: { label: 'Generando…',   color: 'text-blue-400 bg-blue-500/10' },
  READY:      { label: 'Media pronto', color: 'text-green-400 bg-green-500/10' },
  FAILED:     { label: 'AI fallita',   color: 'text-red-400 bg-red-500/10' },
};

// ─── COMPONENTE PRINCIPALE ───────────────────────────────────────────────────

export default function GenerationQueuePage() {
  const { tenants, selectedTenant, setSelectedTenant, isMaster, showSelector, ready } = useTenantFilter();

  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  // Providers per tenant (per mostrare info modello in ogni job card)
  const [providersByTenant, setProvidersByTenant] = useState<Record<string, { model: string; imageModel?: string; imageEnabled?: boolean; videoModel?: string; videoEnabled?: boolean }>>({});

  // Filtri
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  // Ordinamento — default: data creazione discendente
  type QueueSortField = 'createdAt' | 'updatedAt' | 'priority' | 'status' | 'type';
  const [sortField, setSortField] = useState<QueueSortField>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSortDir = () => setSortDir(d => d === 'asc' ? 'desc' : 'asc');

  const sortedJobs = [...jobs].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'createdAt') cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    else if (sortField === 'updatedAt') cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    else if (sortField === 'priority') cmp = a.priority - b.priority;
    else if (sortField === 'status') cmp = a.status.localeCompare(b.status);
    else if (sortField === 'type') cmp = a.type.localeCompare(b.type);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // Selezione multipla per eliminazione
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const toggleSelectJob = (id: string) => setSelectedJobs(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleSelectAll = () => {
    if (selectedJobs.size === jobs.length) setSelectedJobs(new Set());
    else setSelectedJobs(new Set(jobs.map(j => j.id)));
  };

  const deleteSelected = async () => {
    if (!selectedJobs.size) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/generation-queue', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selectedJobs] }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message ?? 'Job eliminati');
        setSelectedJobs(new Set());
        fetchQueue(true);
      } else {
        toast.error(json.error ?? 'Errore eliminazione');
      }
    } catch {
      toast.error('Errore di rete');
    } finally {
      setDeleting(false);
    }
  };

  const deleteJob = async (id: string) => {
    try {
      const res = await fetch('/api/generation-queue', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Job eliminato');
        setSelectedJobs(prev => { const n = new Set(prev); n.delete(id); return n; });
        fetchQueue(true);
      } else {
        toast.error(json.error ?? 'Errore');
      }
    } catch {
      toast.error('Errore di rete');
    }
  };

  // Modalità debug — mostra regole iniettate e prompt completi
  const [debugMode, setDebugMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('pineapple-debug-mode') === '1';
  });
  const toggleDebug = () => setDebugMode(prev => {
    const next = !prev;
    localStorage.setItem('pineapple-debug-mode', next ? '1' : '0');
    return next;
  });

  // Gallery lightbox per media generati
  const [galleryData, setGalleryData] = useState<{ items: GalleryMediaItem[]; tenantId: string } | null>(null);

  // Modal "Migliora media"
  const [refineModal, setRefineModal] = useState<{ jobId: string } | null>(null);

  // Stato per la diagnostica modelli inline
  const [modelDiscovery, setModelDiscovery] = useState<{
    jobId: string;
    tenantId: string;
    loading: boolean;
    models: { name: string; category: 'gemini-image' | 'imagen' | 'video' | 'other' }[];
    error?: string;
  } | null>(null);


  /** Chiama l'API di diagnostica Google per scoprire i modelli disponibili */
  const discoverModels = async (jobId: string, tenantId: string) => {
    setModelDiscovery({ jobId, tenantId, loading: true, models: [] });
    try {
      const provRes = await fetch(`/api/ai/providers?tenantId=${tenantId}`);
      const provJson = await provRes.json();
      const googleProvider = (provJson.data ?? []).find((p: { provider: string }) => p.provider === 'google');
      if (!googleProvider) {
        setModelDiscovery({ jobId, tenantId, loading: false, models: [], error: 'Nessun provider Google configurato per questo tenant.' });
        return;
      }
      const modRes = await fetch(`/api/ai/providers/${googleProvider.id}/models`);
      const modJson = await modRes.json();
      const results = modJson.results ?? [];
      const seen = new Set<string>();
      const models: { name: string; category: 'gemini-image' | 'imagen' | 'video' | 'other' }[] = [];
      for (const r of results) {
        for (const m of (r.imageModels ?? [])) {
          if (!seen.has(m)) {
            seen.add(m);
            models.push({ name: m, category: categorizeModel(m) });
          }
        }
        for (const m of (r.videoModels ?? [])) {
          if (!seen.has(m)) {
            seen.add(m);
            models.push({ name: m, category: categorizeModel(m) });
          }
        }
      }
      setModelDiscovery({ jobId, tenantId, loading: false, models });
    } catch (e) {
      setModelDiscovery({ jobId, tenantId, loading: false, models: [], error: String(e) });
    }
  };

  /** Applica un modello al provider Google del tenant */
  const applyModel = async (tenantId: string, modelName: string, modelField: 'imageModel' | 'videoModel' = 'imageModel') => {
    try {
      const provRes = await fetch(`/api/ai/providers?tenantId=${tenantId}`);
      const provJson = await provRes.json();
      const googleProvider = (provJson.data ?? []).find((p: { provider: string }) => p.provider === 'google');
      if (!googleProvider) { toast.error('Provider Google non trovato'); return; }
      const res = await fetch(`/api/ai/providers/${googleProvider.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          modelField === 'imageModel'
            ? { imageModel: modelName, imageEnabled: true }
            : { videoModel: modelName, videoEnabled: true }
        ),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`✅ Modello ${modelField === 'imageModel' ? 'immagini' : 'video'} impostato: ${modelName}`);
        setModelDiscovery(null);
        fetchQueue(false);
      } else {
        toast.error(json.error ?? 'Errore salvataggio');
      }
    } catch { toast.error('Errore di rete'); }
  };

  const fetchQueue = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter)   params.set('type', typeFilter);
      if (selectedTenant) params.set('tenantId', selectedTenant);

      const [queueRes, provRes] = await Promise.all([
        fetch(`/api/generation-queue?${params}`),
        fetch(`/api/ai/providers${selectedTenant ? `?tenantId=${selectedTenant}` : ''}`),
      ]);
      const [queueJson, provJson] = await Promise.all([queueRes.json(), provRes.json()]);
      if (queueJson.success) {
        setJobs(queueJson.data);
        setSummary(queueJson.summary);
        setLastRefresh(new Date());
      }
      // Crea mappa tenant → provider info
      if (provJson.success && Array.isArray(provJson.data)) {
        const map: Record<string, { model: string; imageModel?: string; imageEnabled?: boolean; videoModel?: string; videoEnabled?: boolean }> = {};
        for (const p of provJson.data) {
          if (p.isDefault || !map[p.tenantId]) {
            map[p.tenantId] = {
              model: p.model,
              imageModel: p.imageModel,
              imageEnabled: p.imageEnabled,
              videoModel: p.videoModel,
              videoEnabled: p.videoEnabled,
            };
          }
        }
        setProvidersByTenant(map);
      }
    } catch (err) {
      // Errore di rete (server in riavvio, connessione persa) — non crashare la pagina
      console.warn('[Queue] fetchQueue error:', err instanceof Error ? err.message : err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, typeFilter, selectedTenant]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  // ── SSE: aggiornamento real-time quando un job cambia stato ──────────────
  useEffect(() => {
    // Costruisce l'URL con il filtro tenant se disponibile
    const url = selectedTenant
      ? `/api/generation-queue/stream?tenantId=${selectedTenant}`
      : '/api/generation-queue/stream';

    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 2000; // backoff esponenziale: 2s → 4s → 8s → max 30s

    const connect = () => {
      es = new EventSource(url);

      es.addEventListener('connected', () => {
        retryDelay = 2000; // reset backoff alla riconnessione
      });

      es.addEventListener('job-update', () => {
        // Un job ha cambiato stato → ricarica la lista
        fetchQueue(true);
      });

      es.onerror = () => {
        es?.close();
        es = null;
        // Riconnessione automatica con backoff esponenziale
        retryTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, 30_000);
          connect();
        }, retryDelay);
      };
    };

    connect();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, [selectedTenant, fetchQueue]);

  // Auto-refresh ogni 60 secondi come fallback (SSE gestisce già gli aggiornamenti real-time)
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'PENDING' || j.status === 'PROCESSING');
    if (!hasActive) return;
    const t = setInterval(() => fetchQueue(true), 60_000);
    return () => clearInterval(t);
  }, [jobs, fetchQueue]);

  const doAction = async (action: string, id: string, extra?: Record<string, string>) => {
    try {
      const res = await fetch('/api/generation-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, jobId: action !== 'markReady' ? id : undefined, postId: action === 'markReady' ? id : undefined, ...extra }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message ?? 'Operazione completata');
        fetchQueue(true);
      } else {
        toast.error(json.error ?? 'Errore');
      }
    } catch {
      toast.error('Errore di rete');
    }
  };

  const totalActive = (summary?.PENDING ?? 0) + (summary?.PROCESSING ?? 0) + (summary?.WAITING_TOKENS ?? 0);

  // Forza l'elaborazione immediata della coda (chiama lo scheduler manualmente)
  const processNow = async () => {
    setProcessing(true);
    try {
      const res = await fetch('/api/scheduler/init', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        toast.success('Generazione avviata! Aggiorna tra qualche secondo per vedere i risultati.');
        setTimeout(() => fetchQueue(true), 3000);
      } else {
        toast.error(json.error ?? 'Errore');
      }
    } catch {
      toast.error('Errore di rete');
    } finally {
      setProcessing(false);
    }
  };

  // Sblocca tutti i job WAITING_TOKENS → rimanda in PENDING immediatamente
  const unlockQuota = async () => {
    setUnlocking(true);
    try {
      const body: Record<string, unknown> = { action: 'unlockQuota' };
      if (selectedTenant) body.tenantId = selectedTenant;
      const res = await fetch('/api/generation-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message ?? 'Job sbloccati');
        fetchQueue(true);
      } else {
        toast.error(json.error ?? 'Errore');
      }
    } catch {
      toast.error('Errore di rete');
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Zap size={20} className="text-brand-400" />
            Coda Generazione Media
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Stato in tempo reale di tutti i job di generazione contenuti AI
          </p>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2 flex-wrap">
          {ready && showSelector && (
            <TenantSelector
              tenants={tenants}
              value={selectedTenant}
              onChange={setSelectedTenant}
              isMaster={isMaster}
            />
          )}
          {totalActive > 0 && (
            <button
              onClick={processNow}
              disabled={processing}
              className="btn-primary text-sm flex items-center gap-1.5"
              title="Avvia subito la generazione AI senza aspettare il cron automatico"
            >
              <Zap size={14} className={processing ? 'animate-pulse' : ''} />
              {processing ? 'Generando…' : 'Processa ora'}
            </button>
          )}
          <button
            onClick={() => fetchQueue(true)}
            disabled={refreshing}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Aggiornando…' : 'Aggiorna'}
          </button>
        </div>
      </div>

      {lastRefresh && (
        <p className="text-xs text-gray-600">
          Ultimo aggiornamento: {lastRefresh.toLocaleTimeString('it-IT')}
          {totalActive > 0 && <span className="ml-2 text-brand-400 animate-pulse">● Live</span>}
        </p>
      )}

      {/* Banner quota esaurita — mostra quando ci sono job bloccati */}
      {(summary?.WAITING_TOKENS ?? 0) > 0 && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/8 p-4 flex flex-wrap items-start gap-3">
          <AlertTriangle size={18} className="text-orange-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-orange-300">
              {summary!.WAITING_TOKENS} job bloccati — quota immagini AI in attesa
            </p>
            <p className="text-xs text-orange-400/70 mt-1">
              La quota immagini AI (per modelli Gemini/Imagen) è <strong>separata</strong> dalla quota testo
              visibile nel dashboard Google AI Studio. Se sei convinto che la quota sia disponibile,
              puoi sbloccare i job manualmente per riprovare subito.
            </p>
            {/* Mostra il prossimo retry del primo job bloccato */}
            {(() => {
              const blocked = jobs.find(j => j.status === 'WAITING_TOKENS' && j.nextRetryAt);
              if (!blocked?.nextRetryAt) return null;
              const retryDate = new Date(blocked.nextRetryAt);
              const mins = Math.max(0, Math.round((retryDate.getTime() - Date.now()) / 60000));
              return (
                <p className="text-xs text-orange-400/60 mt-0.5">
                  Retry automatico previsto: {retryDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                  {mins > 0 ? ` (tra ~${mins} min)` : ' (a breve)'}
                </p>
              );
            })()}
          </div>
          <button
            onClick={unlockQuota}
            disabled={unlocking}
            className="btn-secondary text-xs flex items-center gap-1.5 border-orange-500/40 text-orange-300 hover:text-orange-200 flex-shrink-0"
            title="Sblocca tutti i job in attesa e rimandali in coda immediatamente"
          >
            <Unlock size={13} className={unlocking ? 'animate-pulse' : ''} />
            {unlocking ? 'Sbloccando…' : 'Sblocca e riprova ora'}
          </button>
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {[
            { key: 'PENDING',        label: 'In attesa',       color: 'text-yellow-400',  bg: 'bg-yellow-500/8  border-yellow-500/20', val: summary.PENDING },
            { key: 'PROCESSING',     label: 'In corso',        color: 'text-blue-400',    bg: 'bg-blue-500/8    border-blue-500/20',    val: summary.PROCESSING },
            { key: 'WAITING_TOKENS', label: 'Attesa token',    color: 'text-orange-400',  bg: 'bg-orange-500/8  border-orange-500/20',  val: summary.WAITING_TOKENS },
            { key: 'MANUAL_UPLOAD',  label: 'Upload manuale',  color: 'text-purple-400',  bg: 'bg-purple-500/8  border-purple-500/20',  val: summary.MANUAL_UPLOAD },
            { key: 'FAILED',         label: 'Falliti',         color: 'text-red-400',     bg: 'bg-red-500/8     border-red-500/20',     val: summary.FAILED },
            { key: 'COMPLETED_TODAY',label: 'Completati oggi', color: 'text-green-400',   bg: 'bg-green-500/8   border-green-500/20',   val: summary.COMPLETED_TODAY },
            { key: 'CANCELLED',      label: 'Annullati',       color: 'text-gray-400',    bg: 'bg-gray-100 dark:bg-gray-700/40 border-gray-200 dark:border-gray-700',        val: summary.CANCELLED },
          ].map(({ key, label, color, bg, val }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === (key === 'COMPLETED_TODAY' ? 'COMPLETED' : key) ? '' : (key === 'COMPLETED_TODAY' ? 'COMPLETED' : key))}
              className={`rounded-xl border p-3 text-center transition-all cursor-pointer ${bg} ${
                statusFilter === (key === 'COMPLETED_TODAY' ? 'COMPLETED' : key) ? 'ring-1 ring-brand-500/50' : ''
              }`}
            >
              <div className={`text-2xl font-bold ${color}`}>{val}</div>
              <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">{label}</div>
            </button>
          ))}
        </div>
      )}

      {/* Filtri */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter size={14} className="text-gray-500" />
        <select className="select text-sm w-44" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Tutti gli stati</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select className="select text-sm w-36" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">Tutti i tipi</option>
          {Object.entries(TYPE_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        {(statusFilter || typeFilter) && (
          <button onClick={() => { setStatusFilter(''); setTypeFilter(''); }} className="text-xs text-gray-500 hover:text-gray-300">
            ✕ Reset filtri
          </button>
        )}
        <span className="ml-auto text-xs text-gray-500">{jobs.length} job</span>
        {/* Selezione multipla */}
        {jobs.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border bg-gray-100 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-all"
          >
            {selectedJobs.size === jobs.length ? <CheckSquare size={12} /> : <Square size={12} />}
            {selectedJobs.size > 0 ? `${selectedJobs.size} selezionati` : 'Seleziona'}
          </button>
        )}
        {selectedJobs.size > 0 && (
          <button
            onClick={deleteSelected}
            disabled={deleting}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all"
          >
            <Trash2 size={12} />
            {deleting ? 'Eliminando…' : `Elimina ${selectedJobs.size}`}
          </button>
        )}
        {/* Toggle debug mode */}
        <button
          onClick={toggleDebug}
          title={debugMode ? 'Disattiva modalità debug' : 'Attiva modalità debug (mostra prompt e regole codice)'}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all ${
            debugMode
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 hover:bg-amber-500/25'
              : 'bg-gray-100 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600'
          }`}
        >
          <Bug size={12} />
          {debugMode ? 'Debug ON' : 'Debug'}
        </button>

        {/* Ordinamento */}
        <div className="flex items-center gap-1 ml-auto sm:ml-0">
          <ArrowUpDown size={13} className="text-gray-500 flex-shrink-0" />
          <select
            className="select text-xs py-1 h-7 w-36"
            value={sortField}
            onChange={e => setSortField(e.target.value as QueueSortField)}
          >
            <option value="createdAt">Data creazione</option>
            <option value="updatedAt">Data aggiornamento</option>
            <option value="priority">Priorità</option>
            <option value="status">Stato</option>
            <option value="type">Tipo</option>
          </select>
          <button
            onClick={toggleSortDir}
            title={sortDir === 'desc' ? 'Ordine discendente — clicca per ascendente' : 'Ordine ascendente — clicca per discendente'}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-gray-100 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-all h-7"
          >
            {sortDir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
            {sortDir === 'desc' ? 'DESC' : 'ASC'}
          </button>
        </div>
      </div>

      {/* Lista job */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 shimmer rounded-xl" />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="card p-12 text-center">
          <CheckCheck size={48} className="mx-auto text-gray-700 mb-3" />
          <p className="text-gray-400 text-sm">Nessun job trovato</p>
          <p className="text-gray-600 text-xs mt-1">
            {statusFilter || typeFilter ? 'Prova a cambiare i filtri' : 'La coda è vuota — nessun contenuto in generazione'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedJobs.map(job => {
            const sc = STATUS_CONFIG[job.status] ?? STATUS_CONFIG['PENDING'];
            const tc = TYPE_CONFIG[job.type] ?? TYPE_CONFIG['MANUAL'];
            const isExpanded = expandedJob === job.id;
            const payload = (() => { try { return JSON.parse(job.payload); } catch { return {}; } })();
            const provInfo = providersByTenant[job.tenantId];
            // Modello effettivo usato per questo job
            // Per VIDEO: usa prima il modello salvato nel payload dal scheduler (videoModel),
            // poi il modello nell'stitching, poi il default del tenant
            const effectiveModel = job.type === 'VIDEO'
              ? ((payload.videoModel as string | undefined)
                  ?? (payload._stitching as { videoModel?: string } | undefined)?.videoModel
                  ?? (provInfo?.videoEnabled ? provInfo?.videoModel : null))
              : job.type === 'IMAGE'
                ? (provInfo?.imageEnabled ? provInfo?.imageModel : provInfo?.model)
                : job.type === 'TEXT' ? provInfo?.model : null;
            const modelCost = effectiveModel ? MODEL_COST[effectiveModel] : undefined;
            const modelLabel = effectiveModel ? (MODEL_LABELS[effectiveModel] ?? effectiveModel) : null;

            return (
              <div key={job.id} className={`card transition-all ${sc.bg} border ${selectedJobs.has(job.id) ? 'ring-1 ring-brand-500/50' : ''}`}>

                {/* ── Riga principale ─────────────────────────────────── */}
                <div className="px-3 py-2.5 flex items-center gap-2 min-w-0">

                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => toggleSelectJob(job.id)}
                    className="flex-shrink-0 text-gray-400 hover:text-brand-400 transition-colors"
                    title={selectedJobs.has(job.id) ? 'Deseleziona' : 'Seleziona'}
                  >
                    {selectedJobs.has(job.id)
                      ? <CheckSquare size={15} className="text-brand-400" />
                      : <Square size={15} />}
                  </button>

                  {/* Tipo + Status — pillole compatte */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tc.color} bg-current/5`}>
                      {tc.icon}
                      <span className="hidden xs:inline">{tc.label}</span>
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${sc.color} ${sc.bg}`}>
                      {sc.icon}
                      <span className="hidden sm:inline">{sc.label}</span>
                    </span>
                  </div>

                  {/* Thumbnail (solo COMPLETED con media) */}
                  {job.status === 'COMPLETED' && (() => {
                    let r: Record<string, unknown> = {};
                    try { r = JSON.parse(job.result ?? '{}'); } catch { /* */ }
                    const thumbUrl = r.url as string | undefined;
                    const thumbMime = r.mimeType as string | undefined;
                    if (!thumbUrl) return null;
                    return (
                      <div className="flex-shrink-0">
                        <MediaGalleryGrid
                          items={[{ url: thumbUrl, mimeType: thumbMime }]}
                          tenantId={job.tenantId}
                          thumbSize={36}
                        />
                      </div>
                    );
                  })()}

                  {/* Corpo — contenuto principale */}
                  <div className="flex-1 min-w-0">
                    {/* Riga 1: caption / prompt */}
                    {job.relatedPost ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm leading-none">{PLATFORM_ICON[job.relatedPost.platform] ?? '📄'}</span>
                        <span className="text-sm leading-none">{TYPE_ICON[job.relatedPost.type] ?? '📄'}</span>
                        <span className="text-xs text-gray-800 dark:text-gray-200 truncate">
                          {job.relatedPost.caption?.slice(0, 80) ?? <em className="text-gray-500">Nessuna caption</em>}
                          {(job.relatedPost.caption?.length ?? 0) > 80 ? '…' : ''}
                        </span>
                      </div>
                    ) : job.type === 'VIDEO' && payload.prompt ? (
                      <span className="text-xs text-gray-800 dark:text-gray-200 truncate block">
                        🎬 {String(payload.prompt).slice(0, 80)}{String(payload.prompt).length > 80 ? '…' : ''}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500 italic">Nessun post collegato</span>
                    )}

                    {/* Riga 2: metadati secondari */}
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {payload.topic && (
                        <span className="text-[10px] text-gray-500 truncate max-w-[160px]">
                          #{payload.topic}
                        </span>
                      )}
                      {job.relatedPost?.site && (
                        <span className="text-[10px] text-gray-500 bg-gray-100 dark:bg-gray-800 rounded px-1.5 py-px truncate max-w-[100px]">
                          🌐 {job.relatedPost.site.name}
                        </span>
                      )}
                      {job.relatedPost && (() => {
                        const mr = MEDIA_READY_BADGE[job.relatedPost.mediaReady];
                        return mr ? (
                          <span className={`text-[10px] px-1.5 py-px rounded ${mr.color}`}>{mr.label}</span>
                        ) : null;
                      })()}
                      {isMaster && job.tenant && (
                        <span className="text-[10px] text-brand-400 bg-brand-500/10 rounded px-1.5 py-px hidden sm:inline">
                          {job.tenant.name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Meta destra: modello + costo + tempo */}
                  <div className="hidden md:flex flex-col items-end gap-0.5 flex-shrink-0">
                    {modelLabel ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-500 truncate max-w-[100px]" title={modelLabel}>
                          {modelLabel.split(' — ')[0].split(' · ')[0]}
                        </span>
                        {modelCost !== undefined && (
                          <span className={`inline-flex items-center gap-0.5 px-1 py-px rounded border text-[9px] font-bold ${costBadgeClass(modelCost)}`}>
                            {modelCost}×
                          </span>
                        )}
                      </div>
                    ) : (job.type === 'IMAGE' || job.type === 'VIDEO') ? (
                      <Link href="/ai-providers" className="text-[10px] text-orange-400 hover:text-orange-300 transition-colors">
                        ⚠️ Modello
                      </Link>
                    ) : null}
                    <div className="flex items-center gap-1 text-[10px] text-gray-500">
                      <Clock size={9} />
                      <span title={formatDateTime(job.createdAt)}>{formatRelativeTime(job.createdAt)}</span>
                      <span className="text-gray-400 dark:text-gray-600">·</span>
                      <span className={job.attempts >= job.maxAttempts ? 'text-red-400' : ''}>
                        {job.attempts}/{job.maxAttempts}
                      </span>
                    </div>
                  </div>

                  {/* Azioni rapide */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {job.status === 'PENDING' && job.nextRetryAt && new Date(job.nextRetryAt) > new Date() && (
                      <button onClick={() => doAction('forceRetry', job.id)}
                        className="p-1.5 rounded-lg text-brand-400 hover:bg-brand-500/10 transition-colors"
                        title="Forza retry subito">
                        <FastForward size={13} />
                      </button>
                    )}
                    {(job.status === 'FAILED' || job.status === 'CANCELLED') && (
                      <button onClick={() => doAction('retry', job.id)}
                        className="p-1.5 rounded-lg text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                        title="Rimetti in coda">
                        <RotateCcw size={13} />
                      </button>
                    )}
                    {job.status === 'WAITING_TOKENS' && (
                      <button onClick={() => doAction('retry', job.id)}
                        className="p-1.5 rounded-lg text-orange-400 hover:bg-orange-500/10 transition-colors"
                        title="Sblocca e riprova">
                        <Unlock size={13} />
                      </button>
                    )}
                    {(job.status === 'MANUAL_UPLOAD' || job.status === 'PENDING' || job.status === 'WAITING_TOKENS') && job.relatedPostId && (
                      <button onClick={() => doAction('markReady', job.relatedPostId!)}
                        className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10 transition-colors"
                        title="Segna media come pronto">
                        <CheckCircle2 size={13} />
                      </button>
                    )}
                    {(job.status === 'PENDING' || job.status === 'WAITING_TOKENS') && (
                      <button onClick={() => doAction('cancel', job.id)}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Annulla job">
                        <Ban size={13} />
                      </button>
                    )}
                    {job.status === 'COMPLETED' && (() => {
                      let hasMedia = false;
                      try { const r = JSON.parse(job.result ?? '{}'); hasMedia = !!(r.url || r.videoUrl); } catch { /* */ }
                      if (!hasMedia) return null;
                      return (
                        <button onClick={() => setRefineModal({ jobId: job.id })}
                          className="p-1.5 rounded-lg text-violet-400 hover:bg-violet-500/10 transition-colors"
                          title="Migliora media">
                          <Wand2 size={13} />
                        </button>
                      );
                    })()}
                    {/* Espandi */}
                    <button
                      onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                      className={`p-1.5 rounded-lg transition-colors ${isExpanded ? 'text-brand-400 bg-brand-500/10' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                      title="Dettagli">
                      <ChevronDown size={13} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    {/* Elimina */}
                    <button onClick={() => deleteJob(job.id)}
                      className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Elimina">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Pannello espanso — dettagli */}
                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-800/50 px-3 pb-3 pt-3 space-y-3">
                    {/* ── Anteprima media generato (solo job COMPLETED con URL nel result) ── */}
                    {(() => {
                      let resultData: Record<string, unknown> = {};
                      try { resultData = JSON.parse(job.result ?? '{}'); } catch { /* */ }
                      const mediaUrl = resultData.url as string | undefined;
                      const resultModel = resultData.model as string | undefined;
                      const imgWidth  = resultData.width as number | undefined;
                      const imgHeight = resultData.height as number | undefined;
                      const fileSizeKb = resultData.size ? Math.round((resultData.size as number) / 1024) : undefined;
                      const mimeType  = resultData.mimeType as string | undefined;
                      const isVideo   = mimeType?.startsWith('video/') || mediaUrl?.endsWith('.mp4') || mediaUrl?.endsWith('.webm');
                      const videoJobId = resultData.videoJobId as string | undefined;

                      if (!mediaUrl && !videoJobId) return null;
                      return (
                        <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-900/60 overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800/60">
                            <div className="flex items-center gap-2">
                              {isVideo ? <Video size={13} className="text-violet-400" /> : <ImageIcon size={13} className="text-emerald-400" />}
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                {isVideo ? 'Video generato' : 'Immagine generata'}
                              </span>
                              {imgWidth && imgHeight && (
                                <span className="text-[10px] text-gray-500 dark:text-gray-600">{imgWidth}×{imgHeight}px</span>
                              )}
                              {fileSizeKb && (
                                <span className="text-[10px] text-gray-500 dark:text-gray-600">{fileSizeKb} KB</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                             {mediaUrl && (
                                 <>
                                   <button
                                     onClick={() => setGalleryData({ items: [{ url: mediaUrl, type: isVideo ? 'video' : 'image' }], tenantId: job.tenantId })}
                                     className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded px-1.5 py-0.5 transition-colors"
                                     title="Apri gallery"
                                   >
                                     <Eye size={10} /> Apri
                                   </button>
                                   {/* URL remoto (es. Google Veo): scarica e persisti via backend con autenticazione */}
                                   {isVideo && !mediaUrl.startsWith('/uploads/') ? (
                                     <button
                                       onClick={async () => {
                                         toast.loading('Download video in corso…', { id: 'redownload' });
                                         try {
                                           const res = await fetch('/api/generation-queue', {
                                             method: 'POST',
                                             headers: { 'Content-Type': 'application/json' },
                                             body: JSON.stringify({ action: 'redownloadVideo', jobId: job.id }),
                                           });
                                           const json = await res.json();
                                           if (json.success) {
                                             toast.success('✅ Video scaricato!', { id: 'redownload' });
                                             fetchQueue(true);
                                           } else {
                                             toast.error(json.error ?? 'Errore', { id: 'redownload' });
                                           }
                                         } catch { toast.error('Errore di rete', { id: 'redownload' }); }
                                       }}
                                        className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 transition-colors"
                                        title="Scarica il video (autenticazione backend)"
                                     >
                                       <Download size={10} /> Scarica
                                     </button>
                                   ) : (
                                     /* URL locale: download diretto */
                                     <a
                                       href={mediaUrl}
                                       download
                                      className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 transition-colors"
                                        title="Scarica"
                                     >
                                       <Download size={10} /> Scarica
                                     </a>
                                   )}
                                 </>
                               )}
                            </div>
                          </div>

                          {/* Anteprima */}
                          {mediaUrl && (
                            <div className="p-3 flex gap-4 items-start">
                              <MediaGalleryGrid
                                items={[{ url: mediaUrl, mimeType: mimeType }]}
                                tenantId={job.tenantId}
                                thumbSize={isVideo ? 120 : 100}
                              />
                              {/* Info modello usato + metadati */}
                              <div className="flex-1 min-w-0 space-y-2">
                                {resultModel && resultModel !== 'unknown' && (
                                  <div>
                                    <div className="text-[10px] text-gray-500 dark:text-gray-600 uppercase tracking-wide mb-0.5">
                                      {job.type === 'VIDEO' ? '🎬 Modello Video usato' : '🖼️ Modello Immagini usato'}
                                    </div>
                                    <div className="font-mono text-[10px] text-yellow-700 dark:text-yellow-200 bg-gray-100 dark:bg-gray-800/80 rounded px-2 py-1 inline-block border border-yellow-500/20">
                                      {resultModel}
                                    </div>
                                     {MODEL_LABELS[resultModel] && (
                                       <div className="text-[10px] text-gray-500 dark:text-gray-500 mt-0.5">{MODEL_LABELS[resultModel]}</div>
                                     )}
                                    {MODEL_COST[resultModel] !== undefined && (() => {
                                      const cost = MODEL_COST[resultModel];
                                      const filled = Math.max(1, Math.round((cost / MAX_COST) * 6));
                                      return (
                                        <div className="flex items-center gap-1.5 mt-1">
                                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${costBadgeClass(cost)}`}>
                                            {cost}× consumo
                                          </span>
                                          <div className="flex gap-px">
                                            {Array.from({ length: 6 }).map((_, i) => (
                                              <div key={i} className={`w-2 h-2 rounded-sm ${i < filled ? costBadgeClass(cost).split(' ')[0] : 'bg-gray-200 dark:bg-gray-800'}`} />
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}
                                {mimeType && (
                                  <div className="text-[10px] text-gray-500 dark:text-gray-600">Formato: {mimeType}</div>
                                )}
                                {videoJobId && (
                                  <div>
                                    <div className="text-[10px] text-gray-500 dark:text-gray-600 uppercase tracking-wide mb-0.5">Video Job ID</div>
                                    <div className="font-mono text-[10px] text-gray-600 dark:text-gray-400">{videoJobId}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          {!mediaUrl && videoJobId && (
                            <div className="p-3 text-xs text-gray-500">
                              Il video era in elaborazione separata (sistema legacy). Controlla la pagina <Link href="/video" className="text-violet-400 hover:text-violet-300 underline">Video AI</Link>.
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* ── Clip singole — disponibili sia durante la generazione che dopo il completamento ── */}
                    {(() => {
                      if (job.type !== 'VIDEO') return null;
                      // Prova dal result (COMPLETED) o dal payload (PROCESSING/PENDING)
                      let resultData: Record<string, unknown> = {};
                      try { resultData = JSON.parse(job.result ?? '{}'); } catch { /* */ }
                      const stitchingResult = resultData.stitching as {
                        clips?: number;
                        clipUrls?: string[];
                        stitchingError?: string | null;
                      } | undefined;
                      const clipUrls: string[] = stitchingResult?.clipUrls ?? [];
                      if (clipUrls.length <= 1) return null;
                      return (
                        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="text-[10px] uppercase tracking-wide font-semibold text-green-400 flex items-center gap-1.5">
                              🎬 Clip singole
                              <span className="text-[9px] font-normal text-gray-500 normal-case">
                                ({clipUrls.length} clip completate)
                              </span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            {clipUrls.map((url, idx) => (
                              <div key={idx} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-green-500/15 bg-green-500/5 text-[10px]">
                                <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                                <span className="font-semibold text-green-300 flex-shrink-0">Clip {idx + 1}</span>
                                <span className="flex-1 min-w-0 font-mono text-gray-600 truncate text-[9px]">{url.split('/').pop()}</span>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    onClick={() => setGalleryData({ items: [{ url, type: 'video' }], tenantId: job.tenantId })}
                                    className="flex items-center gap-0.5 text-[9px] text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded px-1.5 py-px transition-colors"
                                    title="Anteprima clip"
                                  >
                                    <Eye size={9} /> Anteprima
                                  </button>
                                  {url.startsWith('/uploads/') ? (
                                    <a
                                      href={url}
                                      download
                                      className="flex items-center gap-0.5 text-[9px] text-gray-400 hover:text-gray-300 bg-gray-700/40 hover:bg-gray-700/60 border border-gray-600/40 rounded px-1.5 py-px transition-colors"
                                      title="Scarica clip"
                                    >
                                      <Download size={9} /> Scarica
                                    </a>
                                  ) : (
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-0.5 text-[9px] text-gray-400 hover:text-gray-300 bg-gray-700/40 hover:bg-gray-700/60 border border-gray-600/40 rounded px-1.5 py-px transition-colors"
                                      title="Apri clip"
                                    >
                                      <ExternalLink size={9} /> Apri
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          {stitchingResult?.stitchingError && (
                            <p className="text-[9px] text-orange-400">⚠️ Errore stitching: {stitchingResult.stitchingError}</p>
                          )}
                        </div>
                      );
                    })()}

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 text-xs">
                      {/* Priorità */}
                      <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2.5 py-1.5">
                        <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Priorità</div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{job.priority}</span>
                          <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-green-500 to-red-500" style={{ width: `${job.priority}%` }} />
                          </div>
                        </div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2.5 py-1.5">
                        <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">ID Job</div>
                        <div className="font-mono text-gray-500 dark:text-gray-500 text-[10px] truncate">{job.id}</div>
                      </div>
                      {job.relatedPostId && (
                        <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2.5 py-1.5">
                          <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Post ID</div>
                          <div className="font-mono text-gray-500 dark:text-gray-500 text-[10px] truncate">{job.relatedPostId}</div>
                        </div>
                      )}
                      <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2.5 py-1.5">
                        <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Creato</div>
                        <div className="text-gray-600 dark:text-gray-400 text-[11px]">{formatDateTime(job.createdAt)}</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2.5 py-1.5">
                        <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Aggiornato</div>
                        <div className="text-gray-600 dark:text-gray-400 text-[11px]">{formatDateTime(job.updatedAt)}</div>
                      </div>

                      {/* ── Parametri generazione (lingua, formato, durata) — sempre visibili ── */}
                      {(() => {
                        const LANG_FLAGS: Record<string, string> = {
                          it: '🇮🇹', en: '🇬🇧', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪',
                          pt: '🇵🇹', nl: '🇳🇱', pl: '🇵🇱', ru: '🇷🇺', zh: '🇨🇳', ja: '🇯🇵',
                        };
                        const LANG_LABELS: Record<string, string> = {
                          it: 'Italiano', en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch',
                          pt: 'Português', nl: 'Nederlands', pl: 'Polski', ru: 'Русский', zh: '中文', ja: '日本語',
                        };
                        const langCode = (payload.language as string) ?? 'it';
                        const langFlag = LANG_FLAGS[langCode] ?? '🌐';
                        const langLabel = LANG_LABELS[langCode] ?? langCode;
                        const ar = (payload.videoAspectRatio ?? payload.aspectRatio) as string | undefined;
                        const dur = payload.duration as number | undefined;
                        return (
                          <>
                            {langCode && (
                              <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2.5 py-1.5">
                                <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Lingua</div>
                                <div className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                                  <span>{langFlag}</span>
                                  <span className="text-[11px]">{langLabel}</span>
                                </div>
                              </div>
                            )}
                            {job.type === 'VIDEO' && ar && (
                              <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2.5 py-1.5">
                                <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Formato</div>
                                <div className="text-gray-700 dark:text-gray-300 text-[11px]">
                                  {ar === '16:9' ? '📺 16:9' : ar === '9:16' ? '📱 9:16' : ar}
                                </div>
                              </div>
                            )}
                            {job.type === 'VIDEO' && dur !== undefined && (
                              <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2.5 py-1.5">
                                <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Durata</div>
                                <div className="text-gray-700 dark:text-gray-300 text-[11px]">{dur}s</div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                      {job.nextRetryAt && (
                        <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg px-2.5 py-1.5">
                          <div className="text-[9px] text-orange-400/80 uppercase tracking-wider mb-0.5">Prossimo retry</div>
                          <div className="flex items-center gap-2">
                            <span className="text-orange-400 text-[11px]">{formatRelativeTime(job.nextRetryAt)}</span>
                            {job.status === 'PENDING' && new Date(job.nextRetryAt) > new Date() && (
                              <button
                                onClick={() => doAction('forceRetry', job.id)}
                                className="flex items-center gap-1 text-[10px] text-brand-400 hover:text-brand-300 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 rounded px-1.5 py-px transition-colors"
                                title="Forza il retry immediatamente"
                              >
                                <FastForward size={9} />
                                Forza ora
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      {isMaster && job.tenant && (
                        <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2.5 py-1.5">
                          <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Tenant</div>
                          <div className="text-brand-400 text-[11px]">{job.tenant.name} <span className="text-gray-500">({job.tenant.slug})</span></div>
                        </div>
                      )}
                      {/* Modello AI usato per questo job */}
                      {(job.type === 'IMAGE' || job.type === 'VIDEO' || job.type === 'TEXT') && (
                        <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2.5 py-1.5">
                          <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">
                            {job.type === 'IMAGE' ? 'Modello Immagini' : job.type === 'VIDEO' ? 'Modello Video' : 'Modello Testo'}
                          </div>
                          {effectiveModel ? (
                            <div className="space-y-1">
                              <div className="font-mono text-[10px] text-yellow-700 dark:text-yellow-200 bg-yellow-500/10 rounded px-1.5 py-0.5 inline-block border border-yellow-500/20">
                                {effectiveModel}
                              </div>
                              {modelCost !== undefined && (
                                <div className="flex items-center gap-1.5">
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-px rounded border text-[10px] font-semibold ${costBadgeClass(modelCost)}`}>
                                    {modelCost}×
                                  </span>
                                  <div className="flex gap-px">
                                    {Array.from({ length: 6 }).map((_, i) => {
                                      const filled = Math.max(1, Math.round((modelCost / MAX_COST) * 6));
                                      return <div key={i} className={`w-2 h-2 rounded-sm ${i < filled ? costBadgeClass(modelCost).split(' ')[0] : 'bg-gray-200 dark:bg-gray-800'}`} />;
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <Link href="/ai-providers" className="text-[10px] text-orange-400 hover:text-orange-300 flex items-center gap-1">
                              ⚠️ Non configurato
                            </Link>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── Formato video (aspect ratio) — visibile anche dopo completamento ── */}
                     {job.type === 'VIDEO' && job.status !== 'CANCELLED' && (() => {
                       const readOnly = job.status === 'COMPLETED';
                       const currentAR: string = payload.videoAspectRatio ?? payload.aspectRatio ?? '16:9';
                      const isInvalidAR = currentAR !== '16:9' && currentAR !== '9:16';
                      // Controlla se c'è un errore di aspect ratio attivo
                      const hasARError = !!job.errorMessage && (
                        job.errorMessage.toLowerCase().includes('aspectratio') ||
                        job.errorMessage.toLowerCase().includes('aspect ratio') ||
                        job.errorMessage.toLowerCase().includes('aspect_ratio')
                      );
                      // Controlla se c'è un errore di durata attivo
                      const hasDurationError = !!job.errorMessage && (
                        job.errorMessage.toLowerCase().includes('durationseconds') ||
                        (job.errorMessage.toLowerCase().includes('duration') && job.errorMessage.toLowerCase().includes('out of bound'))
                      );

                      const VEO_RATIOS = [
                        { value: '16:9', icon: '📺', label: 'Orizzontale 16:9', desc: 'Landscape — feed, YouTube' },
                        { value: '9:16', icon: '📱', label: 'Verticale 9:16',   desc: 'Portrait — Story, Reel' },
                      ] as const;

                      // Durata: supporta 5-60s con stitching
                      const currentDuration: number = typeof payload.duration === 'number'
                        ? payload.duration : (parseInt(String(payload.duration ?? '5'), 10) || 5);
                      const videoModelForDuration: string = payload.videoModel ?? providersByTenant[job.tenantId]?.videoModel ?? '';
                      // Range per singola clip (4-8 o 5-8 a seconda del modello) — usato solo per info
                      const durationOptions: number[] = videoModelForDuration.toLowerCase().includes('veo-3') ||
                        videoModelForDuration.toLowerCase().includes('veo-2')
                        ? [5, 6, 7, 8]
                        : [4, 5, 6, 7, 8];

                      const applyAspectRatio = async (value: string) => {
                        const res = await fetch('/api/generation-queue', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'updatePayload', jobId: job.id, payloadPatch: { videoAspectRatio: value } }),
                        });
                        const json = await res.json();
                        if (json.success) {
                          toast.success(`✅ Formato ${value} applicato — avvio generazione...`);
                          fetch('/api/scheduler/init', { method: 'POST' }).catch(() => {});
                          setTimeout(() => fetchQueue(true), 1500);
                        } else {
                          toast.error(json.error ?? 'Errore aggiornamento');
                        }
                      };

                      const applyDuration = async (value: number) => {
                        // Pulisce _stitching dal payload per forzare un nuovo calcolo delle clip
                        // Necessario quando si cambia la durata (soprattutto da ≤8s a >8s o viceversa)
                        const res = await fetch('/api/generation-queue', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'updatePayload',
                            jobId: job.id,
                            payloadPatch: { duration: value, _stitching: null },
                            forceReset: true,
                          }),
                        });
                        const json = await res.json();
                        if (json.success) {
                          toast.success(value > 8
                            ? `✅ Durata ${value}s applicata — ${calcNumClips(value)} clip in sequenza (stitching automatico)`
                            : `✅ Durata ${value}s applicata — avvio generazione...`
                          );
                          fetch('/api/scheduler/init', { method: 'POST' }).catch(() => {});
                          setTimeout(() => fetchQueue(true), 1500);
                        } else {
                          toast.error(json.error ?? 'Errore aggiornamento');
                        }
                      };

                      return (
                        <div className="space-y-2">
                          {/* Sezione Aspect Ratio */}
                          <div className={`rounded-xl border p-3 space-y-2 ${hasARError || isInvalidAR ? 'border-orange-500/30 bg-orange-500/5' : 'border-violet-500/15 bg-violet-500/5'}`}>
                            {/* Header */}
                            <div className="flex items-center justify-between">
                              <div className={`text-[10px] uppercase tracking-wide font-semibold flex items-center gap-1.5 ${hasARError || isInvalidAR ? 'text-orange-400' : 'text-violet-400'}`}>
                                📐 Formato video
                                {(hasARError || isInvalidAR) && (
                                  <span className="text-[9px] bg-orange-500/15 border border-orange-500/30 text-orange-300 rounded px-1.5 py-px font-normal normal-case">
                                    ⚠️ formato non valido — cambialo per procedere
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] text-gray-600">Solo 16:9 e 9:16 supportati da Veo</span>
                            </div>

                            {/* Pulsanti di selezione format */}
                            <div className="flex gap-2">
                              {VEO_RATIOS.map(({ value, icon, label, desc }) => {
                                const isActive = currentAR === value;
                                return (
                                   <button
                                     key={value}
                                     onClick={() => { if (!isActive && !readOnly) applyAspectRatio(value); }}
                                     disabled={readOnly && !isActive}
                                     title={readOnly ? `${label}${isActive ? ' — formato usato' : ''}` : isActive ? `${label} — formato attuale` : `Imposta formato ${label} e rimetti in coda`}
                                     className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all ${
                                       isActive
                                         ? 'border-violet-500/50 bg-violet-500/15 text-violet-300 cursor-default'
                                         : readOnly
                                           ? 'border-gray-700/40 text-gray-600 bg-gray-800/20 cursor-default opacity-40'
                                           : (hasARError || isInvalidAR)
                                             ? 'border-orange-500/30 text-orange-300 bg-orange-500/8 hover:bg-orange-500/15 hover:border-orange-500/50 cursor-pointer'
                                             : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-violet-500/30 hover:text-violet-300 hover:bg-violet-500/8 cursor-pointer'
                                     }`}
                                   >
                                    <span className="text-base">{icon}</span>
                                    <div className="text-left min-w-0 flex-1">
                                      <div className="font-medium text-[11px]">{label}</div>
                                      <div className="text-[9px] opacity-60">{desc}</div>
                                    </div>
                                    {isActive
                                      ? <span className="ml-auto text-[9px] bg-violet-500/20 border border-violet-500/30 text-violet-300 rounded px-1 py-px flex-shrink-0">attivo</span>
                                      : <span className="ml-auto text-[9px] text-gray-600 hover:text-violet-400 flex-shrink-0">
                                          {(hasARError || isInvalidAR) ? 'Applica + Riprova →' : 'Seleziona →'}
                                        </span>
                                    }
                                  </button>
                                );
                              })}
                            </div>

                            {/* Avviso formato non valido */}
                            {isInvalidAR && !hasARError && (
                              <p className="text-[10px] text-orange-400">
                                ⚠️ Formato &quot;{currentAR}&quot; non supportato — seleziona 16:9 o 9:16 sopra.
                              </p>
                            )}
                          </div>

                          {/* Sezione Durata — slider 5-60s con info stitching */}
                          <div className={`rounded-xl border p-3 space-y-2 ${hasDurationError ? 'border-orange-500/30 bg-orange-500/5' : 'border-violet-500/15 bg-violet-500/5'}`}>
                            <div className="flex items-center justify-between">
                              <div className={`text-[10px] uppercase tracking-wide font-semibold flex items-center gap-1.5 ${hasDurationError ? 'text-orange-400' : 'text-violet-400'}`}>
                                ⏱ Durata video
                                {hasDurationError && (
                                  <span className="text-[9px] bg-orange-500/15 border border-orange-500/30 text-orange-300 rounded px-1.5 py-px font-normal normal-case">
                                    ⚠️ durata non valida — cambiala per procedere
                                  </span>
                                )}
                                {currentDuration > 8 && !hasDurationError && (
                                  <span className="text-[9px] bg-violet-500/15 border border-violet-500/30 text-violet-300 rounded px-1.5 py-px font-normal normal-case">
                                    🎬 {calcNumClips(currentDuration)} clip in sequenza
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] text-gray-600">
                                5–60s · clip Veo: {durationOptions[0]}-{durationOptions[durationOptions.length - 1]}s
                              </span>
                            </div>
                            {/* Slider + valore */}
                            <div className="space-y-1">
                              <div className="flex items-center gap-3">
                               <input
                                   type="range"
                                   min={5}
                                   max={60}
                                   step={1}
                                   defaultValue={currentDuration}
                                   onChange={(e) => { if (!readOnly) applyDuration(Number(e.target.value)); }}
                                   disabled={readOnly}
                                   className={`flex-1 ${hasDurationError ? 'accent-orange-500' : 'accent-violet-500'} ${readOnly ? 'opacity-40 cursor-default' : ''}`}
                                 />
                                <span className={`w-14 text-center text-xs font-bold rounded-lg px-2 py-1 flex-shrink-0 border ${
                                  hasDurationError
                                    ? 'text-orange-300 bg-orange-500/10 border-orange-500/30'
                                    : 'text-violet-300 bg-violet-500/10 border-violet-500/20'
                                }`}>
                                  {currentDuration}s
                                </span>
                              </div>
                              <div className="flex justify-between text-[9px] text-gray-600 px-0.5">
                                <span>5s</span>
                                <span className={`${currentDuration > 8 ? 'text-violet-400/70' : 'text-gray-600'}`}>
                                  {currentDuration > 8
                                    ? `${calcNumClips(currentDuration)} clip da 5-8s`
                                    : 'singola clip'
                                  }
                                </span>
                                <span>60s</span>
                              </div>
                            </div>
                            {hasDurationError && (
                              <p className="text-[10px] text-orange-400">
                                ⚠️ La clip Veo accetta {durationOptions[0]}-{durationOptions[durationOptions.length - 1]}s per singola clip. Per durate superiori a {durationOptions[durationOptions.length - 1]}s viene usato lo stitching multi-clip automatico — imposta la durata desiderata (5-60s) e riprova.
                              </p>
                            )}

                            {/* ── Sub-clip stitching progress ───────────────── */}
                            {(() => {
                              const stitching = payload._stitching as {
                                totalDuration: number;
                                currentClipIndex: number;
                                clipPrompts?: string[];
                                clips: Array<{
                                  index: number;
                                  duration: number;
                                  status: string;
                                  videoUrl?: string;
                                  operationName?: string;
                                  errorMessage?: string;
                                }>;
                              } | undefined;
                              if (!stitching || stitching.clips.length <= 1) return null;

                              const CLIP_STATUS_META: Record<string, { color: string; dot: string; label: string; bg: string }> = {
                                PENDING:    { color: 'text-gray-400 border-gray-600/50',         dot: 'bg-gray-500',                     label: 'In attesa',        bg: 'bg-gray-800/30' },
                                PROCESSING: { color: 'text-yellow-300 border-yellow-500/40',     dot: 'bg-yellow-400 animate-pulse',     label: 'In generazione…',  bg: 'bg-yellow-500/5' },
                                COMPLETED:  { color: 'text-green-300 border-green-500/30',       dot: 'bg-green-400',                    label: 'Completata',       bg: 'bg-green-500/5' },
                                FAILED:     { color: 'text-red-300 border-red-500/40',           dot: 'bg-red-400',                      label: 'Fallita',          bg: 'bg-red-500/8' },
                              };

                              const retryClip = async (clipIndex: number) => {
                                const res = await fetch('/api/generation-queue', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'retryClip', jobId: job.id, clipIndex }),
                                });
                                const json = await res.json();
                                if (json.success) {
                                  toast.success(json.message ?? `Clip ${clipIndex + 1} rimessa in coda`);
                                  fetch('/api/scheduler/init', { method: 'POST' }).catch(() => {});
                                  setTimeout(() => fetchQueue(true), 1000);
                                } else {
                                  toast.error(json.error ?? 'Errore retry clip');
                                }
                              };

                              const hasFailedClip = stitching.clips.some(c => c.status === 'FAILED');

                              return (
                                <div className="mt-2 space-y-1.5 pt-2 border-t border-violet-500/10">
                                    {/* Header */}
                                   <div className="flex items-center gap-2 flex-wrap">
                                     <div className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                                       🎬 {job.status === 'COMPLETED' ? 'Clip generate' : 'Clip in generazione'}
                                       <span className="text-[9px] font-normal text-gray-500 normal-case">
                                         ({stitching.clips.filter(c => c.status === 'COMPLETED').length}/{stitching.clips.length} completate)
                                       </span>
                                     </div>
                                    {/* Retry globale se ci sono clip fallite e il job non è già PENDING/PROCESSING */}
                                    {hasFailedClip && job.status === 'FAILED' && (() => {
                                      const firstFailed = stitching.clips.find(c => c.status === 'FAILED');
                                      if (!firstFailed) return null;
                                      return (
                                        <button
                                          onClick={() => retryClip(firstFailed.index)}
                                          className="ml-auto flex items-center gap-1 text-[9px] text-yellow-400 hover:text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/25 rounded px-2 py-0.5 transition-colors"
                                          title={`Riprova da clip ${firstFailed.index + 1}`}
                                        >
                                          <RotateCcw size={9} />
                                          Riprova da clip {firstFailed.index + 1}
                                        </button>
                                      );
                                    })()}
                                  </div>

                                  {/* Lista clip */}
                                  <div className="space-y-1">
                                    {stitching.clips.map((clip) => {
                                      const m = CLIP_STATUS_META[clip.status] ?? CLIP_STATUS_META.PENDING;
                                      const isActive = clip.index === stitching.currentClipIndex && clip.status === 'PROCESSING';
                                      return (
                                        <div key={clip.index} className={`rounded-lg border text-[10px] ${m.color} ${m.bg} overflow-hidden`}>
                                          {/* Riga principale clip */}
                                          <div className="flex items-center gap-2 px-2.5 py-1.5">
                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${m.dot}`} />
                                            <span className="font-semibold flex-shrink-0">Clip {clip.index + 1}</span>
                                            <span className="text-gray-500 flex-shrink-0">{clip.duration}s</span>
                                            <span className="flex-1 min-w-0 truncate opacity-80">{m.label}</span>

                                            {/* Badge "Veo attiva" */}
                                            {isActive && (
                                              <span className="text-[8px] text-yellow-400/70 bg-yellow-500/10 rounded px-1.5 py-px flex-shrink-0 border border-yellow-500/20 animate-pulse">
                                                ⚡ Veo in esecuzione
                                              </span>
                                            )}

                                            {/* Azioni per clip COMPLETED */}
                                            {clip.status === 'COMPLETED' && clip.videoUrl && (
                                              <div className="flex items-center gap-1 flex-shrink-0">
                                                <button
                                                  onClick={() => setGalleryData({ items: [{ url: clip.videoUrl!, type: 'video' }], tenantId: job.tenantId })}
                                                  className="flex items-center gap-0.5 text-[9px] text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded px-1.5 py-px transition-colors"
                                                  title="Anteprima clip"
                                                >
                                                  <Eye size={9} /> Anteprima
                                                </button>
                                                {clip.videoUrl.startsWith('/uploads/') ? (
                                                  <a
                                                    href={clip.videoUrl}
                                                    download
                                                    className="flex items-center gap-0.5 text-[9px] text-gray-400 hover:text-gray-300 bg-gray-700/40 hover:bg-gray-700/60 border border-gray-600/40 rounded px-1.5 py-px transition-colors"
                                                    title="Scarica clip"
                                                  >
                                                    <Download size={9} /> Scarica
                                                  </a>
                                                ) : (
                                                  <a
                                                    href={clip.videoUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-0.5 text-[9px] text-gray-400 hover:text-gray-300 bg-gray-700/40 hover:bg-gray-700/60 border border-gray-600/40 rounded px-1.5 py-px transition-colors"
                                                    title="Apri clip (URL esterno)"
                                                  >
                                                    <ExternalLink size={9} /> Apri
                                                  </a>
                                                )}
                                              </div>
                                            )}

                                            {/* Azioni per clip FAILED */}
                                            {clip.status === 'FAILED' && (job.status === 'FAILED' || job.status === 'PENDING') && (
                                              <button
                                                onClick={() => retryClip(clip.index)}
                                                className="flex items-center gap-0.5 text-[9px] text-yellow-400 hover:text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/25 rounded px-1.5 py-px transition-colors flex-shrink-0"
                                                title={`Riprova dalla clip ${clip.index + 1}`}
                                              >
                                                <RotateCcw size={9} /> Riprova
                                              </button>
                                            )}
                                          </div>

                                          {/* Errore clip — visibile solo per FAILED */}
                                          {clip.status === 'FAILED' && clip.errorMessage && (
                                            <div className="flex items-start gap-1.5 px-2.5 pb-1.5 pt-0">
                                              <AlertTriangle size={9} className="text-red-400 flex-shrink-0 mt-0.5" />
                                              <p className="text-[9px] text-red-300/80 leading-relaxed line-clamp-3">
                                                {clip.errorMessage}
                                              </p>
                                            </div>
                                          )}

                                          {/* Dettagli extra per clip PROCESSING — operazione Veo + info prompt ── */}
                                         {clip.status === 'PROCESSING' && (
                                           <div className="px-2.5 pb-1.5 pt-0 space-y-1">
                                             {/* Prompt visivo della clip */}
                                             {stitching.clipPrompts?.[clip.index] && (
                                               <div className="flex items-start gap-1.5">
                                                 <span className="text-[8px] text-gray-600 uppercase tracking-wider flex-shrink-0 mt-0.5">Prompt</span>
                                                 <span className="text-[8px] text-gray-400 italic line-clamp-2">
                                                   {stitching.clipPrompts[clip.index]}
                                                 </span>
                                               </div>
                                             )}
                                             {/* Operazione ID */}
                                             {clip.operationName && (
                                               <div className="flex items-center gap-1.5">
                                                 <span className="text-[8px] text-gray-600 uppercase tracking-wider flex-shrink-0">Op. ID</span>
                                                 <span className="font-mono text-[8px] text-yellow-700/80 dark:text-yellow-300/60 truncate">
                                                   …{clip.operationName.slice(-28)}
                                                 </span>
                                               </div>
                                             )}
                                             {/* Modello */}
                                             <div className="flex items-center gap-1.5">
                                               <span className="text-[8px] text-gray-600 uppercase tracking-wider flex-shrink-0">Modello</span>
                                               <span className="font-mono text-[8px] text-violet-400/70">
                                                 {(payload.videoModel as string | undefined) ?? providersByTenant[job.tenantId]?.videoModel ?? 'N/D'}
                                               </span>
                                             </div>
                                             {/* Progress clip */}
                                             <div className="flex items-center gap-1.5">
                                               <span className="text-[8px] text-gray-600 uppercase tracking-wider flex-shrink-0">Avanzamento</span>
                                               <span className="text-[8px] text-violet-400/70">
                                                 Clip {clip.index + 1} di {stitching.clips.length} · {clip.duration}s
                                               </span>
                                             </div>
                                             {/* Status spinner */}
                                             <div className="flex items-center gap-1.5 text-[8px] text-yellow-500/60">
                                               <RefreshCw size={7} className="animate-spin flex-shrink-0" />
                                               <span>In attesa risposta Google Veo — potrebbe richiedere 1-5 minuti per clip</span>
                                             </div>
                                           </div>
                                         )}
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Nota sequenziale */}
                                  {job.status !== 'COMPLETED' && (job.status === 'PROCESSING' || job.status === 'PENDING') && (
                                    <p className="text-[9px] text-gray-600 pt-0.5">
                                      Ogni clip viene generata sequenzialmente — l&apos;ultimo frame di ogni clip diventa il primo della successiva per garantire continuità visiva.
                                    </p>
                                   )}
                                 </div>
                               );
                              })()}
                            </div>

                          {/* ── Selettore modello Video — visibile per tutti i job non cancellati ── */}
                          {(() => {
                           const currentVideoModel: string = (payload.videoModel as string | undefined) ?? providersByTenant[job.tenantId]?.videoModel ?? '';
                           const VEO_MODELS = [
                             { id: 'veo-2.0-generate-001',         label: 'Veo 2', desc: 'Stabile ✅', cost: 8 },
                             { id: 'veo-3.0-generate-preview',     label: 'Veo 3 Preview', desc: 'Alta qualità ✅', cost: 13 },
                             { id: 'veo-3.0-generate-001',         label: 'Veo 3', desc: 'Stabile ✅ ⭐', cost: 13 },
                             { id: 'veo-3.0-fast-generate-001',    label: 'Veo 3 Fast', desc: 'Veloce ✅', cost: 10 },
                             { id: 'veo-3.1-generate-preview',     label: 'Veo 3.1', desc: '⚠️ Vertex AI', cost: 15 },
                             { id: 'veo-3.1-fast-generate-preview',label: 'Veo 3.1 Fast', desc: '⚠️ Vertex AI', cost: 12 },
                             { id: 'veo-3.1-lite-generate-preview',label: 'Veo 3.1 Lite', desc: '⚠️ Vertex AI', cost: 9 },
                           ];

                           const applyJobVideoModel = async (modelId: string) => {
                             const res = await fetch('/api/generation-queue', {
                               method: 'POST',
                               headers: { 'Content-Type': 'application/json' },
                               body: JSON.stringify({
                                 action: 'updatePayload',
                                 jobId: job.id,
                                 payloadPatch: { videoModel: modelId },
                               }),
                             });
                             const json = await res.json();
                             if (json.success) {
                               toast.success(`✅ Modello ${modelId} impostato per questo job`);
                               setTimeout(() => fetchQueue(true), 800);
                             } else {
                               toast.error(json.error ?? 'Errore aggiornamento modello');
                             }
                           };

                           return (
                             <div className="rounded-xl border border-violet-500/15 bg-violet-500/5 p-3 space-y-2">
                               <div className="flex items-center justify-between">
                                 <div className="text-[10px] uppercase tracking-wide font-semibold text-violet-400 flex items-center gap-1.5">
                                   🎬 Modello Video
                                   {readOnly && <span className="text-[9px] bg-gray-700/40 border border-gray-600/30 text-gray-500 rounded px-1.5 py-px font-normal normal-case">completato — sola lettura</span>}
                                 </div>
                                 <span className="text-[9px] text-gray-600">{readOnly ? 'Modello usato per questo video' : 'Solo per questa esecuzione — non modifica le impostazioni globali'}</span>
                               </div>
                               <div className="flex gap-1.5 flex-wrap">
                                 {VEO_MODELS.map(m => {
                                   const isActive = currentVideoModel === m.id;
                                   const cost = MODEL_COST[m.id] ?? m.cost;
                                   return (
                                     <button
                                       key={m.id}
                                       onClick={() => { if (!isActive && !readOnly) applyJobVideoModel(m.id); }}
                                       disabled={readOnly && !isActive}
                                       title={readOnly ? (isActive ? `${m.label} — modello usato` : m.label) : (isActive ? `${m.label} — modello attuale` : `Usa ${m.label} per questo job`)}
                                       className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] transition-all ${
                                         isActive
                                           ? 'border-violet-500/50 bg-violet-500/20 text-violet-200 cursor-default font-semibold'
                                           : readOnly
                                             ? 'border-gray-800/50 text-gray-700 cursor-default opacity-30'
                                             : 'border-gray-700/50 text-gray-500 hover:border-violet-500/30 hover:text-violet-300 hover:bg-violet-500/8 cursor-pointer'
                                       }`}
                                     >
                                       <span className="font-mono">{m.label}</span>
                                       <span className={`text-[9px] px-1 py-px rounded border font-bold ${costBadgeClass(cost)}`}>{cost}×</span>
                                       {isActive && <span className="text-[8px] opacity-60">attivo</span>}
                                     </button>
                                   );
                                 })}
                               </div>
                               {currentVideoModel && (
                                 <div className="flex items-center gap-2 text-[9px] text-gray-500">
                                   <span className="font-mono text-yellow-700 dark:text-yellow-200 bg-yellow-500/10 rounded px-1.5 py-0.5 border border-yellow-500/20">
                                     {currentVideoModel}
                                   </span>
                                   {MODEL_LABELS[currentVideoModel] && (
                                     <span className="truncate">{MODEL_LABELS[currentVideoModel].split(' — ')[1] ?? ''}</span>
                                   )}
                                 </div>
                               )}
                             </div>
                           );
                         })()}

                       </div>
                       );
                     })()}

                     {/* Errore — pannello intelligente */}
                    {job.errorMessage && (() => {
                      const err = job.errorMessage;
                      const isModelError = err.includes('Provider AI') || err.includes('modello') || err.includes('quota') || err.includes('free tier') || err.includes('imagen-4') || err.includes('gemini-');
                      const isModelNotFound = err.includes('non esiste') || err.includes('non trovato') || err.includes('controlla il nome');
                      const isTimeout = err.toLowerCase().includes('timeout') || err.toLowerCase().includes('aborted') || err.toLowerCase().includes('abortato');
                      const modelMatch = err.match(/"([a-z0-9][-a-z0-9.]*(?:image|imagen|flash|generate|preview|veo)[a-z0-9.-]*)"/i);
                      const modelName = modelMatch?.[1];
                      const isDiscovering = modelDiscovery?.jobId === job.id && modelDiscovery.loading;
                      const discoveryResult = modelDiscovery?.jobId === job.id && !modelDiscovery.loading ? modelDiscovery : null;
                      const hasFutureRetry = job.nextRetryAt && new Date(job.nextRetryAt) > new Date();

                      return (
                        <div className="space-y-2">
                          {/* Banner timeout con retry prominente */}
                          {isTimeout && hasFutureRetry && (
                            <div className="flex items-center gap-3 rounded-lg px-3 py-2 border border-blue-500/30 bg-blue-500/8 text-blue-300">
                              <Clock size={13} className="flex-shrink-0" />
                              <span className="flex-1 text-xs">L&apos;API Google ha impiegato troppo tempo. Puoi forzare il retry ora o aspettare {formatRelativeTime(job.nextRetryAt!)}.</span>
                              <button
                                onClick={() => doAction('forceRetry', job.id)}
                                className="flex items-center gap-1.5 text-xs bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 rounded px-2.5 py-1 flex-shrink-0 transition-colors"
                              >
                                <FastForward size={11} /> Riprova ora
                              </button>
                            </div>
                          )}
                          {/* Messaggio errore */}
                          <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2.5 border ${isModelNotFound ? 'text-red-300 bg-red-500/10 border-red-500/30' : isTimeout ? 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700' : 'text-orange-300 bg-orange-500/8 border-orange-500/20'}`}>
                            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              {modelName && (
                                <div className="font-mono text-[10px] bg-gray-100 dark:bg-gray-900 rounded px-1.5 py-0.5 inline-block mb-1.5 text-yellow-700 dark:text-yellow-300 border border-yellow-500/20">
                                  modello configurato: {modelName}
                                </div>
                              )}
                              <p className="leading-relaxed">{err}</p>
                            </div>
                          </div>

                          {/* Azioni contestuali */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Pulsante scopri modelli — visibile quando c'è errore di modello */}
                            {(isModelError || isModelNotFound) && (job.type === 'IMAGE' || job.type === 'VIDEO') && (
                              <button
                                onClick={() => discoverModels(job.id, job.tenantId)}
                                disabled={isDiscovering}
                                className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60"
                              >
                                {isDiscovering ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
                                {isDiscovering ? 'Carico modelli...' : job.type === 'VIDEO' ? '🎬 Scopri modelli Veo disponibili' : '🔬 Scopri modelli disponibili'}
                              </button>
                            )}
                            {isModelError && (
                              <Link
                                href="/ai-providers"
                                className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg px-3 py-1.5 transition-colors"
                              >
                                <Settings size={12} />
                                Provider AI
                                <ExternalLink size={10} />
                              </Link>
                            )}
                            {job.status === 'FAILED' && (
                              <button
                                onClick={() => doAction('retry', job.id)}
                                className="flex items-center gap-1.5 text-xs text-yellow-400 hover:text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 rounded-lg px-3 py-1.5 transition-colors"
                              >
                                <RotateCcw size={12} />
                                Riprova
                              </button>
                            )}
                          </div>

                          {/* Pannello scoperta modelli */}
                          {discoveryResult && (
                            <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-3 space-y-2">
                              <div className="text-xs font-semibold text-teal-300 flex items-center gap-1.5">
                                <Search size={12} />
                                Modelli disponibili con la tua API key — clicca per applicare
                              </div>
                              {discoveryResult.error ? (
                                <div className="text-xs text-red-300">{discoveryResult.error}</div>
                              ) : discoveryResult.models.length === 0 ? (
                                <div className="text-xs text-yellow-300">
                                  ⚠️ Nessun modello per generazione immagini trovato. Verifica la chiave API Google in Provider AI.
                                </div>
                              ) : (
                                <div className="grid gap-1">
                                  {([
                                    { cat: 'gemini-image' as const, label: '🎨 Gemini Image', color: 'text-teal-400' },
                                    { cat: 'imagen' as const,       label: '🖼️ Imagen',        color: 'text-blue-400' },
                                    { cat: 'video' as const,        label: '🎬 Video (Veo)',   color: 'text-violet-400' },
                                    { cat: 'other' as const,        label: '🔧 Altri',         color: 'text-gray-400' },
                                  ]).map(({ cat, label, color }) => {
                                    const catModels = discoveryResult.models.filter(m => m.category === cat);
                                    if (!catModels.length) return null;
                                    return (
                                      <div key={cat}>
                                        <div className={`text-[10px] uppercase tracking-wider mb-1 font-semibold ${color}`}>{label}</div>
                                        {catModels.map(m => {
                                          const friendlyLabel = MODEL_LABELS[m.name];
                                          return (
                                            <button
                                              key={m.name}
                                              onClick={() => applyModel(job.tenantId, m.name, m.category === 'video' ? 'videoModel' : 'imageModel')}
                                              className="w-full text-left flex items-start gap-2 justify-between font-mono text-[11px] px-2.5 py-1.5 rounded bg-gray-100 dark:bg-gray-800 hover:bg-teal-500/20 hover:text-teal-200 text-gray-700 dark:text-gray-300 transition-colors border border-transparent hover:border-teal-500/30 mb-0.5"
                                            >
                                              <div className="flex-1 min-w-0">
                                                <div className="text-white/80">{m.name}</div>
                                         {friendlyLabel && <div className="text-[10px] text-gray-500 dark:text-gray-500 mt-0.5 font-sans">{friendlyLabel}</div>}
                                              </div>
                                              <span className="text-[10px] text-gray-500 hover:text-teal-400 whitespace-nowrap flex-shrink-0 mt-0.5">Applica →</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              <button onClick={() => setModelDiscovery(null)} className="text-[10px] text-gray-600 hover:text-gray-400">✕ Chiudi</button>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* ── Storyboard REEL (se presente nel payload) ─────────── */}
                    {(() => {
                      const sb = payload._storyboard as {
                        hook?: string; totalDuration?: string; music?: string; cta?: string;
                        scenes?: Array<{ scene: number; duration: string; visual: string; script: string; onScreenText?: string; transition?: string }>;
                      } | undefined;
                      if (!sb || (!sb.hook && !sb.scenes?.length)) return null;
                      return (
                        <div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-600 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                            🎬 Storyboard Reel
                            {sb.scenes?.length ? <span className="text-[9px] bg-teal-500/15 border border-teal-500/30 text-teal-400 rounded px-1.5 py-0.5">{sb.scenes.length} scene</span> : null}
                            {sb.totalDuration ? <span className="text-[9px] text-gray-600">· {sb.totalDuration}</span> : null}
                          </div>
                          <div className="space-y-1.5">
                            {sb.hook && (
                              <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-2.5 py-1.5">
                                <p className="text-[9px] font-bold text-yellow-400 uppercase tracking-widest mb-0.5">🎣 Hook</p>
                                <p className="text-[10px] text-white">{sb.hook}</p>
                              </div>
                            )}
                            {sb.scenes && sb.scenes.map((s, i) => (
                              <div key={i} className="rounded-lg bg-gray-900/60 border border-gray-700/60 px-2.5 py-1.5 space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-bold text-brand-400 uppercase">Scena {s.scene}</span>
                                  <span className="text-[9px] text-gray-500 bg-gray-700 px-1 py-px rounded">{s.duration}</span>
                                  {s.transition && <span className="text-[9px] text-gray-600 italic ml-auto">→ {s.transition}</span>}
                                </div>
                                {s.visual && <p className="text-[9px] text-gray-400">📷 {s.visual.slice(0, 120)}{s.visual.length > 120 ? '…' : ''}</p>}
                                {s.script && <p className="text-[9px] text-gray-300">🎙 {s.script.slice(0, 120)}{s.script.length > 120 ? '…' : ''}</p>}
                                {s.onScreenText && <p className="text-[9px] text-teal-300">📝 {s.onScreenText}</p>}
                              </div>
                            ))}
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {sb.music && (
                                <div className="text-[9px] text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded px-2 py-0.5">
                                  🎵 <span className="text-gray-500">Musica:</span> {sb.music}
                                </div>
                              )}
                              {sb.cta && (
                                <div className="text-[9px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5">
                                  📢 <span className="text-gray-500">CTA:</span> {sb.cta}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Media di Input (immagini di riferimento passate all'AI) ── */}
                    {Array.isArray(payload.inputMediaRefs) && payload.inputMediaRefs.length > 0 && (
                      <div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-600 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                          <ImageIcon size={11} className="text-brand-400" />
                          Media di Input / Riferimento AI
                          <span className="text-[9px] bg-brand-500/15 border border-brand-500/30 text-brand-400 rounded px-1.5 py-0.5">
                            {payload.inputMediaRefs.length} media
                          </span>
                        </div>
                        <MediaGalleryGrid
                          items={(payload.inputMediaRefs as Array<{ url: string; alt?: string; description?: string; mimeType?: string }>).map(ref => ({
                            url: ref.url,
                            mimeType: ref.mimeType,
                            alt: ref.alt,
                            description: ref.description,
                          }))}
                          tenantId={job.tenantId}
                          thumbSize={64}
                          className="mb-1.5"
                        />
                        {(payload.inputMediaRefs as Array<{ description?: string; alt?: string }>).some(r => r.description || r.alt) && (
                          <div className="text-[10px] text-gray-500 dark:text-gray-600 space-y-0.5">
                            {(payload.inputMediaRefs as Array<{ description?: string; alt?: string }>).map((r, i) =>
                              (r.description || r.alt) ? (
                                <div key={i}>
                                  <span className="text-gray-400 dark:text-gray-600">Rif. {i + 1}:</span> {r.description || r.alt}
                                </div>
                              ) : null
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Payload */}
                    {Object.keys(payload).length > 0 && (
                      <div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-600 uppercase tracking-wide mb-1">Payload</div>
                        <pre className="bg-gray-100 dark:bg-gray-900 rounded-lg px-3 py-2 text-[10px] text-gray-700 dark:text-gray-400 overflow-x-auto">
                          {JSON.stringify(
                            // Nasconde inputMediaRefs e _storyboard dal dump JSON (già mostrate sopra in forma visuale)
                            Object.fromEntries(Object.entries(payload as Record<string, unknown>).filter(([k]) => k !== 'inputMediaRefs' && k !== '_storyboard')),
                            null, 2
                          )}
                        </pre>
                      </div>
                    )}

                    {/* ── Sezione Dettagli Prompt Generazione ─────────────────────── */}
                    {(() => {
                      // 1. Prova result.promptInfo (job completato)
                      let resultData: Record<string, unknown> = {};
                      try { resultData = JSON.parse(job.result ?? '{}'); } catch { /* */ }
                      let pi = (resultData.promptInfo ?? null) as PromptInfo | null;

                      // 2. Fallback: payload._promptInfo (VIDEO job in elaborazione)
                      if (!pi && payload._promptInfo) {
                        pi = payload._promptInfo as PromptInfo;
                      }

                      // 3. Fallback finale: costruisci config dai campi del payload
                      //    (mostra sempre la sezione anche durante PENDING/PROCESSING)
                      if (!pi) {
                        const configFromPayload: Record<string, string | number | boolean | null | undefined> = {};
                        if (payload.platform)  configFromPayload.platform  = payload.platform as string;
                        if (payload.postType)  configFromPayload.postType  = payload.postType as string;
                        if (payload.language)  configFromPayload.language  = payload.language as string;
                        const ar = (payload.videoAspectRatio ?? payload.aspectRatio) as string | undefined;
                        if (ar) configFromPayload.aspectRatio = ar;
                        if (payload.duration !== undefined) configFromPayload.duration = payload.duration as number;
                        if (payload.topic)  configFromPayload.topic  = payload.topic as string;
                        if (payload.siteId) configFromPayload.siteId = payload.siteId as string;
                        pi = { globalRules: [], config: configFromPayload };
                      }

                      const hasGlobalRules = (pi.globalRules?.length ?? 0) > 0;
                      const hasConfig = pi.config && Object.keys(pi.config).length > 0;
                      const hasCodeRules = debugMode && (pi.codeRules?.length ?? 0) > 0;
                      const hasFullPrompt = debugMode && (pi.systemPrompt || pi.userPrompt || pi.finalImagePrompt || pi.finalVideoPrompt);

                      return (
                        <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-900/50 overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800/60 bg-gray-100 dark:bg-gray-900/80">
                            <FileText size={12} className="text-brand-400" />
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Dettagli Prompt Generazione</span>
                            {debugMode && (
                              <span className="ml-1 text-[9px] bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded px-1.5 py-0.5">DEBUG ON</span>
                            )}
                          </div>

                          <div className="p-3 space-y-3">

                            {/* 1. Regole Prompt Globali */}
                            <div>
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">🌐 Regole Applicate al Prompt</span>
                                <span className={`text-[9px] rounded-full px-1.5 py-0.5 ${hasGlobalRules ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>
                                  {pi.globalRules?.length ?? 0} {hasGlobalRules ? 'regole attive' : 'nessuna'}
                                </span>
                                {hasGlobalRules && (
                                  <span className="text-[9px] text-gray-500 dark:text-gray-600">globali + specifiche tenant · ordinate per priorità</span>
                                )}
                              </div>
                              {hasGlobalRules ? (
                                <ul className="space-y-1">
                                  {pi.globalRules!.map((rule, i) => (
                                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-700 dark:text-gray-300">
                                      <span className="text-blue-500/60 flex-shrink-0 mt-0.5">▸</span>
                                      <span>{rule}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (job.status === 'PROCESSING' || job.status === 'PENDING') ? (
                                <p className="text-[11px] text-gray-500 italic flex items-center gap-1.5">
                                  <span className="w-2.5 h-2.5 border border-blue-400/40 border-t-blue-400 rounded-full animate-spin flex-shrink-0" />
                                  Le regole verranno registrate al termine dell&apos;elaborazione.
                                </p>
                              ) : (
                                <p className="text-[11px] text-gray-600 italic">
                                  Nessuna regola configurata (né globali né per questo tenant).{' '}
                                  <a href="/prompts" className="text-blue-500/70 hover:text-blue-400 underline">Aggiungi regole →</a>
                                </p>
                              )}
                            </div>

                            {/* 2. Configurazione */}
                            {hasConfig && (
                              <div>
                                <div className="text-[10px] font-semibold text-teal-400 uppercase tracking-wide mb-1.5">⚙️ Configurazione</div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                  {Object.entries(pi.config!).map(([k, v]) => {
                                    if (v === null || v === undefined) return null;
                                    return (
                                      <div key={k} className="flex items-baseline gap-1.5 text-[11px]">
                                        <span className="text-gray-500 dark:text-gray-600 min-w-[70px] flex-shrink-0">{k}:</span>
                                        <span className="text-gray-700 dark:text-gray-300 truncate">{String(v)}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* 3. Regole Iniettate da Codice (solo debug) */}
                            {hasCodeRules && (
                              <div className="border-t border-amber-500/10 pt-2">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">🔧 Regole Iniettate dal Codice</span>
                                  <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded px-1.5 py-0.5">Solo debug</span>
                                </div>
                                <ul className="space-y-1">
                                  {pi.codeRules!.map((rule, i) => (
                                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-600 dark:text-gray-400">
                                      <span className="text-amber-500/50 flex-shrink-0 mt-0.5">▸</span>
                                      <span>{rule}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* 4. Prompt completo (solo debug) */}
                            {hasFullPrompt && (
                              <div className="border-t border-amber-500/10 pt-2 space-y-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-semibold text-orange-400 uppercase tracking-wide">📝 Prompt Completo</span>
                                  <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded px-1.5 py-0.5">Solo debug</span>
                                </div>
                                {pi.finalImagePrompt && (
                                   <div>
                                     <div className="text-[10px] text-gray-500 dark:text-gray-500 mb-1">Prompt Immagine Finale:</div>
                                     <pre className="bg-gray-100 dark:bg-gray-950 rounded-lg px-3 py-2 text-[10px] text-green-700 dark:text-green-300/80 overflow-x-auto whitespace-pre-wrap border border-gray-200 dark:border-gray-800">
                                       {pi.finalImagePrompt}
                                     </pre>
                                   </div>
                                 )}
                                 {pi.finalVideoPrompt && (
                                   <div>
                                     <div className="text-[10px] text-gray-500 dark:text-gray-500 mb-1">Prompt Video Finale:</div>
                                     <pre className="bg-gray-100 dark:bg-gray-950 rounded-lg px-3 py-2 text-[10px] text-violet-700 dark:text-violet-300/80 overflow-x-auto whitespace-pre-wrap border border-gray-200 dark:border-gray-800">
                                       {pi.finalVideoPrompt}
                                     </pre>
                                   </div>
                                 )}
                                {pi.systemPrompt && (
                                  <div>
                                   <div className="text-[10px] text-gray-500 dark:text-gray-500 mb-1">System Prompt:</div>
                                     <pre className="bg-gray-100 dark:bg-gray-950 rounded-lg px-3 py-2 text-[10px] text-purple-700 dark:text-purple-300/70 overflow-x-auto max-h-48 whitespace-pre-wrap border border-gray-200 dark:border-gray-800">
                                      {pi.systemPrompt}
                                    </pre>
                                  </div>
                                )}
                                {pi.userPrompt && (
                                  <div>
                                   <div className="text-[10px] text-gray-500 dark:text-gray-500 mb-1">User Prompt:</div>
                                     <pre className="bg-gray-100 dark:bg-gray-950 rounded-lg px-3 py-2 text-[10px] text-cyan-700 dark:text-cyan-300/70 overflow-x-auto max-h-48 whitespace-pre-wrap border border-gray-200 dark:border-gray-800">
                                      {pi.userPrompt}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}

                          </div>
                        </div>
                      );
                    })()}

                    {/* Post completo */}
                    {job.relatedPost && (
                      <div className="bg-gray-100 dark:bg-gray-900 rounded-lg p-3 text-xs space-y-1">
                        <div className="text-gray-500 dark:text-gray-600 uppercase tracking-wide text-[10px] mb-1.5">Post collegato</div>
                        <div className="flex flex-wrap gap-2">
                          <span className="badge bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{job.relatedPost.platform}</span>
                          <span className="badge bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{job.relatedPost.type}</span>
                          <span className="badge bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300">Stato: {job.relatedPost.status}</span>
                          {job.relatedPost.scheduledAt && (
                            <span className="badge bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                              📅 {formatRelativeTime(job.relatedPost.scheduledAt)}
                            </span>
                          )}
                        </div>
                        {job.relatedPost.caption && (
                          <p className="text-gray-400 italic mt-1.5 line-clamp-2">{job.relatedPost.caption}</p>
                        )}
                      </div>
                    )}

                    {/* Azioni estese */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {/* Forza retry immediato per PENDING con timer in futuro */}
                      {job.status === 'PENDING' && job.nextRetryAt && new Date(job.nextRetryAt) > new Date() && (
                        <button
                          onClick={() => doAction('forceRetry', job.id)}
                          className="btn-primary text-xs flex items-center gap-1.5"
                        >
                          <FastForward size={13} /> Forza retry ora
                        </button>
                      )}
                      {(job.status === 'FAILED' || job.status === 'CANCELLED') && (
                        <button
                          onClick={() => doAction('retry', job.id)}
                          className="btn-secondary text-xs flex items-center gap-1.5"
                        >
                          <RotateCcw size={13} /> Rimetti in coda
                        </button>
                      )}
                      {job.status === 'WAITING_TOKENS' && (
                        <button
                          onClick={() => doAction('retry', job.id)}
                          className="btn-secondary text-xs flex items-center gap-1.5 border-orange-500/40 text-orange-300 hover:text-orange-200"
                        >
                          <Unlock size={13} /> Sblocca e riprova subito
                        </button>
                      )}
                      {job.relatedPostId && (
                        <button
                          onClick={() => doAction('markReady', job.relatedPostId!)}
                          className="btn-primary text-xs flex items-center gap-1.5"
                        >
                          <CheckCircle2 size={13} /> Segna media come pronto
                        </button>
                      )}
                      {/* Migliora — solo per COMPLETED con media generato */}
                      {job.status === 'COMPLETED' && (() => {
                        let hasMedia = false;
                        try { const r = JSON.parse(job.result ?? '{}'); hasMedia = !!(r.url || r.videoUrl); } catch { /* */ }
                        if (!hasMedia) return null;
                        return (
                          <button
                            onClick={() => setRefineModal({ jobId: job.id })}
                            className="btn-secondary text-xs flex items-center gap-1.5 border-violet-500/40 text-violet-300 hover:text-violet-200"
                          >
                            <Wand2 size={13} /> Migliora media
                          </button>
                        );
                      })()}
                      {(job.status === 'PENDING' || job.status === 'WAITING_TOKENS') && (
                        <button
                          onClick={() => doAction('cancel', job.id)}
                          className="btn-ghost text-xs text-red-400 flex items-center gap-1.5 border border-red-500/20 rounded-lg px-3 py-1.5"
                        >
                          <Ban size={13} /> Annulla job
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legenda */}
      <div className="card p-4 space-y-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Legenda stati</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span className={v.color}>{v.icon}</span>
              <span className="text-gray-400"><span className={`font-medium ${v.color}`}>{v.label}</span></span>
            </div>
          ))}
        </div>
        <div className="pt-2 border-t border-gray-200 dark:border-gray-800 text-[11px] text-gray-600 dark:text-gray-600 space-y-1">
          <p>🤖 <strong className="text-gray-600 dark:text-gray-500">Immagine AI automatica</strong> — i job di tipo <strong>Immagine AI</strong> vengono elaborati automaticamente ogni 5 minuti tramite il provider configurato.</p>
          <p>⏱ <strong className="text-gray-600 dark:text-gray-500">Attesa token (arancione)</strong> — si attiva quando Google restituisce HTTP 429 per quota immagini esaurita. La quota immagini AI è <strong>separata</strong> dalla quota testo (non visibile nel dashboard Google AI Studio generale). Se pensi che la quota sia disponibile, usa il pulsante <strong>Sblocca e riprova</strong>.</p>
          <p>🔃 <strong className="text-gray-600 dark:text-gray-500">Rate limit RPM</strong> — se Google segnala un limite di richieste al minuto (diverso da quota esaurita), il job rimane in <strong>PENDING</strong> e riprova automaticamente in pochi secondi senza sprecare tentativi.</p>
          <p>✅ <strong className="text-gray-600 dark:text-gray-500">Segna media come pronto</strong> — solo per job legacy &quot;Upload manuale&quot;. Non più necessario per i nuovi post creati dal Post Manager o AI Generator.</p>
          <p>🔄 <strong className="text-gray-600 dark:text-gray-500">Rimetti in coda</strong> — disponibile su job FALLITI o ANNULLATI. Azzera i tentativi e rimette il job in stato PENDING per rigenerare l&apos;immagine.</p>
          <p>⚡ <strong className="text-gray-600 dark:text-gray-500">Aggiornamenti real-time</strong> — la pagina usa Server-Sent Events (SSE) per ricevere notifiche istantanee quando un job si completa o fallisce, senza bisogno di premere &quot;Aggiorna&quot;. Un fallback a 60 secondi è attivo quando ci sono job in elaborazione.</p>
        </div>
      </div>

      {/* Gallery lightbox per media generati */}
      {galleryData && (
        <MediaGalleryLightbox
          items={galleryData.items}
          tenantId={galleryData.tenantId}
          onClose={() => setGalleryData(null)}
        />
      )}

      {/* Modal Migliora media */}
      {refineModal && (
        <RefinePromptModal
          jobId={refineModal.jobId}
          onClose={() => setRefineModal(null)}
          onSuccess={() => {
            toast.success('✨ Miglioramento avviato!');
            setTimeout(() => fetchQueue(true), 1200);
          }}
        />
      )}
    </div>
  );
}

