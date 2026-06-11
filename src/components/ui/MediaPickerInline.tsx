'use client';
// src/components/ui/MediaPickerInline.tsx
// Selettore media dalla Libreria (usedInAI=true) per contestualizzare i prompt AI

import { useState, useEffect, useRef } from 'react';
import { Images, X, ZoomIn, Check, RefreshCw, Plus, Upload, Link, Loader2 } from 'lucide-react';
import type { AIMediaRef } from '@/types';

interface MediaAssetLight {
  id: string;
  url: string;
  name: string;
  alt: string | null;
  description: string | null;
  type: string;
}

interface MediaPickerInlineProps {
  tenantId?: string;
  siteId?: string;
  value: AIMediaRef[];
  onChange: (refs: AIMediaRef[]) => void;
}

type AddMode = 'file' | 'url';

export function MediaPickerInline({ tenantId, siteId, value, onChange }: MediaPickerInlineProps) {
  const [assets, setAssets] = useState<MediaAssetLight[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  // ── Stato mini-form aggiunta nuovo media ──────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('file');
  const [addUrl, setAddUrl] = useState('');
  const [addName, setAddName] = useState('');
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ usedInAI: 'true' });
      if (tenantId) params.set('tenantId', tenantId);
      if (siteId) params.set('siteId', siteId);
      const res = await fetch(`/api/media?${params}`);
      const json = await res.json();
      if (json.success) setAssets(json.data ?? []);
    } catch { setAssets([]); }
    finally { setLoading(false); }
  };

  // Carica quando si apre il picker
  useEffect(() => {
    if (open) loadAssets();
  }, [open, tenantId, siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apri automaticamente il form aggiunta se la libreria è vuota dopo il caricamento
  useEffect(() => {
    if (open && !loading && assets.length === 0) {
      setAddOpen(true);
    }
  }, [open, loading, assets.length]);

  // ── Aggiunta nuovo media ──────────────────────────────────────────────────
  const handleAdd = async () => {
    setAddError(null);
    if (addMode === 'url' && !addUrl.trim()) { setAddError('Inserisci un URL valido'); return; }
    if (addMode === 'file' && !addFile) { setAddError('Seleziona un file da caricare'); return; }

    setAddLoading(true);
    try {
      let asset: MediaAssetLight | null = null;

       if (addMode === 'url') {
         const res = await fetch('/api/media', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             url: addUrl.trim(),
             name: addName.trim() || addUrl.trim().split('/').pop() || 'media',
             usedInAI: true,
             ...(tenantId ? { tenantId } : {}),
             ...(siteId ? { siteId } : {}),
           }),
         });
         const json = await res.json();
         if (!json.success) throw new Error(json.error ?? 'Errore salvataggio');
         asset = json.data;
       } else {
         const fd = new FormData();
         fd.append('file', addFile!);
         fd.append('usedInAI', 'true');
         if (addName.trim()) fd.append('name', addName.trim());
         if (tenantId) fd.append('tenantId', tenantId);
         if (siteId) fd.append('siteId', siteId);
         const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
         const json = await res.json();
         if (!json.success) throw new Error(json.error ?? 'Errore upload');
         asset = json.data;
       }

      // Aggiunge alla lista locale e seleziona automaticamente
      if (asset) {
        setAssets(prev => [asset!, ...prev]);
        onChange([...value, {
          url: asset.url,
          alt: asset.alt,
          description: asset.description,
          type: asset.type,
        }]);
      }

      // Reset form
      setAddUrl('');
      setAddName('');
      setAddFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setAddOpen(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Errore sconosciuto');
    } finally {
      setAddLoading(false);
    }
  };

  const isSelected = (url: string) => value.some(v => v.url === url);

  const toggle = (asset: MediaAssetLight) => {
    if (isSelected(asset.url)) {
      onChange(value.filter(v => v.url !== asset.url));
    } else {
      onChange([...value, {
        url: asset.url,
        alt: asset.alt,
        description: asset.description,
        type: asset.type,
      }]);
    }
  };

  const remove = (url: string) => onChange(value.filter(v => v.url !== url));

  // ── Mini-form aggiunta media ──────────────────────────────────────────────
  const AddMediaForm = (
    <div className="border-t border-gray-800 bg-gray-950/60 p-3 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
          <Plus size={12} className="text-brand-400" />
          Aggiungi nuovo media
        </span>
        <button
          type="button"
          onClick={() => { setAddOpen(false); setAddError(null); }}
          className="btn-ghost p-0.5 text-gray-500 hover:text-gray-300"
        >
          <X size={12} />
        </button>
      </div>

      {/* Selettore modalità */}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setAddMode('file')}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-all ${
            addMode === 'file'
              ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
              : 'text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-600'
          }`}
        >
          <Upload size={11} /> Da file
        </button>
        <button
          type="button"
          onClick={() => setAddMode('url')}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-all ${
            addMode === 'url'
              ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
              : 'text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-600'
          }`}
        >
          <Link size={11} /> Da URL
        </button>
      </div>

      {/* Input file o URL */}
      {addMode === 'file' ? (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={e => setAddFile(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-gray-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-brand-500/20 file:text-brand-300 hover:file:bg-brand-500/30 cursor-pointer"
          />
        </div>
      ) : (
        <input
          type="url"
          placeholder="https://esempio.com/immagine.jpg"
          value={addUrl}
          onChange={e => setAddUrl(e.target.value)}
          className="input-field text-xs py-1.5 w-full"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
        />
      )}

      {/* Nome opzionale */}
      <input
        type="text"
        placeholder="Nome (opzionale)"
        value={addName}
        onChange={e => setAddName(e.target.value)}
        className="input-field text-xs py-1.5 w-full"
      />

      {addError && (
        <p className="text-xs text-red-400">{addError}</p>
      )}

      <button
        type="button"
        onClick={handleAdd}
        disabled={addLoading}
        className="btn-primary text-xs px-3 py-1.5 w-full flex items-center justify-center gap-1.5 disabled:opacity-60"
      >
        {addLoading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
        {addLoading ? 'Caricamento...' : 'Aggiungi e seleziona'}
      </button>
    </div>
  );

  return (
    <div className="space-y-2">
      <label className="label flex items-center gap-1.5">
        <Images size={13} className="text-gray-500" />
        Media di riferimento AI
        <span className="text-gray-500 font-normal">(opzionale)</span>
      </label>

      {/* Thumbnail selezionati */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map(ref => (
            <div key={ref.url} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-brand-500/40">
              {ref.type === 'VIDEO' ? (
                <div className="w-full h-full bg-gray-800 flex items-center justify-center text-2xl">🎬</div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ref.url} alt={ref.alt ?? ''} className="w-full h-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => remove(ref.url)}
                className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={10} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Bottone apri picker */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-gray-700 hover:border-brand-500/50 hover:bg-brand-500/5 transition-all text-xs text-gray-400 hover:text-gray-200 w-full justify-center"
      >
        <Images size={14} />
        {value.length > 0 ? `${value.length} media selezionati · Modifica selezione` : 'Seleziona media dalla libreria'}
      </button>

      {/* Pannello picker */}
      {open && (
        <div className="rounded-xl border border-gray-700 bg-gray-900 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
            <span className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
              <Images size={13} className="text-brand-400" />
              Libreria Media AI ({assets.length} disponibili)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setAddOpen(v => !v); setAddError(null); }}
                title="Aggiungi nuovo media"
                className={`btn-ghost p-1 transition-colors ${addOpen ? 'text-brand-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <Plus size={13} />
              </button>
              <button type="button" onClick={loadAssets} className="btn-ghost p-1 text-gray-500 hover:text-gray-300" title="Ricarica">
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              </button>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost p-1 text-gray-500 hover:text-gray-300">
                <X size={14} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-gray-500">
              <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mx-auto mb-2" />
              Caricamento...
            </div>
          ) : assets.length === 0 && !addOpen ? (
            <div className="p-8 text-center text-xs text-gray-500">
              <Images size={32} className="mx-auto mb-2 text-gray-700" />
              Nessun media disponibile.
              <br />
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="mt-2 inline-flex items-center gap-1 text-brand-400 hover:text-brand-300 underline-offset-2 hover:underline"
              >
                <Plus size={11} /> Aggiungi subito un media
              </button>
            </div>
          ) : assets.length > 0 ? (
            <div className="p-3 grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
              {assets.map(asset => {
                const selected = isSelected(asset.url);
                return (
                  <div
                    key={asset.id}
                    className={`relative group rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                      selected ? 'border-brand-500' : 'border-transparent hover:border-gray-600'
                    }`}
                    style={{ aspectRatio: '1' }}
                    onClick={() => toggle(asset)}
                  >
                    {asset.type === 'VIDEO' ? (
                      <div className="w-full h-full bg-gray-800 flex items-center justify-center text-3xl">🎬</div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={asset.url}
                        alt={asset.alt ?? asset.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    )}
                    {selected && (
                      <div className="absolute inset-0 bg-brand-500/20 flex items-center justify-center">
                        <div className="w-6 h-6 bg-brand-500 rounded-full flex items-center justify-center">
                          <Check size={12} className="text-white" />
                        </div>
                      </div>
                    )}
                    {/* Preview bottone */}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setPreview(asset.url); }}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ZoomIn size={10} className="text-white" />
                    </button>
                    {/* Nome troncato */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5 text-[9px] text-white truncate opacity-0 group-hover:opacity-100 transition-opacity">
                      {asset.name}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Form aggiunta nuovo media */}
          {addOpen && AddMediaForm}

          {value.length > 0 && (
            <div className="px-3 py-2 border-t border-gray-800 flex items-center justify-between">
              <span className="text-xs text-brand-400">{value.length} selezionati</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => onChange([])} className="text-xs text-red-400 hover:text-red-300">
                  Deseleziona tutti
                </button>
                <button type="button" onClick={() => setOpen(false)} className="btn-primary text-xs px-3 py-1">
                  Conferma
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal preview immagine */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="preview" className="max-w-full max-h-[80vh] rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}

