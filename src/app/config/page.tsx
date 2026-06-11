'use client';
// src/app/config/page.tsx — Configurazione completa (multi-tenant)

import { useState, useEffect, useCallback } from 'react';
import {
  Instagram, Clock, Globe, Shield, Save,
  ExternalLink, Info, ChevronDown, ChevronUp, Plus, Brain, Building2,
  Facebook, Music2, Globe2, BookOpen, Unlink
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getWeeklySchedule } from '@/lib/peak-hours';
import { TenantSelector } from '@/components/ui/TenantSelector';
import { useTenantFilter } from '@/lib/hooks/useTenantFilter';
import type { AITone } from '@/types';

// ─── Sezione collassabile ───────────────────────────────────────
function ConfigSection({
  icon: Icon, title, description, children, defaultOpen = true,
  accent = 'brand',
}: {
  icon: React.ElementType; title: string; description?: string; children: React.ReactNode;
  defaultOpen?: boolean; accent?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const accentMap: Record<string, string> = {
    brand: 'text-brand-400 bg-brand-400/10',
    instagram: 'text-pink-400 bg-pink-400/10',
    purple: 'text-purple-400 bg-purple-400/10',
    blue: 'text-blue-400 bg-blue-400/10',
    green: 'text-green-400 bg-green-400/10',
  };
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-800/30 transition-colors"
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${accentMap[accent]}`}>
          <Icon size={20} />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-white">{title}</div>
          {description && <div className="text-xs text-gray-500 mt-0.5">{description}</div>}
        </div>
        {open ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-gray-800 pt-5">{children}</div>}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────
export default function ConfigPage() {
  const [saving, setSaving] = useState(false);
  const [account, setAccount] = useState<{ username?: string; followersCount?: number; profilePicture?: string } | null>(null);
  const [fbAccount, setFbAccount] = useState<{ pageName?: string; followersCount?: number } | null>(null);
  const [ttAccount, setTtAccount] = useState<{ username?: string; displayName?: string; followersCount?: number } | null>(null);
  const { tenants, selectedTenant, setSelectedTenant, isMaster, showSelector, ready } = useTenantFilter();

  // 'global' = configurazione globale (tutti i clienti, tenantId = null)
  const [configScope, setConfigScope] = useState<'tenant' | 'global'>('tenant');

  // Determina il tenantId effettivo:
  // - se scope 'global' → null (nessun tenant = globale)
  // - altrimenti → selectedTenant
  const effectiveTenant = configScope === 'global' ? '' : selectedTenant;

  // Instagram
  const [igToken, setIgToken] = useState('');
  const [igAccountId, setIgAccountId] = useState('');
  const [igAppId, setIgAppId] = useState('');
  const [igAppSecret, setIgAppSecret] = useState('');
  const [igGuideOpen, setIgGuideOpen] = useState(false);
  const [igAppIdError, setIgAppIdError] = useState('');
  const [igTokenError, setIgTokenError] = useState('');

  // Facebook
  const [fbToken, setFbToken] = useState('');
  const [fbPageId, setFbPageId] = useState('');
  const [fbGuideOpen, setFbGuideOpen] = useState(false);
  const [fbTokenError, setFbTokenError] = useState('');

  // TikTok
  const [ttAccessToken, setTtAccessToken] = useState('');
  const [ttRefreshToken, setTtRefreshToken] = useState('');
  const [ttOpenId, setTtOpenId] = useState('');
  const [ttGuideOpen, setTtGuideOpen] = useState(false);
  const [ttTokenError, setTtTokenError] = useState('');
  const [ttRefreshTokenError, setTtRefreshTokenError] = useState('');

  // General
  const [timezone, setTimezone] = useState('Europe/Rome');
  const [language, setLanguage] = useState('it');
  const [defaultTone, setDefaultTone] = useState<AITone>('professional');
  const [autoPublish, setAutoPublish] = useState(false);

  // Scheduler
  const [schName, setSchName] = useState('Regola principale');
  const [postsPerDay, setPostsPerDay] = useState(2);
  const [storiesPerDay, setStoriesPerDay] = useState(3);
  const [reelsPerWeek, setReelsPerWeek] = useState(1);
  const [preferredTimes, setPreferredTimes] = useState(['09:00', '12:00', '18:00', '20:00']);
  const [activeDays, setActiveDays] = useState([1, 2, 3, 4, 5, 6, 0]);
  const [aiTopics, setAiTopics] = useState<string[]>(['smart home', 'automazione', 'design', 'lifestyle']);
  const [newTopic, setNewTopic] = useState('');
  const [schSiteUrl, setSchSiteUrl] = useState('');
  const [schAiTone, setSchAiTone] = useState<AITone>('professional');

  // Reset form quando cambia il tenant selezionato
  const resetForm = () => {
    setAccount(null); setFbAccount(null); setTtAccount(null);
    setTimezone('Europe/Rome'); setLanguage('it');
    setDefaultTone('professional'); setAutoPublish(false);
    setSchName('Regola principale'); setPostsPerDay(2);
    setStoriesPerDay(3); setReelsPerWeek(1);
    setPreferredTimes(['09:00','12:00','18:00','20:00']);
    setActiveDays([1,2,3,4,5,6,0]);
    setAiTopics([]); setSchSiteUrl(''); setSchAiTone('professional');
  };

  const fetchConfig = useCallback(async () => {
    // Per master: se non ha scelto né scope 'global' né un tenant specifico → skip
    if (showSelector && configScope === 'tenant' && !effectiveTenant) return;

    // Scope globale = nessun tenantId in query → API legge Config globale
    const params = (configScope === 'global') ? '?global=1' : (effectiveTenant ? `?tenantId=${effectiveTenant}` : '');
    const res = await fetch(`/api/config${params}`);
    const json = await res.json();
    if (json.success) {
      const c = json.data?.config ?? {};
      if (c.timezone) setTimezone(c.timezone);
      if (c.defaultLanguage) setLanguage(c.defaultLanguage);
      if (c.defaultTone) setDefaultTone(c.defaultTone as AITone);
      if (c.autoPublish !== undefined) setAutoPublish(c.autoPublish === 'true');
      if (json.data?.account) setAccount(json.data.account);
      else setAccount(null);
      if (json.data?.facebookAccount) setFbAccount(json.data.facebookAccount);
      else setFbAccount(null);
      if (json.data?.tiktokAccount) setTtAccount(json.data.tiktokAccount);
      else setTtAccount(null);
    }
    // Carica regole scheduler per il tenant selezionato
    const srParams = (configScope === 'global') ? '' : (effectiveTenant ? `?tenantId=${effectiveTenant}` : '');
    const srRes = await fetch(`/api/scheduler/rules${srParams}`);
    const srJson = await srRes.json();
    if (srJson.success && srJson.data?.length) {
      const rule = srJson.data[0];
      setSchName(rule.name);
      setPostsPerDay(rule.postsPerDay);
      setStoriesPerDay(rule.storiesPerDay);
      setReelsPerWeek(rule.reelsPerWeek);
      setPreferredTimes(JSON.parse(rule.preferredTimes || '[]'));
      setActiveDays(JSON.parse(rule.activeDays || '[1,2,3,4,5,6,0]'));
      setAiTopics(JSON.parse(rule.aiTopics || '[]'));
      if (rule.siteUrl) setSchSiteUrl(rule.siteUrl);
      if (rule.aiTone) setSchAiTone(rule.aiTone as AITone);
    } else {
      // Nessuna regola per questo tenant → reset ai default
      setSchName('Regola principale'); setPostsPerDay(2);
      setStoriesPerDay(3); setReelsPerWeek(1);
      setPreferredTimes(['09:00','12:00','18:00','20:00']);
      setActiveDays([1,2,3,4,5,6,0]);
      setAiTopics([]); setSchSiteUrl(''); setSchAiTone('professional');
    }
  }, [effectiveTenant, showSelector, configScope]);

  // Ricarica config quando cambia il tenant o quando il componente è pronto
  useEffect(() => {
    if (ready) {
      resetForm();
      fetchConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchConfig, ready]);

  const saveInstagram = async () => {
    if (!igToken || !igAccountId) {
      toast.error('Token e Account ID sono obbligatori');
      return;
    }
    if (igAppId && !/^\d+$/.test(igAppId)) {
      setIgAppIdError("L'App ID deve essere un numero (es: 1234567890123456) — non il nome dell'app");
      toast.error("App ID non valido: deve essere il numero ID, non il nome dell'app");
      return;
    }
    if (showSelector && configScope === 'tenant' && !effectiveTenant) {
      toast.error('Seleziona prima un cliente o scegli "Globale"');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instagramAccessToken: igToken,
          instagramBusinessAccountId: igAccountId,
          instagramAppId: igAppId,
          instagramAppSecret: igAppSecret,
          ...(configScope === 'global' ? { isGlobal: true } : effectiveTenant ? { tenantId: effectiveTenant } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('✅ Account Instagram collegato!');
        setIgToken(''); setIgAccountId(''); setIgAppId(''); setIgAppSecret('');
        fetchConfig();
      } else {
        toast.error(json.error ?? 'Errore');
      }
    } finally {
      setSaving(false);
    }
  };

  const saveFacebook = async () => {
    if (!fbToken || !fbPageId) { toast.error('Token e Page ID sono obbligatori'); return; }
    if (showSelector && configScope === 'tenant' && !effectiveTenant) { toast.error('Seleziona prima un cliente o scegli "Globale"'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facebookPageAccessToken: fbToken,
          facebookPageId: fbPageId,
          ...(configScope === 'global' ? { isGlobal: true } : effectiveTenant ? { tenantId: effectiveTenant } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('✅ Pagina Facebook collegata!');
        setFbToken(''); setFbPageId('');
        fetchConfig();
      } else {
        toast.error(json.error ?? 'Errore');
      }
    } finally { setSaving(false); }
  };

  const saveTikTok = async () => {
    if (!ttAccessToken || !ttOpenId) { toast.error('Access Token e Open ID sono obbligatori'); return; }
    if (showSelector && configScope === 'tenant' && !effectiveTenant) { toast.error('Seleziona prima un cliente o scegli "Globale"'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tiktokAccessToken: ttAccessToken,
          tiktokRefreshToken: ttRefreshToken || undefined,
          tiktokOpenId: ttOpenId,
          ...(configScope === 'global' ? { isGlobal: true } : effectiveTenant ? { tenantId: effectiveTenant } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('✅ Account TikTok collegato!');
        setTtAccessToken(''); setTtRefreshToken(''); setTtOpenId('');
        fetchConfig();
      } else {
        toast.error(json.error ?? 'Errore');
      }
    } finally { setSaving(false); }
  };

  const disconnectAccount = async (type: 'instagram' | 'facebook' | 'tiktok') => {
    const labels = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' };
    if (!confirm(`Sei sicuro di voler disassociare l'account ${labels[type]}? Dovrai re-inserire le credenziali per collegarlo nuovamente.`)) return;
    try {
      const params = new URLSearchParams({ type });
      if (configScope === 'global') params.set('global', '1');
      else if (effectiveTenant) params.set('tenantId', effectiveTenant);
      const res = await fetch(`/api/config?${params.toString()}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast.success(`✅ Account ${labels[type]} disassociato`);
        fetchConfig();
      } else {
        toast.error(json.error ?? 'Errore');
      }
    } catch {
      toast.error('Errore durante la disassociazione');
    }
  };

  const saveGeneral = async () => {
    if (showSelector && configScope === 'tenant' && !effectiveTenant) {
      toast.error('Seleziona prima un cliente o scegli "Globale"');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone, defaultLanguage: language, defaultTone, autoPublish,
          ...(configScope === 'global' ? { isGlobal: true } : effectiveTenant ? { tenantId: effectiveTenant } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) toast.success('✅ Impostazioni generali salvate!');
    } finally {
      setSaving(false);
    }
  };

  const saveSchedulerRule = async () => {
    if (showSelector && configScope === 'tenant' && !effectiveTenant) {
      toast.error('Seleziona prima un cliente o scegli "Globale"');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: schName,
        postsPerDay, storiesPerDay, reelsPerWeek,
        preferredTimes, activeDays, aiTopics,
        siteUrl: schSiteUrl || null,
        aiTone: schAiTone,
        aiLanguage: language,
        contentSource: 'AI',
        contentType: 'MIXED',
        frequency: 'DAILY',
        isActive: true,
        timezone,
        ...(configScope === 'global' ? {} : effectiveTenant ? { tenantId: effectiveTenant } : {}),
      };
      const res = await fetch('/api/scheduler/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) toast.success('✅ Regola scheduler creata!');
      else toast.error(json.error ?? 'Errore');
    } finally {
      setSaving(false);
    }
  };

  const toggleTime = (time: string) => {
    setPreferredTimes((prev) =>
      prev.includes(time) ? prev.filter((t) => t !== time) : [...prev, time].sort()
    );
  };

  const toggleDay = (day: number) => {
    setActiveDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const DAYS_LABELS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const COMMON_TIMES = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
    '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];

  const preview = getWeeklySchedule(postsPerDay, storiesPerDay, activeDays);


  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Tenant selector header */}
      {ready && showSelector && (
        <div className="flex items-center justify-between flex-wrap gap-3 card p-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              configScope === 'global' ? 'bg-green-500/10' : 'bg-brand-500/10'
            }`}>
              {configScope === 'global'
                ? <Globe2 size={18} className="text-green-400" />
                : <Building2 size={18} className="text-brand-400" />}
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                {configScope === 'global'
                  ? <span className="text-green-400">Configurazione Globale</span>
                  : effectiveTenant
                    ? <>Configurazione: <span className="text-brand-400">{tenants.find(t => t.id === effectiveTenant)?.name}</span></>
                    : 'Seleziona un cliente'}
              </div>
              <div className="text-xs text-gray-500">
                {configScope === 'global'
                  ? 'Valida per tutti i clienti senza config specifica'
                  : 'Le impostazioni sono specifiche per questo cliente'}
              </div>
            </div>
          </div>
          {/* Scope switcher + tenant selector */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Toggle Globale / Cliente */}
            <div className="flex items-center bg-gray-800 rounded-xl p-1 gap-1">
              <button
                onClick={() => { setConfigScope('global'); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  configScope === 'global' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Globe2 size={12} /> Globale
              </button>
              <button
                onClick={() => { setConfigScope('tenant'); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  configScope === 'tenant' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Building2 size={12} /> Cliente
              </button>
            </div>
            {configScope === 'tenant' && (
              <TenantSelector
                tenants={tenants}
                value={selectedTenant}
                onChange={setSelectedTenant}
                isMaster={isMaster}
              />
            )}
          </div>
        </div>
      )}

      {/* Banner info globale */}
      {ready && showSelector && configScope === 'global' && (
        <div className="card p-3 border-green-500/20 bg-green-500/5 flex items-center gap-3">
          <Globe2 size={16} className="text-green-400 flex-shrink-0" />
          <p className="text-xs text-green-300">
            Stai configurando le <strong>impostazioni globali</strong>. 
            Vengono usate come fallback per i clienti che non hanno una configurazione specifica.
            Le configurazioni per cliente hanno sempre la precedenza.
          </p>
        </div>
      )}

      {/* Banner "seleziona cliente" per master senza selezione (solo in mode tenant) */}
      {ready && showSelector && configScope === 'tenant' && !effectiveTenant ? (
        <div className="card p-10 text-center">
          <Building2 size={40} className="mx-auto text-gray-700 mb-3" />
          <p className="text-gray-300 font-medium">Nessun cliente selezionato</p>
          <p className="text-gray-500 text-sm mt-1">
            Scegli un cliente dal selettore in alto per visualizzare e modificare la sua configurazione.
          </p>
        </div>
      ) : (
        <>
          {/* Banner AI Providers */}
          <div className="card p-4 border-purple-500/30 bg-purple-500/5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-purple-400 bg-purple-400/10">
              <Brain size={20} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">Configurazione Provider AI</div>
              <div className="text-xs text-gray-400 mt-0.5">
                OpenAI, Claude e Gemini si configurano nella pagina dedicata, con assegnazione per funzionalità.
              </div>
            </div>
            <a href="/ai-providers" className="btn-secondary text-xs whitespace-nowrap">
              <Brain size={13} /> Vai ai Provider AI
            </a>
          </div>

          {/* Instagram */}
          <ConfigSection
            icon={Instagram}
            title="Account Instagram"
            description="Collega il tuo account Instagram Business o Creator"
            accent="instagram"
          >
            {/* Account già collegato */}
            {account?.username && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20 mb-4">
                <div className="w-10 h-10 rounded-full ig-gradient flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-white">IG</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">@{account.username}</div>
                  <div className="text-xs text-green-400">✓ Account collegato · sostituisci inserendo nuove credenziali</div>
                </div>
                <button
                  type="button"
                  onClick={() => disconnectAccount('instagram')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-all flex-shrink-0"
                  title="Disassocia account Instagram"
                >
                  <Unlink size={12} /> Disassocia
                </button>
              </div>
            )}

            {/* ── Guida inline collassabile ─────────────────────── */}
            <div className="mb-4 rounded-xl border border-pink-500/20 bg-pink-500/5 overflow-hidden">
              <button
                type="button"
                onClick={() => setIgGuideOpen(v => !v)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-pink-500/5 transition-colors"
              >
                <BookOpen size={14} className="text-pink-400 flex-shrink-0" />
                <span className="text-sm font-medium text-pink-200">📖 Guida passo per passo — come ottenere le credenziali</span>
                {igGuideOpen
                  ? <ChevronUp size={14} className="text-pink-400 ml-auto" />
                  : <ChevronDown size={14} className="text-pink-400 ml-auto" />}
              </button>

              {igGuideOpen && (
                <div className="px-4 pb-5 space-y-5 border-t border-pink-500/20 pt-4">

                  {/* ── STEP 1 ── */}
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-pink-500/20 text-pink-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</div>
                    <div className="space-y-2 flex-1">
                      <div className="text-sm font-semibold text-white">Crea (o apri) la tua App Meta</div>
                      <div className="text-xs text-gray-400">
                        Vai su{' '}
                        <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer"
                          className="text-pink-400 underline inline-flex items-center gap-0.5">
                          developers.facebook.com/apps <ExternalLink size={10} />
                        </a>
                        {' '}→ <strong className="text-white">Crea app</strong> → tipo <strong className="text-white">&quot;Business&quot;</strong> → aggiungi il prodotto <strong className="text-white">&quot;Instagram Graph API&quot;</strong>.
                      </div>
                      <div className="p-3 rounded-lg bg-gray-900 border border-gray-700 text-xs space-y-2">
                        <div className="text-yellow-300 font-semibold">↓ Dove trovo App ID e App Secret?</div>
                        <div className="flex items-start gap-2 text-gray-300">
                          <span className="text-pink-400 mt-0.5">→</span>
                          <span>Nel menu laterale: <strong className="text-white">Impostazioni → Base</strong></span>
                        </div>
                        <div className="flex items-start gap-2 text-gray-300">
                          <span className="text-pink-400 mt-0.5">→</span>
                          <span><strong className="text-yellow-200">ID app</strong> = solo cifre, es: <code className="bg-gray-700 px-1 rounded">1311665224243327</code><br/>
                          <span className="text-red-400">⚠ NON inserire il nome dell&apos;app (es: &quot;Pineapple Home-IG&quot;)</span></span>
                        </div>
                        <div className="flex items-start gap-2 text-gray-300">
                          <span className="text-pink-400 mt-0.5">→</span>
                          <span><strong className="text-yellow-200">Chiave segreta</strong> = clicca &quot;Mostra&quot; per vedere la stringa da 32 caratteri → copia quella</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── STEP 2 ── */}
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-pink-500/20 text-pink-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</div>
                    <div className="space-y-2 flex-1">
                      <div className="text-sm font-semibold text-white">Genera il token d&apos;accesso (nuova IG API)</div>
                      <div className="text-xs text-gray-400">
                        Nella tua App Meta → <strong className="text-white">Casi d&apos;uso</strong> → trova{' '}
                        <strong className="text-white">&quot;Gestisci i messaggi e i contenuti su Instagram&quot;</strong> → clicca{' '}
                        <strong className="text-white">Personalizza</strong>.
                      </div>

                      <div className="p-3 rounded-lg bg-gray-900 border border-gray-700 text-xs space-y-3">
                        {/* substep A */}
                        <div className="space-y-1">
                          <div className="text-white font-semibold">A — Aggiungi i permessi</div>
                          <div className="text-gray-400 mb-1.5">Nella sezione <strong className="text-white">&quot;1. Aggiungi le autorizzazioni necessarie&quot;</strong> clicca <strong className="text-white">&quot;Add all required permissions&quot;</strong>. Vengono aggiunti:</div>
                          <div className="space-y-1">
                            {[
                              { perm: 'instagram_business_basic', note: 'lettura profilo business' },
                              { perm: 'instagram_business_content_publish', note: 'pubblicazione post/reel/story' },
                              { perm: 'instagram_manage_comments', note: 'commenti' },
                              { perm: 'instagram_business_manage_messages', note: 'messaggi diretti' },
                            ].map(({ perm, note }) => (
                              <div key={perm} className="flex items-center gap-2">
                                <span className="text-green-400">✓</span>
                                <code className="text-green-300 bg-green-500/10 px-1.5 py-0.5 rounded font-mono text-[10px]">{perm}</code>
                                <span className="text-gray-500 text-[10px]">— {note}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* substep B */}
                        <div className="space-y-1">
                          <div className="text-white font-semibold">B — Genera il token (tab &quot;Configurazione dell&apos;API con Insta...&quot;)</div>
                          <div className="flex items-start gap-1.5 text-gray-300">
                            <span className="text-pink-400 mt-0.5">→</span>
                            <span>Sezione <strong className="text-white">&quot;2. Genera i token d&apos;accesso&quot;</strong> → clicca <strong className="text-white">&quot;Aggiungi account&quot;</strong> se l&apos;account non è presente</span>
                          </div>
                          <div className="flex items-start gap-1.5 text-gray-300">
                            <span className="text-pink-400 mt-0.5">→</span>
                            <span>Accanto al tuo account Instagram clicca <strong className="text-white">&quot;Genera token&quot;</strong> → autorizza</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 p-2 rounded bg-green-500/10 border border-green-500/20">
                            <span className="text-green-400">✓</span>
                            <span className="text-green-300">Il token inizia con <code className="bg-gray-700 px-1 rounded">IGAA</code> — è quello corretto!</span>
                          </div>
                        </div>
                        {/* substep C */}
                        <div className="space-y-1">
                          <div className="text-white font-semibold">C — Trova App ID e App Secret</div>
                          <div className="text-gray-400">Sono mostrati nella stessa pagina (in cima): <strong className="text-white">ID app Instagram</strong> e <strong className="text-white">Chiave segreta di Instagram</strong> → copia entrambi.</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── STEP 3 ── */}
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-pink-500/20 text-pink-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</div>
                    <div className="space-y-2 flex-1">
                      <div className="text-sm font-semibold text-white">Trova il tuo Instagram User ID</div>
                      <div className="text-xs text-gray-400">
                        Con la nuova IG API il campo <strong className="text-white">&quot;Business Account ID&quot;</strong> è il tuo <strong className="text-white">Instagram User ID</strong>.
                        Il modo più semplice: nella stessa pagina Meta dove hai generato il token, l&apos;ID è già visibile accanto al nome account (es: <code className="bg-gray-700 px-1 rounded">17841474077325803</code>).
                      </div>
                      <div className="p-3 rounded-lg bg-gray-900 border border-gray-700 text-xs space-y-1.5">
                        <div className="text-gray-400">In alternativa, chiama con il token appena ottenuto:</div>
                        <div className="font-mono text-blue-300 flex items-center gap-2">
                          <span className="text-gray-500">GET</span>
                          <span>https://graph.instagram.com/me?fields=id,username&amp;access_token=IGAA...</span>
                        </div>
                        <div className="text-yellow-300 mt-1">→ Copia il campo <strong>id</strong> dalla risposta</div>
                      </div>
                      <div className="p-2 rounded bg-blue-500/5 border border-blue-500/20 text-xs text-blue-300">
                        💡 Con token <code className="bg-gray-700 px-1 rounded">IGAA</code> il campo &quot;Business Account ID&quot; viene ignorato e usato l&apos;id dal profilo — puoi lasciare quello che hai già.
                      </div>
                    </div>
                  </div>

                  {/* ── STEP 4 ── */}
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-pink-500/20 text-pink-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">4</div>
                    <div className="space-y-2 flex-1">
                      <div className="text-sm font-semibold text-white">Step 4 nel pannello Meta — &quot;Configura Instagram Business Login&quot;</div>
                      <div className="text-xs text-gray-400">
                        Nell&apos;interfaccia Meta Developers, il caso d&apos;uso <strong className="text-white">&quot;Gestisci i messaggi e i contenuti su Instagram&quot;</strong> mostra 4 step. Lo step 4 è{' '}
                        <strong className="text-white">&quot;Configura Instagram Business Login&quot;</strong> — puoi ignorarlo per il flusso manuale di questa guida.
                      </div>
                      <div className="p-3 rounded-lg bg-gray-900 border border-gray-700 text-xs space-y-2">
                        <div className="text-pink-300 font-semibold">Cosa vedi in questo step:</div>
                        <div className="flex items-start gap-2 text-gray-300">
                          <span className="text-pink-400 mt-0.5">→</span>
                          <span><strong className="text-white">URL di incorporamento</strong> — un link OAuth pre-generato con il tuo <code className="bg-gray-700 px-1 rounded">client_id</code> e il <code className="bg-gray-700 px-1 rounded">redirect_uri</code> configurato. È read-only, non richiede modifiche.</span>
                        </div>
                        <div className="flex items-start gap-2 text-gray-300">
                          <span className="text-pink-400 mt-0.5">→</span>
                          <span>Pulsante <strong className="text-white">&quot;Impostazioni di Business Login&quot;</strong> → apre un modal con <strong>solo 3 campi</strong>:</span>
                        </div>
                        <div className="ml-4 space-y-1">
                          {[
                            { field: 'URI di reindirizzamento OAuth', note: 'deve corrispondere al redirect_uri della tua app (es: https://tuosito.it/)' },
                            { field: 'URL di callback per la rimozione dell\'autorizzazione', note: 'webhook chiamato quando un utente revoca i permessi — opzionale' },
                            { field: 'URL per la richiesta di eliminazione dei dati', note: 'richiesto per l\'App Review di Meta — opzionale in dev mode' },
                          ].map(({ field, note }) => (
                            <div key={field} className="flex items-start gap-2">
                              <span className="text-gray-500 mt-0.5">·</span>
                              <div>
                                <span className="text-white font-medium">{field}</span>
                                <span className="text-gray-500 ml-1">— {note}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 mt-1 p-2 rounded bg-green-500/10 border border-green-500/20">
                          <span className="text-green-400 flex-shrink-0">✓</span>
                          <span className="text-green-300">
                            Per il flusso manuale di questa guida (token generato dal pannello Meta) <strong>non è necessario configurare nulla qui</strong>. Il modal non offre altre opzioni oltre a questi 3 URL.
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <a
                    href="https://developers.facebook.com/tools/explorer/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-pink-500/30 text-pink-300 hover:bg-pink-500/10 text-xs font-semibold transition-all"
                  >
                    <ExternalLink size={12} /> Apri Graph API Explorer
                  </a>
                </div>
              )}
            </div>

            {/* ── Campi credenziali ─────────────────────────────── */}
            <div className="space-y-3">

              {/* access_token */}
              <div>
                <label className="label flex items-center gap-1.5">
                  <code className="text-pink-400 bg-pink-500/10 px-1.5 py-0.5 rounded text-xs">access_token</code>
                  <span className="text-gray-400 text-xs">User Access Token *</span>
                </label>
                <input
                  type="password"
                  className={`input font-mono text-sm ${igTokenError ? 'border-red-500/60 focus:border-red-500' : ''}`}
                  placeholder="IGAAxxxxxxxx...  oppure  EAAxxxxxxxx..."
                  value={igToken}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\s+/g, '');
                    setIgToken(v);
                    if (v && !v.startsWith('IGAA') && !v.startsWith('EAA')) {
                      setIgTokenError(`Prefisso non riconosciuto ("${v.substring(0,6)}"). Deve iniziare con IGAA (nuova Instagram API) o EAA (vecchia Graph API).`);
                    } else {
                      setIgTokenError('');
                    }
                  }}
                />
                {igTokenError
                  ? <p className="text-xs text-red-400 mt-1">⚠️ {igTokenError}</p>
                  : <p className="text-xs text-gray-500 mt-1">
                      Inizia con <code className="bg-gray-800 px-1 rounded text-green-300">IGAA</code> (nuova IG API) oppure <code className="bg-gray-800 px-1 rounded text-blue-300">EAA</code> (vecchia Graph API) — segui la guida sopra
                    </p>
                }
              </div>

              {/* instagram_business_account.id */}
              <div>
                <label className="label flex items-center gap-1.5">
                  <code className="text-pink-400 bg-pink-500/10 px-1.5 py-0.5 rounded text-xs">instagram_business_account.id</code>
                  <span className="text-gray-400 text-xs">Business Account ID *</span>
                </label>
                <input
                  type="text"
                  className="input font-mono"
                  placeholder="17841474077325803"
                  value={igAccountId}
                  onChange={(e) => setIgAccountId(e.target.value.trim())}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Solo numeri · trovalo con: Graph API Explorer → <code className="bg-gray-800 px-1 rounded">GET /me/accounts</code> → espandi la pagina → <code className="bg-gray-800 px-1 rounded">instagram_business_account.id</code>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* app_id */}
                <div>
                  <label className="label flex items-center gap-1.5">
                    <code className="text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded text-xs">app_id</code>
                    <span className="text-gray-400 text-xs">App ID</span>
                  </label>
                  <input
                    type="text"
                    className={`input font-mono ${igAppIdError ? 'border-red-500/60 focus:border-red-500' : ''}`}
                    placeholder="1234567890123456"
                    value={igAppId}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setIgAppId(v);
                      setIgAppIdError(v && !/^\d+$/.test(v) ? "Deve essere solo numeri (non il nome dell'app)" : '');
                    }}
                  />
                  {igAppIdError
                    ? <p className="text-xs text-red-400 mt-1">⚠️ {igAppIdError}</p>
                    : <p className="text-xs text-gray-500 mt-1">Solo numeri · Impostazioni → Base → <strong>ID app</strong></p>
                  }
                </div>

                {/* client_secret (App Secret) */}
                <div>
                  <label className="label flex items-center gap-1.5">
                    <code className="text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded text-xs">client_secret</code>
                    <span className="text-gray-400 text-xs">App Secret</span>
                  </label>
                  <input
                    type="password"
                    className="input font-mono"
                    placeholder="abc123def456... (32 car.)"
                    value={igAppSecret}
                    onChange={(e) => setIgAppSecret(e.target.value.trim())}
                  />
                  <p className="text-xs text-gray-500 mt-1">Impostazioni → Base → <strong>Chiave segreta</strong></p>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-xs text-yellow-300">
                <Info size={12} className="flex-shrink-0 mt-0.5" />
                <span>
                  <strong>App ID + App Secret</strong> sono opzionali: se inseriti, il sistema prova a convertire automaticamente il token short-lived (1h) in long-lived (60 gg).
                  Se la conversione non riesce (es. token già long-lived o app diversa), il token viene comunque usato così com&apos;è.
                  Se non li inserisci, incolla direttamente un token long-lived.
                </span>
              </div>

              <button
                onClick={saveInstagram}
                disabled={saving || !igToken || !igAccountId || !!igAppIdError || !!igTokenError}
                className="btn-primary w-full"
              >
                <Instagram size={15} />
                {saving ? 'Verifica in corso...' : 'Collega Account Instagram'}
              </button>
            </div>
          </ConfigSection>

          {/* Facebook */}
          <ConfigSection
            icon={Facebook}
            title="Pagina Facebook"
            description="Collega una Pagina Facebook Business per pubblicare post, video e storie"
            accent="blue"
            defaultOpen={false}
          >
            {/* Pagina già collegata */}
            {fbAccount?.pageName && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <Facebook size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{fbAccount.pageName}</div>
                  <div className="text-xs text-blue-400">✓ Pagina collegata · {fbAccount.followersCount?.toLocaleString('it-IT')} follower · sostituisci con nuove credenziali</div>
                </div>
                <button
                  type="button"
                  onClick={() => disconnectAccount('facebook')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-all flex-shrink-0"
                  title="Disassocia pagina Facebook"
                >
                  <Unlink size={12} /> Disassocia
                </button>
              </div>
            )}

            {/* ── Guida inline collassabile ─────────────────────── */}
            <div className="mb-4 rounded-xl border border-blue-500/20 bg-blue-500/5 overflow-hidden">
              <button
                type="button"
                onClick={() => setFbGuideOpen(v => !v)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-blue-500/5 transition-colors"
              >
                <BookOpen size={14} className="text-blue-400 flex-shrink-0" />
                <span className="text-sm font-medium text-blue-200">📖 Guida passo per passo — come ottenere le credenziali</span>
                {fbGuideOpen
                  ? <ChevronUp size={14} className="text-blue-400 ml-auto" />
                  : <ChevronDown size={14} className="text-blue-400 ml-auto" />}
              </button>

              {fbGuideOpen && (
                <div className="px-4 pb-5 space-y-5 border-t border-blue-500/20 pt-4">

                  {/* ── STEP 0 — prerequisiti ── */}
                  <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-xs space-y-1.5">
                    <div className="text-yellow-300 font-semibold">⚠ Prerequisiti obbligatori</div>
                    <div className="flex items-start gap-2 text-gray-300">
                      <span className="text-yellow-400 mt-0.5">→</span>
                      <span>Il tuo account Facebook deve essere <strong className="text-white">Amministratore</strong> della Pagina che vuoi collegare (non Editor o Moderatore)</span>
                    </div>
                    <div className="flex items-start gap-2 text-gray-300">
                      <span className="text-yellow-400 mt-0.5">→</span>
                      <span>La Pagina deve essere di tipo <strong className="text-white">Business / Professional</strong> — non un profilo personale</span>
                    </div>
                  </div>

                  {/* ── STEP 1 ── */}
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</div>
                    <div className="space-y-2 flex-1">
                      <div className="text-sm font-semibold text-white">Crea (o apri) la tua App Meta</div>
                      <div className="text-xs text-gray-400">
                        Vai su{' '}
                        <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer"
                          className="text-blue-400 underline inline-flex items-center gap-0.5">
                          developers.facebook.com/apps <ExternalLink size={10} />
                        </a>
                        {' '}→ <strong className="text-white">Crea app</strong> → scegli tipo <strong className="text-white">&quot;Business&quot;</strong> → dai un nome → conferma.
                      </div>
                      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-300">
                        <Info size={11} className="flex-shrink-0 mt-0.5" />
                        <span>
                          Il form qui sotto richiede solo <strong>2 campi</strong>: il <strong>Page Access Token</strong> e il <strong>Page ID</strong>.
                          Non ci sono campi per App ID o App Secret — se hai un token temporaneo devi prima convertirlo seguendo il <strong>passo 2C</strong> della guida, poi incollare il risultato nel form.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ── STEP 2 ── */}
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</div>
                    <div className="space-y-2 flex-1">
                      <div className="text-sm font-semibold text-white">Genera il User Token nel Graph API Explorer</div>
                      <div className="text-xs text-gray-400">
                        Vai su{' '}
                        <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer"
                          className="text-blue-400 underline inline-flex items-center gap-0.5 font-semibold">
                          Graph API Explorer <ExternalLink size={10} />
                        </a>
                        {' '}e segui questi passi:
                      </div>
                      <div className="p-3 rounded-lg bg-gray-900 border border-gray-700 text-xs space-y-3">

                        {/* substep A */}
                        <div className="space-y-1.5">
                          <div className="text-white font-semibold">A — Seleziona app e permessi</div>
                          <div className="flex items-start gap-1.5 text-gray-300">
                            <span className="text-blue-400 mt-0.5">→</span>
                            <span><strong className="text-white">App di Meta</strong>: seleziona la tua app (es: &quot;Pineapple Home&quot;)</span>
                          </div>
                          <div className="flex items-start gap-1.5 text-gray-300">
                            <span className="text-blue-400 mt-0.5">→</span>
                            <span><strong className="text-white">Utente o Pagina</strong> → seleziona la tua <strong className="text-white">Pagina</strong> (es: &quot;Pineapple Home&quot;) — <strong className="text-red-400">NON</strong> lasciare &quot;Token utente&quot;, altrimenti il token non funzionerà!</span>
                          </div>
                          <div className="flex items-start gap-1.5 text-gray-300">
                            <span className="text-blue-400 mt-0.5">→</span>
                            <span>Sezione <strong className="text-white">Autorizzazioni</strong> → <strong className="text-white">&quot;Aggiungi un&apos;autorizzazione&quot;</strong> — aggiungi questi (gli unici disponibili per questa app):</span>
                          </div>
                          <div className="ml-3 space-y-1">
                            {[
                              { perm: 'pages_show_list', note: 'necessaria — permette GET /me/accounts per ottenere il Page Token' },
                              { perm: 'pages_read_engagement', note: 'consigliata — lettura metriche base della pagina' },
                              { perm: 'business_management', note: 'opzionale — gestione account business' },
                            ].map(({ perm, note }) => (
                              <div key={perm} className="flex items-start gap-2">
                                <span className="text-green-400 mt-0.5">✓</span>
                                <div>
                                  <code className="text-green-300 bg-green-500/10 px-1.5 py-0.5 rounded font-mono text-[10px]">{perm}</code>
                                  <span className="text-gray-500 text-[10px] ml-1.5">— {note}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-start gap-2 mt-1.5 p-2 rounded bg-blue-500/10 border border-blue-500/20">
                            <span className="text-blue-400 mt-0.5 flex-shrink-0">ℹ</span>
                            <span className="text-blue-200 text-[10px]">
                              Solo questi permessi sono disponibili nel menu per questo tipo di app. <strong>Non cercare</strong> <code className="bg-gray-700 px-1 rounded">pages_manage_posts</code> — non esiste in questa lista. Il Page Access Token che otterrai al passo B sarà comunque sufficiente per pubblicare se sei admin della pagina.
                            </span>
                          </div>
                          <div className="flex items-start gap-1.5 text-gray-300 mt-1">
                            <span className="text-blue-400 mt-0.5">→</span>
                            <span>Clicca <strong className="text-white">&quot;Generate Access Token&quot;</strong> → autorizza nel popup Facebook</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                            <span className="text-yellow-400 flex-shrink-0">⚠</span>
                            <span className="text-yellow-300">Questo è un <strong>User Token</strong> temporaneo (~1h) — serve il passo B per ricavare il Page Token</span>
                          </div>
                        </div>

                        {/* substep B */}
                        <div className="space-y-1.5 border-t border-gray-700 pt-2">
                          <div className="text-white font-semibold">B — Ottieni il Page Access Token con GET /me/accounts</div>
                          <div className="text-gray-400">Con il User Token attivo nel campo in alto, digita nella query bar:</div>
                          <div className="mt-1 p-2 rounded bg-gray-800 border border-gray-700 font-mono text-blue-300 text-[10px]">
                            GET /me/accounts?fields=id,name,access_token
                          </div>
                          <div className="flex items-start gap-1.5 text-gray-300 mt-1.5">
                            <span className="text-blue-400 mt-0.5">→</span>
                            <span>Nella risposta JSON trovi l&apos;array <code className="bg-gray-700 px-1 rounded">data[]</code> — ogni oggetto è una delle tue Pagine Facebook</span>
                          </div>
                          <div className="flex items-start gap-1.5 text-yellow-300">
                            <span className="text-yellow-400 mt-0.5">→</span>
                            <span>Campo <strong>access_token</strong> della pagina → <strong className="text-white">Page Access Token da incollare qui sotto</strong></span>
                          </div>
                          <div className="flex items-start gap-1.5 text-yellow-300">
                            <span className="text-yellow-400 mt-0.5">→</span>
                            <span>Campo <strong>id</strong> della stessa pagina → <strong className="text-white">Facebook Page ID</strong></span>
                          </div>
                          <div className="flex items-center gap-2 mt-2 p-2 rounded bg-green-500/10 border border-green-500/20">
                            <span className="text-green-400 flex-shrink-0">✓</span>
                            <span className="text-green-300">Il Page Access Token inizia con <code className="bg-gray-700 px-1 rounded">EAA</code> — è diverso dal User Token</span>
                          </div>
                        </div>

                        {/* substep C — token permanente */}
                        <div className="space-y-1.5 border-t border-gray-700 pt-2">
                          <div className="text-white font-semibold">C — Rendi il Page Token permanente (consigliato)</div>
                          <div className="text-gray-400">Il Page Token ottenuto da un <strong className="text-white">long-lived User Token</strong> non scade mai. Converti prima il User Token con questa chiamata (puoi farla direttamente dal Graph API Explorer o da browser/Postman):</div>
                          <div className="mt-1 p-2 rounded bg-gray-800 border border-gray-700 font-mono text-blue-300 text-[10px] break-all">
                            GET https://graph.facebook.com/v21.0/oauth/access_token
                            ?grant_type=fb_exchange_token
                            &amp;client_id=&#123;APP_ID&#125;
                            &amp;client_secret=&#123;APP_SECRET&#125;
                            &amp;fb_exchange_token=&#123;SHORT_USER_TOKEN&#125;
                          </div>
                          <div className="text-gray-400 text-[10px] mt-1">→ Copia l&apos;<code className="bg-gray-700 px-1 rounded">access_token</code> dalla risposta → ripeti il passo B con questo → il Page Token sarà permanente</div>
                          <div className="text-gray-500 text-[10px]">App ID e App Secret: Meta Developers → tua app → Impostazioni → Base</div>
                          <div className="flex items-start gap-2 mt-2 p-2 rounded bg-red-500/10 border border-red-500/30">
                            <span className="text-red-400 flex-shrink-0 mt-0.5">⚠</span>
                            <span className="text-red-300 text-[10px]">
                              Nel <strong>Graph API Explorer</strong>, nel campo <strong>&quot;Utente o Pagina&quot;</strong>, assicurati di selezionare la tua <strong>Pagina</strong> (es: &quot;Pineapple Home&quot;) e <strong>non</strong> &quot;Token utente&quot; — di default viene selezionato &quot;Token utente&quot; ma il token generato in quel modo non funzionerà per la pubblicazione.
                            </span>
                          </div>
                          <div className="flex items-start gap-2 mt-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                            <span className="text-yellow-400 flex-shrink-0 mt-0.5">⚠</span>
                            <span className="text-yellow-300 text-[10px]">
                              <strong>IP del server in whitelist:</strong> se la chiamata di scambio token restituisce un errore, vai su Meta Developers → tua app → <strong>Impostazioni Avanzate</strong> → sezione <strong>&quot;Aggiorna la lista degli IP consentiti delle impostazioni&quot;</strong> e <strong>&quot;Lista degli IP server consentiti&quot;</strong> → aggiungi l&apos;IP del tuo server.
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── STEP 3 ── */}
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</div>
                    <div className="space-y-2 flex-1">
                      <div className="text-sm font-semibold text-white">Trova il Facebook Page ID (metodo alternativo)</div>
                      <div className="text-xs text-gray-400">Se il Page ID non è visibile nella risposta GET /me/accounts, puoi trovarlo anche qui:</div>
                      <div className="p-3 rounded-lg bg-gray-900 border border-gray-700 text-xs space-y-1.5">
                        <div className="flex items-start gap-2 text-gray-300">
                          <span className="text-blue-400 mt-0.5">→</span>
                          <span><strong className="text-white">Facebook.com</strong> → vai sulla tua Pagina → clicca i tre puntini <strong className="text-white">&quot;…&quot;</strong> → <strong className="text-white">&quot;Impostazioni e privacy&quot;</strong> → <strong className="text-white">&quot;Impostazioni&quot;</strong></span>
                        </div>
                        <div className="flex items-start gap-2 text-gray-300">
                          <span className="text-blue-400 mt-0.5">→</span>
                          <span>Menu laterale: <strong className="text-white">&quot;Informazioni sulla pagina&quot;</strong> → in fondo: <strong className="text-white">ID Pagina</strong></span>
                        </div>
                        <div className="flex items-start gap-2 text-yellow-300">
                          <span className="text-yellow-400 mt-0.5">→</span>
                          <span>È un numero come <code className="bg-gray-700 px-1 rounded">123456789012345</code> — copia quello</span>
                        </div>
                        <div className="border-t border-gray-700 pt-1.5 flex items-start gap-2 text-gray-400">
                          <span className="text-gray-500 mt-0.5">→</span>
                          <span>In alternativa: se l&apos;URL della Pagina contiene già un numero: <code className="bg-gray-700 px-1 rounded">facebook.com/profile.php?id=123456789012345</code></span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <a
                      href="https://developers.facebook.com/tools/explorer/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 flex-1 py-2.5 rounded-xl border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 text-xs font-semibold transition-all"
                    >
                      <ExternalLink size={12} /> Graph API Explorer
                    </a>
                    <a
                      href="https://developers.facebook.com/apps"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-300 hover:bg-gray-700/40 text-xs font-semibold transition-all"
                    >
                      <ExternalLink size={12} /> Dashboard App Meta
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* ── Campi credenziali ─────────────────────────────── */}
            <div className="space-y-3">

              {/* access_token (Page Access Token) */}
              <div>
                <label className="label flex items-center gap-1.5">
                  <code className="text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded text-xs">access_token</code>
                  <span className="text-gray-400 text-xs">Page Access Token *</span>
                </label>
                <input
                  type="password"
                  className={`input font-mono text-sm ${fbTokenError ? 'border-red-500/60 focus:border-red-500' : ''}`}
                  placeholder="EAAxxxxxxxxxxxxxxxxxxxxxxxx..."
                  value={fbToken}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\s+/g, '');
                    setFbToken(v);
                    if (v && !v.startsWith('EAA')) {
                      setFbTokenError(`Prefisso non riconosciuto ("${v.substring(0,6)}"). Il Page Access Token deve iniziare con EAA. Segui lo Step B della guida.`);
                    } else {
                      setFbTokenError('');
                    }
                  }}
                />
                {fbTokenError
                  ? <p className="text-xs text-red-400 mt-1">⚠️ {fbTokenError}</p>
                  : <p className="text-xs text-gray-500 mt-1">
                      Inizia con <code className="bg-gray-800 px-1 rounded text-blue-300">EAA</code> —
                      ottenuto da <code className="bg-gray-800 px-1 rounded">GET /me/accounts</code> → campo <code className="bg-gray-800 px-1 rounded">access_token</code> della pagina
                    </p>
                }
              </div>

              {/* page_id */}
              <div>
                <label className="label flex items-center gap-1.5">
                  <code className="text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded text-xs">page_id</code>
                  <span className="text-gray-400 text-xs">Facebook Page ID *</span>
                </label>
                <input
                  type="text"
                  className="input font-mono"
                  placeholder="123456789012345"
                  value={fbPageId}
                  onChange={(e) => setFbPageId(e.target.value.replace(/\s+/g, ''))}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Solo numeri · ottenuto da <code className="bg-gray-800 px-1 rounded">GET /me/accounts</code> → campo <code className="bg-gray-800 px-1 rounded">id</code> della pagina,
                  oppure: Facebook → Pagina → Impostazioni → Info pagina → <strong>ID Pagina</strong>
                </p>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-blue-300">
                <Info size={12} className="flex-shrink-0 mt-0.5" />
                <span>
                  Incolla qui il <strong>Page Access Token</strong> già permanente (non il User Token).
                  Se hai un token temporaneo, segui prima il <strong>passo 2C della guida</strong> qui sopra per convertirlo — poi torna qui e incolla il risultato.
                </span>
              </div>

              <button
                onClick={saveFacebook}
                disabled={saving || !fbToken || !fbPageId || !!fbTokenError}
                className="btn-primary w-full"
                style={{ background: '#1877f2' }}
              >
                <Facebook size={15} />
                {saving ? 'Verifica in corso...' : 'Collega Pagina Facebook'}
              </button>
            </div>
          </ConfigSection>

          {/* TikTok */}
          <ConfigSection
            icon={Music2}
            title="Account TikTok"
            description="Collega il tuo account TikTok for Business tramite Content Posting API v2"
            accent="brand"
            defaultOpen={false}
          >
            {/* Account già collegato */}
            {ttAccount?.username && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 mb-4">
                <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                  <Music2 size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">@{ttAccount.username ?? ttAccount.displayName}</div>
                  <div className="text-xs text-cyan-400">✓ Account collegato · {ttAccount.followersCount?.toLocaleString('it-IT')} follower · sostituisci inserendo nuove credenziali</div>
                </div>
                <button
                  type="button"
                  onClick={() => disconnectAccount('tiktok')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-all flex-shrink-0"
                  title="Disassocia account TikTok"
                >
                  <Unlink size={12} /> Disassocia
                </button>
              </div>
            )}

            {/* ── Guida inline collassabile ─────────────────────── */}
            <div className="mb-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 overflow-hidden">
              <button
                type="button"
                onClick={() => setTtGuideOpen(v => !v)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-cyan-500/5 transition-colors"
              >
                <BookOpen size={14} className="text-cyan-400 flex-shrink-0" />
                <span className="text-sm font-medium text-cyan-200">📖 Guida passo per passo — come ottenere le credenziali TikTok</span>
                {ttGuideOpen
                  ? <ChevronUp size={14} className="text-cyan-400 ml-auto" />
                  : <ChevronDown size={14} className="text-cyan-400 ml-auto" />}
              </button>

              {ttGuideOpen && (
                <div className="px-4 pb-5 space-y-5 border-t border-cyan-500/20 pt-4">

                  {/* ── Prerequisiti ── */}
                  <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-xs space-y-1.5">
                    <div className="text-yellow-300 font-semibold">⚠ Prerequisiti obbligatori</div>
                    {[
                      'Il tuo account TikTok deve essere un account Business o Creator',
                      'Devi avere un\'app registrata su developers.tiktok.com (piano Sandbox o Live)',
                      'L\'app deve avere i prodotti "Login Kit" e "Content Posting API" abilitati',
                      'Servono i permessi (scope): video.publish, video.upload, user.info.basic',
                    ].map((t, i) => (
                      <div key={i} className="flex items-start gap-2 text-gray-300">
                        <span className="text-yellow-400 mt-0.5 flex-shrink-0">→</span>
                        <span>{t}</span>
                      </div>
                    ))}
                  </div>

                  {/* ── STEP 1 ── */}
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</div>
                    <div className="space-y-2 flex-1">
                      <div className="text-sm font-semibold text-white">Crea (o apri) la tua App TikTok</div>
                      <div className="text-xs text-gray-400">
                        Vai su{' '}
                        <a href="https://developers.tiktok.com/apps/" target="_blank" rel="noopener noreferrer"
                          className="text-cyan-400 underline inline-flex items-center gap-0.5">
                          developers.tiktok.com/apps <ExternalLink size={10} />
                        </a>
                        {' '}→ crea una nuova app → nella schermata dell&apos;app clicca <strong className="text-white">&quot;Add products&quot;</strong> e aggiungi:
                      </div>
                      <div className="ml-2 space-y-1 text-xs">
                        {[
                          { name: 'Login Kit', note: 'autenticazione OAuth — obbligatorio' },
                          { name: 'Content Posting API', note: 'pubblicazione video — obbligatorio' },
                        ].map(({ name, note }) => (
                          <div key={name} className="flex items-center gap-2">
                            <span className="text-green-400">✓</span>
                            <strong className="text-white">{name}</strong>
                            <span className="text-gray-500">— {note}</span>
                          </div>
                        ))}
                      </div>
                      <div className="p-3 rounded-lg bg-gray-900 border border-gray-700 text-xs space-y-1.5">
                        <div className="text-yellow-300 font-semibold">↓ Dove trovo Client Key e Client Secret?</div>
                        <div className="flex items-start gap-2 text-gray-300">
                          <span className="text-cyan-400 mt-0.5">→</span>
                          <span>Nella pagina dell&apos;app: sezione <strong className="text-white">&quot;App info&quot;</strong> → tab <strong className="text-white">&quot;Basic info&quot;</strong></span>
                        </div>
                        <div className="flex items-start gap-2 text-gray-300">
                          <span className="text-cyan-400 mt-0.5">→</span>
                          <span><strong className="text-yellow-200">Client Key</strong> = stringa alfanumerica, es: <code className="bg-gray-700 px-1 rounded">aw1234abc5xy6789</code></span>
                        </div>
                        <div className="flex items-start gap-2 text-gray-300">
                          <span className="text-cyan-400 mt-0.5">→</span>
                          <span><strong className="text-yellow-200">Client Secret</strong> = clicca &quot;Generate&quot; per vederlo → copia subito, non verrà più mostrato</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── STEP 2 ── */}
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</div>
                    <div className="space-y-2 flex-1">
                      <div className="text-sm font-semibold text-white">Configura gli scope nei due prodotti separati</div>
                      <div className="text-xs text-gray-400">
                        TikTok gestisce i permessi in due sezioni distinte della tua app:
                      </div>

                      {/* Login Kit scopes */}
                      <div className="p-3 rounded-lg bg-gray-900 border border-gray-700 text-xs space-y-2">
                        <div className="text-cyan-300 font-semibold flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-[10px]">Login Kit</span>
                          Sezione &quot;Scopes&quot; → clicca &quot;Add scopes&quot;
                        </div>
                        <div className="space-y-1.5">
                          {[
                            { scope: 'user.info.profile', note: 'profilo pubblico (bio_description, profile_web_link, is_verified)', req: true },
                            { scope: 'user.info.stats', note: 'statistiche account (follower count, likes count, video count)', req: true },
                            { scope: 'video.list', note: 'lista video pubblici dell\'utente', req: false },
                          ].map(({ scope, note, req }) => (
                            <div key={scope} className="flex items-start gap-2">
                              <span className={req ? 'text-green-400' : 'text-gray-500'}>✓</span>
                              <code className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${req ? 'text-green-300 bg-green-500/10' : 'text-gray-400 bg-gray-700'}`}>{scope}</code>
                              <span className="text-gray-500 text-[10px]">— {note}{!req ? ' (opzionale)' : ''}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-start gap-2 p-2 rounded bg-yellow-500/5 border border-yellow-500/20 mt-1">
                          <span className="text-yellow-400 flex-shrink-0">⚠</span>
                          <span className="text-yellow-300 text-[10px]">
                            In &quot;Add scopes&quot; di Login Kit vedrai solo questi 3 scope. <strong>Non cercare</strong>{' '}
                            <code className="bg-gray-700 px-1 rounded">user.info.basic</code> — non esiste nel pannello attuale di TikTok.
                          </span>
                        </div>
                      </div>

                      {/* Content Posting API scopes */}
                      <div className="p-3 rounded-lg bg-gray-900 border border-gray-700 text-xs space-y-2">
                        <div className="text-purple-300 font-semibold flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-[10px]">Content Posting API</span>
                          Prodotto separato — va abilitato a parte
                        </div>
                        <div className="text-gray-400">
                          I permessi di pubblicazione{' '}
                          <code className="bg-gray-700 px-1 rounded text-purple-300">video.publish</code> e{' '}
                          <code className="bg-gray-700 px-1 rounded text-purple-300">video.upload</code>{' '}
                          <strong className="text-white">non compaiono nella lista scope di Login Kit</strong> — sono gestiti direttamente dal prodotto Content Posting API:
                        </div>
                        <div className="space-y-1.5">
                          {[
                            { step: '1', text: 'Vai alla pagina della tua app → menu laterale "Products"' },
                            { step: '2', text: 'Clicca "Add products" e aggiungi "Content Posting API"' },
                            { step: '3', text: 'Il prodotto compare nel menu laterale — clicca "Settings" o "Configuration"' },
                            { step: '4', text: 'Abilita i toggle per video.publish e video.upload' },
                          ].map(({ step, text }) => (
                            <div key={step} className="flex items-start gap-2 text-gray-300">
                              <span className="text-purple-400 w-4 flex-shrink-0 mt-0.5">{step}.</span>
                              <span>{text}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 p-2 rounded bg-green-500/10 border border-green-500/20 mt-1">
                          <span className="text-green-400 flex-shrink-0">✓</span>
                          <span className="text-green-300">Dopo il flusso OAuth (Step 3), il token includerà automaticamente tutti i permessi abilitati in entrambi i prodotti</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── STEP 3 ── */}
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</div>
                    <div className="space-y-2 flex-1">
                      <div className="text-sm font-semibold text-white">Esegui il flusso OAuth e ottieni i token</div>
                      <div className="text-xs text-gray-400">
                        TikTok non fornisce uno strumento web per generare token manualmente come Meta.
                        Devi eseguire il flusso OAuth con una chiamata browser oppure usare uno strumento come Postman.
                      </div>
                      <div className="p-3 rounded-lg bg-gray-900 border border-gray-700 text-xs space-y-4">

                        {/* substep A */}
                        <div className="space-y-1.5">
                          <div className="text-white font-semibold">A — Apri l&apos;URL di autorizzazione nel browser</div>
                          <div className="text-gray-400 mb-1">Costruisci questo URL con i tuoi dati e aprilo nel browser:</div>
                          <div className="p-2 rounded bg-gray-800 border border-gray-700 font-mono text-cyan-300 text-[10px] break-all space-y-0.5">
                            <div>https://www.tiktok.com/v2/auth/authorize/</div>
                            <div className="text-gray-500">?client_key=<span className="text-yellow-300">&#123;CLIENT_KEY&#125;</span></div>
                            <div className="text-gray-500">&amp;response_type=code</div>
                            <div className="text-gray-500">&amp;scope=user.info.basic,video.publish,video.upload</div>
                            <div className="text-gray-500">&amp;redirect_uri=<span className="text-yellow-300">&#123;REDIRECT_URI&#125;</span></div>
                            <div className="text-gray-500">&amp;state=random_string</div>
                          </div>
                          <div className="flex items-center gap-2 mt-1 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                            <span className="text-yellow-400 flex-shrink-0">⚠</span>
                            <span className="text-yellow-300">Il <strong>redirect_uri</strong> deve corrispondere esattamente a quello configurato nell&apos;app TikTok (App info → Redirect URI)</span>
                          </div>
                        </div>

                        {/* substep B */}
                        <div className="space-y-1.5 border-t border-gray-700 pt-3">
                          <div className="text-white font-semibold">B — Ricava il codice dal redirect</div>
                          <div className="flex items-start gap-1.5 text-gray-300">
                            <span className="text-cyan-400 mt-0.5">→</span>
                            <span>Dopo aver autorizzato, TikTok reindirizza a:<br />
                              <code className="bg-gray-800 px-1 rounded text-cyan-200">https://tuosito.it/?code=<strong className="text-yellow-200">CODICE</strong>&amp;state=...</code>
                            </span>
                          </div>
                          <div className="flex items-start gap-1.5 text-yellow-300">
                            <span className="text-yellow-400 mt-0.5">→</span>
                            <span>Copia il valore del parametro <strong>code</strong> dall&apos;URL</span>
                          </div>
                        </div>

                        {/* substep C */}
                        <div className="space-y-1.5 border-t border-gray-700 pt-3">
                          <div className="text-white font-semibold">C — Scambia il codice con i token (POST da Postman o terminale)</div>
                          <div className="p-2 rounded bg-gray-800 border border-gray-700 font-mono text-[10px] space-y-0.5 break-all">
                            <div className="text-gray-400">POST https://open.tiktokapis.com/v2/oauth/token/</div>
                            <div className="text-gray-500 mt-1">Content-Type: application/x-www-form-urlencoded</div>
                            <div className="text-cyan-300 mt-1">
                              client_key=&#123;CLIENT_KEY&#125;<br />
                              &amp;client_secret=&#123;CLIENT_SECRET&#125;<br />
                              &amp;code=&#123;CODE&#125;<br />
                              &amp;grant_type=authorization_code<br />
                              &amp;redirect_uri=&#123;REDIRECT_URI&#125;
                            </div>
                          </div>
                        </div>

                        {/* substep D — risposta */}
                        <div className="space-y-1.5 border-t border-gray-700 pt-3">
                          <div className="text-white font-semibold">D — Leggi la risposta JSON</div>
                          <div className="text-gray-400">La risposta contiene tutti i campi che ti servono:</div>
                          <div className="p-2 rounded bg-gray-800 border border-gray-700 font-mono text-[10px] space-y-0.5">
                            <div className="text-gray-500">&#123;</div>
                            <div className="ml-2"><span className="text-yellow-300">&quot;open_id&quot;</span>: <span className="text-green-300">&quot;_000AbC1defGhijK...&quot;</span>, <span className="text-gray-600">← copia qui sotto</span></div>
                            <div className="ml-2"><span className="text-yellow-300">&quot;access_token&quot;</span>: <span className="text-green-300">&quot;act.xxxxxxxxxxx...&quot;</span>, <span className="text-gray-600">← copia qui sotto</span></div>
                            <div className="ml-2"><span className="text-yellow-300">&quot;refresh_token&quot;</span>: <span className="text-green-300">&quot;rft.xxxxxxxxxxx...&quot;</span>, <span className="text-gray-600">← copia qui sotto</span></div>
                            <div className="ml-2"><span className="text-gray-500">&quot;expires_in&quot;: 86400,</span> <span className="text-gray-600">← access_token dura 24h</span></div>
                            <div className="ml-2"><span className="text-gray-500">&quot;refresh_expires_in&quot;: 31536000,</span> <span className="text-gray-600">← refresh dura 1 anno</span></div>
                            <div className="text-gray-500">&#125;</div>
                          </div>
                          <div className="flex items-center gap-2 p-2 rounded bg-green-500/10 border border-green-500/20 mt-1">
                            <span className="text-green-400 flex-shrink-0">✓</span>
                            <span className="text-green-300">
                              <code className="bg-gray-700 px-1 rounded">access_token</code> inizia con <strong>act.</strong> ·{' '}
                              <code className="bg-gray-700 px-1 rounded">refresh_token</code> inizia con <strong>rft.</strong>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── STEP 4 — Sandbox ── */}
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">4</div>
                    <div className="space-y-2 flex-1">
                      <div className="text-sm font-semibold text-white">Sandbox vs Live — differenze importanti</div>
                      <div className="p-3 rounded-lg bg-gray-900 border border-gray-700 text-xs space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div className="space-y-1">
                            <div className="text-yellow-300 font-semibold mb-1">🧪 Sandbox (sviluppo)</div>
                            <div className="text-gray-400">→ Solo account aggiunti come &quot;Sandbox User&quot;</div>
                            <div className="text-gray-400">→ Video pubblicati non visibili pubblicamente</div>
                            <div className="text-gray-400">→ Nessuna approval Meta richiesta</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-green-300 font-semibold mb-1">✅ Live (produzione)</div>
                            <div className="text-gray-400">→ Qualsiasi account TikTok Business</div>
                            <div className="text-gray-400">→ Pubblicazione reale sui profili</div>
                            <div className="text-gray-400">→ Richiede App Review TikTok</div>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 p-2 rounded bg-cyan-500/5 border border-cyan-500/20 mt-1">
                          <Info size={11} className="text-cyan-400 flex-shrink-0 mt-0.5" />
                          <span className="text-cyan-300">Per aggiungere account Sandbox: nella dashboard app → <strong>Manage apps</strong> → <strong>Sandbox</strong> → sezione <strong>&quot;Testers&quot;</strong> → <strong>&quot;Add Tester&quot;</strong> → inserisci username TikTok</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <a
                      href="https://developers.tiktok.com/apps/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 flex-1 py-2.5 rounded-xl border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 text-xs font-semibold transition-all"
                    >
                      <ExternalLink size={12} /> TikTok Developer Portal
                    </a>
                    <a
                      href="https://developers.tiktok.com/doc/content-posting-api-get-started/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-300 hover:bg-gray-700/40 text-xs font-semibold transition-all"
                    >
                      <ExternalLink size={12} /> Docs Content Posting API
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* ── Campi credenziali ─────────────────────────────── */}
            <div className="space-y-3">

              {/* open_id */}
              <div>
                <label className="label flex items-center gap-1.5">
                  <code className="text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded text-xs">open_id</code>
                  <span className="text-gray-400 text-xs">User Open ID *</span>
                </label>
                <input
                  type="text"
                  className="input font-mono"
                  placeholder="_000AbcDeFghiJklMn..."
                  value={ttOpenId}
                  onChange={(e) => setTtOpenId(e.target.value.trim())}
                />
                <p className="text-xs text-gray-500 mt-1">
                  ID univoco dell&apos;utente TikTok — campo <code className="bg-gray-800 px-1 rounded">open_id</code> nella risposta <code className="bg-gray-800 px-1 rounded">POST /v2/oauth/token/</code> · rimane costante
                </p>
              </div>

              {/* access_token */}
              <div>
                <label className="label flex items-center gap-1.5">
                  <code className="text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded text-xs">access_token</code>
                  <span className="text-gray-400 text-xs">Access Token *</span>
                </label>
                <input
                  type="password"
                  className={`input font-mono text-sm ${ttTokenError ? 'border-red-500/60 focus:border-red-500' : ''}`}
                  placeholder="act.xxxxxxxxxxxxxxxxxxxxxxxxxx..."
                  value={ttAccessToken}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\s+/g, '');
                    setTtAccessToken(v);
                    if (v && !v.startsWith('act.')) {
                      setTtTokenError(`Prefisso non riconosciuto ("${v.substring(0, 6)}…"). L'Access Token TikTok deve iniziare con act. — segui lo Step 3D della guida.`);
                    } else {
                      setTtTokenError('');
                    }
                  }}
                />
                {ttTokenError
                  ? <p className="text-xs text-red-400 mt-1">⚠️ {ttTokenError}</p>
                  : <p className="text-xs text-gray-500 mt-1">
                      Inizia con <code className="bg-gray-800 px-1 rounded text-cyan-300">act.</code> · scade ogni <strong className="text-gray-300">24 ore</strong> · si rinnoverà automaticamente se fornisci il Refresh Token
                    </p>
                }
              </div>

              {/* refresh_token */}
              <div>
                <label className="label flex items-center gap-1.5">
                  <code className="text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded text-xs">refresh_token</code>
                  <span className="text-gray-400 text-xs">Refresh Token</span>
                </label>
                <input
                  type="password"
                  className={`input font-mono text-sm ${ttRefreshTokenError ? 'border-red-500/60 focus:border-red-500' : ''}`}
                  placeholder="rft.xxxxxxxxxxxxxxxxxxxxxxxxxx..."
                  value={ttRefreshToken}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\s+/g, '');
                    setTtRefreshToken(v);
                    if (v && !v.startsWith('rft.')) {
                      setTtRefreshTokenError(`Prefisso non riconosciuto ("${v.substring(0, 6)}…"). Il Refresh Token deve iniziare con rft.`);
                    } else {
                      setTtRefreshTokenError('');
                    }
                  }}
                />
                {ttRefreshTokenError
                  ? <p className="text-xs text-red-400 mt-1">⚠️ {ttRefreshTokenError}</p>
                  : <p className="text-xs text-gray-500 mt-1">
                      Inizia con <code className="bg-gray-800 px-1 rounded text-yellow-300">rft.</code> · valido <strong className="text-gray-300">365 giorni</strong> · consigliato — permette il rinnovo automatico dell&apos;access token
                    </p>
                }
              </div>

              <div className="flex items-start gap-2 p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20 text-xs text-cyan-300">
                <Info size={12} className="flex-shrink-0 mt-0.5" />
                <span>
                  L&apos;<strong>Access Token</strong> TikTok scade ogni 24 ore. Se inserisci anche il <strong>Refresh Token</strong>, il sistema lo rinnoverà automaticamente prima che scada. Senza refresh token, dovrai aggiornare manualmente l&apos;access token ogni giorno.
                </span>
              </div>

              <button
                onClick={saveTikTok}
                disabled={saving || !ttAccessToken || !ttOpenId || !!ttTokenError || !!ttRefreshTokenError}
                className="btn-primary w-full"
                style={{ background: '#010101' }}
              >
                <Music2 size={15} />
                {saving ? 'Verifica in corso...' : 'Collega Account TikTok'}
              </button>
            </div>
          </ConfigSection>

          {/* Scheduler */}
          <ConfigSection
            icon={Clock}
            title="Regole di Schedulazione Automatica"
            description="Imposta quanti contenuti pubblicare e quando"
            accent="blue"
          >
            <div className="space-y-4">
              <div>
                <label className="label">Nome regola</label>
                <input type="text" className="input" value={schName} onChange={(e) => setSchName(e.target.value)} />
              </div>

              {/* Frequenza */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Post/giorno</label>
                  <input type="number" min={0} max={10} className="input text-center"
                    value={postsPerDay} onChange={(e) => setPostsPerDay(Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">Storie/giorno</label>
                  <input type="number" min={0} max={20} className="input text-center"
                    value={storiesPerDay} onChange={(e) => setStoriesPerDay(Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">Reel/settimana</label>
                  <input type="number" min={0} max={7} className="input text-center"
                    value={reelsPerWeek} onChange={(e) => setReelsPerWeek(Number(e.target.value))} />
                </div>
              </div>

              {/* Giorni attivi */}
              <div>
                <label className="label">Giorni attivi</label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS_LABELS.map((d, i) => (
                    <button
                      key={i}
                      onClick={() => toggleDay(i)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        activeDays.includes(i)
                          ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                          : 'border-gray-700 text-gray-500 hover:border-gray-600'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Orari */}
              <div>
                <label className="label">Orari preferiti</label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_TIMES.map((t) => (
                    <button
                      key={t}
                      onClick={() => toggleTime(t)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                        preferredTimes.includes(t)
                          ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                          : 'border-gray-700 text-gray-500 hover:border-gray-600'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mt-1.5">
                  💡 Orari consigliati per Italia: 09:00, 12:00, 18:00, 20:00
                </p>
              </div>

              {/* AI Topics */}
              <div>
                <label className="label">Topic AI automatici</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {aiTopics.map((t, i) => (
                    <span key={i} className="badge bg-gray-700 text-gray-300 gap-1">
                      {t}
                      <button onClick={() => setAiTopics(aiTopics.filter((_, j) => j !== i))}
                        className="text-gray-500 hover:text-red-400">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="text" className="input flex-1 text-sm"
                    placeholder="Aggiungi topic (es: prodotto, offerta...)"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTopic.trim()) {
                        setAiTopics([...aiTopics, newTopic.trim()]);
                        setNewTopic('');
                      }
                    }} />
                  <button
                    onClick={() => { if (newTopic.trim()) { setAiTopics([...aiTopics, newTopic.trim()]); setNewTopic(''); } }}
                    className="btn-secondary text-xs"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>

              {/* Sito URL */}
              <div>
                <label className="label">URL Sito (per contenuto automatico)</label>
                <input type="url" className="input" placeholder="https://www.tuosito.it"
                  value={schSiteUrl} onChange={(e) => setSchSiteUrl(e.target.value)} />
              </div>

              {/* Tono AI */}
              <div>
                <label className="label">Tono AI predefinito</label>
                <select className="select" value={schAiTone} onChange={(e) => setSchAiTone(e.target.value as AITone)}>
                  <option value="professional">💼 Professionale</option>
                  <option value="friendly">😊 Amichevole</option>
                  <option value="funny">😄 Divertente</option>
                  <option value="inspirational">✨ Inspirazionale</option>
                  <option value="luxury">👑 Luxury</option>
                  <option value="minimal">◻️ Minimal</option>
                </select>
              </div>

              {/* Preview schedule */}
              <div className="bg-gray-800/50 rounded-xl p-4">
                <div className="text-xs font-medium text-gray-400 mb-3">📅 Anteprima schedule settimanale</div>
                <div className="space-y-1.5">
                  {preview.map(({ dayLabel, times, types }) => (
                    <div key={dayLabel} className="flex items-center gap-3 text-xs">
                      <span className="text-gray-400 w-16 flex-shrink-0">{dayLabel}</span>
                      <div className="flex gap-1.5">
                        {times.map((time, i) => (
                          <span key={i} className={`badge ${types[i] === 'POST' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
                            {types[i] === 'POST' ? '🖼️' : '📱'} {time}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={saveSchedulerRule} disabled={saving} className="btn-primary w-full">
                <Clock size={15} />
                Salva regola scheduler
              </button>
            </div>
          </ConfigSection>

          {/* Impostazioni generali */}
          <ConfigSection
            icon={Globe}
            title="Impostazioni Generali"
            description="Lingua, fuso orario e preferenze app"
            accent="green"
            defaultOpen={false}
          >
            <div className="space-y-3">
              <div>
                <label className="label">Fuso orario</label>
                <select className="select" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  <option value="Europe/Rome">🇮🇹 Europe/Rome (CET/CEST)</option>
                  <option value="Europe/London">🇬🇧 Europe/London</option>
                  <option value="Europe/Paris">🇫🇷 Europe/Paris</option>
                  <option value="America/New_York">🇺🇸 America/New_York</option>
                  <option value="America/Los_Angeles">🇺🇸 America/Los_Angeles</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <div>
                <label className="label">Lingua predefinita</label>
                <select className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="it">🇮🇹 Italiano</option>
                  <option value="en">🇬🇧 English</option>
                  <option value="es">🇪🇸 Español</option>
                  <option value="fr">🇫🇷 Français</option>
                </select>
              </div>
              <div>
                <label className="label">Tono comunicativo predefinito</label>
                <select className="select" value={defaultTone} onChange={(e) => setDefaultTone(e.target.value as AITone)}>
                  <option value="professional">💼 Professionale</option>
                  <option value="friendly">😊 Amichevole</option>
                  <option value="funny">😄 Divertente</option>
                  <option value="inspirational">✨ Inspirazionale</option>
                  <option value="luxury">👑 Luxury</option>
                </select>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-800/50">
                <div>
                  <div className="text-sm font-medium text-gray-200">Pubblicazione automatica</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    ⚠️ Pubblica automaticamente senza approvazione umana
                  </div>
                </div>
                <button
                  onClick={() => setAutoPublish(!autoPublish)}
                  className={`w-12 h-6 rounded-full transition-all ${autoPublish ? 'bg-brand-500' : 'bg-gray-700'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-all m-0.5 ${autoPublish ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
              <button onClick={saveGeneral} disabled={saving} className="btn-primary w-full">
                <Save size={15} />
                Salva impostazioni
              </button>
            </div>
          </ConfigSection>

          {/* Link docs ufficiali */}
          <div className="card p-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-gray-700 flex items-center justify-center flex-shrink-0">
              <Shield size={16} className="text-gray-400" />
            </div>
            <div className="flex-1 text-xs text-gray-400">
              Per problemi di autenticazione o permessi, consulta la documentazione ufficiale Meta.
            </div>
            <a
              href="https://developers.facebook.com/docs/instagram-api/getting-started"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs whitespace-nowrap"
            >
              <ExternalLink size={12} /> Docs Meta
            </a>
          </div>
        </>
      )}
    </div>
  );
}
