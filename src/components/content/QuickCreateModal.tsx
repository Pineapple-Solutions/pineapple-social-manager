'use client';
// src/components/content/QuickCreateModal.tsx

import { useState } from 'react';
import { X, Plus, Bot, Wand2, Image as ImageIcon, Film, Smartphone, LayoutGrid, Sparkles, Camera, Video, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PostType, AITone, Platform, AIMediaRef } from '@/types';
import type { RemovalMethod } from '@/components/ui/WatermarkRemoverModal';
import { getPlatformLabel } from '@/lib/utils';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { ProviderSelectorWidget } from '@/components/ui/ProviderSelectorWidget';

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
import { MediaPickerInline } from '@/components/ui/MediaPickerInline';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  tenantId?: string;
  /** Se impostato, il post viene creato per ogni tenantId nella lista (modalita bulk) */
  bulkTenantIds?: string[];
}

const PLATFORMS: Platform[] = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK'];

const POST_TYPE_DEFS: Record<string, { icon: React.ReactNode; label: string }> = {
  POST:     { icon: <ImageIcon size={20} />,  label: 'Post' },
  STORY:    { icon: <Smartphone size={20} />, label: 'Story' },
  REEL:     { icon: <Film size={20} />,       label: 'Reel' },
  CAROUSEL: { icon: <LayoutGrid size={20} />, label: 'Carousel' },
};

const TONE_OPTIONS: { value: AITone; label: string }[] = [
  { value: 'professional',  label: 'Professionale' },
  { value: 'friendly',      label: 'Amichevole' },
  { value: 'inspirational', label: 'Inspirazionale' },
  { value: 'luxury',        label: 'Luxury' },
  { value: 'funny',         label: 'Divertente' },
  { value: 'minimal',       label: 'Minimal' },
];

export function QuickCreateModal({ onClose, onSuccess, tenantId, bulkTenantIds }: Props) {
  const [platform, setPlatform] = useState<Platform>('INSTAGRAM');
  const [postType, setPostType] = useState<PostType>('POST');
  const [mediaType, setMediaType] = useState<'IMAGE' | 'VIDEO'>('IMAGE');  // 📷 o 🎬
  const [carouselCount, setCarouselCount] = useState<number>(3);  // numero slide carousel
  const [caption, setCaption] = useState('');
  const [hashtag, setHashtag] = useState('');
  const [imageDescription, setImageDescription] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<AIMediaRef[]>([]);
  const [referenceMedia, setReferenceMedia] = useState<AIMediaRef[]>([]);  // immagini di riferimento per AI
  const [scheduledAt, setScheduledAt] = useState('');
  const [aiTopic, setAiTopic] = useState('');
  const [aiTone, setAiTone] = useState<AITone>('professional');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [videoDuration, setVideoDuration] = useState(8); // 5-60s
  // Override provider/modello per questa singola esecuzione (non modifica impostazioni globali)
  const [overrideModel, setOverrideModel] = useState<string | null>(null);

  // Chiarimento AI: quando il provider risponde con needsClarification
  const [aiClarification, setAiClarification] = useState<{
    question: string;
    options: { label: string; description?: string }[];
  } | null>(null);
  const [aiClarifyInput, setAiClarifyInput] = useState('');

  // Scene manuali per REEL — conservano tutti i campi AI (visual, script, onScreenText, transition)
  interface ManualScene {
    id: string;
    description: string;      // descrizione visiva (visual)
    script?: string;           // narrazione vocale (separata dal visual)
    onScreenText?: string;     // testo sovrapposto a schermo
    transition?: string;       // tipo di transizione
    maxDurationSeconds?: number;
  }
  const [manualScenes, setManualScenes] = useState<ManualScene[]>([]);
  // Metadati REEL da AI (hook, music, cta) — popolati da generateWithAI
  const [reelMeta, setReelMeta] = useState<{ hook?: string; music?: string; cta?: string } | null>(null);
  const addScene = () => setManualScenes(prev => [...prev, { id: `${Date.now()}`, description: '', maxDurationSeconds: undefined }]);
  const removeScene = (id: string) => setManualScenes(prev => prev.filter(s => s.id !== id));
  const updateScene = (id: string, patch: Partial<ManualScene>) =>
    setManualScenes(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  // Costruisce il reelScript dalle scene manuali (formato compatibile con storyboard AI)
  const buildManualReelScript = (): string | undefined => {
    if (manualScenes.length === 0 && !reelMeta) return undefined;
    const storyboard = {
      hook: reelMeta?.hook || manualScenes[0]?.description?.slice(0, 80) || undefined,
      totalDuration: `${videoDuration}s`,
      scenes: manualScenes.map((s, i) => ({
        scene: i + 1,
        // Durata: usa quella impostata (5-8s per clip), se non disponibile usa 'auto'
        duration: s.maxDurationSeconds ? `${s.maxDurationSeconds}s` : 'auto',
        visual: s.description,
        // Script (narrazione): usa il campo dedicato, fallback alla descrizione visiva
        script: s.script || s.description,
        onScreenText: s.onScreenText || undefined,
        transition: s.transition || undefined,
      })),
      music: reelMeta?.music ?? null,
      cta: reelMeta?.cta ?? null,
    };
    return JSON.stringify(storyboard);
  };

  // Auto-rimozione filigrana AI
  const [autoWatermarkEnabled, setAutoWatermarkEnabled] = useState(false);
  const [wmPreset, setWmPreset] = useState('bottom-right');
  const [wmMethod, setWmMethod] = useState<RemovalMethod>('taglio');

  // REEL è sempre video — ignora selezione manuale
  const effectiveMediaType: 'IMAGE' | 'VIDEO' = postType === 'REEL' ? 'VIDEO' : mediaType;
  // Tipi che permettono scelta foto/video
  const canChooseMediaType = postType === 'POST' || postType === 'STORY' || postType === 'CAROUSEL';

  // Se l'utente ha selezionato media manualmente, NON serve la generazione AI
  const hasManualMedia = selectedMedia.length > 0;

  // Post types disponibili per piattaforma
  const availableTypes = (): PostType[] => {
    if (platform === 'TIKTOK') return ['POST', 'REEL'];
    if (platform === 'FACEBOOK') return ['POST', 'STORY', 'REEL'];
    return ['POST', 'STORY', 'REEL', 'CAROUSEL'];
  };

  const generateWithAI = async (additionalContext?: string) => {
    if (!aiTopic) { toast.error('Inserisci un topic'); return; }
    setGenerating(true);
    try {
      // tenantId è necessario per caricare il provider AI configurato dal tenant.
      // In modalità bulk usa il primo tenant come riferimento per la generazione testo.
      const tid = tenantId ?? bulkTenantIds?.[0];
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'full_post',
          topic: aiTopic,
          tone: aiTone,
          postType,
          platform,
          additionalContext: additionalContext || undefined,
          ...(tid ? { tenantId: tid } : {}),
          ...(overrideModel ? { overrideModel } : {}),
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        if (json.data.needsClarification) {
          // L'AI ha bisogno di un chiarimento — mostra la domanda inline
          setAiClarification({
            question: json.data.clarificationQuestion ?? 'Puoi specificare meglio?',
            options: json.data.clarificationOptions ?? [],
          });
          setAiClarifyInput('');
          // Non toccare caption/hashtag esistenti
        } else {
          // Generazione riuscita
          setAiClarification(null);
          setAiClarifyInput('');
          setCaption(json.data.caption ?? '');
          setHashtag((json.data.hashtags ?? []).join(' '));

          // Auto-popola le scene dallo storyboard AI (solo per REEL)
          if (postType === 'REEL' && json.data.reelScript) {
            try {
              const raw: string = typeof json.data.reelScript === 'string'
                ? json.data.reelScript : JSON.stringify(json.data.reelScript);
              const s = raw.indexOf('{'); const e2 = raw.lastIndexOf('}');
              const storyboard = s !== -1 && e2 > s ? JSON.parse(raw.slice(s, e2 + 1)) : null;
              if (storyboard?.scenes?.length > 0) {
                setManualScenes(storyboard.scenes.map(
                  (sc: { visual?: string; script?: string; onScreenText?: string; transition?: string; duration?: string }, i: number) => ({
                    id: `ai-${Date.now()}-${i}`,
                    description: sc.visual || sc.script || '',   // campo visual (descrizione camera)
                    script: sc.script || undefined,              // narrazione vocale separata
                    onScreenText: sc.onScreenText || undefined,  // testo a schermo
                    transition: sc.transition || undefined,      // transizione
                    maxDurationSeconds: sc.duration ? (parseInt(sc.duration) || undefined) : undefined,
                  })
                ));
                setReelMeta({
                  hook: storyboard.hook ?? undefined,
                  music: storyboard.music ?? undefined,
                  cta: storyboard.cta ?? undefined,
                });
              }
            } catch { /* ignora errori di parsing */ }
          }

          toast.success('Contenuto generato!');
        }
      } else {
        toast.error(json.error ?? 'Errore');
      }
    } catch {
      toast.error('Errore di rete');
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const isBulk = bulkTenantIds && bulkTenantIds.length > 0;
      const targets: (string | undefined)[] = isBulk ? bulkTenantIds! : [tenantId];

      // Se l'utente ha selezionato media dalla libreria, usali direttamente (no AI generation)
      const mediaUrls = hasManualMedia ? selectedMedia.map(m => m.url) : [];

      let successCount = 0;
      for (const tid of targets) {
        const res = await fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
            platform,
            type: postType,
            caption,
            hashtags: hashtag.split(/\s+/).filter(h => h.startsWith('#')),
            mediaUrls,
            mediaType: effectiveMediaType,
            carouselCount: postType === 'CAROUSEL' ? carouselCount : undefined,
            imageDescription: !hasManualMedia ? (imageDescription || undefined) : undefined,
            inputMediaRefs: !hasManualMedia && referenceMedia.length > 0 ? referenceMedia : undefined,
            scheduledAt: scheduledAt || null,
            aiGenerated: !!aiTopic,
            aiPrompt: aiTopic || undefined,
            // Durata video (solo per VIDEO, ignorato per IMAGE)
            videoDuration: effectiveMediaType === 'VIDEO' ? videoDuration : undefined,
            // Aspect ratio: 9:16 per REEL (portrait), 16:9 per video standard
            videoAspectRatio: postType === 'REEL' ? '9:16' : (effectiveMediaType === 'VIDEO' ? '16:9' : undefined),
            // Storyboard REEL: scene manuali (se presenti), altrimenti nessuno storyboard
            reelScript: postType === 'REEL' ? buildManualReelScript() : undefined,
            // Override provider/modello per questa esecuzione (non modifica impostazioni globali)
            ...(overrideModel ? { overrideModel, ...(effectiveMediaType === 'VIDEO' ? { videoModel: overrideModel } : {}) } : {}),
            ...(tid ? { tenantId: tid } : {}),
            ...(!hasManualMedia && autoWatermarkEnabled ? {
              autoRemoveWatermark: true,
              wmPreset,
              wmMethod,
            } : {}),
          }),
        });
        const json = await res.json();
        if (json.success) successCount++;
      }

      if (isBulk) {
        if (successCount === targets.length) {
          const aiMsg = hasManualMedia ? '' : effectiveMediaType === 'VIDEO' ? " L'AI generera il video automaticamente." : " L'AI generera le immagini automaticamente.";
          toast.success(`Post creato per tutti i ${targets.length} clienti!${aiMsg}`);
        } else {
          toast.error(`Creato ${successCount}/${targets.length} post.`);
        }
      } else {
        if (successCount > 0) {
          const msg = scheduledAt ? 'schedulato' : 'salvato come bozza';
          const aiMsg = hasManualMedia ? '' : effectiveMediaType === 'VIDEO' ? " L'AI generera il video (coda Video AI)." : " L'AI generera l'immagine automaticamente.";
          toast.success(`Post ${msg}!${aiMsg}`);
        } else {
          toast.error('Errore salvataggio');
          return;
        }
      }
      onSuccess();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const platformColors: Record<Platform, string> = {
    INSTAGRAM: 'border-pink-500 bg-pink-500/10',
    FACEBOOK:  'border-blue-500 bg-blue-500/10',
    TIKTOK:    'border-cyan-500 bg-cyan-500/10',
  };

  const types = availableTypes();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-lg animate-slide-up max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Plus size={20} className="text-brand-400" />
              Crea nuovo post
            </h2>
            {bulkTenantIds && bulkTenantIds.length > 0 && (
              <p className="text-xs text-amber-500 dark:text-amber-400 mt-0.5">
                Modalita bulk — una bozza per {bulkTenantIds.length} clienti
              </p>
            )}
          </div>
          <button onClick={onClose} className="btn-ghost w-8 h-8 p-0">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Piattaforma */}
          <div>
            <label className="label">Piattaforma</label>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  onClick={() => { setPlatform(p); setPostType('POST'); }}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    platform === p ? platformColors[p] : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-center">
                    <PlatformIcon platform={p} size={28} />
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{getPlatformLabel(p)}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Tipo contenuto */}
          <div>
            <label className="label">Tipo contenuto</label>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${types.length}, 1fr)` }}>
              {types.map((t) => {
                const def = POST_TYPE_DEFS[t];
                return (
                  <button
                    key={t}
                    onClick={() => setPostType(t)}
                    className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                      postType === t
                        ? 'border-brand-500 bg-brand-500/10 text-brand-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600'
                    }`}
                  >
                    {def?.icon}
                    <span className="text-xs">{def?.label ?? t}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Selezione Tipo Media: Foto o Video ─────────────────────────── */}
          {canChooseMediaType && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-800/40 p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Tipo media da generare</span>
                <span className="text-xs text-gray-400 dark:text-gray-600">— solo per contenuto AI</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMediaType('IMAGE')}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all ${
                    mediaType === 'IMAGE'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  <Camera size={16} />
                  <span>📷 Foto</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMediaType('VIDEO')}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all ${
                    mediaType === 'VIDEO'
                      ? 'border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  <Video size={16} />
                  <span>🎬 Video</span>
                </button>
              </div>
              {postType === 'CAROUSEL' && (
                <div className="flex items-center gap-2 mt-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400">Numero slide carousel:</label>
                  <div className="flex gap-1">
                    {[2, 3, 4, 5, 6, 8, 10].map((n) => (
                      <button key={n} type="button"
                        onClick={() => setCarouselCount(n)}
                        className={`w-7 h-7 rounded-lg text-xs border transition-all ${
                          carouselCount === n ? 'border-brand-500 bg-brand-500/20 text-brand-600 dark:text-brand-300' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-400 dark:hover:border-gray-600'
                        }`}
                      >{n}</button>
                    ))}
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-600">({carouselCount} {mediaType === 'IMAGE' ? 'immagini' : 'video'})</span>
                </div>
              )}
              {mediaType === 'VIDEO' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-purple-400 bg-purple-500/8 border border-purple-500/20 rounded-lg px-3 py-2 mt-1">
                    <Video size={12} />
                    <span>Richiede modello <strong>Video AI (Veo)</strong> configurato in Provider AI → il job verrà messo in coda</span>
                  </div>
                  {/* Slider durata video */}
                  <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-purple-300 flex items-center gap-1.5">
                        ⏱️ Durata video
                      </label>
                      <span className="text-xs font-bold text-purple-300 bg-purple-500/15 border border-purple-500/30 rounded px-2 py-0.5">
                        {videoDuration}s
                        {videoDuration > 8 && <span className="text-[9px] ml-1 opacity-70">({calcNumClips(videoDuration)} clip)</span>}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={60}
                      step={1}
                      value={videoDuration}
                      onChange={(e) => setVideoDuration(Number(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                    <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
                      <span>5s</span>
                      <span className="text-purple-400/60">{videoDuration > 8 ? `🎬 ${calcNumClips(videoDuration)} clip in sequenza` : '🎬 singola clip'}</span>
                      <span>60s</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {postType === 'REEL' && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-purple-400 bg-purple-500/8 border border-purple-500/20 rounded-lg px-3 py-2">
                <Film size={12} />
                <span>Il Reel genera sempre un <strong>video</strong> tramite il modello Video AI (Veo) configurato</span>
              </div>
              {/* Slider durata reel */}
              <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 px-3 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-teal-300 flex items-center gap-1.5">
                    ⏱️ Durata Reel
                  </label>
                  <span className="text-xs font-bold text-teal-300 bg-teal-500/15 border border-teal-500/30 rounded px-2 py-0.5">
                    {videoDuration}s
                    {videoDuration > 8 && <span className="text-[9px] ml-1 opacity-70">({calcNumClips(videoDuration)} clip)</span>}
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={60}
                  step={1}
                  value={videoDuration}
                  onChange={(e) => setVideoDuration(Number(e.target.value))}
                  className="w-full accent-teal-500"
                />
                <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
                  <span>5s</span>
                  <span className="text-teal-400/60">{videoDuration > 8 ? `🎬 ${calcNumClips(videoDuration)} clip in sequenza` : '🎬 singola clip'}</span>
                  <span>60s</span>
                </div>
              </div>
            </div>
          )}

          {/* AI Generator */}
          <div className="bg-gray-100 dark:bg-gray-800/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Bot size={16} className="text-brand-400" />
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Genera contenuti con AI</span>
            </div>
            <input
              type="text"
              className="input"
              placeholder="Topic (es: nuovo prodotto, offerta speciale...)"
              value={aiTopic}
              onChange={(e) => { setAiTopic(e.target.value); setAiClarification(null); }}
            />
            <div className="flex gap-2">
              <select
                className="select flex-1 text-sm"
                value={aiTone}
                onChange={(e) => setAiTone(e.target.value as AITone)}
              >
                {TONE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <button onClick={() => generateWithAI()} disabled={generating} className="btn-primary text-xs px-4">
                {generating
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><Wand2 size={13} /> Genera</>
                }
              </button>
            </div>

            {/* Provider selector — override per questa esecuzione */}
            {(tenantId || bulkTenantIds?.[0]) && (
              <ProviderSelectorWidget
                tenantId={tenantId ?? bulkTenantIds?.[0]}
                jobType="text"
                value={overrideModel}
                onChange={setOverrideModel}
                label="Provider AI"
              />
            )}

            {/* Chiarimento AI — appare quando il provider chiede più contesto */}
            {aiClarification && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2.5">
                <div className="flex items-start gap-2">
                  <Bot size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide mb-0.5">L&apos;AI chiede un chiarimento</p>
                    <p className="text-xs text-gray-200">{aiClarification.question}</p>
                  </div>
                </div>
                {aiClarification.options.length > 0 && (
                  <div className="space-y-1.5">
                    {aiClarification.options.map((opt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => generateWithAI(`${opt.label}${opt.description ? `: ${opt.description}` : ''}`)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-gray-700 bg-gray-800/60 text-gray-300 hover:border-brand-500/50 hover:bg-brand-500/8 hover:text-white transition-all text-xs"
                      >
                        <span className="font-medium text-brand-300">{opt.label}</span>
                        {opt.description && <span className="text-gray-400 ml-1.5">— {opt.description}</span>}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-0.5">
                  <input
                    type="text"
                    value={aiClarifyInput}
                    onChange={e => setAiClarifyInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && aiClarifyInput.trim()) generateWithAI(aiClarifyInput.trim()); }}
                    placeholder="Oppure scrivi una risposta personalizzata..."
                    className="input flex-1 text-xs py-1.5"
                  />
                  <button
                    type="button"
                    disabled={!aiClarifyInput.trim() || generating}
                    onClick={() => generateWithAI(aiClarifyInput.trim())}
                    className="btn-primary text-xs px-3 disabled:opacity-50"
                  >
                    {generating ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Wand2 size={12} />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Caption */}
          <div>
            <label className="label">Caption</label>
            <textarea
              className="textarea h-28"
              placeholder="Scrivi la caption o usa l'AI..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>

          {/* ── Scene Manuali REEL (opzionale, sotto la caption) ──────────── */}
          {postType === 'REEL' && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-800/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">🎬 Scene storyboard</span>
                  <span className="text-[10px] text-gray-400">(visual + narrazione + durata per ogni clip)</span>
                </div>
                <button
                  type="button"
                  onClick={addScene}
                  className="text-[10px] text-teal-400 hover:text-teal-300 flex items-center gap-1 px-2 py-1 rounded-lg border border-teal-500/20 hover:border-teal-500/40 bg-teal-500/5 transition-all"
                >
                  <Plus size={10} /> Aggiungi scena
                </button>
              </div>
              {manualScenes.length === 0 ? (
                <p className="text-[10px] text-gray-500 italic">Nessuna scena aggiunta — le clip verranno generate in base alla durata totale impostata.</p>
              ) : (
                <div className="space-y-2">
                  {manualScenes.map((scene, i) => (
                    <div key={scene.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-2.5 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-teal-400 uppercase">Scena {i + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeScene(scene.id)}
                          className="ml-auto text-[10px] text-red-400 hover:text-red-300 p-0.5"
                          title="Rimuovi scena"
                        >
                          ✕
                        </button>
                      </div>
                      <textarea
                        className="textarea text-xs py-1.5 h-14 resize-none"
                        placeholder="🎥 Descrizione visuale (cosa mostra la camera)..."
                        value={scene.description}
                        onChange={e => updateScene(scene.id, { description: e.target.value })}
                      />
                      <textarea
                        className="textarea text-xs py-1.5 h-12 resize-none"
                        placeholder="🎙️ Narrazione vocale (voiceover, separato dal visual)..."
                        value={scene.script ?? ''}
                        onChange={e => updateScene(scene.id, { script: e.target.value || undefined })}
                      />
                      <input
                        type="text"
                        className="input text-xs py-1 h-7"
                        placeholder="📝 Testo a schermo (opz.)..."
                        value={scene.onScreenText ?? ''}
                        onChange={e => updateScene(scene.id, { onScreenText: e.target.value || undefined })}
                      />
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-gray-500 whitespace-nowrap">⏱ Durata (s):</label>
                        <div className="flex items-center gap-1.5 flex-1">
                          <input
                            type="number"
                            min={5}
                            max={8}
                            className="input text-xs py-1 h-7 w-20"
                            placeholder="5-8"
                            value={scene.maxDurationSeconds ?? ''}
                            onChange={e => updateScene(scene.id, { maxDurationSeconds: e.target.value ? Math.max(5, Math.min(8, Number(e.target.value))) : undefined })}
                          />
                          <span className="text-[10px] text-gray-500">sec (5-8s per clip Veo)</span>
                          {scene.maxDurationSeconds && (scene.maxDurationSeconds < 5 || scene.maxDurationSeconds > 8) && (
                            <span className="text-[9px] text-amber-400">range: 5-8s</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Hashtag */}
          {platform !== 'TIKTOK' && (
            <div>
              <label className="label">Hashtag</label>
              <input
                type="text"
                className="input"
                placeholder="#hashtag1 #hashtag2 ..."
                value={hashtag}
                onChange={(e) => setHashtag(e.target.value)}
              />
            </div>
          )}

          {/* ── MEDIA SECTION ─────────────────────────────────────────────── */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon size={15} className="text-purple-400" />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Media per il post</span>
              </div>
              {hasManualMedia ? (
                <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">Media manuale</span>
              ) : (
                <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">AI genera</span>
              )}
            </div>

            {/* Media picker dalla libreria */}
            <MediaPickerInline
              tenantId={tenantId}
              value={selectedMedia}
              onChange={setSelectedMedia}
            />

            {/* Se nessun media selezionato: AI genera automaticamente */}
            {!hasManualMedia ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/8 border border-emerald-500/20 rounded-lg px-3 py-2">
                  <Sparkles size={12} />
                  {effectiveMediaType === 'VIDEO'
                    ? <span>Il modello <strong>Video AI (Veo)</strong> genererà automaticamente la clip video (tramite coda)</span>
                    : <span>Il modello <strong>Immagini AI</strong> genererà automaticamente un&apos;immagine basata sulla caption (entro 5 min)</span>
                  }
                </div>
                {effectiveMediaType === 'IMAGE' && (
                  <div>
                    <label className="label text-xs flex items-center gap-1.5">
                      <Bot size={12} className="text-purple-400" />
                      Descrizione immagine per il modello AI
                      <span className="text-gray-500 font-normal">(opzionale)</span>
                    </label>
                    <input
                      type="text"
                      className="input text-sm"
                      placeholder="es: Ambiente moderno, colori chiari, prodotto in primo piano..."
                      value={imageDescription}
                      onChange={(e) => setImageDescription(e.target.value)}
                    />
                  </div>
                )}
                {/* Immagini di riferimento per la generazione AI — l'AI le usa come contesto visivo */}
                {effectiveMediaType === 'IMAGE' && (
                  <div className="pt-1">
                    <div className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-1">
                      <Bot size={12} className="text-brand-400" />
                      Immagini di riferimento per l&apos;AI
                      <span className="text-gray-400 dark:text-gray-500 font-normal">(opzionale) — l&apos;AI genererà un&apos;immagine coerente con queste</span>
                    </div>
                    <MediaPickerInline
                      tenantId={tenantId}
                      value={referenceMedia}
                      onChange={setReferenceMedia}
                    />
                    {referenceMedia.length > 0 && (
                      <p className="text-[10px] text-brand-400 mt-1">
                        ✓ {referenceMedia.length} immagine/i di riferimento — l&apos;AI utilizzerà lo stile e il contesto visivo per generare il media
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/8 border border-blue-500/20 rounded-lg px-3 py-2">
                <ImageIcon size={12} />
                <span>{selectedMedia.length} media selezionati — la generazione AI non e necessaria</span>
              </div>
            )}
          </div>

          {/* Provider selector per media AI (immagine / video) — quando non è manuale */}
          {!hasManualMedia && (tenantId || bulkTenantIds?.[0]) && (
            <ProviderSelectorWidget
              tenantId={tenantId ?? bulkTenantIds?.[0]}
              jobType={effectiveMediaType === 'VIDEO' ? 'video' : 'image'}
              value={overrideModel}
              onChange={setOverrideModel}
              label={effectiveMediaType === 'VIDEO' ? 'Modello Video AI' : 'Modello Immagini AI'}
            />
          )}

          {/* Scheduling */}
          <div>
            <label className="label">Schedula (opzionale)</label>
            <input
              type="datetime-local"
              className="input"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>

          {/* Auto-rimozione filigrana AI */}
          {!hasManualMedia && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={14} className="text-yellow-500 dark:text-yellow-400/70" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-rimozione filigrana AI</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoWatermarkEnabled(v => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${autoWatermarkEnabled ? 'bg-yellow-500' : 'bg-gray-300 dark:bg-gray-700'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoWatermarkEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {!autoWatermarkEnabled && (
                <p className="text-[11px] text-gray-400 dark:text-gray-600">
                  Applica automaticamente la rimozione filigrana subito dopo la generazione del media AI.
                </p>
              )}
              {autoWatermarkEnabled && (
                <div className="space-y-2 pt-1">
                  <p className="text-[11px] text-yellow-300/70">
                    ⚠️ La filigrana sarà rimossa automaticamente appena il media AI viene generato.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label text-xs">Posizione watermark</label>
                      <select className="select text-xs" value={wmPreset} onChange={e => setWmPreset(e.target.value)}>
                        <option value="bottom-right">↘️ Basso destra (Midjourney)</option>
                        <option value="bottom-left">↙️ Basso sinistra (Stable Diffusion)</option>
                        <option value="top-right">↗️ Alto destra (Bing, Gemini)</option>
                        <option value="top-left">↖️ Alto sinistra (Playground AI)</option>
                        <option value="center">📦 Centro (DALL-E, Firefly)</option>
                      </select>
                    </div>
                    <div>
                      <label className="label text-xs">Metodo rimozione</label>
                      <select className="select text-xs" value={wmMethod} onChange={e => setWmMethod(e.target.value as RemovalMethod)}>
                        <option value="taglio">✂️ Taglio (qualità max)</option>
                        <option value="distorsione">↔️ Distorsione</option>
                        <option value="dissolve">✨ Dissolvenza AI</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-gray-200 dark:border-gray-800 sticky bottom-0 bg-white dark:bg-gray-900">
          <button onClick={onClose} className="btn-secondary flex-1">Annulla</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">
            {saving
              ? 'Salvataggio...'
              : bulkTenantIds && bulkTenantIds.length > 0
                ? `Crea per ${bulkTenantIds.length} clienti`
                : scheduledAt
                  ? `Schedula su ${getPlatformLabel(platform)}`
                  : 'Salva bozza'}
          </button>
        </div>
      </div>
    </div>
  );
}
