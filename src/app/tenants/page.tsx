'use client';
// src/app/tenants/page.tsx — Gestione clienti / tenant

import { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Trash2, Edit2, Check, X, Crown } from 'lucide-react';
import toast from 'react-hot-toast';

interface Tenant {
  id: string; name: string; slug: string; plan: string;
  logoUrl?: string; isActive: boolean; createdAt: string;
  _count?: { users: number; posts: number; instagramAccounts: number };
}

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  pro: 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30',
  agency: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30',
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', plan: 'free', logoUrl: '' });
  const [saving, setSaving] = useState(false);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tenants');
      const json = await res.json();
      if (json.success) setTenants(json.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const handleSubmit = async () => {
    if (!form.name || !form.slug) { toast.error('Nome e slug obbligatori'); return; }
    setSaving(true);
    try {
      const method = editingId ? 'PATCH' : 'POST';
      const url = editingId ? `/api/tenants/${editingId}` : '/api/tenants';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(editingId ? 'Cliente aggiornato!' : 'Cliente creato!');
        setShowForm(false); setEditingId(null);
        setForm({ name: '', slug: '', plan: 'free', logoUrl: '' });
        fetchTenants();
      } else toast.error(json.error ?? 'Errore');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Elimina il cliente "${name}"? Questa azione è irreversibile.`)) return;
    const res = await fetch(`/api/tenants/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) { toast.success('Cliente eliminato'); fetchTenants(); }
    else toast.error(json.error ?? 'Errore');
  };

  const startEdit = (t: Tenant) => {
    setForm({ name: t.name, slug: t.slug, plan: t.plan, logoUrl: '' });
    setEditingId(t.id);
    setShowForm(true);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Clienti</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Gestione multi-tenancy — ogni cliente ha il proprio spazio isolato</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', slug: '', plan: 'free', logoUrl: '' }); }}
          className="btn-primary">
          <Plus size={16} /> Nuovo Cliente
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-5 border-brand-500/30 bg-brand-500/5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{editingId ? 'Modifica Cliente' : 'Nuovo Cliente'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nome *</label>
              <input className="input" placeholder="Pineapple Home" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value,
                  slug: editingId ? form.slug : e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
                })} />
            </div>
            <div>
              <label className="label">Slug (URL) *</label>
              <input className="input" placeholder="pineapple-home" value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })} />
            </div>
            <div>
              <label className="label">Piano</label>
              <select className="select" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="agency">Agency</option>
              </select>
            </div>
            <div>
              <label className="label">Logo URL (opzionale)</label>
              <input className="input" placeholder="https://..." value={form.logoUrl}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSubmit} disabled={saving} className="btn-primary">
              <Check size={15} /> {saving ? 'Salvataggio...' : 'Salva'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="btn-secondary">
              <X size={15} /> Annulla
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="card p-5 shimmer h-20" />)}</div>
      ) : tenants.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">
          <Building2 size={40} className="mx-auto mb-3 opacity-30" />
          <p>Nessun cliente ancora. Crea il primo!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tenants.map((t) => (
            <div key={t.id} className="card p-4 flex items-center gap-4 hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                {t.logoUrl ? <img src={t.logoUrl} className="w-8 h-8 rounded-lg object-cover" alt={t.name} /> : <Building2 size={20} className="text-brand-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">{t.name}</span>
                  <span className="text-gray-400 dark:text-gray-600 text-xs">/{t.slug}</span>
                  <span className={`badge text-xs ${PLAN_COLORS[t.plan]}`}>
                    {t.plan === 'agency' && <Crown size={10} />} {t.plan}
                  </span>
                  {!t.isActive && <span className="badge bg-red-500/10 text-red-400 text-xs">Inattivo</span>}
                </div>
                {t._count && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    {t._count.users} utenti · {t._count.posts} post · {t._count.instagramAccounts} account IG
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => startEdit(t)} className="btn-ghost p-2">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => handleDelete(t.id, t.name)} className="btn-ghost p-2 text-red-400 hover:text-red-300">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
