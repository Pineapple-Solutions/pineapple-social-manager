'use client';
// src/app/users/page.tsx — Gestione utenti e dipendenti

import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Trash2, Edit2, Check, X, Shield, Eye, EyeOff, Smartphone, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface UserTenantEntry {
  tenantId: string;
  tenant: { id: string; name: string; slug: string };
}

interface User {
  id: string; email: string; name: string; role: string;
  permissions: string; isActive: boolean; otpEnabled: boolean;
  tenantId: string | null;
  tenant?: { name: string; slug: string };
  userTenants?: UserTenantEntry[];
  createdAt: string;
}

interface Tenant { id: string; name: string; slug: string; }

const ROLES = [
  { value: 'admin', label: 'Admin', desc: 'Gestione completa tranne utenti master' },
  { value: 'editor', label: 'Editor', desc: 'Crea e modifica contenuti' },
  { value: 'viewer', label: 'Viewer', desc: 'Solo visualizzazione' },
];

const ROLE_COLORS: Record<string, string> = {
  master: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  admin: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
  editor: 'bg-green-500/20 text-green-600 dark:text-green-400',
  viewer: 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    email: '', password: '', name: '', role: 'editor',
    tenantId: '',        // tenant primario
    tenantIds: [] as string[],  // tutti i tenant associati
    isActive: true,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, tenantsRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/tenants'),
      ]);
      const [usersJson, tenantsJson] = await Promise.all([
        usersRes.json(), tenantsRes.json(),
      ]);
      if (usersJson.success) setUsers(usersJson.data);
      if (tenantsJson.success) setTenants(tenantsJson.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleTenant = (id: string) => {
    setForm(prev => {
      const has = prev.tenantIds.includes(id);
      const next = has ? prev.tenantIds.filter(t => t !== id) : [...prev.tenantIds, id];
      // Se il tenant primario viene deselezionato, aggiorna anche tenantId
      const newPrimary = next.length > 0 && !next.includes(prev.tenantId)
        ? next[0]
        : next.length === 0 ? '' : prev.tenantId;
      return { ...prev, tenantIds: next, tenantId: newPrimary };
    });
  };

  const setPrimaryTenant = (id: string) => {
    setForm(prev => ({
      ...prev,
      tenantId: id,
      // Assicura che sia anche nella lista
      tenantIds: prev.tenantIds.includes(id) ? prev.tenantIds : [...prev.tenantIds, id],
    }));
  };

  const handleSubmit = async () => {
    if (!form.name || (!editingId && !form.email) || (!editingId && !form.password)) {
      toast.error('Nome, email e password obbligatori');
      return;
    }
    setSaving(true);
    try {
      const method = editingId ? 'PATCH' : 'POST';
      const url = editingId ? `/api/users/${editingId}` : '/api/users';
      const body = editingId
        ? {
            name: form.name,
            role: form.role,
            tenantId: form.tenantId || null,
            tenantIds: form.tenantIds,
            isActive: form.isActive,
            ...(form.password ? { password: form.password } : {}),
          }
        : {
            email: form.email,
            password: form.password,
            name: form.name,
            role: form.role,
            tenantId: form.tenantId || null,
            tenantIds: form.tenantIds,
            isActive: form.isActive,
          };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      let json: { success: boolean; error?: string };
      try {
        json = await res.json();
      } catch {
        toast.error(`Errore server (${res.status})`);
        return;
      }
      if (json.success) {
        toast.success(editingId ? 'Utente aggiornato!' : 'Utente creato!');
        setShowForm(false); setEditingId(null);
        setForm({ email: '', password: '', name: '', role: 'editor', tenantId: '', tenantIds: [], isActive: true });
        fetchData();
      } else toast.error(json.error ?? 'Errore');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Elimina l'utente "${name}"?`)) return;
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) { toast.success('Utente eliminato'); fetchData(); }
    else toast.error(json.error ?? 'Errore');
  };

  const startEdit = (u: User) => {
    // Raccogli tutti i tenantIds dalla relazione UserTenant
    const allIds = (u.userTenants ?? []).map(ut => ut.tenantId);
    // Fallback: se non c'è userTenants ma c'è tenantId, usalo
    if (allIds.length === 0 && u.tenantId) allIds.push(u.tenantId);
    setForm({
      email: u.email,
      password: '',
      name: u.name,
      role: u.role,
      tenantId: u.tenantId ?? (allIds[0] ?? ''),
      tenantIds: allIds,
      isActive: u.isActive,
    });
    setEditingId(u.id);
    setShowForm(true);
  };

  // Calcola i clienti di un utente da mostrare nel card
  const getUserTenants = (u: User): { id: string; name: string }[] => {
    if (u.userTenants && u.userTenants.length > 0) {
      return u.userTenants.map(ut => ({ id: ut.tenantId, name: ut.tenant.name }));
    }
    if (u.tenant) return [{ id: u.tenantId!, name: u.tenant.name }];
    return [];
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Utenti & Dipendenti</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Gestisci accessi e permessi per ogni membro del team</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ email: '', password: '', name: '', role: 'editor', tenantId: '', tenantIds: [], isActive: true }); }}
          className="btn-primary">
          <Plus size={16} /> Nuovo Utente
        </button>
      </div>

      {/* Info ruoli */}
      <div className="grid grid-cols-3 gap-3">
        {ROLES.map((r) => (
          <div key={r.value} className="card p-3">
            <div className={`badge ${ROLE_COLORS[r.value]} mb-1.5`}>{r.label}</div>
            <p className="text-xs text-gray-500">{r.desc}</p>
          </div>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-5 border-brand-500/30 bg-brand-500/5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{editingId ? 'Modifica Utente' : 'Nuovo Utente'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nome *</label>
              <input className="input" placeholder="Mario Rossi" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            {!editingId && (
              <div>
                <label className="label">Email *</label>
                <input type="email" className="input" placeholder="mario@esempio.it" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            )}
            <div>
              <label className="label">{editingId ? 'Nuova password (lascia vuoto per non cambiare)' : 'Password *'}</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} className="input pr-9" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">Ruolo</label>
              <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          {/* Multi-select clienti */}
          {tenants.length > 0 && (
            <div className="mt-3">
              <label className="label flex items-center gap-1.5">
                <Building2 size={13} /> Clienti associati
                {form.tenantIds.length > 0 && (
                  <span className="text-gray-500 font-normal text-xs">({form.tenantIds.length} selezionati)</span>
                )}
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Seleziona uno o più clienti. Il cliente <span className="text-yellow-400">★ primario</span> determina il contesto di default al login.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {tenants.map(t => {
                  const selected = form.tenantIds.includes(t.id);
                  const isPrimary = form.tenantId === t.id;
                  return (
                    <div
                      key={t.id}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all
                        ${selected
                          ? 'border-brand-500 bg-brand-500/10'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'}`}
                    >
                      {/* Checkbox selezione */}
                      <button
                        type="button"
                        onClick={() => toggleTenant(t.id)}
                        className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition-all
                          ${selected ? 'bg-brand-500 border-brand-500' : 'border-gray-300 dark:border-gray-600 bg-transparent'}`}
                      >
                        {selected && <Check size={10} className="text-white" />}
                      </button>
                      <span
                        className={`flex-1 text-sm truncate ${selected ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
                        onClick={() => toggleTenant(t.id)}
                      >
                        {t.name}
                      </span>
                      {/* Stella per impostare come primario */}
                      {selected && (
                        <button
                          type="button"
                          onClick={() => setPrimaryTenant(t.id)}
                          title="Imposta come tenant primario"
                          className={`flex-shrink-0 text-xs transition-colors ${isPrimary ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-500'}`}
                        >
                          ★
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {form.tenantIds.length === 0 && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5 italic">Nessun cliente selezionato → accesso globale (solo master)</p>
              )}
            </div>
          )}

          {editingId && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-100 dark:bg-gray-800/50 mt-3">
              <span className="text-sm text-gray-700 dark:text-gray-300">Attivo</span>
              <button onClick={() => setForm({ ...form, isActive: !form.isActive })}
                className={`w-10 h-5 rounded-full transition-all ${form.isActive ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                <div className={`w-4 h-4 bg-white rounded-full m-0.5 transition-all ${form.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          )}

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
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="card p-4 h-16 shimmer" />)}</div>
      ) : users.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">
          <Users size={40} className="mx-auto mb-3 opacity-30" />
          <p>Nessun utente aggiunto. Crea il primo!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const userTenants = getUserTenants(u);
            return (
              <div key={u.id} className="card p-4 flex items-center gap-4 hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
                <div className="w-9 h-9 rounded-full ig-gradient flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-white">{u.name?.[0]?.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-900 dark:text-white">{u.name}</span>
                    <span className="text-xs text-gray-500">{u.email}</span>
                    <span className={`badge text-xs ${ROLE_COLORS[u.role] ?? ROLE_COLORS.viewer}`}>
                      {u.role === 'master' && <Shield size={10} />} {u.role}
                    </span>
                    {u.otpEnabled && <span className="badge bg-green-500/10 text-green-400 text-xs"><Smartphone size={10} /> OTP</span>}
                    {!u.isActive && <span className="badge bg-red-500/10 text-red-400 text-xs">Inattivo</span>}
                  </div>
                  {/* Clienti associati */}
                  {userTenants.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {userTenants.map(t => (
                        <span
                          key={t.id}
                          className={`badge text-xs flex items-center gap-0.5
                            ${t.id === u.tenantId
                              ? 'bg-brand-500/15 text-brand-600 dark:text-brand-300 border border-brand-500/30'
                              : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
                        >
                          {t.id === u.tenantId && <span className="text-yellow-400 text-xs">★</span>}
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
                    Registrato: {new Date(u.createdAt).toLocaleDateString('it-IT')}
                  </div>
                </div>
                {u.role !== 'master' && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(u)} className="btn-ghost p-2"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(u.id, u.name)} className="btn-ghost p-2 text-red-400 hover:text-red-300"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
