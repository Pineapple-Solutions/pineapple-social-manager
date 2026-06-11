'use client';
// src/app/sites/page.tsx — Siti collegati (tenant-scoped)

import { useState, useEffect, useCallback } from 'react';
import { Plus, Globe, Trash2, ExternalLink, Building2, AlertCircle, Edit2, Check, X, ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTenantFilter } from '@/lib/hooks/useTenantFilter';

interface Site {
  id: string; name: string; url: string;
  description?: string; niche?: string; language: string;
  logoUrl?: string | null;
  isActive: boolean; tenantId: string | null; createdAt: string;
  tenant?: { name: string; slug: string };
}

// Componente avatar: mostra favicon o fallback Globe
function SiteAvatar({ logoUrl, name }: { logoUrl?: string | null; name: string }) {
  const [error, setError] = useState(false);
  if (logoUrl && !error) {
    return (
      <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={name}
          className="w-7 h-7 object-contain"
          onError={() => setError(true)}
        />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center flex-shrink-0">
      <Globe size={18} className="text-brand-400" />
    </div>
  );
}

export default function SitesPage() {
  const { tenants, selectedTenant, setSelectedTenant, currentUser, isMaster, ready } = useTenantFilter();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ url: '', name: '', niche: '', description: '', logoUrl: '', tenantId: '' });

  const fetchSites = useCallback(async () => {
    setLoading(true);
    try {
      const params = selectedTenant ? `?tenantId=${selectedTenant}` : '';
      const res = await fetch(`/api/sites${params}`);
      const json = await res.json();
      if (json.success) setSites(json.data ?? []);
      else if (json.error) toast.error(json.error);
    } finally {
      setLoading(false);
    }
  }, [selectedTenant]);

  useEffect(() => {
    if (ready) fetchSites();
  }, [fetchSites, ready]);

  const resetForm = () => setForm({ url: '', name: '', niche: '', description: '', logoUrl: '', tenantId: '' });

  const startEdit = (site: Site) => {
    setForm({
      url: site.url,
      name: site.name,
      niche: site.niche ?? '',
      description: site.description ?? '',
      logoUrl: site.logoUrl ?? '',
      tenantId: site.tenantId ?? '',
    });
    setEditingId(site.id);
    setShowForm(true);
  };

  const addSite = async () => {
    if (!form.url) { toast.error('URL obbligatorio'); return; }
    const tenantIdToUse = tenants.length > 1 ? (form.tenantId || selectedTenant) : selectedTenant;
    if (!tenantIdToUse) { toast.error('Seleziona prima un cliente a cui associare il sito'); return; }
    setAdding(true);
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: form.url,
          name: form.name || undefined,
          niche: form.niche || undefined,
          logoUrl: form.logoUrl || undefined,
          tenantId: tenantIdToUse,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('✅ Sito aggiunto!');
        resetForm();
        setShowForm(false);
        fetchSites();
      } else {
        toast.error(json.error ?? 'Errore');
      }
    } finally {
      setAdding(false);
    }
  };

  const saveSite = async () => {
    if (!form.url || !form.name) { toast.error('URL e nome obbligatori'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/sites/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: form.url,
          name: form.name,
          niche: form.niche || null,
          description: form.description || null,
          logoUrl: form.logoUrl || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Sito aggiornato!');
        setShowForm(false);
        setEditingId(null);
        resetForm();
        fetchSites();
      } else {
        toast.error(json.error ?? 'Errore');
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (site: Site) => {
    const res = await fetch(`/api/sites/${site.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !site.isActive }),
    });
    const json = await res.json();
    if (json.success) fetchSites();
    else toast.error(json.error ?? 'Errore');
  };

  const deleteSite = async (id: string, siteName: string) => {
    if (!confirm(`Rimuovere il sito "${siteName}"?`)) return;
    const res = await fetch(`/api/sites/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) { toast.success('Sito rimosso'); fetchSites(); }
    else toast.error(json.error ?? 'Errore');
  };

  const hasMultipleTenants = tenants.length > 1;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Siti Collegati</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Ogni cliente ha i propri siti — l'AI li usa per generare contenuti contestuali
          </p>
        </div>
        <button onClick={() => { resetForm(); setEditingId(null); setShowForm(!showForm); }} className="btn-primary text-sm">
          <Plus size={14} /> Aggiungi sito
        </button>
      </div>

      {/* Tenant selector */}
      {hasMultipleTenants && (
        <div className="card p-4">
          <label className="label">Filtra per cliente</label>
          <select className="select" value={selectedTenant} onChange={(e) => setSelectedTenant(e.target.value)}>
            {isMaster && <option value="">Tutti i clienti</option>}
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      {/* Avviso se utente non ha tenant assegnato */}
      {!isMaster && !currentUser?.tenantId && (
        <div className="card p-4 border-yellow-500/20 bg-yellow-500/5 flex gap-3">
          <AlertCircle size={18} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-300">
            Il tuo account non è associato a nessun cliente. Contatta l'amministratore per essere assegnato a un cliente.
          </div>
        </div>
      )}

      {/* Form aggiunta / modifica */}
      {showForm && (
        <div className="card p-5 space-y-4 border-brand-500/30 bg-brand-500/5 animate-slide-up">
          <h3 className="font-semibold text-gray-900 dark:text-white">{editingId ? 'Modifica sito' : 'Collega nuovo sito'}</h3>

          {/* Selector cliente */}
          {hasMultipleTenants && !editingId && (
            <div>
              <label className="label">Cliente *</label>
              <select className="select" value={form.tenantId || selectedTenant}
                onChange={(e) => setForm({ ...form, tenantId: e.target.value })}>
                <option value="">Seleziona cliente...</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1">Il sito sarà visibile solo a questo cliente</p>
            </div>
          )}

          <div>
            <label className="label">URL del sito *</label>
            <input type="url" className="input" placeholder="https://www.tuosito.it"
              value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            {!editingId && (
              <p className="text-xs text-gray-500 mt-1">
                🔍 Le informazioni e l'icona verranno estratte automaticamente
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nome {editingId ? '*' : '(opzionale)'}</label>
              <input type="text" className="input" placeholder="Pineapple Home"
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Niche / Settore</label>
              <input type="text" className="input" placeholder="smart home, hotel..."
                value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} />
            </div>
          </div>

          {/* Campo icona — con anteprima */}
          <div>
            <label className="label flex items-center gap-1.5">
              <ImageIcon size={12} className="text-gray-500" />
              URL icona / logo
              <span className="text-gray-600 font-normal">(opzionale — estratta automaticamente)</span>
            </label>
            <div className="flex items-center gap-2">
              {/* Anteprima icona */}
              <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.logoUrl}
                    alt="preview"
                    className="w-6 h-6 object-contain"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <Globe size={14} className="text-gray-400 dark:text-gray-600" />
                )}
              </div>
              <input
                type="url"
                className="input flex-1"
                placeholder="https://tuosito.it/favicon.ico"
                value={form.logoUrl}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              />
              {form.logoUrl && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, logoUrl: '' })}
                  className="btn-ghost p-2 text-gray-500 hover:text-gray-300 flex-shrink-0"
                  title="Rimuovi icona">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {editingId && (
            <div>
              <label className="label">Descrizione</label>
              <textarea
                className="input min-h-[80px] resize-none"
                rows={3}
                placeholder="Descrizione del sito..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => { setShowForm(false); setEditingId(null); resetForm(); }} className="btn-secondary flex-1">
              <X size={14} /> Annulla
            </button>
            {editingId ? (
              <button onClick={saveSite} disabled={saving} className="btn-primary flex-1">
                <Check size={14} /> {saving ? 'Salvataggio...' : 'Salva modifiche'}
              </button>
            ) : (
              <button onClick={addSite} disabled={adding} className="btn-primary flex-1">
                {adding ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analisi in corso...</>
                ) : 'Aggiungi sito'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Lista siti */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 shimmer rounded-xl" />)}
        </div>
      ) : sites.length === 0 ? (
        <div className="card p-12 text-center">
          <Globe size={40} className="mx-auto text-gray-300 dark:text-gray-700 mb-3" />
          <p className="text-gray-400 text-sm">Nessun sito collegato</p>
          <p className="text-gray-400 dark:text-gray-600 text-xs mt-1">
            {selectedTenant ? 'Nessun sito per questo cliente' : 'Aggiungi i siti per cui gestisci i social'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sites.map((site) => (
            <div key={site.id} className={`card p-4 flex items-start gap-4 hover:border-gray-300 dark:hover:border-gray-700 transition-all ${!site.isActive ? 'opacity-50' : ''}`}>
              {/* Avatar con favicon */}
              <SiteAvatar logoUrl={site.logoUrl} name={site.name} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 dark:text-white text-sm">{site.name}</span>
                  {site.niche && (
                    <span className="badge bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs">{site.niche}</span>
                  )}
                  <span className={`badge text-xs ${site.isActive ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>
                    {site.isActive ? '● Attivo' : '○ Disattivo'}
                  </span>
                  {hasMultipleTenants && site.tenant && !selectedTenant && (
                    <span className="badge bg-brand-500/10 text-brand-400 text-xs flex items-center gap-1">
                      <Building2 size={10} /> {site.tenant.name}
                    </span>
                  )}
                </div>
                <a href={site.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-gray-400 hover:text-brand-400 transition-colors flex items-center gap-0.5 mt-0.5">
                  {site.url} <ExternalLink size={10} />
                </a>
                {site.description && (
                  <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{site.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Toggle attivo/disattivo */}
                <button
                  onClick={() => toggleActive(site)}
                  title={site.isActive ? 'Disattiva' : 'Attiva'}
                  className={`relative w-8 h-4 rounded-full transition-all ${site.isActive ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${site.isActive ? 'left-4' : 'left-0.5'}`} />
                </button>
                {/* Modifica */}
                <button onClick={() => startEdit(site)} className="btn-ghost p-1.5" title="Modifica">
                  <Edit2 size={13} />
                </button>
                {/* Elimina */}
                <button onClick={() => deleteSite(site.id, site.name)}
                  className="btn-ghost p-1.5 text-red-400 hover:text-red-300" title="Elimina">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
