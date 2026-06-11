'use client';
// src/app/campaigns/page.tsx — Gestione campagne (tenant-scoped)

import { useState, useEffect, useCallback } from 'react';
import { Zap, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate } from '@/lib/utils';
import { TenantSelector } from '@/components/ui/TenantSelector';
import { SiteSelector } from '@/components/ui/SiteSelector';
import { useTenantFilter } from '@/lib/hooks/useTenantFilter';
import { useSiteFilter } from '@/lib/hooks/useSiteFilter';

interface Campaign {
  id: string; name: string; description?: string; goal?: string;
  status: string; startDate?: string; endDate?: string; createdAt: string;
  _count?: { posts: number };
  tenant?: { name: string };
}

const GOAL_LABELS: Record<string, { label: string; emoji: string }> = {
  AWARENESS: { label: 'Brand Awareness', emoji: '📢' },
  ENGAGEMENT: { label: 'Engagement', emoji: '❤️' },
  TRAFFIC: { label: 'Traffico Sito', emoji: '🔗' },
  CONVERSIONS: { label: 'Conversioni', emoji: '💰' },
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-400/10',
  PAUSED: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-400/10',
  COMPLETED: 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-400/10',
  DRAFT: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-400/10',
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const { tenants, selectedTenant, setSelectedTenant, isMaster, showSelector, ready } = useTenantFilter();
  const { sites, selectedSite, setSelectedSite } = useSiteFilter(selectedTenant);

  // Form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('AWARENESS');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchCampaigns = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedTenant) params.set('tenantId', selectedTenant);
      if (selectedSite) params.set('siteId', selectedSite);
      const qs = params.toString() ? '?' + params : '';
      const res = await fetch(`/api/campaigns${qs}`);
      const json = await res.json();
      if (json.success) setCampaigns(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [selectedTenant, selectedSite]);

  useEffect(() => {
    if (ready) fetchCampaigns();
  }, [fetchCampaigns, ready]);

  const createCampaign = async () => {
    if (!name) { toast.error('Nome obbligatorio'); return; }
    // Se master senza tenant selezionato, richiedi la selezione
    if (isMaster && !selectedTenant && tenants.length > 0) {
      toast.error('Seleziona un cliente prima di creare la campagna');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, description, goal,
          startDate: startDate || null,
          endDate: endDate || null,
          ...(selectedTenant ? { tenantId: selectedTenant } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('✅ Campagna creata!');
        setName(''); setDescription(''); setStartDate(''); setEndDate('');
        setShowForm(false);
        fetchCampaigns();
      } else {
        toast.error(json.error ?? 'Errore');
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm('Eliminare questa campagna?')) return;
    const res = await fetch(`/api/campaigns?id=${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) { toast.success('Campagna eliminata'); fetchCampaigns(); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">Raggruppa i post in campagne tematiche per una strategia organizzata</p>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tenant + Sito selector */}
          {ready && showSelector && (
            <TenantSelector
              tenants={tenants}
              value={selectedTenant}
              onChange={setSelectedTenant}
              isMaster={isMaster}
            />
          )}
          {ready && (
            <SiteSelector
              sites={sites}
              value={selectedSite}
              onChange={setSelectedSite}
            />
          )}
          <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
            <Plus size={14} /> Nuova campagna
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-5 space-y-4 border-brand-500/30 animate-slide-up">
          <h3 className="font-semibold text-gray-900 dark:text-white">Crea nuova campagna</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Nome campagna *</label>
              <input type="text" className="input" placeholder="es: Lancio Primavera 2026"
                value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Descrizione</label>
              <textarea className="textarea h-20" placeholder="Obiettivo e strategia..."
                value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label className="label">Obiettivo</label>
              <select className="select" value={goal} onChange={(e) => setGoal(e.target.value)}>
                {Object.entries(GOAL_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.emoji} {v.label}</option>
                ))}
              </select>
            </div>
            <div />
            <div>
              <label className="label">Data inizio</label>
              <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Data fine</label>
              <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Annulla</button>
            <button onClick={createCampaign} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Creazione...' : 'Crea campagna'}
            </button>
          </div>
        </div>
      )}

      {/* Lista campagne */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 shimmer rounded-xl" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card p-12 text-center">
          <Zap size={40} className="mx-auto text-gray-300 dark:text-gray-700 mb-3" />
          <p className="text-gray-400 text-sm">Nessuna campagna{selectedTenant && ' per questo cliente'}{selectedSite && ' per questo sito'}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {campaigns.map(campaign => {
            const goalInfo = GOAL_LABELS[campaign.goal ?? ''] ?? { label: campaign.goal, emoji: '📋' };
            return (
              <div key={campaign.id} className="card p-4 hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="text-2xl">{goalInfo.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 dark:text-white">{campaign.name}</span>
                      <span className={`badge text-xs ${STATUS_COLORS[campaign.status] ?? 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-400/10'}`}>
                        {campaign.status}
                      </span>
                      <span className="badge bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs">{goalInfo.label}</span>
                      {/* Badge tenant quando si visualizzano tutti i clienti */}
                      {!selectedTenant && campaign.tenant && (
                        <span className="badge bg-brand-500/10 text-brand-600 dark:text-brand-400 text-xs">{campaign.tenant.name}</span>
                      )}
                    </div>
                    {campaign.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{campaign.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      {campaign.startDate && <span>Da: {formatDate(campaign.startDate)}</span>}
                      {campaign.endDate && <span>A: {formatDate(campaign.endDate)}</span>}
                      <span>Creata: {formatDate(campaign.createdAt)}</span>
                      {campaign._count && <span>📝 {campaign._count.posts} post</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => deleteCampaign(campaign.id)}
                      className="btn-ghost text-xs text-red-400 hover:text-red-300 w-8 h-8 p-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
