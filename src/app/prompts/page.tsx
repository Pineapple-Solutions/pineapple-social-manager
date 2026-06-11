'use client';
// src/app/prompts/page.tsx — Regole Prompt Globali

import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Plus, Trash2, Edit2, Check, X, Info, Globe, Wand2, Sparkles, RefreshCw, MinusCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTenantFilter } from '@/lib/hooks/useTenantFilter';

interface PromptRule {
  id: string; name: string; description: string | null;
  contentType: string; rule: string; isActive: boolean;
  priority: number; tenantId: string | null;
  isNegativePrompt: boolean;
  tenant?: { id: string; name: string } | null;
  createdAt: string;
}


const CONTENT_TYPES = [
  { value: 'ALL',      label: '🌐 Tutti i contenuti', color: 'text-gray-700 dark:text-white bg-gray-200 dark:bg-gray-700' },
  { value: 'POST',     label: '🖼️ Post',              color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/10' },
  { value: 'STORY',    label: '📱 Storie',            color: 'text-pink-600 dark:text-pink-400 bg-pink-100 dark:bg-pink-500/10' },
  { value: 'REEL',     label: '🎬 Reel',              color: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-500/10' },
  { value: 'VIDEO',    label: '🎥 Video AI',          color: 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/10' },
  { value: 'CAPTION',  label: '✍️ Caption',           color: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-500/10' },
  { value: 'HASHTAGS', label: '#️⃣ Hashtag',          color: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-500/10' },
];

// Livelli di priorità — pill moderne
const PRIORITY_LEVELS = [
  { value: 0,   label: 'Bassa',   dot: 'bg-gray-500',   cls: 'border-gray-700 text-gray-400 hover:border-gray-500' },
  { value: 25,  label: 'Normale', dot: 'bg-blue-500',   cls: 'border-blue-700/50 text-blue-400 hover:border-blue-500' },
  { value: 50,  label: 'Alta',    dot: 'bg-yellow-500', cls: 'border-yellow-700/50 text-yellow-400 hover:border-yellow-500' },
  { value: 75,  label: 'Urgente', dot: 'bg-orange-500', cls: 'border-orange-700/50 text-orange-400 hover:border-orange-500' },
  { value: 100, label: 'Critica', dot: 'bg-red-500',    cls: 'border-red-700/50 text-red-400 hover:border-red-500' },
];

function PriorityPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // Normalizza il valore al livello più vicino
  const nearest = PRIORITY_LEVELS.reduce((a, b) =>
    Math.abs(b.value - value) < Math.abs(a.value - value) ? b : a
  );
  return (
    <div>
      <label className="label">Priorità</label>
      <div className="flex gap-2 flex-wrap">
        {PRIORITY_LEVELS.map((lv) => {
          const active = nearest.value === lv.value;
          return (
            <button
              key={lv.value}
              type="button"
              onClick={() => onChange(lv.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all
                ${active
                  ? `${lv.cls} bg-current/10 border-current scale-105 shadow-sm opacity-100`
                  : `${lv.cls} bg-transparent opacity-60`}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${lv.dot} flex-shrink-0`} />
              {lv.label}
            </button>
          );
        })}
      </div>
      {/* Barra visiva */}
      <div className="mt-2 h-1 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${nearest.dot.replace('bg-', 'bg-')}`}
          style={{ width: `${nearest.value}%` }}
        />
      </div>
    </div>
  );
}

interface AISuggestedRule {
  name: string;
  description: string;
  contentType: string;
  rule: string;
  priority: number;
  selected: boolean;
}

export default function PromptsPage() {
  const { tenants, selectedTenant, setSelectedTenant, currentUser, isMaster, ready } = useTenantFilter();
  const [rules, setRules] = useState<PromptRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', contentType: 'ALL', rule: '', priority: 0,
    isNegativePrompt: false,
    // multi-select: 'global' oppure uno o più tenantId
    scopeTenantIds: [] as string[],
  });

  // ─── AI Generate state ──────────────────────────────────────────
  const [hasProvider, setHasProvider] = useState(false);
  const [checkingProvider, setCheckingProvider] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestedRule[]>([]);
  const [importingAI, setImportingAI] = useState(false);


  const fetchRules = useCallback(async (tenantId?: string) => {
    setLoading(true);
    try {
      const params = tenantId ? `?tenantId=${tenantId}` : '';
      const res = await fetch(`/api/prompt-rules${params}`);
      if (!res.ok) { setLoading(false); return; }
      let json: { success: boolean; data?: PromptRule[] };
      try { json = await res.json(); } catch { setLoading(false); return; }
      if (json.success && json.data) setRules(json.data);
    } catch { /* ignora errori di rete */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const tid = selectedTenant || currentUser?.tenantId;
    if (tid) fetchRules(tid);
    else if (isMaster) fetchRules();
    else setLoading(false);
  }, [selectedTenant, ready, currentUser, isMaster, fetchRules]);

  const resetForm = () => {
    const defaultTenant = selectedTenant || currentUser?.tenantId || '';
    setForm({ name: '', description: '', contentType: 'ALL', rule: '', priority: 0, isNegativePrompt: false, scopeTenantIds: defaultTenant ? [defaultTenant] : [] });
  };

  // ─── Controlla se il tenant selezionato ha un provider AI configurato ──
  const checkProvider = useCallback(async (tenantId: string) => {
    setCheckingProvider(true);
    try {
      const res = await fetch(`/api/ai/providers?tenantId=${tenantId}`);
      const json = await res.json();
      setHasProvider(json.success && Array.isArray(json.data) && json.data.length > 0);
    } catch {
      setHasProvider(false);
    } finally {
      setCheckingProvider(false);
    }
  }, []);

  useEffect(() => {
    const tid = selectedTenant || currentUser?.tenantId;
    if (tid) {
      checkProvider(tid);
    } else {
      setHasProvider(false);
    }
    // Chiudi pannello AI se cambia il tenant
    setShowAIPanel(false);
    setAiSuggestions([]);
  }, [selectedTenant, currentUser, checkProvider]);

  // ─── Genera regole con AI ─────────────────────────────────────
  const handleGenerateAI = async () => {
    const tid = selectedTenant || currentUser?.tenantId;
    if (!tid) { toast.error('Seleziona un cliente per generare le regole con AI'); return; }
    setGenerating(true);
    setAiSuggestions([]);
    try {
      const res = await fetch('/api/prompt-rules/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: tid }),
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setAiSuggestions(json.data.map((s: Omit<AISuggestedRule, 'selected'>) => ({ ...s, selected: true })));
        toast.success(`${json.data.length} regole suggerite dall'AI!`);
      } else {
        toast.error(json.error ?? 'Errore durante la generazione');
      }
    } catch {
      toast.error('Errore di rete durante la generazione AI');
    } finally {
      setGenerating(false);
    }
  };

  // ─── Importa regole selezionate ──────────────────────────────
  const handleImportAI = async () => {
    const tid = selectedTenant || currentUser?.tenantId;
    if (!tid) return;
    const toImport = aiSuggestions.filter((s) => s.selected);
    if (!toImport.length) { toast.error('Seleziona almeno una regola da importare'); return; }
    setImportingAI(true);
    let imported = 0;
    for (const s of toImport) {
      try {
        const res = await fetch('/api/prompt-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: s.name,
            description: s.description,
            contentType: s.contentType,
            rule: s.rule,
            priority: s.priority,
            tenantId: tid,
          }),
        });
        const json = await res.json();
        if (json.success) imported++;
      } catch { /* ignora errori singoli */ }
    }
    toast.success(`${imported} regol${imported === 1 ? 'a importata' : 'e importate'} con successo!`);
    setShowAIPanel(false);
    setAiSuggestions([]);
    fetchRules(tid);
    setImportingAI(false);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.rule) { toast.error('Nome e regola obbligatori'); return; }
    if (!form.scopeTenantIds.length) { toast.error('Seleziona almeno una portata (cliente o globale)'); return; }
    setSaving(true);
    try {
      if (editingId) {
        // Modifica: invia solo i campi che possono essere aggiornati
        const res = await fetch(`/api/prompt-rules/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            description: form.description,
            contentType: form.contentType,
            rule: form.rule,
            priority: form.priority,
            isNegativePrompt: form.isNegativePrompt,
          }),
        });
        const json = await res.json();
        if (json.success) {
          toast.success('Regola aggiornata!');
          setShowForm(false);
          setEditingId(null);
          resetForm();
          const tid = selectedTenant || currentUser?.tenantId;
          if (tid) fetchRules(tid); else fetchRules();
        } else {
          toast.error(json.error ?? 'Errore durante l\'aggiornamento');
        }
      } else {
        // Creazione: una regola per ogni scope selezionato
        let created = 0;
        for (const scopeId of form.scopeTenantIds) {
          const isGlobal = scopeId === 'global';
          const res = await fetch('/api/prompt-rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: form.name, description: form.description,
              contentType: form.contentType, rule: form.rule, priority: form.priority,
              isNegativePrompt: form.isNegativePrompt,
              tenantId: isGlobal ? 'global' : scopeId,
            }),
          });
          const json = await res.json();
          if (json.success) created++;
        }
        if (created > 0) {
          toast.success(created === 1 ? 'Regola creata!' : `${created} regole create (una per ogni cliente selezionato)!`);
          setShowForm(false); setEditingId(null); resetForm();
          const tid = selectedTenant || currentUser?.tenantId;
          if (tid) fetchRules(tid); else fetchRules();
        } else {
          toast.error('Errore durante la creazione delle regole');
        }
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Elimina questa regola?')) return;
    const res = await fetch(`/api/prompt-rules/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      toast.success('Regola eliminata');
      const tid = selectedTenant || currentUser?.tenantId;
      if (tid) fetchRules(tid); else fetchRules();
    }
  };

  const toggleActive = async (rule: PromptRule) => {
    await fetch(`/api/prompt-rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !rule.isActive }),
    });
    const tid = selectedTenant || currentUser?.tenantId;
    if (tid) fetchRules(tid); else fetchRules();
  };

  const startEdit = (r: PromptRule) => {
    setForm({
      name: r.name,
      description: r.description ?? '',
      contentType: r.contentType,
      rule: r.rule,
      priority: r.priority,
      isNegativePrompt: r.isNegativePrompt ?? false,
      scopeTenantIds: [r.tenantId ?? 'global'],
    });
    setEditingId(r.id);
    setShowForm(true);
  };

  const contentTypeInfo = (type: string) => CONTENT_TYPES.find(t => t.value === type) ?? CONTENT_TYPES[0];
  const priorityLevel = (v: number) => PRIORITY_LEVELS.reduce((a, b) => Math.abs(b.value - v) < Math.abs(a.value - v) ? b : a);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Regole Prompt Globali</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Istruzioni che l'AI segue <strong className="text-gray-700 dark:text-gray-300">sempre</strong> per tutti i contenuti generati</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Pulsante Genera con AI — disponibile solo se c'è un tenant selezionato con provider configurato */}
          {(() => {
            const tid = selectedTenant || currentUser?.tenantId;
            const canGenerate = !!tid && hasProvider && !checkingProvider;
            const noTenant = !tid;
            const noProvider = !!tid && !hasProvider && !checkingProvider;
            return (
              <div className="relative group">
                <button
                  onClick={() => { setShowAIPanel(true); if (aiSuggestions.length === 0) handleGenerateAI(); }}
                  disabled={!canGenerate}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border
                    ${canGenerate
                      ? 'bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20 hover:border-purple-500/50'
                      : 'bg-gray-100 dark:bg-gray-800/50 border-gray-300 dark:border-gray-700 text-gray-400 cursor-not-allowed'}`}
                >
                  <Wand2 size={15} />
                  Genera con AI
                  {checkingProvider && <span className="w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin" />}
                </button>
                {/* Tooltip */}
                {(noTenant || noProvider) && (
                  <div className="absolute right-0 top-full mt-1.5 z-20 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-xs text-gray-600 dark:text-gray-400 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    {noTenant
                      ? '⚠️ Seleziona un cliente per usare la generazione AI.'
                      : '⚠️ Nessun provider AI configurato per questo cliente. Vai in Configurazione → Provider AI.'}
                  </div>
                )}
              </div>
            );
          })()}
          <button onClick={() => { resetForm(); setEditingId(null); setShowForm(true); }} className="btn-primary">
            <Plus size={16} /> Nuova Regola
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="card p-4 border-brand-500/20 bg-brand-500/5">
        <div className="flex gap-3">
          <Info size={18} className="text-brand-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-700 dark:text-gray-300">
            <strong className="text-gray-900 dark:text-white">Come funziona:</strong> Queste regole vengono iniettate automaticamente nel prompt di ogni generazione AI.
            Le regole <span className="text-green-400 font-medium">🌐 Globali</span> si applicano a tutti i clienti;
            quelle per cliente sovrascrivono le globali in caso di conflitto.
            Le regole con priorità più alta vengono applicate per prime.
            Le regole <span className="text-red-400 font-medium">Negative</span> vengono inviate come <em>negative prompt</em> ai provider che lo supportano
            nativamente (Google Imagen, Veo) e come istruzione "EVITA SEMPRE" per i modelli LLM.
          </div>
        </div>
      </div>

      {/* Tenant selector — tutti gli utenti, filtrato ai propri clienti */}
      {tenants.length > 0 && (
        <div className="card p-4">
          <label className="label">Filtra per cliente</label>
          <select className="select" value={selectedTenant} onChange={(e) => setSelectedTenant(e.target.value)}>
            {isMaster && <option value="">Tutti i clienti</option>}
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      {/* ─── Pannello AI Generate ─────────────────────────────────────── */}
      {showAIPanel && (
        <div className="card p-5 border-purple-500/30 bg-purple-500/5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-purple-400" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Regole suggerite dall'AI</h3>
              {aiSuggestions.length > 0 && (
                <span className="badge bg-purple-500/20 text-purple-300 text-xs border border-purple-500/20">
                  {aiSuggestions.filter(s => s.selected).length}/{aiSuggestions.length} selezionate
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerateAI}
                disabled={generating}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-purple-500/30 text-purple-300 text-xs hover:bg-purple-500/10 disabled:opacity-50 transition-all"
              >
                <RefreshCw size={12} className={generating ? 'animate-spin' : ''} />
                {generating ? 'Generazione...' : 'Rigenera'}
              </button>
              <button onClick={() => { setShowAIPanel(false); setAiSuggestions([]); }} className="btn-ghost p-1.5 text-gray-500">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Loading state */}
          {generating && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-400">Analizzo il sito e genero le regole più adatte al brand...</p>
            </div>
          )}

          {/* Suggestions list */}
          {!generating && aiSuggestions.length > 0 && (
            <div className="space-y-3">
              {/* Seleziona tutto / deseleziona */}
              <div className="flex gap-3 text-xs">
                <button
                  onClick={() => setAiSuggestions(prev => prev.map(s => ({ ...s, selected: true })))}
                  className="text-purple-400 hover:text-purple-300 transition-colors"
                >
                  Seleziona tutto
                </button>
                <span className="text-gray-700">·</span>
                <button
                  onClick={() => setAiSuggestions(prev => prev.map(s => ({ ...s, selected: false })))}
                  className="text-gray-500 hover:text-gray-400 transition-colors"
                >
                  Deseleziona tutto
                </button>
              </div>

              {aiSuggestions.map((s, idx) => {
                const typeInfo = CONTENT_TYPES.find(t => t.value === s.contentType) ?? CONTENT_TYPES[0];
                return (
                  <div
                    key={idx}
                    onClick={() => setAiSuggestions(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r))}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all
                      ${s.selected
                        ? 'border-purple-500/40 bg-purple-500/10'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 opacity-60'}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox visivo */}
                      <div className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border transition-all flex items-center justify-center
                        ${s.selected ? 'bg-purple-500 border-purple-500' : 'border-gray-300 dark:border-gray-600 bg-transparent'}`}>
                        {s.selected && <Check size={10} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{s.name}</span>
                          <span className={`badge text-xs ${typeInfo.color}`}>{typeInfo.label}</span>
                        </div>
                        {s.description && <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>}
                        <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800/60 text-xs text-gray-700 dark:text-gray-300 font-mono leading-relaxed">
                          {s.rule}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleImportAI}
                  disabled={importingAI || aiSuggestions.every(s => !s.selected)}
                  className="btn-primary bg-purple-600 hover:bg-purple-500 disabled:opacity-50"
                >
                  <Check size={14} />
                  {importingAI ? 'Importazione...' : `Importa ${aiSuggestions.filter(s => s.selected).length} regol${aiSuggestions.filter(s => s.selected).length === 1 ? 'a' : 'e'}`}
                </button>
                <button onClick={() => { setShowAIPanel(false); setAiSuggestions([]); }} className="btn-secondary">
                  <X size={14} /> Annulla
                </button>
              </div>
            </div>
          )}

          {/* Empty state dopo generazione */}
          {!generating && aiSuggestions.length === 0 && (
            <div className="text-center py-6 text-gray-500 text-sm">
              Nessuna regola generata. Riprova o aggiungi un sito al cliente.
            </div>
          )}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="card p-5 border-brand-500/30 bg-brand-500/5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{editingId ? 'Modifica Regola' : 'Nuova Regola'}</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Nome *</label>
                <input className="input" placeholder="es: Emoji obbligatorie" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Applica a</label>
                <select className="select" value={form.contentType}
                  onChange={(e) => setForm({ ...form, contentType: e.target.value })}>
                  {CONTENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            {/* Portata — Globale o uno/più clienti */}
            <div>
              <label className="label flex items-center gap-2">
                Portata
                {!editingId && form.scopeTenantIds.length > 1 && (
                  <span className="text-[10px] text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded px-1.5 py-0.5">
                    Verrà creata 1 regola per ogni cliente selezionato ({form.scopeTenantIds.length})
                  </span>
                )}
                {editingId && (
                  <span className="text-[10px] text-gray-500">In modifica puoi assegnare a un solo cliente</span>
                )}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {/* Opzione Globale — solo master; selezionarla deseleziona tutti gli altri */}
                {isMaster && (
                  <button
                    type="button"
                    onClick={() => {
                      if (editingId) {
                        setForm({ ...form, scopeTenantIds: ['global'] });
                      } else {
                        // Toggle: se già selezionato → deseleziona; altrimenti seleziona SOLO globale
                        setForm(f => ({
                          ...f,
                          scopeTenantIds: f.scopeTenantIds.includes('global')
                            ? f.scopeTenantIds.filter(id => id !== 'global')
                            : ['global'],   // esclude tutti i tenant specifici
                        }));
                      }
                    }}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-sm transition-all
                      ${form.scopeTenantIds.includes('global')
                        ? 'border-green-500/50 bg-green-500/10 text-green-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600'}`}
                  >
                    <Globe size={14} className={form.scopeTenantIds.includes('global') ? 'text-green-400' : 'text-gray-600'} />
                    <div className="text-left flex-1">
                      <div className="font-medium text-xs">Globale</div>
                      <div className="text-xs opacity-60">Tutti i clienti</div>
                    </div>
                    {form.scopeTenantIds.includes('global') && !editingId && (
                      <Check size={12} className="text-green-400 flex-shrink-0" />
                    )}
                  </button>
                )}
                {/* Clienti disponibili; selezionarne uno deseleziona 'global' se presente */}
                {tenants.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (editingId) {
                        setForm({ ...form, scopeTenantIds: [t.id] });
                      } else {
                        setForm(f => ({
                          ...f,
                          scopeTenantIds: f.scopeTenantIds.includes(t.id)
                            ? f.scopeTenantIds.filter(id => id !== t.id)
                            // Aggiunge tenant e rimuove 'global' se era selezionato
                            : [...f.scopeTenantIds.filter(id => id !== 'global'), t.id],
                        }));
                      }
                    }}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-sm transition-all text-left
                      ${form.scopeTenantIds.includes(t.id)
                        ? 'border-brand-500/50 bg-brand-500/10 text-brand-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600'}`}
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${form.scopeTenantIds.includes(t.id) ? 'bg-brand-400' : 'bg-gray-300 dark:bg-gray-700'}`} />
                    <span className="truncate text-xs font-medium flex-1">{t.name}</span>
                    {form.scopeTenantIds.includes(t.id) && !editingId && (
                      <Check size={12} className="text-brand-400 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
              {/* Helper testo selezione */}
              {!editingId && form.scopeTenantIds.length === 0 && (
                <p className="text-[11px] text-amber-400 mt-1.5">⚠️ Seleziona almeno una portata</p>
              )}
              {!editingId && tenants.length > 1 && (
                <div className="flex items-center gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, scopeTenantIds: tenants.map(t => t.id) }))}
                    className="text-[11px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  >
                    Seleziona tutti i clienti
                  </button>
                  {form.scopeTenantIds.length > 0 && (
                    <>
                      <span className="text-gray-300 dark:text-gray-700">·</span>
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, scopeTenantIds: [] }))}
                        className="text-[11px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                      >
                        Deseleziona tutto
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="label">Descrizione (opzionale)</label>
              <input className="input" placeholder="Breve spiegazione della regola..."
                value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className="label">Regola / Istruzione AI *</label>
              <textarea className="input min-h-[100px] resize-none" rows={4}
                placeholder="Scrivi l'istruzione che l'AI dovrà seguire. Es: 'Usa sempre almeno 3 emoji per post. Non usare mai il tono formale.'"
                value={form.rule} onChange={(e) => setForm({ ...form, rule: e.target.value })} />
            </div>

            {/* Toggle Negative Prompt */}
            <div
              onClick={() => setForm({ ...form, isNegativePrompt: !form.isNegativePrompt })}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none
                ${form.isNegativePrompt
                  ? 'border-red-500/40 bg-red-500/8'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'}`}
            >
              <div className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border transition-all flex items-center justify-center
                ${form.isNegativePrompt ? 'bg-red-500 border-red-500' : 'border-gray-300 dark:border-gray-600'}`}>
                {form.isNegativePrompt && <Check size={10} className="text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <MinusCircle size={14} className={form.isNegativePrompt ? 'text-red-400' : 'text-gray-500'} />
                  <span className={`text-sm font-medium ${form.isNegativePrompt ? 'text-red-300' : 'text-gray-700 dark:text-gray-300'}`}>
                    Prompt Negativo
                  </span>
                  {form.isNegativePrompt && (
                    <span className="badge bg-red-500/15 text-red-400 border border-red-500/25 text-[10px]">NEGATIVE</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Se attivato, questa regola viene inviata come <strong>negative prompt</strong> ai provider che lo supportano
                  nativamente (Google Imagen, Veo). Per i modelli LLM viene tradotta come istruzione "EVITA SEMPRE".
                </p>
              </div>
            </div>

            {/* Priority picker moderno */}
            <PriorityPicker value={form.priority} onChange={(v) => setForm({ ...form, priority: v })} />
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSubmit} disabled={saving} className="btn-primary">
              <Check size={15} /> {saving ? 'Salvataggio...' : 'Salva Regola'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="btn-secondary">
              <X size={15} /> Annulla
            </button>
          </div>
        </div>
      )}

      {/* Lista regole */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="card p-4 h-20 shimmer" />)}</div>
      ) : rules.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">
          <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nessuna regola configurata.</p>
          <p className="text-xs mt-1">Aggiungi istruzioni per personalizzare la generazione AI.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => {
            const typeInfo = contentTypeInfo(r.contentType);
            const pLevel = priorityLevel(r.priority);
            const isGlobal = r.tenantId === null;
            return (
              <div key={r.id} className={`card p-4 transition-all ${!r.isActive ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900 dark:text-white">{r.name}</span>
                      <span className={`badge text-xs ${typeInfo.color}`}>{typeInfo.label}</span>
                      {/* Badge tipo prompt */}
                      {r.isNegativePrompt ? (
                        <span className="badge bg-red-500/10 text-red-400 border border-red-500/20 text-xs flex items-center gap-0.5">
                          <MinusCircle size={9} /> Negativo
                        </span>
                      ) : null}
                      {/* Badge portata */}
                      {isGlobal ? (
                        <span className="badge bg-green-500/10 text-green-400 border border-green-500/20 text-xs flex items-center gap-0.5">
                          <Globe size={9} /> Globale
                        </span>
                      ) : r.tenant ? (
                        <span className="badge bg-brand-500/10 text-brand-400 text-xs">{r.tenant.name}</span>
                      ) : null}
                      {/* Badge priorità */}
                      {r.priority > 0 && (
                        <span className={`badge text-xs flex items-center gap-1 border ${
                          pLevel.value >= 100 ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                          pLevel.value >= 75  ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                          pLevel.value >= 50  ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                                                'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${pLevel.dot}`} />
                          {pLevel.label}
                        </span>
                      )}
                      {!r.isActive && <span className="badge bg-gray-200 dark:bg-gray-800 text-gray-500 text-xs">Disabilitata</span>}
                    </div>
                    {r.description && <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>}
                    <div className="mt-2 p-2.5 rounded-lg bg-gray-100 dark:bg-gray-800/50 text-xs text-gray-700 dark:text-gray-300 font-mono leading-relaxed">
                      {r.rule}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleActive(r)}
                      className={`relative w-8 h-4 rounded-full transition-all ${r.isActive ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                      <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${r.isActive ? 'left-4' : 'left-0.5'}`} />
                    </button>
                    <button onClick={() => startEdit(r)} className="btn-ghost p-1.5"><Edit2 size={13} /></button>
                    <button onClick={() => handleDelete(r.id)} className="btn-ghost p-1.5 text-red-400 hover:text-red-300"><Trash2 size={13} /></button>
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
