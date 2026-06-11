'use client';
// src/components/ui/WatermarkRemoverModal.tsx
// Modal rimozione filigrana — include disclaimer legale obbligatorio

import { useState } from 'react';
import {
  AlertTriangle, ShieldAlert, X, Download, Check,
  Loader2, ZoomIn, Lock, Scissors, Maximize2, Sparkles,
  UserCheck, Send,
} from 'lucide-react';

// ─── Tipi ──────────────────────────────────────────────────────
export type RemovalMethod = 'dissolve' | 'distorsione' | 'taglio';

export interface WatermarkRemoverProps {
  /** URL del media da elaborare. Se omesso, il modal mostra un campo URL interno */
  sourceUrl?: string;
  mediaType?: 'image' | 'video';
  tenantId?: string;
  onClose: () => void;
  onSuccess?: (outputUrl: string) => void;
  /** Se impostato, salta lo step di selezione metodo */
  initialMethod?: RemovalMethod;
  /** Chiamato quando l'utente accetta il disclaimer di responsabilità */
  onPublishAllowed?: (outputUrl: string) => void;
}

// ─── Categorie professionali legittime (per responsabilità) ───
const DISCLAIMER_CATEGORIES = [
  {
    key: 'researcher',
    icon: '🔬',
    label: 'Ricercatore / Accademico',
    desc: 'Utilizzo a fini di ricerca accademica, analisi tecnica o studio (Art. 3-4 Direttiva UE 2019/790)',
    legalBasis: 'Art. 3-4 Direttiva UE 2019/790 — Eccezione per text and data mining',
  },
  {
    key: 'developer',
    icon: '💻',
    label: 'Sviluppatore / Tecnico IT',
    desc: 'Test, dimostrazione tecnica e sviluppo di sistemi di computer vision, AI o machine learning',
    legalBasis: 'Uso tecnico dimostrativo non commerciale — Art. 5(3)(d) Dir. 2001/29/CE',
  },
  {
    key: 'educator',
    icon: '🎓',
    label: 'Educatore / Formatore',
    desc: "Utilizzo didattico interno per corsi, tutorial o materiale formativo non commerciale",
    legalBasis: 'Art. 5(3)(a) Direttiva 2001/29/CE — Eccezione per scopi illustrativi dell\'insegnamento',
  },
  {
    key: 'journalist',
    icon: '📰',
    label: 'Giornalista / Critico / Saggista',
    desc: 'Rendiconto critico, analisi giornalistica, commento o rassegna di opere esistenti',
    legalBasis: 'Art. 5(3)(c-d) Dir. 2001/29/CE — Citazione per critica, commento, rassegna',
  },
  {
    key: 'artist',
    icon: '🎨',
    label: 'Artista / Creativo',
    desc: 'Uso parodistico, trasformativo o critico espressamente riconosciuto da legge',
    legalBasis: 'Art. 5(3)(k) Dir. 2001/29/CE — Eccezione per parodia, caricatura, pastiche',
  },
];

type Step = 'legal' | 'method' | 'source_url' | 'region' | 'processing' | 'result';

const PRESETS = [
  { key: 'center',       label: '📦 Centro', desc: 'DALL-E, Adobe Firefly, Ideogram' },
  { key: 'bottom-right', label: '↘️ Basso destra', desc: 'Midjourney, Leonardo AI' },
  { key: 'bottom-left',  label: '↙️ Basso sinistra', desc: 'Stable Diffusion, Canva AI' },
  { key: 'top-right',    label: '↗️ Alto destra', desc: 'Bing Image Creator, Gemini' },
  { key: 'top-left',     label: '↖️ Alto sinistra', desc: 'Playground AI, altri generatori' },
];

const VIDEO_PRESETS = [
  { key: 'bottom-right', label: '↘️ Basso destra', desc: 'Kling AI, Hailuo, Pika Labs' },
  { key: 'bottom-left',  label: '↙️ Basso sinistra', desc: 'Google Veo, Sora, RunwayML' },
  { key: 'top-right',    label: '↗️ Alto destra', desc: 'Luma Dream Machine, Stable Video' },
  { key: 'top-left',     label: '↖️ Alto sinistra', desc: 'Wan Video, CogVideoX' },
  { key: 'center',       label: '📦 Centro', desc: 'Watermark in sovraimpressione centrale' },
];

const REMOVAL_METHODS: {
  key: RemovalMethod;
  icon: React.ReactNode;
  label: string;
  desc: string;
  badge?: string;
  badgeColor?: string;
  note: string;
}[] = [
  {
    key: 'dissolve',
    icon: <Sparkles size={22} className="text-yellow-400" />,
    label: 'Dissolvenza',
    desc: 'Dissolve la filigrana rigenerando il contenuto sottostante tramite AI.',
    badge: 'AI',
    badgeColor: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
    note: 'Usa DALL-E 2 se OpenAI è configurato, altrimenti blur locale. Ideale per filigrane centrali o su sfondi uniformi.',
  },
  {
    key: 'distorsione',
    icon: <Maximize2 size={22} className="text-blue-400" />,
    label: 'Distorsione',
    desc: 'Allunga l\'immagine orizzontalmente o verticalmente fino a tagliare la filigrana fuori dal bordo.',
    note: 'Il contenuto viene leggermente stirato nella direzione dell\'allungamento. Ottimo per filigrane ai bordi.',
  },
  {
    key: 'taglio',
    icon: <Scissors size={22} className="text-green-400" />,
    label: 'Taglio',
    desc: 'Ritaglia dinamicamente la finestra più ampia disponibile senza filigrana, mantenendo le stesse proporzioni.',
    note: 'Nessuna distorsione, massima qualità. Il risultato può mostrare una porzione diversa dell\'originale.',
  },
];

export function WatermarkRemoverModal({
  sourceUrl: externalSourceUrl,
  mediaType: externalMediaType,
  tenantId,
  onClose,
  onSuccess,
  initialMethod,
  onPublishAllowed,
}: WatermarkRemoverProps) {
  const [step, setStep] = useState<Step>('legal');
  const [legalChecks, setLegalChecks] = useState({ noPublish: false, mockupOnly: false, understoodLaw: false });
  const [selectedMethod, setSelectedMethod] = useState<RemovalMethod | ''>(initialMethod ?? '');
  const [selectedPreset, setSelectedPreset] = useState('');
  const [customRegion, setCustomRegion] = useState({ xPct: 20, yPct: 30, wPct: 60, hPct: 40 });
  const [useCustom, setUseCustom] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ outputUrl: string; method: string } | null>(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  // URL interno (quando non fornito dall'esterno)
  const [internalUrl, setInternalUrl] = useState('');
  const [internalMediaType, setInternalMediaType] = useState<'image' | 'video'>('image');

  const sourceUrl = externalSourceUrl || internalUrl;
  const mediaType = externalMediaType ?? internalMediaType;

  // ─── Disclaimer pubblicazione ─────────────────────────────────
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [disclaimerChecked, setDisclaimerChecked] = useState(false);
  const [publishAllowed, setPublishAllowed] = useState(false);

  const allLegalAccepted = legalChecks.noPublish && legalChecks.mockupOnly && legalChecks.understoodLaw;
  const presets = mediaType === 'video' ? VIDEO_PRESETS : PRESETS;

  const isVideoUrl = (u: string) => /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(u);

  // ─── Step 1 → step successivo ────────────────────────────────
  const goToMethod = () => {
    if (!allLegalAccepted) return;
    if (initialMethod) {
      // metodo già scelto dal widget esterno
      if (externalSourceUrl) {
        setStep('region');
      } else {
        setStep('source_url');
      }
    } else {
      setStep('method');
    }
  };

  // ─── Step metodo → source_url o region ───────────────────────
  const goToRegion = () => {
    if (!selectedMethod) return;
    if (externalSourceUrl) {
      setStep('region');
    } else {
      setStep('source_url');
    }
  };

  // ─── Step source_url → region ────────────────────────────────
  const goToRegionFromUrl = () => {
    if (!internalUrl.trim()) return;
    if (isVideoUrl(internalUrl)) setInternalMediaType('video');
    setStep('region');
  };

  // ─── Elaborazione ─────────────────────────────────────────────
  const handleProcess = async () => {
    if (!useCustom && !selectedPreset) return;
    setProcessing(true);
    setError('');
    setStep('processing');

    try {
      const res = await fetch('/api/media/remove-watermark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl,
          mediaType,
          tenantId,
          consentHash: 'ACCEPTED_LEGAL_WATERMARK_REMOVAL_2026',
          preset: useCustom ? 'custom' : selectedPreset,
          customRegion: useCustom ? customRegion : undefined,
          removalMethod: selectedMethod || 'dissolve',
        }),
      });
      const json = await res.json();
      if (json.success) {
        setResult({ outputUrl: json.outputUrl, method: json.method });
        setStep('result');
        onSuccess?.(json.outputUrl);
      } else {
        setError(json.error ?? 'Errore elaborazione');
        setStep('region');
      }
    } catch {
      setError('Errore di rete');
      setStep('region');
    } finally {
      setProcessing(false);
    }
  };

  // ─── Download ──────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!result) return;
    setDownloading(true);
    try {
      const res = await fetch(result.outputUrl);
      const blob = await res.blob();
      const ext = mediaType === 'video' ? 'mp4' : 'png';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mockup_${Date.now()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">

        {/* ─── Step 1: Disclaimer legale ─────────────────────────── */}
        {step === 'legal' && (
          <div className="p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                <ShieldAlert size={20} className="text-red-400" />
              </div>
              <div>
                <h2 className="font-bold text-white text-lg">Rimozione Watermark AI</h2>
                <p className="text-sm text-red-400 font-medium">Leggi attentamente prima di continuare</p>
              </div>
              <button onClick={onClose} className="ml-auto btn-ghost p-1.5 text-gray-500 flex-shrink-0">
                <X size={16} />
              </button>
            </div>

            {/* Box avviso principale */}
            <div className="p-4 rounded-xl bg-red-500/5 border-2 border-red-500/30 space-y-3">
              <div className="flex items-center gap-2 text-red-300 font-bold text-sm">
                <AlertTriangle size={16} />
                AVVISO LEGALE IMPORTANTE
              </div>
              <div className="text-sm text-gray-300 space-y-2">
                <p>
                  Questo strumento rimuove il <strong className="text-yellow-300">watermark automatico</strong> che i servizi AI di generazione
                  media (Midjourney, DALL-E, Google Veo, RunwayML, Kling ecc.) appongono sull&apos;output in versione gratuita o di prova.
                </p>
                <p>
                  Il contenuto elaborato rimane comunque soggetto ai <strong className="text-red-300">Termini di Servizio del generatore AI</strong> che lo ha creato.
                  L&apos;uso commerciale è consentito solo se il tuo piano/licenza con quel servizio lo prevede esplicitamente.
                </p>
                <p>
                  Questo strumento è previsto <strong className="text-yellow-300">esclusivamente per:</strong>
                </p>
                <ul className="list-none space-y-1 pl-2">
                  <li className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    <span>Contenuti AI generati tramite <strong>Post Manager, AI Generator o Video AI</strong> di questa app</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    <span>Creare <strong>mockup e anteprime</strong> per mostrare idee ai propri clienti</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    <span>Presentazioni dove il mockup verrà <strong>sostituito con contenuto in licenza</strong></span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Box cosa è VIETATO */}
            <div className="p-4 rounded-xl bg-gray-800 border border-gray-700 space-y-2">
              <div className="text-sm font-bold text-gray-200">🚫 È ASSOLUTAMENTE VIETATO:</div>
              <ul className="text-sm text-gray-400 space-y-1">
                <li className="flex items-start gap-2"><Lock size={12} className="text-red-400 mt-1 flex-shrink-0" />Pubblicare il contenuto su social media, siti web o qualsiasi piattaforma pubblica</li>
                <li className="flex items-start gap-2"><Lock size={12} className="text-red-400 mt-1 flex-shrink-0" />Usarlo in materiali pubblicitari o commerciali se il tuo piano AI non prevede uso commerciale</li>
                <li className="flex items-start gap-2"><Lock size={12} className="text-red-400 mt-1 flex-shrink-0" />Distribuirlo o condividerlo come se fosse contenuto di propria creazione originale</li>
                <li className="flex items-start gap-2"><Lock size={12} className="text-red-400 mt-1 flex-shrink-0" />Violare i Termini di Servizio del generatore AI che ha prodotto il contenuto</li>
              </ul>
              <p className="text-xs text-gray-500 pt-1">
                Riferimenti normativi: D.Lgs. 68/2003 · Direttiva UE 2019/790 · ToS del provider AI utilizzato
              </p>
            </div>

            {/* Checkboxes consenso */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-300">
                Devi confermare tutti i seguenti punti per continuare:
              </p>

              {[
                {
                  key: 'noPublish' as const,
                  text: 'Confermo che <strong>non pubblicherò</strong> il contenuto con watermark rimosso su alcuna piattaforma pubblica o commerciale senza aver verificato la licenza del generatore AI.',
                },
                {
                  key: 'mockupOnly' as const,
                  text: 'Confermo che utilizzerò il risultato <strong>esclusivamente come mockup interno</strong> generato dagli strumenti AI di questa app (Post Manager, AI Generator o Video AI).',
                },
                {
                  key: 'understoodLaw' as const,
                  text: 'Ho letto e compreso le <strong>implicazioni legali e i ToS del provider AI</strong> e mi assumo la piena responsabilità dell\'uso che farò di questo strumento.',
                },
              ].map(({ key, text }) => (
                <label
                  key={key}
                  className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-all
                    ${legalChecks[key]
                      ? 'bg-green-500/5 border-green-500/30'
                      : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'}`}
                >
                  <div
                    onClick={() => setLegalChecks(prev => ({ ...prev, [key]: !prev[key] }))}
                    className={`w-5 h-5 rounded flex-shrink-0 mt-0.5 border-2 transition-all flex items-center justify-center
                      ${legalChecks[key] ? 'bg-green-500 border-green-500' : 'border-gray-600'}`}
                  >
                    {legalChecks[key] && <Check size={12} className="text-white" />}
                  </div>
                  <span
                    className="text-sm text-gray-300"
                    dangerouslySetInnerHTML={{ __html: text }}
                  />
                </label>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={goToMethod}
                disabled={!allLegalAccepted}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2
                  ${allLegalAccepted
                    ? 'bg-yellow-500 hover:bg-yellow-400 text-black'
                    : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
              >
                {allLegalAccepted ? <><Check size={15} /> Ho capito, continua</> : <><Lock size={15} /> Accetta tutti i termini</>}
              </button>
              <button onClick={onClose} className="btn-secondary px-4">Annulla</button>
            </div>
          </div>
        )}

        {/* ─── Step 2: Selezione metodo ──────────────────────────── */}
        {step === 'method' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
                <Sparkles size={16} className="text-yellow-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Come vuoi rimuovere la filigrana?</h3>
                <p className="text-xs text-gray-500">Scegli il metodo più adatto al tuo caso</p>
              </div>
              <button onClick={onClose} className="ml-auto btn-ghost p-1.5 text-gray-500"><X size={14} /></button>
            </div>

            <div className="space-y-3">
              {REMOVAL_METHODS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setSelectedMethod(m.key)}
                  className={`w-full p-4 rounded-xl border text-left transition-all space-y-1
                    ${selectedMethod === m.key
                      ? 'border-yellow-500/50 bg-yellow-500/8 ring-1 ring-yellow-500/30'
                      : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
                      ${selectedMethod === m.key ? 'bg-gray-700' : 'bg-gray-800'}`}>
                      {m.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">{m.label}</span>
                        {m.badge && (
                          <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${m.badgeColor}`}>
                            {m.badge}
                          </span>
                        )}
                        {selectedMethod === m.key && (
                          <span className="ml-auto"><Check size={14} className="text-yellow-400" /></span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{m.desc}</p>
                    </div>
                  </div>
                  {selectedMethod === m.key && (
                    <div className="mt-2 ml-13 pl-13 flex items-start gap-2 p-2 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-400">
                      <AlertTriangle size={11} className="flex-shrink-0 mt-0.5 text-yellow-500" />
                      {m.note}
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={goToRegion}
                disabled={!selectedMethod}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2
                  ${selectedMethod
                    ? 'bg-yellow-500 hover:bg-yellow-400 text-black'
                    : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
              >
                Continua →
              </button>
              <button onClick={() => setStep('legal')} className="btn-secondary px-3">← Indietro</button>
            </div>
          </div>
        )}

        {/* ─── Step URL interno (quando sourceUrl non è fornito) ── */}
        {step === 'source_url' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
                <ZoomIn size={16} className="text-yellow-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Qual è il media AI da elaborare?</h3>
                <p className="text-xs text-gray-500">Incolla l&apos;URL del contenuto generato dall&apos;AI (Post Manager, AI Generator o Video AI)</p>
              </div>
              <button onClick={onClose} className="ml-auto btn-ghost p-1.5 text-gray-500"><X size={14} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">URL output AI (immagine o video generato)</label>
                <input
                  type="url"
                  className="input"
                  placeholder="https://… oppure URL interno /api/media/…"
                  value={internalUrl}
                  onChange={(e) => setInternalUrl(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-gray-600 mt-1">
                  ℹ️ Se hai già aperto questo pannello da un job completato, l&apos;URL viene compilato automaticamente.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setInternalMediaType('image')}
                  className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all ${internalMediaType === 'image' ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-200' : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}
                >🖼️ Immagine</button>
                <button
                  onClick={() => setInternalMediaType('video')}
                  className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all ${internalMediaType === 'video' ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-200' : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}
                >🎬 Video</button>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={goToRegionFromUrl}
                disabled={!internalUrl.trim()}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${internalUrl.trim() ? 'bg-yellow-500 hover:bg-yellow-400 text-black' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
              >
                Continua →
              </button>
              <button onClick={() => setStep(initialMethod ? 'legal' : 'method')} className="btn-secondary px-3">← Indietro</button>
            </div>
          </div>
        )}

        {/* ─── Step 3: Selezione zona ────────────────────────────── */}
        {step === 'region' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
                <ZoomIn size={16} className="text-yellow-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Dove si trova il watermark AI?</h3>
                <p className="text-xs text-gray-500">Seleziona la posizione del watermark nel media generato</p>
              </div>
              <button onClick={onClose} className="ml-auto btn-ghost p-1.5 text-gray-500"><X size={14} /></button>
            </div>

            {/* Badge metodo selezionato */}
            {selectedMethod && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-300">
                <span className="text-gray-500">Metodo:</span>
                <span className="font-semibold text-yellow-300 capitalize">{selectedMethod}</span>
                <button
                  onClick={() => setStep('method')}
                  className="ml-auto text-xs text-gray-500 hover:text-gray-300 underline"
                >
                  Cambia
                </button>
              </div>
            )}

            {/* Anteprima media */}
            <div className="relative rounded-xl overflow-hidden bg-gray-800 border border-gray-700">
              {mediaType === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sourceUrl} alt="Anteprima" className="w-full max-h-48 object-contain" />
              ) : (
                <video src={sourceUrl} className="w-full max-h-48 object-contain" controls muted />
              )}
              <div className="absolute bottom-2 left-2 px-2 py-1 rounded-md bg-black/70 text-xs text-yellow-400">
                ⚠️ Solo uso interno
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Presets */}
            <div>
              <label className="label">Posizione watermark AI (preimpostata per provider)</label>
              <div className="grid grid-cols-2 gap-2">
                {presets.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => { setSelectedPreset(p.key); setUseCustom(false); }}
                    className={`p-3 rounded-xl border text-left text-sm transition-all
                      ${selectedPreset === p.key && !useCustom
                        ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-200'
                        : 'border-gray-700 text-gray-300 hover:border-gray-600'}`}
                  >
                    <div className="font-medium">{p.label}</div>
                    <div className="text-xs text-gray-500">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom */}
            <div>
              <button
                onClick={() => { setUseCustom(v => !v); setSelectedPreset(''); }}
                className={`text-sm w-full p-2.5 rounded-xl border transition-all text-left
                  ${useCustom ? 'border-brand-500/40 bg-brand-500/10 text-brand-300' : 'border-gray-700 text-gray-500 hover:border-gray-600'}`}
              >
                ⚙️ Personalizzata (coordinate % personalizzate)
              </button>
              {useCustom && (
                <div className="mt-2 grid grid-cols-2 gap-2 p-3 rounded-xl bg-gray-800 border border-gray-700">
                  {([
                    ['xPct', 'Sinistra %'],
                    ['yPct', 'Alto %'],
                    ['wPct', 'Larghezza %'],
                    ['hPct', 'Altezza %'],
                  ] as const).map(([k, label]) => (
                    <div key={k}>
                      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                      <input
                        type="number" min={0} max={100}
                        className="input py-1.5 text-sm"
                        value={customRegion[k]}
                        onChange={(e) => setCustomRegion(prev => ({ ...prev, [k]: Number(e.target.value) }))}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Warning token AI — solo per dissolve */}
            {selectedMethod === 'dissolve' && mediaType === 'image' && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-blue-300">
                <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                Se è configurato OpenAI, verrà usato DALL-E 2 per l&apos;inpainting AI (≈1000 token).
                Altrimenti viene usata elaborazione locale (qualità inferiore).
              </div>
            )}
            {selectedMethod === 'dissolve' && mediaType === 'video' && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 text-xs text-purple-300">
                <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                L&apos;elaborazione video usa il filtro <code>delogo</code> di ffmpeg. Il tempo varia in base alla durata del video.
              </div>
            )}
            {selectedMethod === 'distorsione' && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-blue-300">
                <Maximize2 size={12} className="flex-shrink-0 mt-0.5" />
                Il {mediaType === 'video' ? 'video' : "l'immagine"} verrà stirato verso il bordo più vicino alla filigrana. Più la filigrana è in posizione marginale, più il risultato sarà naturale.
              </div>
            )}
            {selectedMethod === 'taglio' && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-green-500/5 border border-green-500/20 text-xs text-green-300">
                <Scissors size={12} className="flex-shrink-0 mt-0.5" />
                Verrà identificata la finestra più ampia disponibile senza filigrana, mantenendo le proporzioni originali. Nessuna distorsione visiva.
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleProcess}
                disabled={(!selectedPreset && !useCustom) || processing}
                className="btn-primary flex-1 disabled:opacity-40"
              >
                <Loader2 size={14} />
                Rimuovi filigrana
              </button>
              <button onClick={() => setStep(externalSourceUrl ? 'method' : 'source_url')} className="btn-secondary px-3">← Indietro</button>
            </div>
          </div>
        )}

        {/* ─── Step 4: Elaborazione ──────────────────────────────── */}
        {step === 'processing' && (
          <div className="p-10 text-center space-y-4">
            <div className="w-14 h-14 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <h3 className="font-semibold text-white">Elaborazione in corso...</h3>
            <p className="text-sm text-gray-400">
              {selectedMethod === 'dissolve'
                ? (mediaType === 'video'
                  ? 'Il video viene elaborato frame per frame con ffmpeg. Potrebbe richiedere qualche minuto.'
                  : "L'AI sta rigenerando la zona della filigrana. Attendi qualche secondo.")
                : selectedMethod === 'distorsione'
                  ? `Distorsione ${mediaType === 'video' ? 'video' : 'immagine'} in corso...`
                  : `Taglio smart in corso — ricerca della finestra ottimale...`}
            </p>
            <div className="text-xs text-gray-600">⚠️ Non chiudere questa finestra</div>
          </div>
        )}

        {/* ─── Step 5: Risultato ────────────────────────────────── */}
        {step === 'result' && result && (
          <div className="p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                <Check size={16} className="text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Elaborazione completata</h3>
                <p className="text-xs text-gray-500">Metodo: {result.method}</p>
              </div>
              <button onClick={onClose} className="ml-auto btn-ghost p-1.5 text-gray-500"><X size={14} /></button>
            </div>

            {/* Anteprima risultato */}
            <div className="relative rounded-xl overflow-hidden bg-gray-800 border border-gray-700">
              {mediaType === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.outputUrl} alt="Risultato" className="w-full max-h-60 object-contain" />
              ) : (
                <video src={result.outputUrl} className="w-full max-h-60 object-contain" controls />
              )}
            </div>

            {/* ⚠️ Box legale del risultato — molto visibile */}
            <div className="p-4 rounded-xl bg-red-500/10 border-2 border-red-500/30 space-y-2">
              <div className="flex items-center gap-2 font-bold text-red-300 text-sm">
                <ShieldAlert size={15} />
                RICORDA: SOLO USO INTERNO — VERIFICA LA LICENZA DEL TUO PIANO AI PRIMA DI PUBBLICARE
              </div>
              <p className="text-xs text-gray-400">
                Questo file è disponibile <strong className="text-yellow-300">esclusivamente per download e uso come mockup interno</strong>.
                La pubblicazione commerciale è consentita solo se il tuo piano con il provider AI (OpenAI, Google, Kling, ecc.) lo prevede.
                In caso contrario viola i ToS del servizio e il diritto d&apos;autore (D.Lgs. 68/2003, Dir. UE 2019/790).
              </p>
            </div>

            {/* Pulsanti — Download + sezione pubblicazione */}
            <div className="space-y-2">
              {/* Download sempre disponibile */}
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              >
                {downloading
                  ? <><Loader2 size={15} className="animate-spin" /> Download in corso...</>
                  : <><Download size={15} /> Scarica per uso interno (mockup)</>}
              </button>

              {/* Sezione pubblicazione — espandibile con disclaimer */}
              {!publishAllowed ? (
                !showDisclaimer ? (
                  <button
                    onClick={() => setShowDisclaimer(true)}
                    className="w-full py-2.5 rounded-xl border border-orange-500/30 bg-orange-500/5 text-orange-300 hover:bg-orange-500/10 text-sm font-medium flex items-center justify-center gap-2 transition-all"
                  >
                    <AlertTriangle size={14} />
                    Pubblica comunque — Dichiarazione di responsabilità
                  </button>
                ) : (
                  <div className="p-4 rounded-xl bg-gray-800/80 border border-orange-500/40 space-y-4">
                    {/* Header disclaimer */}
                    <div className="flex items-center gap-2">
                      <UserCheck size={16} className="text-orange-400 flex-shrink-0" />
                      <span className="font-semibold text-orange-200 text-sm">Dichiarazione di Responsabilità Personale</span>
                      <button onClick={() => setShowDisclaimer(false)} className="ml-auto btn-ghost p-1 text-gray-500">
                        <X size={12} />
                      </button>
                    </div>

                    <p className="text-xs text-gray-400">
                      Per procedere alla pubblicazione devi qualificarti nella categoria professionale che giustifica legalmente il tuo utilizzo.
                      Seleziona quella più appropriata alla tua situazione:
                    </p>

                    {/* Selezione categoria */}
                    <div className="space-y-1.5">
                      {DISCLAIMER_CATEGORIES.map(cat => (
                        <label
                          key={cat.key}
                          className={`flex items-start gap-3 p-2.5 rounded-xl cursor-pointer border transition-all ${
                            selectedCategory === cat.key
                              ? 'border-orange-500/40 bg-orange-500/8'
                              : 'border-gray-700 hover:border-gray-600'
                          }`}
                        >
                          <div
                            onClick={() => setSelectedCategory(cat.key)}
                            className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                              selectedCategory === cat.key ? 'border-orange-500 bg-orange-500' : 'border-gray-600'
                            }`}
                          >
                            {selectedCategory === cat.key && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <div>
                            <div className="text-xs font-medium text-gray-200">{cat.icon} {cat.label}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{cat.desc}</div>
                            {selectedCategory === cat.key && (
                              <div className="text-[10px] text-orange-400/70 mt-1 italic">Riferimento: {cat.legalBasis}</div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>

                    {/* Testo esonero responsabilità */}
                    {selectedCategory && (
                      <div className="p-3 rounded-xl bg-gray-900 border border-gray-700 text-[11px] text-gray-400 space-y-2 max-h-40 overflow-y-auto">
                        <p className="font-semibold text-gray-300">⚖️ Dichiarazione legale — Leggere attentamente</p>
                        <p>
                          Io sottoscritto, in qualità di{' '}
                          <strong className="text-orange-300">{DISCLAIMER_CATEGORIES.find(c => c.key === selectedCategory)?.label}</strong>,
                          dichiaro sotto la mia <strong>personale ed esclusiva responsabilità</strong> che:
                        </p>
                        <ol className="list-decimal pl-4 space-y-1">
                          <li>Il contenuto elaborato verrà utilizzato <strong>esclusivamente</strong> nell&apos;ambito delle attività previste dalla categoria professionale selezionata;</li>
                          <li>Tale utilizzo rientra nelle <strong>eccezioni e limitazioni al diritto d&apos;autore</strong> previste dalla normativa applicabile;</li>
                          <li>Assumo piena responsabilità civile e penale per qualsiasi utilizzo che ecceda i limiti delle suddette eccezioni;</li>
                          <li>Ho verificato autonomamente che il mio caso specifico rientri nelle eccezioni di legge invocate.</li>
                        </ol>
                        <div className="mt-2 p-2 rounded-lg bg-orange-500/5 border border-orange-500/20">
                          <p className="text-orange-300/80 font-medium">⚠️ Esonero di responsabilità della piattaforma</p>
                          <p className="mt-1">
                            La piattaforma Pineapple Social Manager, i suoi sviluppatori e gestori si escludono da qualsiasi responsabilità
                            civile, penale o amministrativa derivante dall&apos;utilizzo improprio di questo strumento.
                            Lo strumento è fornito &quot;as-is&quot; per usi tecnici legittimi. L&apos;utente è l&apos;unico responsabile
                            del rispetto delle leggi vigenti nella propria giurisdizione.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Checkbox conferma */}
                    {selectedCategory && (
                      <label className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                        disclaimerChecked ? 'bg-orange-500/5 border-orange-500/30' : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                      }`}>
                        <div
                          onClick={() => setDisclaimerChecked(v => !v)}
                          className={`w-5 h-5 rounded flex-shrink-0 mt-0.5 border-2 transition-all flex items-center justify-center ${
                            disclaimerChecked ? 'bg-orange-500 border-orange-500' : 'border-gray-600'
                          }`}
                        >
                          {disclaimerChecked && <Check size={12} className="text-white" />}
                        </div>
                        <span className="text-xs text-gray-300">
                          Dichiaro di aver letto e compreso la dichiarazione di responsabilità.
                          Mi assumo personalmente e integralmente ogni responsabilità legale derivante dalla pubblicazione
                          di questo contenuto, esonerando esplicitamente la piattaforma da qualsiasi pretesa.
                        </span>
                      </label>
                    )}

                    {/* Pulsante conferma pubblicazione */}
                    <button
                      disabled={!selectedCategory || !disclaimerChecked}
                      onClick={() => {
                        if (!result) return;
                        setPublishAllowed(true);
                        setShowDisclaimer(false);
                        onPublishAllowed?.(result.outputUrl);
                      }}
                      className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                        selectedCategory && disclaimerChecked
                          ? 'bg-orange-500 hover:bg-orange-400 text-white'
                          : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      <UserCheck size={15} />
                      Confermo — Consento la pubblicazione sotto mia responsabilità
                    </button>
                  </div>
                )
              ) : (
                /* Pubblicazione consentita */
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-xs text-orange-300">
                    <UserCheck size={14} className="flex-shrink-0" />
                    <span>
                      <strong>Dichiarazione accettata.</strong> La pubblicazione è consentita sotto la tua esclusiva responsabilità.
                      La piattaforma è esonerata da qualsiasi responsabilità.
                    </span>
                  </div>
                  <button
                    className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-semibold flex items-center justify-center gap-2 transition-all"
                    onClick={onClose}
                  >
                    <Send size={15} />
                    Procedi alla pubblicazione (sotto tua responsabilità)
                  </button>
                </div>
              )}
            </div>

            <button onClick={onClose} className="w-full btn-secondary py-2">Chiudi</button>
          </div>
        )}
      </div>
    </div>
  );
}

