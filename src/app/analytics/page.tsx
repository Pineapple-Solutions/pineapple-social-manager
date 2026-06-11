'use client';
// src/app/analytics/page.tsx — Analytics multi-piattaforma (Instagram, Facebook, TikTok)

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, TrendingUp, Eye, MousePointer, BarChart2, RefreshCw, ThumbsUp, Share2, Video, Settings2, Clock, Check, ChevronDown, Terminal, Zap, Calendar, CalendarDays, CalendarRange } from 'lucide-react';
import { formatNumber, getPlatformLabel } from '@/lib/utils';
import { TenantSelector } from '@/components/ui/TenantSelector';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { useTenantFilter } from '@/lib/hooks/useTenantFilter';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import type { Platform } from '@/types';
import type { AutoSyncConfig } from '@/lib/analytics-sync-config';
import { useTheme } from '@/lib/theme';
import toast from 'react-hot-toast';

// ─── Tipi generici per metriche snapshot ────────────────────────

interface IGMetric {
  id: string; date: string; followersCount: number;
  impressions: number; reach: number; profileViews: number;
  websiteClicks: number; engagementRate: number;
}

interface FBMetric {
  id: string; date: string; followersCount: number;
  impressions: number; reach: number; pageViews: number;
  reactions: number; shares: number; engagementRate: number;
}

interface TTMetric {
  id: string; date: string; followersCount: number;
  videoViews: number; likes: number; comments: number;
  shares: number; profileViews: number; engagementRate: number;
}

interface ProfileData {
  username?: string; name?: string; displayName?: string;
  followersCount: number; mediaCount?: number; biography?: string;
  likesCount?: number; videoCount?: number;
}

const PLATFORM_TABS: Platform[] = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK'];

export default function AnalyticsPage() {
  const [activePlatform, setActivePlatform] = useState<Platform>('INSTAGRAM');
  const { tenants, selectedTenant, setSelectedTenant, isMaster, showSelector, ready } = useTenantFilter();

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center flex-wrap gap-3 justify-between">
        {/* Platform tabs */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800/60 rounded-xl p-1 gap-1">
          {PLATFORM_TABS.map((p) => (
            <button
              key={p}
              onClick={() => setActivePlatform(p)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activePlatform === p
                  ? 'bg-brand-500 text-white shadow'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
              }`}
            >
              <PlatformIcon platform={p} size={18} />
              {getPlatformLabel(p)}
            </button>
          ))}
        </div>
        {/* Tenant selector */}
        {ready && showSelector && (
          <TenantSelector
            tenants={tenants}
            value={selectedTenant}
            onChange={setSelectedTenant}
            isMaster={isMaster}
          />
        )}
      </div>

      {/* Panel per piattaforma */}
      {activePlatform === 'INSTAGRAM' && (
        <InstagramAnalytics selectedTenant={selectedTenant} />
      )}
      {activePlatform === 'FACEBOOK' && (
        <FacebookAnalytics selectedTenant={selectedTenant} />
      )}
      {activePlatform === 'TIKTOK' && (
        <TikTokAnalytics selectedTenant={selectedTenant} />
      )}

      {/* Widget Sincronizzazione Automatica — sempre visibile in fondo */}
      <AutoSyncWidget />
    </div>
  );
}

// ─── Auto-Sync Widget ────────────────────────────────────────────

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const PLATFORM_META: { key: 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK'; label: string; color: string }[] = [
  { key: 'INSTAGRAM', label: 'Instagram', color: 'text-pink-400' },
  { key: 'FACEBOOK',  label: 'Facebook',  color: 'text-blue-400'  },
  { key: 'TIKTOK',    label: 'TikTok',    color: 'text-cyan-400'  },
];

const CRON_PRESETS = [
  { label: 'Ogni ora',             cron: '0 * * * *',         icon: '⏱' },
  { label: 'Ogni 6 ore',           cron: '0 */6 * * *',       icon: '🕐' },
  { label: 'Ogni 12 ore',          cron: '0 */12 * * *',      icon: '🕛' },
  { label: '3 volte al giorno',    cron: '0 8,14,20 * * *',   icon: '📅' },
  { label: 'Ogni giorno alle 2',   cron: '0 2 * * *',         icon: '🌙' },
  { label: 'Lun-Ven alle 9',       cron: '0 9 * * 1-5',       icon: '💼' },
  { label: 'Ogni lunedì',          cron: '0 8 * * 1',         icon: '📆' },
  { label: '1° e 15° del mese',    cron: '0 8 1,15 * *',      icon: '📋' },
  { label: 'Fine mese',            cron: '0 8 28-31 * *',     icon: '🗓' },
];

/** Descrive in italiano la config preset */
function describePreset(config: AutoSyncConfig): string {
  const hrs = (config.hours?.length ? config.hours : [config.hour ?? 2])
    .sort((a, b) => a - b)
    .map(h => String(h).padStart(2, '0') + ':00')
    .join(', ');

  if (config.frequency === 'hourly') return 'Ogni ora';

  const daysPart = config.weekdays?.length
    ? `ogni ${config.weekdays.map(d => WEEKDAY_LABELS[d]).join(', ')}`
    : config.monthdays?.length
      ? `il giorno ${config.monthdays.join(', ')} del mese`
      : 'ogni giorno';

  return `${daysPart} alle ${hrs}`;
}

/** Descrive un'espressione CRON in italiano (base) */
function describeCronExpr(expr: string): string {
  try {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return 'Espressione non valida (servono 5 campi)';
    const [min, hour, dom, month, dow] = parts;
    const lines: string[] = [];
    if (min === '0' && hour === '*') lines.push('ogni ora');
    else if (min === '0' && hour.startsWith('*/')) lines.push(`ogni ${hour.slice(2)} ore`);
    else if (min === '0') lines.push(`alle ${hour.includes(',') ? hour.split(',').map(h => h.padStart(2,'0')+':00').join(', ') : hour.padStart(2,'0')+':00'}`);
    else lines.push(`al minuto ${min} dell'ora ${hour}`);
    if (dom !== '*') lines.push(`il giorno ${dom} del mese`);
    if (month !== '*') lines.push(`nel mese ${month}`);
    if (dow !== '*') {
      const dowMap: Record<string, string> = { '0':'Dom','1':'Lun','2':'Mar','3':'Mer','4':'Gio','5':'Ven','6':'Sab' };
      const label = dow.split(',').map(d => dowMap[d] ?? d).join(', ');
      lines.push(`di ${label}`);
    }
    return lines.join(' · ') || expr;
  } catch { return expr; }
}

/** Valida brevemente un'espressione CRON */
function validateCron(expr: string): string {
  if (!expr.trim()) return 'Inserisci un\'espressione CRON';
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return 'Richiesti esattamente 5 campi: minuti ore giorno-mese mese giorno-settimana';
  return '';
}

function AutoSyncWidget() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<AutoSyncConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cronError, setCronError] = useState('');

  useEffect(() => {
    fetch('/api/analytics/sync-config')
      .then(r => r.json())
      .then(j => { if (j.success) setConfig(j.data); })
      .catch(() => {});
  }, []);

  if (!config) return null;

  const toggle = (field: keyof AutoSyncConfig, value: unknown) =>
    setConfig(c => c ? { ...c, [field]: value } : c);

  const togglePlatform = (p: 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK') =>
    setConfig(c => {
      if (!c) return c;
      const next = c.platforms.includes(p)
        ? c.platforms.filter(x => x !== p)
        : [...c.platforms, p];
      return { ...c, platforms: next };
    });

  const toggleHour = (h: number) =>
    setConfig(c => {
      if (!c) return c;
      const hrs = c.hours ?? [];
      const next = hrs.includes(h) ? hrs.filter(x => x !== h) : [...hrs, h].sort((a, b) => a - b);
      return { ...c, hours: next.length ? next : [h] };
    });

  const toggleWeekday = (d: number) =>
    setConfig(c => {
      if (!c) return c;
      const wds = c.weekdays ?? [];
      const next = wds.includes(d) ? wds.filter(x => x !== d) : [...wds, d].sort((a, b) => a - b);
      return { ...c, weekdays: next };
    });

  const toggleMonthday = (d: number) =>
    setConfig(c => {
      if (!c) return c;
      const mds = c.monthdays ?? [];
      const next = mds.includes(d) ? mds.filter(x => x !== d) : [...mds, d].sort((a, b) => a - b);
      return { ...c, monthdays: next };
    });

  const handleSave = async () => {
    if (!config) return;
    if (config.mode === 'cron') {
      const err = validateCron(config.customCron ?? '');
      if (err) { setCronError(err); toast.error(err); return; }
    }
    setSaving(true);
    try {
      const res = await fetch('/api/analytics/sync-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const j = await res.json();
      if (j.success) {
        setConfig(j.data);
        setSaved(true);
        toast.success('Configurazione sincronizzazione salvata');
        setTimeout(() => setSaved(false), 3000);
      } else {
        toast.error(j.error ?? 'Errore salvataggio');
      }
    } catch { toast.error('Errore di rete'); }
    finally { setSaving(false); }
  };

  const fmtLastSync = (iso: string | null | undefined) => {
    if (!iso) return 'Mai';
    return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const summaryText = config.mode === 'cron'
    ? (config.customCron ? describeCronExpr(config.customCron) : 'CRON personalizzato')
    : describePreset(config);

  return (
    <div className={`rounded-2xl border transition-all overflow-hidden ${
      config.enabled
        ? 'border-brand-500/30 bg-brand-500/5'
        : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40'
    }`}>
      {/* Header — sempre visibile */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left"
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          config.enabled ? 'bg-brand-500/20 text-brand-400' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'
        }`}>
          <Clock size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Sincronizzazione Automatica</span>
            {config.enabled ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30 font-medium">
                Attiva
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 border border-gray-200 dark:border-gray-700 font-medium">
                Disattivata
              </span>
            )}
          </div>
          {config.enabled && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {summaryText}
              {' · '}{config.platforms.join(', ')}
            </p>
          )}
        </div>
        <ChevronDown size={16} className={`text-gray-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Corpo espandibile */}
      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-gray-200 dark:border-gray-800/60">

          {/* Abilita / Disabilita */}
          <div className="flex items-center justify-between pt-4">
            <div>
              <p className="text-sm font-medium text-white">Abilita sync automatica</p>
              <p className="text-xs text-gray-500 mt-0.5">Il sistema raccoglierà le metriche in background</p>
            </div>
            <button
              onClick={() => toggle('enabled', !config.enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                config.enabled ? 'bg-brand-500' : 'bg-gray-700'
              }`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                config.enabled ? 'left-[22px]' : 'left-0.5'
              }`} />
            </button>
          </div>

          {config.enabled && (
            <>
              {/* Piattaforme */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2.5">Piattaforme</p>
                <div className="flex gap-2 flex-wrap">
                  {PLATFORM_META.map(({ key, label, color }) => {
                    const active = config.platforms.includes(key);
                    return (
                      <button
                        key={key}
                        onClick={() => togglePlatform(key)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                          active
                            ? `border-current bg-current/10 ${color}`
                            : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-400 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-400'
                        }`}
                      >
                        <PlatformIcon platform={key} size={14} />
                        {label}
                        {active && <Check size={11} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tabs: Guidato | CRON */}
              <div>
                <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1 mb-4">
                  <button
                    onClick={() => toggle('mode', 'preset')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all ${
                      config.mode !== 'cron'
                        ? 'bg-brand-500 text-white shadow'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    <Zap size={13} /> Configurazione guidata
                  </button>
                  <button
                    onClick={() => toggle('mode', 'cron')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all ${
                      config.mode === 'cron'
                        ? 'bg-brand-500 text-white shadow'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    <Terminal size={13} /> CRON personalizzato
                  </button>
                </div>

                {/* ── PRESET MODE ── */}
                {config.mode !== 'cron' && (
                  <div className="space-y-5">
                    {/* Tipo frequenza */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2.5">Cadenza</p>
                      <div className="flex gap-2 flex-wrap">
                        {([
                          { value: 'hourly',  label: 'Ogni ora',      icon: '⏱' },
                          { value: 'daily',   label: 'Ogni giorno',   icon: '📅' },
                          { value: 'weekly',  label: 'Settimanale',   icon: '📆' },
                          { value: 'monthly', label: 'Mensile',       icon: '🗓' },
                        ] as const).map(f => (
                          <button
                            key={f.value}
                            onClick={() => toggle('frequency', f.value)}
                              className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all flex items-center gap-1.5 ${
                              config.frequency === f.value
                                ? 'border-brand-500/50 bg-brand-500/15 text-brand-300'
                                : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-400 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-400'
                            }`}
                          >
                            {f.icon} {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Orari (non per every-hour) */}
                    {config.frequency !== 'hourly' && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2.5">
                          Orari di esecuzione{' '}
                          <span className="text-gray-600 normal-case font-normal">(seleziona uno o più)</span>
                        </p>
                        <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
                          {Array.from({ length: 24 }, (_, h) => (
                            <button
                              key={h}
                              onClick={() => toggleHour(h)}
                              className={`py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                                (config.hours ?? []).includes(h)
                                  ? 'bg-brand-500 text-white'
                                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-300'
                              }`}
                            >
                              {String(h).padStart(2,'0')}
                            </button>
                          ))}
                        </div>
                        <p className="text-[11px] text-gray-600 mt-1.5">
                          Selezionati: {(config.hours ?? []).map(h => String(h).padStart(2,'0')+':00').join(', ') || '—'}
                        </p>
                      </div>
                    )}

                    {/* Giorni settimana (solo per weekly) */}
                    {config.frequency === 'weekly' && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
                          <CalendarDays size={12} /> Giorni della settimana
                          <span className="text-gray-600 normal-case font-normal">([] = tutti)</span>
                        </p>
                        <div className="flex gap-1.5 flex-wrap">
                          {WEEKDAY_LABELS.map((d, i) => (
                            <button
                              key={i}
                              onClick={() => toggleWeekday(i)}
                              className={`w-11 h-10 rounded-xl text-xs font-semibold transition-all ${
                                (config.weekdays ?? []).includes(i)
                                  ? 'bg-brand-500 text-white'
                                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-300'
                              }`}
                            >
                              {d}
                            </button>
                          ))}
                          {(config.weekdays ?? []).length > 0 && (
                            <button
                              onClick={() => toggle('weekdays', [])}
                              className="px-3 h-10 rounded-xl text-xs text-gray-500 hover:text-red-400 transition-colors"
                            >
                              ✕ reset
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Giorni del mese (solo per monthly) */}
                    {config.frequency === 'monthly' && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
                          <Calendar size={12} /> Giorni del mese
                          <span className="text-gray-600 normal-case font-normal">([] = ogni giorno)</span>
                        </p>
                        <div className="grid grid-cols-8 sm:grid-cols-11 gap-1.5">
                          {MONTH_DAYS.map(d => (
                            <button
                              key={d}
                              onClick={() => toggleMonthday(d)}
                              className={`py-1.5 rounded-lg text-xs font-medium transition-all ${
                                (config.monthdays ?? []).includes(d)
                                  ? 'bg-brand-500 text-white'
                                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-300'
                              }`}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                        {(config.monthdays ?? []).length > 0 && (
                          <button
                            onClick={() => toggle('monthdays', [])}
                            className="text-[11px] text-gray-500 hover:text-red-400 mt-1.5 transition-colors"
                          >
                            ✕ azzera selezione giorni
                          </button>
                        )}
                      </div>
                    )}

                    {/* Anteprima */}
                    <div className="bg-gray-100 dark:bg-gray-900 rounded-xl px-4 py-3 text-xs">
                      <span className="text-gray-500 dark:text-gray-500">Pianificazione: </span>
                      <span className="text-brand-300 font-medium">{describePreset(config)}</span>
                    </div>
                  </div>
                )}

                {/* ── CRON MODE ── */}
                {config.mode === 'cron' && (
                  <div className="space-y-4">
                    {/* Preset rapidi */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2.5">Preset rapidi</p>
                      <div className="flex flex-wrap gap-1.5">
                        {CRON_PRESETS.map(p => (
                          <button
                            key={p.cron}
                            onClick={() => {
                              toggle('customCron', p.cron);
                              setCronError('');
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-xs border transition-all ${
                              config.customCron === p.cron
                                ? 'border-brand-500/50 bg-brand-500/15 text-brand-300'
                                : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-400 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-400'
                            }`}
                          >
                            {p.icon} {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Input CRON */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Espressione CRON</p>
                      <div className="grid grid-cols-5 gap-1 mb-1.5">
                        {['min', 'ora', 'g.mese', 'mese', 'g.sett'].map(f => (
                          <span key={f} className="text-center text-[10px] text-gray-600">{f}</span>
                        ))}
                      </div>
                      <input
                        type="text"
                        className={`input font-mono text-sm tracking-widest ${cronError ? 'border-red-500/60' : ''}`}
                        placeholder="0 8,14,20 * * 1-5"
                        value={config.customCron ?? ''}
                        onChange={e => {
                          toggle('customCron', e.target.value);
                          setCronError(validateCron(e.target.value));
                        }}
                      />
                      {cronError && <p className="text-xs text-red-400 mt-1">⚠ {cronError}</p>}
                    </div>

                    {/* Preview */}
                    {config.customCron && !cronError && (
                      <div className="bg-gray-100 dark:bg-gray-900 rounded-xl px-4 py-3 text-xs space-y-1">
                        <div className="text-gray-500 dark:text-gray-500">Descrizione:</div>
                        <div className="text-brand-300 dark:text-brand-300 font-medium">{describeCronExpr(config.customCron)}</div>
                        <div className="text-gray-500 dark:text-gray-600 font-mono pt-1">{config.customCron}</div>
                      </div>
                    )}

                    {/* Docs reference */}
                    <div className="text-[11px] text-gray-500 dark:text-gray-600 px-1">
                      Formato: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">minuti ore giorno-mese mese giorno-settimana</code>
                      {' · '}Valori: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">*</code> qualsiasi,{' '}
                      <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">n,m</code> lista,{' '}
                      <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">n-m</code> range,{' '}
                      <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">*/n</code> step
                    </div>
                  </div>
                )}
              </div>

              {/* Ultima sync */}
              {Object.values(config.lastSync ?? {}).some(Boolean) && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Ultima sincronizzazione</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {PLATFORM_META.map(({ key, label, color }) => (
                      <div key={key} className="flex items-center gap-2 bg-gray-100/80 dark:bg-gray-800/60 rounded-xl px-3 py-2">
                        <PlatformIcon platform={key} size={13} />
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs font-medium ${color}`}>{label}</div>
                          <div className="text-[11px] text-gray-500 truncate">{fmtLastSync(config.lastSync?.[key])}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Salva */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-gray-600">
              {config.enabled
                ? `Cron di controllo ogni 30 min`
                : 'La sync automatica è disattivata'}
            </p>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {saved ? <Check size={14} /> : <Settings2 size={14} className={saving ? 'animate-pulse' : ''} />}
              {saving ? 'Salvataggio…' : saved ? 'Salvato!' : 'Salva configurazione'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Instagram ───────────────────────────────────────────────────

function InstagramAnalytics({ selectedTenant }: { selectedTenant: string }) {
  const [metrics, setMetrics] = useState<IGMetric[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tenantQ = selectedTenant ? `&tenantId=${selectedTenant}` : '';
  const tenantP = selectedTenant ? `?tenantId=${selectedTenant}` : '';

  const fetchFromDB = useCallback(async () => {
    const res = await fetch(`/api/instagram/analytics?source=db${tenantQ}`);
    const json = await res.json();
    if (json.success) setMetrics(json.data ?? []);
  }, [tenantQ]);

  const fetchLive = async () => {
    setRefreshing(true); setError(null);
    try {
      const res = await fetch(`/api/instagram/analytics?period=day${tenantQ}`);
      const json = await res.json();
      if (json.success) { setProfile(json.data?.profile); await fetchFromDB(); }
      else setError(json.error ?? 'Errore analytics');
    } catch { setError('Account Instagram non configurato o errore API'); }
    finally { setRefreshing(false); }
  };

  useEffect(() => {
    setLoading(true);
    fetchFromDB().finally(() => setLoading(false));
    fetch(`/api/instagram/profile${tenantP}`).then(r => r.json()).then(json => {
      if (json.success) setProfile(json.data);
    }).catch(() => {});
  }, [fetchFromDB, tenantP]);

  return (
    <AnalyticsPanel
      platform="INSTAGRAM"
      profile={profile}
      profileLabel={profile ? `@${profile.username} · ${formatNumber(profile.followersCount)} follower` : null}
      loading={loading}
      refreshing={refreshing}
      error={error}
      onRefresh={fetchLive}
      refreshLabel="Sync da Instagram"
      rawMetrics={metrics.map(m => ({
        date: m.date,
        Follower: m.followersCount,
        Impressioni: m.impressions,
        Reach: m.reach,
        'Visite Profilo': m.profileViews,
      }))}
      statCards={metrics[0] ? [
        { icon: Users, label: 'Follower', value: formatNumber(metrics[0].followersCount), color: 'purple' },
        { icon: Eye, label: 'Impressioni', value: formatNumber(metrics[0].impressions), color: 'blue' },
        { icon: TrendingUp, label: 'Reach', value: formatNumber(metrics[0].reach), color: 'green' },
        { icon: MousePointer, label: 'Click sito', value: formatNumber(metrics[0].websiteClicks), color: 'brand' },
      ] : []}
      tableHeaders={['Data e ora', 'Follower', 'Impressioni', 'Reach', 'Visite profilo', 'Click sito']}
      tableRows={metrics.slice(0, 15).map(m => [
        new Date(m.date).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
        formatNumber(m.followersCount),
        formatNumber(m.impressions),
        formatNumber(m.reach),
        formatNumber(m.profileViews),
        formatNumber(m.websiteClicks),
      ])}
    />
  );
}

// ─── Facebook ────────────────────────────────────────────────────

function FacebookAnalytics({ selectedTenant }: { selectedTenant: string }) {
  const [metrics, setMetrics] = useState<FBMetric[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tenantQ = selectedTenant ? `&tenantId=${selectedTenant}` : '';
  const tenantP = selectedTenant ? `?tenantId=${selectedTenant}` : '';

  const fetchFromDB = useCallback(async () => {
    const res = await fetch(`/api/facebook/analytics?source=db${tenantQ}`);
    const json = await res.json();
    if (json.success) setMetrics(json.data ?? []);
  }, [tenantQ]);

  const fetchLive = async () => {
    setRefreshing(true); setError(null);
    try {
      const res = await fetch(`/api/facebook/analytics?period=day${tenantQ}`);
      const json = await res.json();
      if (json.success) { setProfile(json.data?.profile); await fetchFromDB(); }
      else setError(json.error ?? 'Errore analytics Facebook');
    } catch { setError('Account Facebook non configurato o errore API'); }
    finally { setRefreshing(false); }
  };

  useEffect(() => {
    setLoading(true);
    fetchFromDB().finally(() => setLoading(false));
    fetch(`/api/facebook/profile${tenantP}`).then(r => r.json()).then(json => {
      if (json.success) setProfile(json.data);
    }).catch(() => {});
  }, [fetchFromDB, tenantP]);

  return (
    <AnalyticsPanel
      platform="FACEBOOK"
      profile={profile}
      profileLabel={profile ? `${profile.name} · ${formatNumber(profile.followersCount)} follower · ${formatNumber(profile.likesCount ?? 0)} like` : null}
      loading={loading}
      refreshing={refreshing}
      error={error}
      onRefresh={fetchLive}
      refreshLabel="Sync da Facebook"
      rawMetrics={metrics.map(m => ({
        date: m.date,
        Follower: m.followersCount,
        Impressioni: m.impressions,
        Reach: m.reach,
        'Visite Pagina': m.pageViews,
      }))}
      statCards={metrics[0] ? [
        { icon: Users, label: 'Follower', value: formatNumber(metrics[0].followersCount), color: 'purple' },
        { icon: Eye, label: 'Impressioni', value: formatNumber(metrics[0].impressions), color: 'blue' },
        { icon: TrendingUp, label: 'Reach', value: formatNumber(metrics[0].reach), color: 'green' },
        { icon: ThumbsUp, label: 'Reazioni', value: formatNumber(metrics[0].reactions), color: 'brand' },
      ] : []}
      tableHeaders={['Data e ora', 'Follower', 'Impressioni', 'Reach', 'Visite', 'Reazioni', 'Condivisioni']}
      tableRows={metrics.slice(0, 15).map(m => [
        new Date(m.date).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
        formatNumber(m.followersCount),
        formatNumber(m.impressions),
        formatNumber(m.reach),
        formatNumber(m.pageViews),
        formatNumber(m.reactions),
        formatNumber(m.shares),
      ])}
    />
  );
}

// ─── TikTok ──────────────────────────────────────────────────────

function TikTokAnalytics({ selectedTenant }: { selectedTenant: string }) {
  const [metrics, setMetrics] = useState<TTMetric[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tenantQ = selectedTenant ? `&tenantId=${selectedTenant}` : '';
  const tenantP = selectedTenant ? `?tenantId=${selectedTenant}` : '';

  const fetchFromDB = useCallback(async () => {
    const res = await fetch(`/api/tiktok/analytics?source=db${tenantQ}`);
    const json = await res.json();
    if (json.success) setMetrics(json.data ?? []);
  }, [tenantQ]);

  const fetchLive = async () => {
    setRefreshing(true); setError(null);
    try {
      const res = await fetch(`/api/tiktok/analytics${tenantQ ? '?' + tenantQ.slice(1) : ''}`);
      const json = await res.json();
      if (json.success) { setProfile(json.data?.profile); await fetchFromDB(); }
      else setError(json.error ?? 'Errore analytics TikTok');
    } catch { setError('Account TikTok non configurato o errore API'); }
    finally { setRefreshing(false); }
  };

  useEffect(() => {
    setLoading(true);
    fetchFromDB().finally(() => setLoading(false));
    fetch(`/api/tiktok/profile${tenantP}`).then(r => r.json()).then(json => {
      if (json.success) setProfile(json.data);
    }).catch(() => {});
  }, [fetchFromDB, tenantP]);

  return (
    <AnalyticsPanel
      platform="TIKTOK"
      profile={profile}
      profileLabel={profile ? `@${profile.username ?? profile.displayName} · ${formatNumber(profile.followersCount)} follower · ${formatNumber(profile.videoCount ?? 0)} video` : null}
      loading={loading}
      refreshing={refreshing}
      error={error}
      onRefresh={fetchLive}
      refreshLabel="Sync da TikTok"
      rawMetrics={metrics.map(m => ({
        date: m.date,
        Follower: m.followersCount,
        'Visualizzazioni': m.videoViews,
        Like: m.likes,
        Commenti: m.comments,
      }))}
      statCards={metrics[0] ? [
        { icon: Users, label: 'Follower', value: formatNumber(metrics[0].followersCount), color: 'purple' },
        { icon: Video, label: 'Views video', value: formatNumber(metrics[0].videoViews), color: 'cyan' },
        { icon: ThumbsUp, label: 'Like', value: formatNumber(metrics[0].likes), color: 'green' },
        { icon: Share2, label: 'Condivisioni', value: formatNumber(metrics[0].shares), color: 'brand' },
      ] : []}
      tableHeaders={['Data e ora', 'Follower', 'Views', 'Like', 'Commenti', 'Condivisioni']}
      tableRows={metrics.slice(0, 15).map(m => [
        new Date(m.date).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
        formatNumber(m.followersCount),
        formatNumber(m.videoViews),
        formatNumber(m.likes),
        formatNumber(m.comments),
        formatNumber(m.shares),
      ])}
    />
  );
}

// ─── Panel Condiviso ─────────────────────────────────────────────

type ChartView = 'daily' | 'weekly' | 'monthly' | 'custom';

interface RawMetricPoint {
  date: string; // ISO string
  [key: string]: string | number;
}

/** Filtra e aggrega i dati grezzi in base alla view selezionata.
 *  - daily   → tutti i punti di OGGI (label: HH:mm)
 *  - weekly  → ultimi 7 giorni, deduplicati per giorno (più recente) (label: dd/MM)
 *  - monthly → ultimi 30 giorni, deduplicati per giorno (più recente) (label: dd/MM)
 *  - custom  → range personalizzato; deduplicato per giorno se range > 1 giorno
 */
function buildChartData(
  raw: RawMetricPoint[],
  view: ChartView,
  customFrom: string,
  customTo: string,
): Record<string, string | number>[] {
  if (!raw.length) return [];

  const sorted = [...raw].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const now = new Date();
  let from: Date | null = null;
  let to: Date | null = null;

  if (view === 'daily') {
    from = new Date(now); from.setHours(0, 0, 0, 0);
    to   = new Date(now); to.setHours(23, 59, 59, 999);
  } else if (view === 'weekly') {
    from = new Date(now); from.setDate(from.getDate() - 7); from.setHours(0, 0, 0, 0);
    to   = new Date(now); to.setHours(23, 59, 59, 999);
  } else if (view === 'monthly') {
    from = new Date(now); from.setDate(from.getDate() - 30); from.setHours(0, 0, 0, 0);
    to   = new Date(now); to.setHours(23, 59, 59, 999);
  } else if (view === 'custom' && customFrom && customTo) {
    from = new Date(customFrom); from.setHours(0, 0, 0, 0);
    to   = new Date(customTo);   to.setHours(23, 59, 59, 999);
  }

  let filtered = (from && to)
    ? sorted.filter(m => { const d = new Date(m.date); return d >= from! && d <= to!; })
    : sorted;

  // Deduplica per giorno (tieni l'ultima misurazione del giorno) — non per la view daily
  const customRangeDays = (view === 'custom' && customFrom && customTo)
    ? Math.round((new Date(customTo).getTime() - new Date(customFrom).getTime()) / 86_400_000)
    : 0;
  const shouldDeduplicate = view === 'weekly' || view === 'monthly' || (view === 'custom' && customRangeDays > 1);

  if (shouldDeduplicate) {
    const dayMap = new Map<string, RawMetricPoint>();
    for (const m of filtered) {
      dayMap.set(new Date(m.date).toISOString().slice(0, 10), m); // ultima per giorno
    }
    filtered = Array.from(dayMap.values());
  }

  // Formatta la label data per l'asse X
  return filtered.map(m => {
    const d = new Date(m.date);
    const dateStr = view === 'daily'
      ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    const result: Record<string, string | number> = { date: dateStr };
    for (const key of Object.keys(m)) {
      if (key !== 'date') result[key] = m[key];
    }
    return result;
  });
}

interface StatItem {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}

interface AnalyticsPanelProps {
  platform: Platform;
  profile: ProfileData | null;
  profileLabel: string | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  refreshLabel: string;
  rawMetrics: RawMetricPoint[];
  statCards: StatItem[];
  tableHeaders: string[];
  tableRows: string[][];
}

function AnalyticsPanel({
  platform, profile, profileLabel, loading, refreshing, error,
  onRefresh, refreshLabel, rawMetrics, statCards, tableHeaders, tableRows,
}: AnalyticsPanelProps) {
  const [chartView, setChartView] = useState<ChartView>('weekly');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { resolvedTheme } = useTheme();

  const lineColors = ['#8b5cf6', '#10b981', '#3b82f6', '#f59e0b', '#06b6d4', '#ef4444'];
  const colorMap: Record<string, string> = {
    purple: 'text-purple-400 bg-purple-400/10',
    blue: 'text-blue-400 bg-blue-400/10',
    green: 'text-green-400 bg-green-400/10',
    brand: 'text-brand-400 bg-brand-400/10',
    cyan: 'text-cyan-400 bg-cyan-400/10',
    yellow: 'text-yellow-400 bg-yellow-400/10',
  };

  const chartData = useMemo(
    () => buildChartData(rawMetrics, chartView, customFrom, customTo),
    [rawMetrics, chartView, customFrom, customTo],
  );

  const chartKeys = chartData.length > 0 ? Object.keys(chartData[0]).filter(k => k !== 'date') : [];

  const VIEW_TABS: { value: ChartView; label: string; icon: React.ElementType }[] = [
    { value: 'daily',   label: 'Giornaliero', icon: Clock },
    { value: 'weekly',  label: 'Settimanale',  icon: CalendarDays },
    { value: 'monthly', label: 'Mensile',      icon: Calendar },
    { value: 'custom',  label: 'Intervallo',   icon: CalendarRange },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 shimmer rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Azioni */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          {profileLabel && <p className="text-sm text-gray-400">{profileLabel}</p>}
          {!profile && <p className="text-sm text-gray-500">Profilo non caricato — premi Sync per connetterti</p>}
        </div>
        <button onClick={onRefresh} disabled={refreshing} className="btn-secondary text-sm">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Sincronizzazione...' : refreshLabel}
        </button>
      </div>

      {/* Errore */}
      {error && (
        <div className="card border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
          ⚠️ {error} — <a href="/config" className="underline">Configura account</a>
        </div>
      )}

      {/* Stat Cards */}
      {statCards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="stat-card">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color] ?? colorMap.brand}`}>
                <Icon size={20} />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grafico */}
      {rawMetrics.length > 1 ? (
        <div className="card p-5">
          {/* Header grafico + controlli view */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="section-title flex items-center gap-2">
              <BarChart2 size={18} className="text-brand-400" />
              Andamento nel tempo
            </h3>
            {/* View tabs */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-800/70 rounded-xl p-1 gap-1">
              {VIEW_TABS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setChartView(value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    chartView === value
                      ? 'bg-brand-500 text-white shadow'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Selezione intervallo personalizzato */}
          {chartView === 'custom' && (
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Dal</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="input text-xs py-1.5 px-2 w-36"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Al</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="input text-xs py-1.5 px-2 w-36"
                />
              </div>
              {(!customFrom || !customTo) && (
                <p className="text-[11px] text-yellow-500/80">Seleziona entrambe le date</p>
              )}
            </div>
          )}

          {/* Nota deduplicazione */}
          {(chartView === 'weekly' || chartView === 'monthly' || (chartView === 'custom' && customFrom && customTo && Math.round((new Date(customTo).getTime() - new Date(customFrom).getTime()) / 86_400_000) > 1)) && (
            <p className="text-[11px] text-gray-600 -mt-1 mb-3">
              Più misurazioni dello stesso giorno sono raggruppate mostrando la più recente.
            </p>
          )}

          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e5e7eb)" className="dark:[--chart-grid:#1f2937]" />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip
                  contentStyle={resolvedTheme === 'dark'
                    ? { background: '#111827', border: '1px solid #374151', borderRadius: 12 }
                    : { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12 }}
                  labelStyle={{ color: resolvedTheme === 'dark' ? '#f3f4f6' : '#111827' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {chartKeys.map((key, i) => (
                  <Line key={key} type="monotone" dataKey={key}
                    stroke={lineColors[i % lineColors.length]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-gray-600">
              <BarChart2 size={28} className="mb-2 opacity-30" />
              <p className="text-xs">Nessun dato nel periodo selezionato</p>
            </div>
          )}
        </div>
      ) : (
        <div className="card p-10 text-center">
          <BarChart2 size={40} className="mx-auto text-gray-700 mb-3" />
          <p className="text-gray-400 text-sm">Dati insufficienti per il grafico</p>
          <p className="text-gray-600 text-xs mt-1">
            Premi &quot;{refreshLabel}&quot; per iniziare a raccogliere metriche
          </p>
        </div>
      )}

      {/* Tabella */}
      {tableRows.length > 0 && (
        <div className="card p-5">
          <h3 className="section-title mb-4">Storico metriche — {getPlatformLabel(platform)}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  {tableHeaders.map(h => (
                    <th key={h} className="text-left text-xs font-medium text-gray-500 dark:text-gray-500 pb-3 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, ri) => (
                  <tr key={ri} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    {row.map((cell, ci) => (
                      <td key={ci} className={`py-2.5 pr-4 text-xs ${ci === 0 ? 'text-gray-500 dark:text-gray-400' : ci === 1 ? 'text-purple-500 dark:text-purple-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
