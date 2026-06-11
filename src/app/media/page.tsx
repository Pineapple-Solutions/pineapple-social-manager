'use client';
// src/app/media/page.tsx – Libreria Media (foto e video per generazione AI)

import { useState, useEffect, useCallback } from 'react';
import {
  Image as ImageIcon, Video, Plus, Trash2, Upload, Globe2, Wand2,
  Info, AlertTriangle, Check, X, RefreshCw, Eye, EyeOff,
  Link as LinkIcon, Layers, Search, Film, Eraser, Bot,
  CheckSquare, Square, SquareX, Gauge,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTenantFilter } from '@/lib/hooks/useTenantFilter';
import { TenantSelector } from '@/components/ui/TenantSelector';
import { WatermarkRemoverModal } from '@/components/ui/WatermarkRemoverModal';
import { MediaGalleryLightbox, type GalleryMediaItem } from '@/components/ui/MediaGalleryLightbox';

// ─── Tipi ──────────────────────────────────────────────────────────────────
interface MediaAsset {
  id: string; tenantId: string; name: string; url: string;
  type: string; mimeType: string | null; alt: string | null;
  description: string | null; tags: string; source: string;
  siteId: string | null; usedInAI: boolean; isActive: boolean;
  width: number | null; height: number | null; size: number | null;
  createdAt: string;
}

interface ConnectedSite {
  id: string; name: string; url: string; niche: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function parseTags(raw: string): string[] {
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

function isVideoUrl(url: string) {
  return /\.(mp4|mov|webm|ogg|avi|mkv)(\?|$)/i.test(url);
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  MANUAL:         { label: 'Manuale',  color: 'bg-gray-700 text-gray-300' },
  SITE_EXTRACTED: { label: 'Da sito', color: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' },
};

function isLocal(url: string) { return url.startsWith('/uploads/'); }

// ─── Pannello estrazione ───────────────────────────────────────────────────
interface ExtractPanelProps {
  mediaType: 'IMAGE' | 'VIDEO';
  sites: ConnectedSite[];
  loadingSites: boolean;
  tenantId: string | null | undefined;
  hasProvider: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function ExtractPanel({ mediaType, sites, loadingSites, tenantId, hasProvider, onClose, onSuccess }: ExtractPanelProps) {
  const isImage = mediaType === 'IMAGE';
  const MAX = isImage ? 30 : 5;
  const DEFAULT = isImage ? 15 : 3;

  const [selectedSite, setSelectedSite] = useState('');
  const [enrichAI, setEnrichAI] = useState(false);
  const [maxItems, setMaxItems] = useState(DEFAULT);
  const [extracting, setExtracting] = useState(false);
  const [optimize, setOptimize] = useState(true);

  const handleExtract = async () => {
    if (!tenantId) { toast.error('Seleziona un cliente'); return; }
    if (!selectedSite) { toast.error('Seleziona un sito'); return; }
    setExtracting(true);
    try {
      const res = await fetch('/api/media/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, siteId: selectedSite, mediaType, enrichWithAI: enrichAI, maxItems, optimize }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message ?? `${json.data?.length ?? 0} ${isImage ? 'immagini' : 'video'} importati!`);
        onClose();
        onSuccess();
      } else {
        toast.error(json.error ?? `Errore durante l'estrazione`);
      }
    } catch {
      toast.error('Errore di rete');
    } finally { setExtracting(false); }
  };

  const maxOptions = isImage ? [5, 10, 15, 20, 25, 30] : [1, 2, 3, 4, 5];

  return (
    <div className={`card p-5 space-y-4 ${isImage ? 'border-blue-500/30 bg-blue-500/5' : 'border-purple-500/30 bg-purple-500/5'}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white flex items-center gap-2">
          {isImage
            ? <><ImageIcon size={16} className="text-blue-400" /> Estrai immagini da sito</>
            : <><Film size={16} className="text-purple-400" /> Estrai video da sito</>
          }
        </h3>
        <button onClick={onClose} className="btn-ghost p-1.5 text-gray-500"><X size={14} /></button>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400">
        {isImage
          ? 'Esegue lo scraping del sito selezionato e importa automaticamente le immagini trovate nella libreria.'
          : 'Cerca tag <video> e link diretti a file video (.mp4, .webm, .mov…) nel sito selezionato.'}
      </p>

      {!isImage && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300">
          <Info size={13} className="flex-shrink-0 mt-0.5 text-purple-400" />
          <span>
            Solo video <strong>ospitati direttamente sul sito</strong> (file .mp4, .webm, .mov).
            I video incorporati da YouTube, Vimeo o altri servizi esterni <strong>non vengono estratti</strong>.
            Il limite massimo è <strong>{MAX} video</strong> per estrazione.
          </span>
        </div>
      )}

      {!tenantId ? (
        <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-300">
          <AlertTriangle size={13} className="inline mr-1" /> Seleziona prima un cliente per accedere ai siti collegati.
        </div>
      ) : loadingSites ? (
        <div className="text-sm text-gray-500">Caricamento siti...</div>
      ) : sites.length === 0 ? (
        <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
          Nessun sito collegato per questo cliente. <a href="/sites" className="text-brand-400 hover:underline">Aggiungi un sito →</a>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label">Sito da cui estrarre *</label>
            <div className="space-y-1.5">
              {sites.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSite(s.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all
                    ${selectedSite === s.id
                      ? isImage
                        ? 'border-blue-500/50 bg-blue-500/10 text-blue-200'
                        : 'border-purple-500/50 bg-purple-500/10 text-purple-200'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600'}`}
                >
                  <Globe2 size={14} className={selectedSite === s.id ? (isImage ? 'text-blue-400' : 'text-purple-400') : 'text-gray-500'} />
                  <div>
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-gray-500">{s.url}</div>
                  </div>
                  {selectedSite === s.id && <Check size={14} className={`ml-auto ${isImage ? 'text-blue-400' : 'text-purple-400'}`} />}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">
                N° max {isImage ? 'immagini' : 'video'}
                <span className="text-gray-600 ml-1">(max {MAX})</span>
              </label>
              <select className="select" value={maxItems} onChange={(e) => setMaxItems(Number(e.target.value))}>
                {maxOptions.map(n => (
                  <option key={n} value={n}>{n} {isImage ? 'immagini' : 'video'}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <label className={`flex items-center gap-2 cursor-pointer p-3 rounded-xl border transition-all
                ${!hasProvider ? 'opacity-40 cursor-not-allowed border-gray-200 dark:border-gray-800' : enrichAI
                  ? (isImage ? 'border-blue-500/40 bg-blue-500/5' : 'border-purple-500/40 bg-purple-500/5')
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'}`}
              >
                <div
                  onClick={() => hasProvider && setEnrichAI(v => !v)}
                  className={`relative w-8 h-4 rounded-full transition-all flex-shrink-0 ${enrichAI && hasProvider ? (isImage ? 'bg-blue-500' : 'bg-purple-500') : 'bg-gray-300 dark:bg-gray-700'}`}
                >
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${enrichAI && hasProvider ? 'left-4' : 'left-0.5'}`} />
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
                    <Wand2 size={11} className={enrichAI && hasProvider ? (isImage ? 'text-blue-400' : 'text-purple-400') : 'text-gray-600'} />
                    Descrizione AI
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-600">
                    {hasProvider ? 'Genera alt text (usa token)' : 'Richiede provider AI'}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {enrichAI && hasProvider && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-xs text-yellow-300">
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
              {isImage
                ? `Genera descrizioni AI per le prime 10 immagini. ≈80 token per immagine (≈800 token totali).`
                : `Genera descrizioni AI per tutti i ${maxItems} video. ≈80 token per video (≈${maxItems * 80} token totali).`}
            </div>
          )}

          {/* Toggle ottimizzazione web */}
          <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all
            ${optimize
              ? 'border-green-500/30 bg-green-500/5'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'}`}
          >
            <div
              onClick={() => setOptimize(v => !v)}
              className={`relative w-8 h-4 rounded-full transition-all flex-shrink-0 ${optimize ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-700'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${optimize ? 'left-4' : 'left-0.5'}`} />
            </div>
            <div>
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
                <Gauge size={11} className={optimize ? 'text-green-400' : 'text-gray-400 dark:text-gray-600'} />
                Ottimizza per il web
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-600">
                {isImage
                  ? 'Converte in WebP (qualità 85) — stessa qualità visiva, ~40% più leggero'
                  : 'Converte in H.264/MP4 — stesso video, più compatibile e leggero'}
              </div>
            </div>
          </label>

          <div className="flex gap-2">
            <button
              onClick={handleExtract}
              disabled={extracting || !selectedSite}
              className={`btn-primary disabled:opacity-50 ${!isImage ? 'bg-purple-600 hover:bg-purple-500' : ''}`}
            >
              {extracting
                ? <><RefreshCw size={14} className="animate-spin" /> Estrazione in corso...</>
                : isImage
                  ? <><ImageIcon size={14} /> Estrai immagini</>
                  : <><Film size={14} /> Estrai video</>
              }
            </button>
            <button onClick={onClose} className="btn-secondary"><X size={14} /> Annulla</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principale ─────────────────────────────────────────────────
export default function MediaPage() {
  const { tenants, selectedTenant, setSelectedTenant, currentUser, isMaster, showSelector, ready } = useTenantFilter();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'IMAGE' | 'VIDEO'>('ALL');
  const [filterAI, setFilterAI] = useState(true);

  // ─── Selezione multipla ─────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // ─── Watermark remover ──────────────────────────────────────────────────
  const [watermarkAsset, setWatermarkAsset] = useState<MediaAsset | null>(null);

  // ─── Lightbox ───────────────────────────────────────────────────────────
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // ─── Form aggiunta manuale ──────────────────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', url: '', alt: '', description: '', type: 'IMAGE', usedInAI: true, optimize: true });
  const [saving, setSaving] = useState(false);

  // ─── Pannelli estrazione separati ──────────────────────────────────────
  const [activeExtract, setActiveExtract] = useState<'IMAGE' | 'VIDEO' | null>(null);
  const [sites, setSites] = useState<ConnectedSite[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [hasProvider, setHasProvider] = useState(false);

  // ─── Fetch assets ───────────────────────────────────────────────────────
  const fetchAssets = useCallback(async (tenantId?: string) => {
    setLoading(true);
    try {
      const params = tenantId ? `?tenantId=${tenantId}` : '';
      const res = await fetch(`/api/media${params}`);
      const json = await res.json();
      if (json.success) setAssets(json.data ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  const fetchSites = useCallback(async (tenantId: string) => {
    setLoadingSites(true);
    try {
      const res = await fetch(`/api/sites?tenantId=${tenantId}`);
      const json = await res.json();
      if (json.success) setSites(json.data ?? []);
    } catch { /* ignore */ } finally { setLoadingSites(false); }
  }, []);

  const checkProvider = useCallback(async (tenantId: string) => {
    try {
      const res = await fetch(`/api/ai/providers?tenantId=${tenantId}`);
      const json = await res.json();
      setHasProvider(json.success && Array.isArray(json.data) && json.data.length > 0);
    } catch { setHasProvider(false); }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const tid = selectedTenant || currentUser?.tenantId;
    if (tid) {
      fetchAssets(tid);
      fetchSites(tid);
      checkProvider(tid);
    } else if (isMaster) {
      fetchAssets();
    } else {
      setLoading(false);
    }
    setActiveExtract(null);
    setSelectedIds(new Set());
  }, [selectedTenant, ready, currentUser, isMaster, fetchAssets, fetchSites, checkProvider]);

  // ─── Aggiunta manuale ───────────────────────────────────────────────────
  const handleAdd = async () => {
    const tid = selectedTenant || currentUser?.tenantId;
    if (!tid) { toast.error('Seleziona un cliente'); return; }
    if (!addForm.url.trim()) { toast.error('URL obbligatorio'); return; }
    setSaving(true);
    try {
      const type = isVideoUrl(addForm.url) ? 'VIDEO' : addForm.type;
      const res = await fetch('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tid,
          name: addForm.name || addForm.url.split('/').pop()?.split('?')[0] || 'Media',
          url: addForm.url.trim(),
          type,
          alt: addForm.alt || null,
          description: addForm.description || null,
          usedInAI: addForm.usedInAI,
          optimize: addForm.optimize,
          source: 'MANUAL',
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Media aggiunto!');
        setShowAddForm(false);
        setAddForm({ name: '', url: '', alt: '', description: '', type: 'IMAGE', usedInAI: true, optimize: true });
        fetchAssets(tid);
      } else {
        toast.error(json.error ?? 'Errore');
      }
    } finally { setSaving(false); }
  };

  const toggleAI = async (asset: MediaAsset) => {
    await fetch('/api/media', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: asset.id, usedInAI: !asset.usedInAI }),
    });
    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, usedInAI: !a.usedInAI } : a));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Elimina questo media dalla libreria?')) return;
    const res = await fetch(`/api/media/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      toast.success('Media eliminato');
      setAssets(prev => prev.filter(a => a.id !== id));
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  // ─── Selezione multipla ─────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filtered.map(a => a.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const bulkToggleAI = async (enable: boolean) => {
    if (!selectedIds.size) return;
    setBulkLoading(true);
    let done = 0;
    for (const id of selectedIds) {
      try {
        await fetch('/api/media', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, usedInAI: enable }),
        });
        done++;
      } catch { /* ignora errori singoli */ }
    }
    setAssets(prev => prev.map(a => selectedIds.has(a.id) ? { ...a, usedInAI: enable } : a));
    toast.success(`${done} media ${enable ? 'abilitati' : 'disabilitati'} per AI`);
    setSelectedIds(new Set());
    setBulkLoading(false);
  };

  const bulkDelete = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Eliminare ${selectedIds.size} media dalla libreria?`)) return;
    setBulkLoading(true);
    let done = 0;
    for (const id of selectedIds) {
      try {
        const res = await fetch(`/api/media/${id}`, { method: 'DELETE' });
        const json = await res.json();
        if (json.success) done++;
      } catch { /* ignora */ }
    }
    setAssets(prev => prev.filter(a => !selectedIds.has(a.id)));
    toast.success(`${done} media eliminati`);
    setSelectedIds(new Set());
    setBulkLoading(false);
  };

  const openExtract = (type: 'IMAGE' | 'VIDEO') => {
    setActiveExtract(prev => prev === type ? null : type);
    setShowAddForm(false);
  };

  // ─── Filtri UI ──────────────────────────────────────────────────────────
  const tenantId = selectedTenant || currentUser?.tenantId;
  const filtered = assets.filter((a) => {
    if (filterType !== 'ALL' && a.type !== filterType) return false;
    if (filterAI && !a.usedInAI) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.name.toLowerCase().includes(q) || (a.alt ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const imageCount = assets.filter(a => a.type === 'IMAGE').length;
  const videoCount = assets.filter(a => a.type === 'VIDEO').length;
  const aiCount = assets.filter(a => a.usedInAI).length;
  const allFilteredSelected = filtered.length > 0 && filtered.every(a => selectedIds.has(a.id));

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Libreria Media</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Foto e video utilizzati dalla generazione AI —{' '}
            <strong className="text-gray-700 dark:text-gray-300">Video AI</strong> e{' '}
            <strong className="text-gray-700 dark:text-gray-300">Content Studio</strong>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {ready && showSelector && (
            <TenantSelector tenants={tenants} value={selectedTenant} onChange={setSelectedTenant} isMaster={isMaster} />
          )}
          <button
            onClick={() => openExtract('IMAGE')}
            disabled={!tenantId}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all
              ${activeExtract === 'IMAGE'
                ? 'bg-blue-500/20 border-blue-500/50 text-blue-200'
                : tenantId
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-300 hover:bg-blue-500/20'
                  : 'opacity-40 cursor-not-allowed bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'}`}
          >
            <ImageIcon size={14} /> Estrai foto
          </button>
          <button
            onClick={() => openExtract('VIDEO')}
            disabled={!tenantId}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all
              ${activeExtract === 'VIDEO'
                ? 'bg-purple-500/20 border-purple-500/50 text-purple-200'
                : tenantId
                  ? 'bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20'
                  : 'opacity-40 cursor-not-allowed bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'}`}
          >
            <Film size={14} /> Estrai video
          </button>
          <button
            onClick={() => { setShowAddForm(true); setActiveExtract(null); }}
            disabled={!tenantId}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={16} /> Aggiungi
          </button>
        </div>
      </div>

      {/* ─── Info box ───────────────────────────────────────────────────── */}
      <div className="card p-4 border-brand-500/20 bg-brand-500/5 space-y-3">
        <div className="flex gap-3">
          <Info size={17} className="text-brand-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
            <p>
              <strong className="text-gray-900 dark:text-white">Come funziona:</strong> I media con{' '}
              <strong className="text-green-600 dark:text-green-400 inline-flex items-center gap-1"><Bot size={12} /> Usa in AI</strong> attivo vengono forniti come contesto visivo
              all&apos;AI durante la generazione di post, caption e video. Vengono passati come URL nel prompt di sistema.
            </p>
            <p>
              Puoi importarli manualmente, oppure estrarre <strong className="text-blue-600 dark:text-blue-300">foto</strong> e{' '}
              <strong className="text-purple-600 dark:text-purple-300">video</strong> separatamente da un sito collegato al cliente.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-500/10 dark:bg-yellow-500/5 border border-yellow-500/30 dark:border-yellow-500/20">
          <AlertTriangle size={15} className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-800 dark:text-yellow-300">
            <strong>Attenzione al consumo di token:</strong> Ogni media attivo nella libreria aumenta il contesto inviato all&apos;AI.
            Troppi media <strong>(oltre 10–15 foto o 3–5 video per cliente)</strong> aumentano significativamente il consumo di token per ogni generazione.
            Mantieni solo i media <strong>più rilevanti e rappresentativi</strong> del brand.
            Puoi disabilitare i singoli media senza eliminarli.
          </p>
        </div>
      </div>

      {/* ─── Stats ──────────────────────────────────────────────────────── */}
      {assets.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="card px-4 py-2.5 flex items-center gap-2 text-sm">
            <Layers size={14} className="text-gray-400" />
            <span className="text-gray-300">{assets.length} media totali</span>
          </div>
          <div className="card px-4 py-2.5 flex items-center gap-2 text-sm">
            <ImageIcon size={14} className="text-blue-400" />
            <span className="text-gray-300">{imageCount} foto</span>
          </div>
          <div className="card px-4 py-2.5 flex items-center gap-2 text-sm">
            <Film size={14} className="text-purple-400" />
            <span className="text-gray-300">{videoCount} video</span>
          </div>
          <div className={`card px-4 py-2.5 flex items-center gap-2 text-sm ${aiCount > 15 ? 'border-yellow-500/30 bg-yellow-500/5' : ''}`}>
            <Wand2 size={14} className={aiCount > 15 ? 'text-yellow-400' : 'text-green-400'} />
            <span className={aiCount > 15 ? 'text-yellow-300' : 'text-gray-300'}>
              {aiCount} attivi per AI
              {aiCount > 15 && <span className="ml-1 font-medium inline-flex items-center gap-0.5"><AlertTriangle size={11} /> molti!</span>}
            </span>
          </div>
        </div>
      )}

      {/* ─── Pannello estrazione foto ────────────────────────────────────── */}
      {activeExtract === 'IMAGE' && (
        <ExtractPanel
          mediaType="IMAGE"
          sites={sites}
          loadingSites={loadingSites}
          tenantId={tenantId}
          hasProvider={hasProvider}
          onClose={() => setActiveExtract(null)}
          onSuccess={() => fetchAssets(tenantId ?? undefined)}
        />
      )}

      {/* ─── Pannello estrazione video ───────────────────────────────────── */}
      {activeExtract === 'VIDEO' && (
        <ExtractPanel
          mediaType="VIDEO"
          sites={sites}
          loadingSites={loadingSites}
          tenantId={tenantId}
          hasProvider={hasProvider}
          onClose={() => setActiveExtract(null)}
          onSuccess={() => fetchAssets(tenantId ?? undefined)}
        />
      )}

      {/* ─── Form aggiunta manuale ───────────────────────────────────────── */}
      {showAddForm && (
        <div className="card p-5 border-brand-500/30 bg-brand-500/5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <LinkIcon size={16} className="text-brand-400" /> Aggiungi media via URL
            </h3>
            <button onClick={() => setShowAddForm(false)} className="btn-ghost p-1.5 text-gray-500"><X size={14} /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="label">
                URL media *{' '}
                <span className="text-gray-600 text-xs">(immagine o video — deve essere pubblicamente accessibile)</span>
              </label>
              <input
                className="input"
                placeholder="https://tuosito.com/immagine.jpg"
                value={addForm.url}
                onChange={(e) => {
                  const url = e.target.value;
                  setAddForm(f => ({ ...f, url, type: isVideoUrl(url) ? 'VIDEO' : 'IMAGE' }));
                }}
              />
            </div>
            <div>
              <label className="label">Nome / Etichetta</label>
              <input className="input" placeholder="es: Banner homepage" value={addForm.name}
                onChange={(e) => setAddForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Tipo</label>
              <select className="select" value={addForm.type} onChange={(e) => setAddForm(f => ({ ...f, type: e.target.value }))}>
                <option value="IMAGE">Foto / Immagine</option>
                <option value="VIDEO">Video</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">
                Alt text / Descrizione breve{' '}
                <span className="text-gray-600 text-xs">(aiuta l&apos;AI a capire il contenuto)</span>
              </label>
              <input className="input" placeholder="es: Soggiorno moderno con smart home Pineapple"
                value={addForm.alt} onChange={(e) => setAddForm(f => ({ ...f, alt: e.target.value }))} />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setAddForm(f => ({ ...f, usedInAI: !f.usedInAI }))}
              className={`relative w-9 h-5 rounded-full transition-all flex-shrink-0 cursor-pointer ${addForm.usedInAI ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-700'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${addForm.usedInAI ? 'left-4' : 'left-0.5'}`} />
            </div>
            <Bot size={14} className={addForm.usedInAI ? 'text-green-400' : 'text-gray-400 dark:text-gray-600'} />
            <span className="text-sm text-gray-700 dark:text-gray-300">Includi nel contesto AI</span>
            <span className="text-xs text-gray-400 dark:text-gray-600">(contribuisce al consumo di token)</span>
          </label>

          <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all
            ${addForm.optimize ? 'border-green-500/30 bg-green-500/5' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'}`}>
            <div
              onClick={() => setAddForm(f => ({ ...f, optimize: !f.optimize }))}
              className={`relative w-9 h-5 rounded-full transition-all flex-shrink-0 cursor-pointer ${addForm.optimize ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-700'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${addForm.optimize ? 'left-4' : 'left-0.5'}`} />
            </div>
            <Gauge size={14} className={addForm.optimize ? 'text-green-400' : 'text-gray-400 dark:text-gray-600'} />
            <div>
              <div className="text-sm text-gray-700 dark:text-gray-300 font-medium">Ottimizza per il web</div>
              <div className="text-xs text-gray-500 dark:text-gray-600">
                {addForm.type === 'VIDEO'
                  ? 'Converte in H.264/MP4 — stesso video, più compatibile e leggero'
                  : 'Converte in WebP (qualità 85) — stessa qualità visiva, ~40% più leggero'}
              </div>
            </div>
          </label>

          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving} className="btn-primary">
              <Upload size={14} /> {saving ? 'Salvataggio...' : 'Aggiungi'}
            </button>
            <button onClick={() => setShowAddForm(false)} className="btn-secondary"><X size={14} /> Annulla</button>
          </div>
        </div>
      )}

      {/* ─── Filtri + ricerca + selezione multipla ────────────────────────── */}
      {assets.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Ricerca */}
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                className="input pl-8 py-2 text-sm"
                placeholder="Cerca per nome, alt text..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {/* Filtri tipo */}
            {(['ALL', 'IMAGE', 'VIDEO'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                  ${filterType === t ? 'bg-brand-500/20 border-brand-500/40 text-brand-300' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-400 dark:hover:border-gray-600'}`}
              >
                {t === 'ALL' ? (
                  <><Layers size={11} /> Tutti</>
                ) : t === 'IMAGE' ? (
                  <><ImageIcon size={11} /> Foto</>
                ) : (
                  <><Film size={11} /> Video</>
                )}
              </button>
            ))}
            <button
              onClick={() => setFilterAI(!filterAI)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                ${filterAI ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-400 dark:hover:border-gray-600'}`}
            >
              <Bot size={11} /> Solo AI attivi
            </button>
            {/* Seleziona / deseleziona tutto */}
            <button
              onClick={allFilteredSelected ? deselectAll : selectAll}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                ${selectedIds.size > 0 ? 'bg-brand-500/10 border-brand-500/30 text-brand-300' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-400 dark:hover:border-gray-600'}`}
            >
              {allFilteredSelected
                ? <><SquareX size={11} /> Deseleziona tutto</>
                : <><CheckSquare size={11} /> Seleziona tutto</>
              }
            </button>
          </div>

          {/* ─── Barra azioni bulk ─── */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-brand-500/10 border border-brand-500/30 animate-slide-up">
              <span className="text-sm text-brand-300 font-medium flex-1">
                <Check size={14} className="inline mr-1" />
                {selectedIds.size} selezionat{selectedIds.size === 1 ? 'o' : 'i'}
              </span>
              <button
                onClick={() => bulkToggleAI(true)}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 disabled:opacity-50 transition-all"
              >
                <Bot size={12} /> Abilita AI
              </button>
              <button
                onClick={() => bulkToggleAI(false)}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-all"
              >
                <EyeOff size={12} /> Disabilita AI
              </button>
              <button
                onClick={bulkDelete}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-all"
              >
                <Trash2 size={12} /> Elimina
              </button>
              <button
                onClick={deselectAll}
                className="btn-ghost p-1.5 text-gray-500"
              >
                <X size={13} />
              </button>
              {bulkLoading && <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />}
            </div>
          )}
        </div>
      )}

      {/* ─── Griglia media ───────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1,2,3,4,5,6].map(i => <div key={i} className="aspect-square rounded-xl shimmer" />)}
        </div>
      ) : !tenantId && !isMaster ? (
        <div className="card p-10 text-center text-gray-500">
          <ImageIcon size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Seleziona un cliente per vedere la sua libreria media.</p>
        </div>
      ) : filtered.length === 0 && assets.length === 0 ? (
        <div className="card p-10 text-center text-gray-500 space-y-3">
          <div className="flex justify-center gap-3 opacity-20">
            <ImageIcon size={36} />
            <Video size={36} />
          </div>
          <p className="text-sm font-medium text-gray-400">Libreria vuota</p>
          <p className="text-xs text-gray-600 max-w-sm mx-auto">
            Aggiungi foto e video via URL oppure estraili da un sito collegato al cliente.
            Verranno usati come contesto visivo nei prompt dell&apos;AI.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-gray-500 text-sm">
          Nessun media corrisponde ai filtri selezionati.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((asset, assetIndex) => {
            const tags = parseTags(asset.tags);
            const sourceMeta = SOURCE_LABELS[asset.source] ?? SOURCE_LABELS.MANUAL;
            const isVideo = asset.type === 'VIDEO';
            const isSelected = selectedIds.has(asset.id);
            return (
              <div
                key={asset.id}
                className={`group relative rounded-xl overflow-hidden border transition-all
                  ${isSelected
                    ? 'border-brand-500/70 ring-2 ring-brand-500/30'
                    : asset.usedInAI
                      ? 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
                      : 'border-gray-200 dark:border-gray-800 opacity-60 hover:opacity-80'}`}
              >
                {/* Preview — cliccabile per aprire lightbox */}
                <div
                  className="aspect-square bg-gray-200 dark:bg-gray-800 relative cursor-pointer"
                  onClick={() => setLightboxIndex(assetIndex)}
                >
                  {isVideo ? (
                    <>
                      <video
                        src={asset.url}
                        preload="metadata"
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // fallback: mostra icona se il video non carica
                          const parent = (e.target as HTMLVideoElement).parentElement;
                          if (parent) {
                            (e.target as HTMLVideoElement).style.display = 'none';
                            const fallback = parent.querySelector('.video-fallback') as HTMLElement | null;
                            if (fallback) fallback.style.display = 'flex';
                          }
                        }}
                      />
                      {/* Overlay play */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center">
                          <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4 ml-0.5">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                      </div>
                      {/* Fallback icona video (nascosto di default, mostrato da onError) */}
                      <div className="video-fallback w-full h-full absolute inset-0 flex-col items-center justify-center gap-2 hidden">
                        <Film size={28} className="text-purple-500/60" />
                        <span className="text-xs text-gray-500 dark:text-gray-600">Video</span>
                      </div>
                    </>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={asset.url}
                      alt={asset.alt ?? asset.name}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}

                  {/* Checkbox selezione — sempre visibile se selezionato, altrimenti al hover */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelect(asset.id); }}
                    className={`absolute bottom-1.5 right-1.5 z-10 w-6 h-6 rounded-md border flex items-center justify-center transition-all
                      ${isSelected
                        ? 'bg-brand-500 border-brand-500 opacity-100'
                        : 'bg-black/50 border-gray-600 opacity-0 group-hover:opacity-100'}`}
                  >
                    {isSelected
                      ? <Check size={12} className="text-white" />
                      : <Square size={12} className="text-gray-400" />
                    }
                  </button>

                  {/* Overlay azioni */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setLightboxIndex(assetIndex); }}
                      title="Apri anteprima"
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setWatermarkAsset(asset); }}
                      title="Rimuovi filigrana (solo uso interno)"
                      className="p-2 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-400 transition-colors"
                    >
                      <Eraser size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(asset.id); }}
                      className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* AI badge */}
                  <div className="absolute top-1.5 left-1.5">
                    <button
                      onClick={() => toggleAI(asset)}
                      title={asset.usedInAI ? 'Disabilita per AI' : 'Abilita per AI'}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium transition-all
                        ${asset.usedInAI ? 'bg-green-500/80 text-white' : 'bg-gray-900/80 text-gray-500'}`}
                    >
                      <Bot size={10} />
                      AI
                    </button>
                  </div>
                  {/* Source badge */}
                  <div className="absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
                    <span className={`px-1.5 py-0.5 rounded-md text-xs ${sourceMeta.color}`}>
                      {sourceMeta.label}
                    </span>
                    {isLocal(asset.url) && (
                      <span className="px-1.5 py-0.5 rounded-md text-xs bg-green-500/20 text-green-400 border border-green-500/20">
                        locale
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer info */}
                <div className="p-2 bg-gray-100 dark:bg-gray-900">
                  <p className="text-xs text-gray-700 dark:text-gray-300 font-medium truncate">{asset.name}</p>
                  {asset.alt && <p className="text-xs text-gray-500 dark:text-gray-600 truncate mt-0.5">{asset.alt}</p>}
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {isVideo && <span className="badge text-xs bg-purple-500/10 text-purple-400">Video</span>}
                    {asset.size && <span className="text-xs text-gray-500 dark:text-gray-700">{formatBytes(asset.size)}</span>}
                    {tags.filter(Boolean).slice(0, 2).map((tag, i) => (
                      <span key={i} className="badge text-xs bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-500">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Modal rimozione filigrana ───────────────────────────────────── */}
      {watermarkAsset && (
        <WatermarkRemoverModal
          sourceUrl={watermarkAsset.url}
          mediaType={watermarkAsset.type === 'VIDEO' ? 'video' : 'image'}
          tenantId={tenantId ?? undefined}
          onClose={() => setWatermarkAsset(null)}
          onSuccess={() => {
            toast.success('Filigrana rimossa! Scarica il file — solo uso interno come mockup.');
          }}
        />
      )}

      {/* ─── Lightbox gallery ────────────────────────────────────────────── */}
      {lightboxIndex !== null && filtered.length > 0 && (
        <MediaGalleryLightbox
          items={filtered.map((a): GalleryMediaItem => ({
            url: a.url,
            type: a.type === 'VIDEO' ? 'video' : 'image',
            mimeType: a.mimeType ?? undefined,
            label: a.name ?? undefined,
          }))}
          initialIndex={lightboxIndex}
          tenantId={tenantId ?? undefined}
          onClose={() => setLightboxIndex(null)}
          onWatermarkSuccess={(index, newUrl) => {
            setAssets(prev => prev.map((a, i) =>
              filtered[index]?.id === a.id ? { ...a, url: newUrl } : a
            ));
          }}
        />
      )}
    </div>
  );
}
