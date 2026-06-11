'use client';
// src/app/posts/page.tsx — Content Studio (Post Manager + AI Generator unificati)

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  Plus, Search, Trash2, Send, Pencil, X as XIcon, Calendar,
  Bot, Wand2, Hash,
  Globe, Sparkles, Copy, Check, Lightbulb, ChevronDown,
  Image as ImageIcon, AlertTriangle, ShieldAlert, Bug, FileText,
  CheckSquare, Square, ArrowUpDown, ArrowUp, ArrowDown,
  Archive, RefreshCw, ExternalLink,
} from 'lucide-react';import toast from 'react-hot-toast';
import { getTypeIcon, getTypeLabel, getStatusColor, getStatusLabel, formatRelativeTime, formatDateTime, getPlatformIcon, getPlatformBadgeColor, getPlatformLabel } from '@/lib/utils';
import { QuickCreateModal } from '@/components/content/QuickCreateModal';
import { TenantSelector } from '@/components/ui/TenantSelector';
import { SiteSelector } from '@/components/ui/SiteSelector';
import { TypePicker, type TypePickerItem } from '@/components/ui/TypePicker';
import { useTenantFilter, type TenantOption } from '@/lib/hooks/useTenantFilter';
import { useSiteFilter, type SiteOption } from '@/lib/hooks/useSiteFilter';
import { ScopeBanner } from '@/components/ui/ScopeBanner';
import { BulkScopeModal } from '@/components/ui/BulkScopeModal';
import { WatermarkRemoverModal, type RemovalMethod } from '@/components/ui/WatermarkRemoverModal';
import { WatermarkMediaCard } from '@/components/ui/WatermarkMediaCard';
import { MediaGalleryLightbox } from '@/components/ui/MediaGalleryLightbox';
import { MediaGalleryGrid } from '@/components/ui/MediaGalleryGrid';
import { RefinePromptModal } from '@/components/ui/RefinePromptModal';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { MediaPickerInline } from '@/components/ui/MediaPickerInline';
import { ProviderSelectorWidget } from '@/components/ui/ProviderSelectorWidget';
import type { AIGenerationResult, AITone, PostType, Platform, ContentIdeaData, AIMediaRef } from '@/types';

// ─── TIPI ────────────────────────────────────────────────────────────────────

interface Post {
  id: string; type: string; status: string;
  platform?: string;
  caption?: string; hashtags?: string;
  mediaUrls: string; scheduledAt?: string;
  publishedAt?: string; aiGenerated: boolean;
  createdAt?: string;
  likesCount?: number; commentsCount?: number;
  error?: string;
  mediaReady?: string;
  tenantId?: string | null;
  /** Storyboard REEL (JSON string con { description?, storyboard? } o plain text) */
  notes?: string | null;
  account?: { username: string };
  instagramPostId?: string | null;
  facebookPostId?: string | null;
  tiktokPostId?: string | null;
}

interface PromptInfo {
  globalRules?: string[];
  config?: Record<string, string | number | boolean | null | undefined>;
  codeRules?: string[];
  systemPrompt?: string;
  userPrompt?: string;
  finalImagePrompt?: string;
}

interface GenerationJobForPost {
  id: string;
  type: string;
  status: string;
  result?: string;
  payload?: string;
  createdAt: string;
}

// ─── COSTANTI AI ─────────────────────────────────────────────────────────────

// Tipi di generazione AI — usati da TypePicker
const AI_TABS: TypePickerItem<'caption' | 'hashtags' | 'full_post'>[] = [
  { value: 'caption',   icon: <Wand2 size={13} />,   label: 'Caption' },
  { value: 'hashtags',  icon: <Hash size={13} />,     label: 'Hashtag' },
  { value: 'full_post', icon: <Sparkles size={13} />, label: 'Post Completo' },
];

type AiTabId = (typeof AI_TABS)[number]['value'];

const TONES: { value: AITone; label: string; emoji: string }[] = [
  { value: 'auto',         label: 'Automatico',    emoji: '🎯' },
  { value: 'professional', label: 'Professionale', emoji: '💼' },
  { value: 'friendly', label: 'Amichevole', emoji: '😊' },
  { value: 'funny', label: 'Divertente', emoji: '😄' },
  { value: 'inspirational', label: 'Inspirazionale', emoji: '✨' },
  { value: 'luxury', label: 'Luxury', emoji: '👑' },
  { value: 'minimal', label: 'Minimal', emoji: '◻️' },
];

const STATUS_FILTERS = ['', 'DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED', 'ARCHIVED'];
const TYPE_FILTERS   = ['', 'POST', 'STORY', 'REEL', 'CAROUSEL'];
const PLATFORM_FILTERS: { val: string; label: string }[] = [
  { val: '', label: '🌐 Tutte le piattaforme' },
  { val: 'INSTAGRAM', label: '📸 Instagram' },
  { val: 'FACEBOOK', label: '🔵 Facebook' },
  { val: 'TIKTOK', label: '🎵 TikTok' },
];


// ─── COMPONENTE PRINCIPALE ───────────────────────────────────────────────────

export default function ContentStudioPage() {
  const [activeTab, setActiveTab] = useState<'posts' | 'ai' | 'ideas'>('posts');
  const { tenants, selectedTenant, setSelectedTenant, isMaster, showSelector, ready } = useTenantFilter();
  const { sites, selectedSite, setSelectedSite } = useSiteFilter(selectedTenant);

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      {/* Header con tab switch e tenant/sito selector */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Tab switcher */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800/60 rounded-xl p-1 gap-1">
          <button
            onClick={() => setActiveTab('posts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'posts'
                ? 'bg-brand-500 text-white shadow'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-gray-700/50'
            }`}
          >
            <ImageIcon size={15} />
            Post Manager
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'ai'
                ? 'bg-brand-500 text-white shadow'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-gray-700/50'
            }`}
          >
            <Bot size={15} />
            AI Generator
          </button>
          <button
            onClick={() => setActiveTab('ideas')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'ideas'
                ? 'bg-brand-500 text-white shadow'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-gray-700/50'
            }`}
          >
            <Lightbulb size={15} />
            Brainstorming
          </button>
        </div>

        <div className="flex-1" />

        {/* Tenant + Sito selector */}
        <div className="flex items-center gap-2 flex-wrap">
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
        </div>
      </div>

      {/* Banner scope */}
      {ready && (
        <ScopeBanner
          selectedTenant={selectedTenant}
          tenants={tenants}
          selectedSite={selectedSite}
          sites={sites}
        />
      )}

      {activeTab === 'posts' ? (
        <PostManagerTab
          selectedTenant={selectedTenant}
          selectedSite={selectedSite}
          tenants={tenants}
        />
      ) : activeTab === 'ai' ? (
        <AIGeneratorTab
          selectedTenant={selectedTenant}
          tenants={tenants}
          selectedSite={selectedSite}
          sites={sites}
        />
      ) : (
        <IdeasTab
          selectedTenant={selectedTenant}
          tenants={tenants}
          selectedSite={selectedSite}
          sites={sites}
        />
      )}
    </div>
  );
}

// ─── POST MANAGER TAB ────────────────────────────────────────────────────────

function PostManagerTab({
  selectedTenant,
  selectedSite,
  tenants,
}: {
  selectedTenant: string;
  selectedSite: string;
  tenants: TenantOption[];
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [refinePostId, setRefinePostId] = useState<string | null>(null);
  const [bulkTenantIds, setBulkTenantIds] = useState<string[] | undefined>();
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  /** Set dei post REEL con storyboard espanso */
  const [expandedStoryboards, setExpandedStoryboards] = useState<Set<string>>(new Set());
  const toggleStoryboard = (id: string) => setExpandedStoryboards(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  // Ordinamento — default: data creazione discendente
  type PostSortField = 'createdAt' | 'scheduledAt' | 'status' | 'platform' | 'type';
  const [sortField, setSortField] = useState<PostSortField>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const toggleSortDir = () => setSortDir(d => d === 'asc' ? 'desc' : 'asc');

  // ─── Selezione multipla ───────────────────────────────────────────
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // ─── Stato pubblicazione ─────────────────────────────────────────
  const [publishConfirmPost, setPublishConfirmPost] = useState<Post | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  // ─── Stato eliminazione e azioni piattaforma ──────────────────────
  const [deleteConfirmPost, setDeleteConfirmPost] = useState<Post | null>(null);
  const [deletePlatformConfirmPost, setDeletePlatformConfirmPost] = useState<Post | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [deletingPlatformId, setDeletingPlatformId] = useState<string | null>(null);

  const toggleSelectPost = (id: string) => setSelectedPosts(prev => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const toggleSelectAll = () => {
    setSelectedPosts(prev =>
      prev.size === filteredPosts.length ? new Set() : new Set(filteredPosts.map(p => p.id))
    );
  };

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (platformFilter) params.set('platform', platformFilter);
      if (selectedTenant) params.set('tenantId', selectedTenant);
      if (selectedSite) params.set('siteId', selectedSite);
      const res = await fetch(`/api/posts?${params}`);
      const json = await res.json();
      if (json.success) setPosts(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, platformFilter, selectedTenant, selectedSite]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // Intercetta "Nuovo post": se nessun tenant e ce ne sono più di uno, mostra bulk modal
  const handleNewPost = () => {
    if (!selectedTenant && tenants.length > 1) {
      setShowBulkModal(true);
    } else {
      setBulkTenantIds(undefined);
      setShowCreate(true);
    }
  };

  const handleGlobalScope = () => {
    setShowBulkModal(false);
    setBulkTenantIds(undefined);
    setShowCreate(true);
  };

  const handleBulkScope = () => {
    setShowBulkModal(false);
    setBulkTenantIds(tenants.map(t => t.id));
    setShowCreate(true);
  };

  const publishNow = async (post: Post) => {
    // Mostra il modale di conferma invece del browser confirm()
    setPublishConfirmPost(post);
  };

  const doPublish = async (post: Post, forceRetry = false) => {
    setPublishConfirmPost(null);
    const p = post as Post & { _forceRetry?: boolean; _republish?: boolean };
    const isRepublish = p._republish ?? false;
    const platform = post.platform ?? 'INSTAGRAM';
    const platformLabel = platform === 'FACEBOOK' ? 'Facebook' : platform === 'TIKTOK' ? 'TikTok' : 'Instagram';

    // Controlla mediaReady prima di tentare
    if (!forceRetry && !isRepublish && post.mediaReady && post.mediaReady !== 'READY' && post.mediaReady !== 'NONE') {
      toast.error(`Media non pronto (stato: ${post.mediaReady}). Attendi la generazione AI.`);
      return;
    }

    const endpoint =
      platform === 'FACEBOOK' ? '/api/facebook/publish' :
      platform === 'TIKTOK'   ? '/api/tiktok/publish' :
                                '/api/instagram/publish';

    setPublishingId(post.id);
    const toastId = toast.loading(isRepublish ? `🔁 Ripubblicazione su ${platformLabel}…` : `📤 Pubblicazione su ${platformLabel}…`);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isRepublish
          ? { postId: post.id, republish: true }
          : { postId: post.id, forceRetry }
        ),
      });
      const json = await res.json();
      if (json.success) {
        toast.dismiss(toastId);
        toast.success(isRepublish ? `🎉 Ripubblicato su ${platformLabel}! (nuovo post duplicato)` : `🎉 Pubblicato su ${platformLabel}!`);
        fetchPosts();
      } else {
        toast.dismiss(toastId);
        toast.error(json.error ?? 'Errore pubblicazione', { duration: 8000 });
      }
    } catch {
      toast.dismiss(toastId);
      toast.error('Errore di rete durante la pubblicazione', { duration: 5000 });
    } finally {
      setPublishingId(null);
    }
  };

  const deletePost = async (id: string) => {
    const post = posts.find(p => p.id === id);
    const hasPlatformId = post && (post.instagramPostId || post.facebookPostId || post.tiktokPostId);
    // Per post PUBLISHED con ID piattaforma, mostra il modale di scelta
    if (post && post.status === 'PUBLISHED' && hasPlatformId) {
      setDeleteConfirmPost(post);
      return;
    }
    // Altrimenti elimina direttamente dall'app
    if (!confirm('Eliminare questo post dall\'app?')) return;
    const res = await fetch(`/api/posts/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) { toast.success('Post eliminato'); fetchPosts(); }
  };

  const doDeleteFromApp = async (id: string) => {
    setDeleteConfirmPost(null);
    const res = await fetch(`/api/posts/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) { toast.success('Post eliminato dall\'app'); fetchPosts(); }
    else toast.error(json.error ?? 'Errore eliminazione');
  };

  const doDeleteFromAppAndPlatform = async (post: Post) => {
    setDeleteConfirmPost(null);
    const platform = post.platform ?? 'INSTAGRAM';
    const toastId = toast.loading('🗑️ Eliminazione dalla piattaforma…');
    try {
      // 1. Elimina dalla piattaforma
      if (post.instagramPostId) {
        const res = await fetch('/api/instagram/media-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId: post.id, action: 'delete_platform' }),
        });
        const json = await res.json();
        if (!json.success) {
          toast.dismiss(toastId);
          // Se l'eliminazione da Instagram fallisce chiediamo se procedere solo con l'app
          toast.error(`Errore eliminazione da ${platform}: ${json.error}. Il post verrà eliminato solo dall'app.`, { duration: 6000 });
          await fetch(`/api/posts/${post.id}`, { method: 'DELETE' });
          fetchPosts(); return;
        }
      }
      // 2. Elimina dall'app
      await fetch(`/api/posts/${post.id}`, { method: 'DELETE' });
      toast.dismiss(toastId);
      toast.success(`🗑️ Post eliminato da ${platform} e dall'app`);
      fetchPosts();
    } catch {
      toast.dismiss(toastId);
      toast.error('Errore di rete durante l\'eliminazione');
    }
  };

  const archiveOnPlatform = async (post: Post) => {
    if (!post.instagramPostId) { toast.error('Nessun ID Instagram associato'); return; }
    setArchivingId(post.id);
    const toastId = toast.loading('📦 Archiviazione su Instagram…');
    try {
      const res = await fetch('/api/instagram/media-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, action: 'archive' }),
      });
      const json = await res.json();
      toast.dismiss(toastId);
      if (json.success) { toast.success('📦 Post archiviato su Instagram'); fetchPosts(); }
      else toast.error(json.error ?? 'Errore archiviazione', { duration: 6000 });
    } catch {
      toast.dismiss(toastId);
      toast.error('Errore di rete durante l\'archiviazione');
    } finally {
      setArchivingId(null);
    }
  };

  const deleteFromPlatform = (post: Post) => {
    if (!post.instagramPostId) { toast.error('Nessun ID Instagram associato'); return; }
    setDeletePlatformConfirmPost(post);
  };

  const doDeleteFromPlatform = async (post: Post) => {
    setDeletePlatformConfirmPost(null);
    setDeletingPlatformId(post.id);
    const toastId = toast.loading('🗑️ Eliminazione da Instagram…');
    try {
      const res = await fetch('/api/instagram/media-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, action: 'delete_platform' }),
      });
      const json = await res.json();
      toast.dismiss(toastId);
      if (json.success) { toast.success('🗑️ Post eliminato da Instagram (contenuto salvato come bozza)'); fetchPosts(); }
      else toast.error(json.error ?? 'Errore eliminazione da piattaforma', { duration: 6000 });
    } catch {
      toast.dismiss(toastId);
      toast.error('Errore di rete');
    } finally {
      setDeletingPlatformId(null);
    }
  };

  const bulkDelete = async () => {
    const ids = [...selectedPosts];
    if (!ids.length) return;
    if (!confirm(`Eliminare ${ids.length} post selezionati?`)) return;
    setBulkActionLoading(true);
    try {
      const res = await fetch('/api/posts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message ?? `${ids.length} post eliminati`);
        setSelectedPosts(new Set());
        fetchPosts();
      } else {
        toast.error(json.error ?? 'Errore eliminazione');
      }
    } catch { toast.error('Errore di rete'); }
    finally { setBulkActionLoading(false); }
  };

  const bulkPublish = async () => {
    const drafts = filteredPosts.filter(p => selectedPosts.has(p.id) && p.status === 'DRAFT');
    if (!drafts.length) { toast.error('Nessun post in bozza tra i selezionati'); return; }
    if (!confirm(`Pubblicare ${drafts.length} post selezionati? Assicurati di avere i diritti su tutti i media allegati.`)) return;
    setBulkActionLoading(true);
    let ok = 0;
    for (const post of drafts) {
      const platform = post.platform ?? 'INSTAGRAM';
      const endpoint =
        platform === 'FACEBOOK' ? '/api/facebook/publish' :
        platform === 'TIKTOK'   ? '/api/tiktok/publish' :
                                  '/api/instagram/publish';
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId: post.id }),
        });
        const json = await res.json();
        if (json.success) ok++;
        else toast.error(`Errore per post ${post.id.slice(-6)}: ${json.error ?? 'Sconosciuto'}`);
      } catch { toast.error(`Errore di rete per post ${post.id.slice(-6)}`); }
    }
    setBulkActionLoading(false);
    if (ok > 0) { toast.success(`🎉 ${ok}/${drafts.length} post pubblicati!`); setSelectedPosts(new Set()); fetchPosts(); }
  };

  const filteredPosts = [...posts]
    .filter((p) => !searchQuery || p.caption?.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'createdAt') {
        cmp = new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
      } else if (sortField === 'scheduledAt') {
        cmp = new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime();
      } else if (sortField === 'status') {
        cmp = (a.status ?? '').localeCompare(b.status ?? '');
      } else if (sortField === 'platform') {
        cmp = (a.platform ?? '').localeCompare(b.platform ?? '');
      } else if (sortField === 'type') {
        cmp = (a.type ?? '').localeCompare(b.type ?? '');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

  return (
    <div className="space-y-4">
      {/* Toolbar — search + nuovo post su una riga, filtri sotto su mobile */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              className="input pl-9 text-sm"
              placeholder="Cerca post..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button onClick={handleNewPost} className="btn-primary text-sm flex-shrink-0">
            <Plus size={15} /> <span className="hidden sm:inline">Nuovo</span> post
          </button>
        </div>
        {/* Filtri — scroll orizzontale su mobile */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <select className="select text-xs flex-shrink-0 min-w-[110px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tutti stati</option>
            {STATUS_FILTERS.slice(1).map((s) => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
          </select>
          <select className="select text-xs flex-shrink-0 min-w-[100px]" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Tutti tipi</option>
            {TYPE_FILTERS.slice(1).map((t) => <option key={t} value={t}>{getTypeLabel(t)}</option>)}
          </select>
          <select className="select text-xs flex-shrink-0 min-w-[130px]" value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
            {PLATFORM_FILTERS.map((p) => <option key={p.val} value={p.val}>{p.label}</option>)}
          </select>
          {/* Sort inline — compatto */}
          <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
            <select
              className="select text-xs py-1 h-7 min-w-[110px]"
              value={sortField}
              onChange={e => setSortField(e.target.value as PostSortField)}
            >
              <option value="createdAt">Data creazione</option>
              <option value="scheduledAt">Data prog.</option>
              <option value="status">Stato</option>
              <option value="platform">Piattaforma</option>
              <option value="type">Tipo</option>
            </select>
            <button
              onClick={toggleSortDir}
              title={sortDir === 'desc' ? 'Discendente' : 'Ascendente'}
              className="flex items-center gap-0.5 text-xs px-1.5 py-1 rounded-lg border bg-gray-100 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-all h-7 flex-shrink-0"
            >
              {sortDir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
            </button>
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
        <span>
          {filteredPosts.length} post {statusFilter || typeFilter || platformFilter ? 'filtrati' : ''}
          {selectedTenant && <span className="ml-1 badge bg-brand-500/10 text-brand-400 hidden sm:inline-flex">cliente filtrato</span>}
          {selectedSite && <span className="ml-1 badge bg-blue-500/10 text-blue-400 hidden sm:inline-flex">sito filtrato</span>}
          {platformFilter && <span className="ml-1 badge bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hidden sm:inline-flex">{getPlatformIcon(platformFilter)} {platformFilter}</span>}
        </span>
        <span className="flex-1" />
        {/* Selezione multipla */}
        {filteredPosts.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectAll}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-gray-100 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-all"
            title={selectedPosts.size === filteredPosts.length ? 'Deseleziona tutti' : 'Seleziona tutti'}
          >
            {selectedPosts.size === filteredPosts.length && filteredPosts.length > 0
              ? <CheckSquare size={12} className="text-brand-400" />
              : <Square size={12} />}
            {selectedPosts.size > 0 ? `${selectedPosts.size}` : 'Sel.'}
          </button>
        )}
        {/* Azioni bulk */}
        {selectedPosts.size > 0 && (
          <>
            <button
              type="button"
              onClick={bulkPublish}
              disabled={bulkActionLoading}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20 transition-all disabled:opacity-50"
              title="Pubblica bozze selezionate"
            >
              <Send size={11} />
              <span className="hidden sm:inline">{bulkActionLoading ? 'In corso…' : `Pubblica (${filteredPosts.filter(p => selectedPosts.has(p.id) && p.status === 'DRAFT').length})`}</span>
              <span className="sm:hidden">{filteredPosts.filter(p => selectedPosts.has(p.id) && p.status === 'DRAFT').length}</span>
            </button>
            <button
              type="button"
              onClick={bulkDelete}
              disabled={bulkActionLoading}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
              title="Elimina selezionati"
            >
              <Trash2 size={11} />
              <span className="hidden sm:inline">{bulkActionLoading ? 'In corso…' : `Elimina ${selectedPosts.size}`}</span>
              <span className="sm:hidden">{selectedPosts.size}</span>
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 shimmer rounded-xl" />)}
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-400 text-sm">Nessun post trovato</p>
          <button onClick={handleNewPost} className="btn-primary text-sm mt-4">
            <Plus size={14} /> Crea il primo post
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredPosts.map((post) => {
            const mediaCount = JSON.parse(post.mediaUrls || '[]').length;
            const tags = JSON.parse(post.hashtags || '[]') as string[];
            const isSelected = selectedPosts.has(post.id);
            const mediaReady = (post as { mediaReady?: string }).mediaReady;
            // Storyboard REEL: parse da notes
            let postStoryboard: { hook?: string; totalDuration?: string; music?: string; cta?: string; scenes?: Array<{ scene: number; duration: string; visual: string; script: string; onScreenText?: string; transition?: string }> } | null = null;
            if (post.type === 'REEL' && post.notes) {
              try {
                const parsedNotes = JSON.parse(post.notes);
                if (parsedNotes?.storyboard) postStoryboard = parsedNotes.storyboard;
              } catch { /* plain text notes */ }
            }
            const storyboardExpanded = expandedStoryboards.has(post.id);
            return (
              <div key={post.id} className={`card overflow-hidden hover:border-gray-300 dark:hover:border-gray-700 transition-colors ${isSelected ? 'ring-1 ring-brand-500/50 border-brand-500/30' : ''}`}>
              <div className="p-2.5 sm:p-4 flex items-start gap-2 sm:gap-3">

                {/* 1. Thumbnail — PRIMO ELEMENTO */}
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-200 dark:border-gray-700">
                  {(() => {
                    const urls: string[] = (() => { try { return JSON.parse(post.mediaUrls || '[]'); } catch { return []; } })();
                    if (urls.length > 0) {
                      return (
                        <MediaGalleryGrid
                          items={urls.map(u => ({ url: u }))}
                          tenantId={post.tenantId ?? undefined}
                          thumbSize={56}
                          maxVisible={1}
                          className="w-full h-full"
                        />
                      );
                    }
                    return <span className="text-2xl">{getTypeIcon(post.type)}</span>;
                  })()}
                </div>

                {/* 2. Contenuto */}
                <div className="flex-1 min-w-0">
                  {/* Badges — riga compatta su mobile */}
                  <div className="flex items-center gap-1 flex-wrap mb-0.5 sm:mb-1">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{getTypeLabel(post.type)}</span>
                    {/* Stato — se ha un errore di pubblicazione ma è SCHEDULED/DRAFT, mostra "Errore" invece */}
                    {post.error && (post.status === 'SCHEDULED' || post.status === 'DRAFT')
                      ? <span className="badge text-xs bg-red-500/10 text-red-400">⚠️ Errore</span>
                      : <span className={`badge text-xs ${getStatusColor(post.status)}`}>{getStatusLabel(post.status)}</span>
                    }
                    {/* Piattaforma — nascosta su mobile piccolo */}
                    {post.platform && (
                      <span className={`badge text-xs hidden sm:inline-flex ${getPlatformBadgeColor(post.platform)}`}>{getPlatformIcon(post.platform)} {post.platform}</span>
                    )}
                    {/* AI badge — nascosto su mobile */}
                    {post.aiGenerated && <span className="badge text-xs bg-purple-500/10 text-purple-400 hidden sm:inline-flex">🤖 AI</span>}
                    {/* Media count — nascosto su mobile */}
                    {mediaCount > 0 && <span className="badge text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hidden sm:inline-flex">📎 {mediaCount}</span>}
                    {/* Badge mediaReady — solo READY visibile su mobile, gli altri nascosti */}
                    {mediaReady === 'READY' && (
                      <span className="badge text-xs bg-green-500/10 text-green-400" title="Media pronto">✅ <span className="hidden sm:inline">Media</span></span>
                    )}
                    {mediaReady === 'PENDING' && (
                      <span className="badge text-xs bg-purple-500/10 text-purple-400 hidden sm:inline-flex" title="AI in coda">🤖 AI in coda</span>
                    )}
                    {mediaReady === 'GENERATING' && (
                      <span className="badge text-xs bg-blue-500/10 text-blue-400 hidden sm:inline-flex" title="Generando…">⚙️ Gen…</span>
                    )}
                    {mediaReady === 'FAILED' && (
                      <span className="badge text-xs bg-red-500/10 text-red-400" title="Generazione fallita">❌ <span className="hidden sm:inline">AI fallita</span></span>
                    )}
                  </div>

                  {/* Caption — 1 riga su mobile, 2 su desktop */}
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 line-clamp-1 sm:line-clamp-2">
                    {post.caption || <span className="italic text-gray-600">Nessuna caption</span>}
                  </p>

                  {/* Hashtag — nascosti su mobile */}
                  {tags.length > 0 && (
                    <div className="hidden sm:flex flex-wrap gap-1 mt-1.5">
                      {tags.slice(0, 5).map((t, i) => <span key={i} className="text-xs text-purple-500">{t}</span>)}
                      {tags.length > 5 && <span className="text-xs text-gray-600">+{tags.length - 5}</span>}
                    </div>
                  )}

                  {/* Errore — sempre visibile */}
                  {post.error && (
                    post.error.includes('localhost') || post.error.includes('ngrok') ? (
                      <div className="text-xs text-amber-400 mt-1 bg-amber-500/10 rounded px-2 py-1.5 space-y-0.5">
                        <p className="font-semibold">⚠️ Media non accessibile da Instagram (localhost)</p>
                        <p className="text-amber-300/80">Rendi il server raggiungibile da internet:</p>
                        <ol className="list-decimal list-inside text-amber-300/70 space-y-0.5">
                          <li>Installa ngrok: <code className="bg-black/20 px-1 rounded">npm install -g ngrok</code></li>
                          <li>Avvia tunnel: <code className="bg-black/20 px-1 rounded">ngrok http 3010</code></li>
                          <li>Copia l&apos;URL HTTPS (es. <em>https://abc.ngrok-free.app</em>)</li>
                          <li>Aggiorna <code className="bg-black/20 px-1 rounded">APP_BASE_URL</code> e <code className="bg-black/20 px-1 rounded">NEXT_PUBLIC_APP_BASE_URL</code> in <code className="bg-black/20 px-1 rounded">.env.local</code></li>
                          <li>Riavvia il server e riprova</li>
                        </ol>
                      </div>
                    ) : (
                      <p className="text-xs text-red-400 mt-1 bg-red-500/10 rounded px-2 py-1 truncate">⚠️ {post.error}</p>
                    )
                  )}

                  {/* Date — su mobile solo la creazione, su desktop tutto */}
                  <div className="flex items-center gap-2 mt-1 sm:mt-2 flex-wrap">
                    {post.createdAt && (
                      <span className="text-xs text-gray-600" title={formatDateTime(post.createdAt)}>
                        🕐 {formatRelativeTime(post.createdAt)}
                      </span>
                    )}
                    {post.scheduledAt && (
                      <span className="text-xs text-gray-500 hidden sm:inline">📅 {formatRelativeTime(post.scheduledAt)}</span>
                    )}
                    {post.publishedAt && (
                      <span className="text-xs text-green-500 hidden sm:inline">✅ {formatDateTime(post.publishedAt)}</span>
                    )}
                    {post.likesCount !== undefined && (
                      <span className="text-xs text-gray-500 hidden sm:inline">❤️ {post.likesCount} 💬 {post.commentsCount ?? 0}</span>
                    )}
                  </div>
                </div>

                {/* 3. Checkbox + Azioni — colonna destra compatta */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => toggleSelectPost(post.id)}
                    className="text-gray-500 hover:text-gray-200 transition-colors"
                    title={isSelected ? 'Deseleziona' : 'Seleziona'}
                  >
                    {isSelected ? <CheckSquare size={15} className="text-brand-400" /> : <Square size={15} />}
                  </button>
                  {/* Modifica */}
                  <button onClick={() => setEditingPost(post)} className="btn-ghost text-xs text-blue-400 hover:text-blue-300 p-0.5" title="Modifica">
                    <Pencil size={14} />
                  </button>
                  {/* Migliora — solo per post AI con media pronto */}
                  {post.aiGenerated && post.mediaReady === 'READY' && (
                    <button
                      onClick={() => setRefinePostId(post.id)}
                      className="btn-ghost text-xs text-violet-400 hover:text-violet-300 p-0.5"
                      title="Migliora media"
                    >
                      <Wand2 size={14} />
                    </button>
                  )}
                  {/* Pubblica — solo per post DRAFT senza errore */}
                  {post.status === 'DRAFT' && !post.error && (
                    <button
                      onClick={() => publishNow(post)}
                      disabled={publishingId === post.id}
                      className={`btn-ghost text-xs p-0.5 transition-colors ${publishingId === post.id ? 'text-gray-500 cursor-wait' : 'text-green-400 hover:text-green-300'}`}
                      title={publishingId === post.id ? 'Pubblicazione in corso...' : 'Pubblica ora'}
                    >
                      {publishingId === post.id
                        ? <svg className="animate-spin" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" strokeOpacity={0.25}/><path d="M12 2 a10 10 0 0 1 10 10"/></svg>
                        : <Send size={14} />
                      }
                    </button>
                  )}
                  {/* Riprova — per post con errore (qualsiasi stato) o bloccati in PUBLISHING */}
                  {(
                    post.status === 'FAILED' ||
                    post.status === 'PUBLISHING' ||
                    (post.error && post.error.length > 0)
                  ) && (
                    <button
                      onClick={() => setPublishConfirmPost({ ...post, _forceRetry: true } as Post & { _forceRetry: boolean })}
                      disabled={publishingId === post.id}
                      className={`btn-ghost text-xs p-0.5 transition-colors ${publishingId === post.id ? 'text-gray-500 cursor-wait' : 'text-orange-400 hover:text-orange-300'}`}
                      title={`Riprova pubblicazione${post.error ? ': ' + post.error.slice(0, 60) : ''}`}
                    >
                      {publishingId === post.id
                        ? <svg className="animate-spin" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" strokeOpacity={0.25}/><path d="M12 2 a10 10 0 0 1 10 10"/></svg>
                        : <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.6"/></svg>
                      }
                    </button>
                  )}
                  {/* Ripubblica — per post PUBLISHED (crea un duplicato) */}
                  {post.status === 'PUBLISHED' && !post.error && (
                    <button
                      onClick={() => setPublishConfirmPost({ ...post, _republish: true } as Post & { _republish: boolean })}
                      disabled={publishingId === post.id}
                      className={`btn-ghost text-xs p-0.5 transition-colors ${publishingId === post.id ? 'text-gray-500 cursor-wait' : 'text-cyan-400 hover:text-cyan-300'}`}
                      title="Ripubblica (crea un nuovo post duplicato)"
                    >
                      <RefreshCw size={14} />
                    </button>
                  )}
                  {/* Archivia su Instagram — solo per post PUBLISHED con instagramPostId */}
                  {post.status === 'PUBLISHED' && post.instagramPostId && (
                    <button
                      onClick={() => archiveOnPlatform(post)}
                      disabled={archivingId === post.id}
                      className={`btn-ghost text-xs p-0.5 transition-colors ${archivingId === post.id ? 'text-gray-500 cursor-wait' : 'text-amber-400 hover:text-amber-300'}`}
                      title="Archivia su Instagram (nasconde il post dal feed)"
                    >
                      {archivingId === post.id
                        ? <svg className="animate-spin" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" strokeOpacity={0.25}/><path d="M12 2 a10 10 0 0 1 10 10"/></svg>
                        : <Archive size={14} />
                      }
                    </button>
                  )}
                  {/* Elimina da Instagram — solo per post PUBLISHED con instagramPostId */}
                  {post.status === 'PUBLISHED' && post.instagramPostId && (
                    <button
                      onClick={() => deleteFromPlatform(post)}
                      disabled={deletingPlatformId === post.id}
                      className={`btn-ghost text-xs p-0.5 transition-colors ${deletingPlatformId === post.id ? 'text-gray-500 cursor-wait' : 'text-rose-400 hover:text-rose-300'}`}
                      title="Elimina da Instagram (mantiene il contenuto nell'app come bozza)"
                    >
                      {deletingPlatformId === post.id
                        ? <svg className="animate-spin" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" strokeOpacity={0.25}/><path d="M12 2 a10 10 0 0 1 10 10"/></svg>
                        : <ExternalLink size={14} className="rotate-180" />
                      }
                    </button>
                  )}
                  {/* Elimina dall'app */}
                  <button onClick={() => deletePost(post.id)} className="btn-ghost text-xs text-red-400 hover:text-red-300 p-0.5" title="Elimina dall'app">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>{/* fine riga principale */}

              {/* ── Storyboard REEL (collassabile) ──────────────────────────── */}
              {postStoryboard && (
                <div className="border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => toggleStoryboard(post.id)}
                    className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 text-[11px] text-teal-400 hover:text-teal-300 hover:bg-teal-500/5 transition-colors text-left"
                  >
                    <span>🎬</span>
                    <span className="font-medium">Storyboard Reel</span>
                    {postStoryboard.scenes?.length ? <span className="text-[10px] text-gray-500">· {postStoryboard.scenes.length} scene</span> : null}
                    {postStoryboard.totalDuration ? <span className="text-[10px] text-gray-500">· {postStoryboard.totalDuration}</span> : null}
                    <span className="ml-auto text-gray-500">{storyboardExpanded ? '▲' : '▼'}</span>
                  </button>
                  {storyboardExpanded && (
                    <div className="px-3 sm:px-4 pb-3 space-y-2">
                      {postStoryboard.hook && (
                        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
                          <p className="text-[9px] font-bold text-yellow-400 uppercase tracking-widest mb-0.5">🎣 Hook</p>
                          <p className="text-xs text-white">{postStoryboard.hook}</p>
                        </div>
                      )}
                      {postStoryboard.scenes && postStoryboard.scenes.length > 0 && (
                        <div className="space-y-1.5">
                          {postStoryboard.scenes.map((s, i) => (
                            <div key={i} className="rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 px-3 py-2 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-bold text-brand-400 uppercase tracking-wide">Scena {s.scene}</span>
                                <span className="text-[9px] text-gray-500 bg-gray-200 dark:bg-gray-700 px-1.5 py-px rounded-full">⏱ {s.duration}</span>
                                {s.transition && <span className="text-[9px] text-gray-500 italic ml-auto">→ {s.transition}</span>}
                              </div>
                              {s.visual && <p className="text-[10px] text-gray-400"><span className="text-gray-500">📷</span> {s.visual}</p>}
                              {s.script && <p className="text-[10px] text-gray-200"><span className="text-gray-500">🎙</span> {s.script}</p>}
                              {s.onScreenText && <p className="text-[10px] text-teal-300"><span className="text-gray-500">📝</span> {s.onScreenText}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {postStoryboard.music && (
                          <div className="text-[10px] text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded px-2 py-1">
                            🎵 <span className="text-gray-400">Musica:</span> {postStoryboard.music}
                          </div>
                        )}
                        {postStoryboard.cta && (
                          <div className="text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-1">
                            📢 <span className="text-gray-400">CTA:</span> {postStoryboard.cta}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        </div>
      )}

      {/* Bulk scope modal */}
      {showBulkModal && (
        <BulkScopeModal
          tenants={tenants}
          onGlobal={handleGlobalScope}
          onBulk={handleBulkScope}
          onCancel={() => setShowBulkModal(false)}
        />
      )}

      {showCreate && (
        <QuickCreateModal
          onClose={() => { setShowCreate(false); setBulkTenantIds(undefined); }}
          onSuccess={fetchPosts}
          tenantId={selectedTenant || undefined}
          bulkTenantIds={bulkTenantIds}
        />
      )}

      {editingPost && (
        <EditPostModal
          post={editingPost}
          tenantId={selectedTenant || editingPost.tenantId || undefined}
          onClose={() => setEditingPost(null)}
          onSuccess={() => { setEditingPost(null); fetchPosts(); }}
        />
      )}

      {refinePostId && (
        <RefinePromptModal
          postId={refinePostId}
          onClose={() => setRefinePostId(null)}
          onSuccess={() => {
            toast.success('✨ Miglioramento avviato! Controlla la Coda Generazione.');
            fetchPosts();
          }}
        />
      )}

      {/* ── Modale conferma pubblicazione ───────────────────────────── */}
      {publishConfirmPost && (() => {
        const post = publishConfirmPost as Post & { _forceRetry?: boolean; _republish?: boolean };
        const forceRetry = post._forceRetry ?? false;
        const isRepublish = post._republish ?? false;
        const platform = post.platform ?? 'INSTAGRAM';
        const platformLabel = platform === 'FACEBOOK' ? 'Facebook' : platform === 'TIKTOK' ? 'TikTok' : 'Instagram';
        const platformEmoji = platform === 'FACEBOOK' ? '🔵' : platform === 'TIKTOK' ? '🎵' : '📸';
        const mediaUrls: string[] = (() => { try { return JSON.parse(post.mediaUrls || '[]'); } catch { return []; } })();
        const hasMedia = mediaUrls.length > 0;
        const appBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL ?? '';
        const isLocalhost = appBaseUrl.includes('localhost') || appBaseUrl.includes('127.0.0.1') || !appBaseUrl;
        const hasLocalMedia = hasMedia && mediaUrls.some(u => u.startsWith('/uploads/') || u.startsWith('/public/'));
        const localMediaWarning = hasLocalMedia && isLocalhost;
        const isRetry = forceRetry || post.status === 'FAILED' || post.status === 'PUBLISHING';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPublishConfirmPost(null)}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{isRepublish ? '🔁' : isRetry ? '🔄' : platformEmoji}</span>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                    {isRepublish
                      ? `Ripubblica su ${platformLabel}`
                      : isRetry ? `Riprova pubblicazione su ${platformLabel}` : `Pubblica su ${platformLabel}`}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">Post ID: {post.id.slice(-8)}</p>
                </div>
              </div>

              {/* Banner ripubblica */}
              {isRepublish && (
                <div className="bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-700/40 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <RefreshCw size={14} className="text-cyan-500 flex-shrink-0" />
                    <span className="text-xs font-semibold text-cyan-800 dark:text-cyan-300">Nuova pubblicazione (duplicato)</span>
                  </div>
                  <p className="text-xs text-cyan-700 dark:text-cyan-400 leading-relaxed">
                    Verrà creato un <strong>nuovo post</strong> con lo stesso contenuto e pubblicato subito.
                    Il post originale rimarrà visibile come <strong>PUBBLICATO</strong>.
                  </p>
                </div>
              )}

              {/* Errore precedente visibile nel retry */}
              {isRetry && post.error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-xl p-3">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">Errore precedente:</p>
                  <p className="text-xs text-red-600 dark:text-red-400">{post.error}</p>
                </div>
              )}

              {post.caption && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                  <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">{post.caption}</p>
                </div>
              )}

              {hasMedia && !isRetry && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <ShieldAlert size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">Dichiarazione diritti media</span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                    Confermando, dichiari di possedere i diritti/licenza per tutti i media allegati e di non aver rimosso filigrane da contenuti protetti da copyright.
                  </p>
                  <p className="text-[10px] text-amber-600/70 dark:text-amber-500/70">
                    {mediaUrls.length} media allegati · Tipo: {post.type}
                  </p>
                </div>
              )}

              {!isRetry && !isRepublish && post.mediaReady && post.mediaReady !== 'READY' && post.mediaReady !== 'NONE' && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-xl p-3 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-700 dark:text-red-400">
                    Media non pronto — stato attuale: <strong>{post.mediaReady}</strong>. Attendi la generazione AI prima di pubblicare.
                  </p>
                </div>
              )}

              {localMediaWarning && (
                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-600/40 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-orange-500 flex-shrink-0" />
                    <span className="text-xs font-semibold text-orange-800 dark:text-orange-300">⚠️ URL localhost rilevato</span>
                  </div>
                  <p className="text-xs text-orange-700 dark:text-orange-400 leading-relaxed">
                    I media sono su <strong>localhost</strong> — Instagram/Facebook non possono scaricarli. 
                    Usa <strong>ngrok</strong> e imposta <code className="bg-orange-100 dark:bg-orange-900/40 px-1 rounded text-[10px]">APP_BASE_URL</code> in <code className="bg-orange-100 dark:bg-orange-900/40 px-1 rounded text-[10px]">.env.local</code> con l&apos;URL pubblico (es. <em>https://abc.ngrok-free.app</em>).
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => doPublish(post, forceRetry)}
                  disabled={!isRetry && !isRepublish && !!(post.mediaReady && post.mediaReady !== 'READY' && post.mediaReady !== 'NONE')}
                  className="flex-1 btn-primary text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isRepublish
                    ? <><RefreshCw size={14} /> Ripubblica (duplica)</>
                    : isRetry
                      ? <><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.6"/></svg> Riprova ora</>
                      : <><Send size={14} /> Pubblica ora</>
                  }
                </button>
                <button
                  onClick={() => setPublishConfirmPost(null)}
                  className="flex-1 btn-secondary text-sm"
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modale conferma eliminazione ──────────────────────────── */}
      {deleteConfirmPost && (() => {
        const post = deleteConfirmPost;
        const platform = post.platform ?? 'INSTAGRAM';
        const platformLabel = platform === 'FACEBOOK' ? 'Facebook' : platform === 'TIKTOK' ? 'TikTok' : 'Instagram';
        const platformEmoji = platform === 'FACEBOOK' ? '🔵' : platform === 'TIKTOK' ? '🎵' : '📸';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setDeleteConfirmPost(null)}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">🗑️</span>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg">Elimina post</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Questo post è pubblicato su {platformLabel} {platformEmoji}</p>
                </div>
              </div>

              {post.caption && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                  <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">{post.caption}</p>
                </div>
              )}

              <p className="text-sm text-gray-600 dark:text-gray-400">
                Come vuoi eliminare questo post?
              </p>

              <div className="space-y-2">
                {/* Opzione 1: solo dall'app */}
                <button
                  onClick={() => doDeleteFromApp(post.id)}
                  className="w-full flex items-start gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-red-500/50 hover:bg-red-500/5 transition-all text-left"
                >
                  <Trash2 size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Solo dall&apos;app</p>
                    <p className="text-xs text-gray-500 mt-0.5">Il post rimarrà visibile su {platformLabel}</p>
                  </div>
                </button>

                {/* Opzione 2: dall'app + piattaforma */}
                {post.instagramPostId && (
                  <button
                    onClick={() => doDeleteFromAppAndPlatform(post)}
                    className="w-full flex items-start gap-3 p-3 rounded-xl border border-red-200 dark:border-red-800/40 hover:border-red-500 hover:bg-red-500/10 transition-all text-left"
                  >
                    <span className="text-base flex-shrink-0 mt-0.5">{platformEmoji}</span>
                    <div>
                      <p className="text-sm font-medium text-red-700 dark:text-red-400">Dall&apos;app + {platformLabel}</p>
                      <p className="text-xs text-red-600/70 dark:text-red-500/70 mt-0.5">Il post verrà eliminato anche da {platformLabel}</p>
                    </div>
                  </button>
                )}
              </div>

              <button
                onClick={() => setDeleteConfirmPost(null)}
                className="w-full btn-secondary text-sm"
              >
                Annulla
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Modale conferma "Elimina da Instagram" (mantieni nell'app) ── */}
      {deletePlatformConfirmPost && (() => {
        const post = deletePlatformConfirmPost;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setDeletePlatformConfirmPost(null)}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                  <ExternalLink size={18} className="text-rose-400 rotate-180" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base">Elimina da Instagram</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Il contenuto rimarrà nell&apos;app come bozza</p>
                </div>
              </div>

              {/* Preview caption */}
              {post.caption && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                  <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">{post.caption}</p>
                </div>
              )}

              {/* Info box */}
              <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 rounded-xl p-3 space-y-1.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="text-rose-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-700 dark:text-rose-400 space-y-1">
                    <p className="font-semibold">Il post verrà eliminato da Instagram</p>
                    <p className="text-rose-600/80 dark:text-rose-500/80">
                      Il contenuto (caption, hashtag, media) rimarrà salvato in quest&apos;app come <strong>bozza</strong> e potrai ripubblicarlo in qualsiasi momento.
                    </p>
                  </div>
                </div>
              </div>

              {/* Azioni */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => doDeleteFromPlatform(post)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium transition-colors"
                >
                  <Trash2 size={14} />
                  Sì, elimina da Instagram
                </button>
                <button
                  onClick={() => setDeletePlatformConfirmPost(null)}
                  className="flex-1 btn-secondary text-sm"
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── EDIT POST MODAL ─────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['DRAFT', 'SCHEDULED', 'CANCELLED'];
const TYPE_OPTIONS = ['POST', 'STORY', 'REEL', 'CAROUSEL'];
const PLATFORM_OPTIONS = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK'];

function EditPostModal({ post, tenantId, onClose, onSuccess }: {
  post: Post;
  tenantId?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [caption, setCaption] = useState(post.caption ?? '');
  const [hashtagsRaw, setHashtagsRaw] = useState<string>(() => {
    try { return (JSON.parse(post.hashtags || '[]') as string[]).join(' '); } catch { return ''; }
  });
  const [type, setType] = useState(post.type);
  const [status, setStatus] = useState(post.status);
  const [platform, setPlatform] = useState(post.platform ?? 'INSTAGRAM');
  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    if (!post.scheduledAt) return '';
    try { return new Date(post.scheduledAt).toISOString().slice(0, 16); } catch { return ''; }
  });
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  // Gallery lightbox per media del post
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  // Caricamento job di generazione collegato al post (per dettagli prompt)
  const [genJob, setGenJob] = useState<GenerationJobForPost | null>(null);
  const [loadingJob, setLoadingJob] = useState(false);
  const [showPromptSection, setShowPromptSection] = useState(false);
  const [debugMode, setDebugMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('pineapple-debug-mode') === '1';
  });

  // Carica il job di generazione quando il modal si apre
  useEffect(() => {
    if (!post.aiGenerated) return;
    setLoadingJob(true);
    fetch(`/api/generation-queue?relatedPostId=${post.id}&limit=1`)
      .then(r => r.json())
      .then(json => {
        const jobs = json.data ?? [];
        if (jobs.length > 0) setGenJob(jobs[0]);
      })
      .catch(() => {/* silenzioso */})
      .finally(() => setLoadingJob(false));
  }, [post.id, post.aiGenerated]);

  const postMediaReady = post.mediaReady ?? 'PENDING';

  // Stato editing media URLs
  const originalMediaUrls: string[] = (() => { try { return JSON.parse(post.mediaUrls || '[]'); } catch { return []; } })();
  const [editingMediaUrls, setEditingMediaUrls] = useState<string[]>(originalMediaUrls);

  // Media picker per sostituzione manuale
  const [mediaRefs, setMediaRefs] = useState<AIMediaRef[]>([]);
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  // Quando si selezionano nuovi media dalla libreria, sostituisci le URL correnti
  const handleMediaPickerChange = (refs: AIMediaRef[]) => {
    setMediaRefs(refs);
    if (refs.length > 0) {
      setEditingMediaUrls(refs.map(r => r.url));
    }
  };

  const discardAndRegenerate = async () => {
    if (!confirm('Scartare il media attuale e avviare una nuova generazione AI?')) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerateImage: true, caption }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('🎨 Media scartato — nuova generazione AI in coda!');
        setEditingMediaUrls([]);
        onSuccess();
      } else {
        toast.error(json.error ?? 'Errore');
      }
    } catch {
      toast.error('Errore di rete');
    } finally {
      setRegenerating(false);
    }
  };

  const regenerateImage = async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerateImage: true, caption }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('🎨 Rigenera immagine AI messa in coda! Aggiorna tra qualche minuto.');
        onSuccess();
      } else {
        toast.error(json.error ?? 'Errore');
      }
    } catch {
      toast.error('Errore di rete');
    } finally {
      setRegenerating(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const hashtags = hashtagsRaw.split(/\s+/).map(h => h.trim()).filter(h => h.length > 0);
      const body: Record<string, unknown> = {
        caption,
        hashtags,
        type,
        status,
        platform,
        scheduledAt: scheduledAt ? scheduledAt : null,
        mediaUrls: editingMediaUrls,
      };
      const res = await fetch(`/api/posts/${post.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('✅ Post aggiornato!');
        onSuccess();
      } else {
        toast.error(json.error ?? 'Errore salvataggio');
      }
    } catch {
      toast.error('Errore di rete');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Pencil size={18} className="text-brand-400" />
            <h2 className="text-base font-semibold text-white">Modifica Post</h2>
          </div>
          <button onClick={onClose} className="btn-ghost text-gray-400 hover:text-white p-1">
            <XIcon size={18} />
          </button>
        </div>

        {/* Body scrollabile */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Banner stato media (solo se non ci sono media caricati) */}
          {editingMediaUrls.length === 0 && postMediaReady === 'PENDING' && (
            <div className="flex items-start gap-2 text-xs text-purple-400 bg-purple-500/8 border border-purple-500/20 rounded-lg px-3 py-2">
              <span className="mt-0.5">🤖</span>
              <span><strong>AI in coda</strong> — DALL-E 3 genererà automaticamente l&apos;immagine entro qualche minuto. Il post verrà pubblicato appena l&apos;immagine è pronta.</span>
            </div>
          )}
          {editingMediaUrls.length === 0 && postMediaReady === 'GENERATING' && (
            <div className="flex items-start gap-2 text-xs text-blue-400 bg-blue-500/8 border border-blue-500/20 rounded-lg px-3 py-2">
              <div className="mt-0.5 w-3 h-3 border border-blue-400/40 border-t-blue-400 rounded-full animate-spin flex-shrink-0" />
              <span><strong>Generazione in corso…</strong> — DALL-E 3 sta creando l&apos;immagine. Torna tra qualche minuto.</span>
            </div>
          )}
          {editingMediaUrls.length === 0 && postMediaReady === 'FAILED' && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2">
              <span className="mt-0.5">❌</span>
              <span><strong>Generazione fallita</strong> — Usa il pulsante &quot;Rigenera con AI&quot; per riprovare, oppure sostituisci il media manualmente.</span>
            </div>
          )}

          {/* ── SEZIONE MEDIA ──────────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                {editingMediaUrls.length > 0 ? `🖼️ Media (${editingMediaUrls.length})` : '🖼️ Nessun media'}
              </span>
              <div className="flex items-center gap-2">
                {/* Rigenera con AI */}
                <button
                  type="button"
                  onClick={regenerateImage}
                  disabled={regenerating}
                  title="Accoda nuova generazione AI (mantiene il media attuale fino al completamento)"
                  className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 disabled:opacity-50"
                >
                  {regenerating
                    ? <><div className="w-3 h-3 border border-brand-400/30 border-t-brand-400 rounded-full animate-spin" /> Rigenerando...</>
                    : <><Bot size={12} /> Rigenera AI</>
                  }
                </button>
                {/* Scarta e rigenera */}
                {editingMediaUrls.length > 0 && (
                  <button
                    type="button"
                    onClick={discardAndRegenerate}
                    disabled={regenerating}
                    title="Scarta il media corrente e avvia una nuova generazione AI"
                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 disabled:opacity-50"
                  >
                    <Trash2 size={12} /> Scarta e rigenera
                  </button>
                )}
              </div>
            </div>

            {/* Preview media correnti */}
            {editingMediaUrls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {editingMediaUrls.map((url, i) => {
                  const isVid = /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
                  return (
                    <div key={i} className="relative group">
                      {isVid ? (
                        <div
                          className="h-28 w-28 rounded-xl border border-gray-700 bg-gray-800 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity overflow-hidden relative"
                          onClick={() => setGalleryIndex(i)}
                          title="Clicca per visualizzare il video"
                        >
                          <video
                            src={url}
                            preload="metadata"
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                            style={{ pointerEvents: 'none' }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <div className="rounded-full bg-black/70 p-2">
                              <svg viewBox="0 0 24 24" className="w-6 h-6 text-white fill-white"><path d="M8 5v14l11-7z"/></svg>
                            </div>
                          </div>
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={url}
                          alt={`Media ${i + 1}`}
                          className="h-28 w-28 rounded-xl object-cover border border-gray-700 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setGalleryIndex(i)}
                          title="Clicca per visualizzare in gallery"
                          onError={e => {
                            const el = e.target as HTMLImageElement;
                            el.parentElement!.innerHTML = `<div class="h-28 w-28 rounded-xl border border-gray-700 bg-gray-800 flex items-center justify-center text-gray-500 text-xs text-center px-2">Immagine non disponibile</div>`;
                          }}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setEditingMediaUrls(prev => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                        title="Rimuovi questo media"
                      >
                        <XIcon size={10} className="text-white" />
                      </button>
                      {editingMediaUrls.length > 1 && (
                        <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] rounded px-1 py-0.5">{i + 1}/{editingMediaUrls.length}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Gallery lightbox */}
            {galleryIndex !== null && (
              <MediaGalleryLightbox
                items={editingMediaUrls.map(url => ({ url }))}
                initialIndex={galleryIndex}
                tenantId={tenantId}
                onClose={() => setGalleryIndex(null)}
                onWatermarkSuccess={(idx, newUrl) => {
                  setEditingMediaUrls(prev => prev.map((u, i) => i === idx ? newUrl : u));
                  setGalleryIndex(null);
                }}
              />
            )}

            {/* Bottone per sostituire/aggiungere media dalla libreria */}
            <button
              type="button"
              onClick={() => setShowMediaPicker(v => !v)}
              className={`flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl border border-dashed transition-all text-xs ${
                showMediaPicker
                  ? 'border-brand-500/60 bg-brand-500/5 text-brand-400'
                  : 'border-gray-700 hover:border-brand-500/40 hover:bg-brand-500/5 text-gray-400 hover:text-gray-200'
              }`}
            >
              <ImageIcon size={13} />
              {editingMediaUrls.length > 0 ? 'Sostituisci media dalla libreria' : 'Seleziona media dalla libreria'}
            </button>

            {/* Picker media inline */}
            {showMediaPicker && (
              <div className="rounded-xl border border-gray-700 overflow-hidden">
                <MediaPickerInline
                  tenantId={tenantId}
                  value={mediaRefs}
                  onChange={handleMediaPickerChange}
                />
              </div>
            )}

            {/* Bottone rigenera per stati non-ready (senza media) */}
            {editingMediaUrls.length === 0 && (postMediaReady === 'PENDING' || postMediaReady === 'FAILED') && (
              <button
                type="button"
                onClick={regenerateImage}
                disabled={regenerating}
                className="btn-secondary w-full text-xs py-2 flex items-center justify-center gap-2"
              >
                {regenerating
                  ? <><div className="w-3 h-3 border border-gray-400/30 border-t-gray-300 rounded-full animate-spin" /> Messa in coda...</>
                  : <><Bot size={13} /> Rigenera immagine con AI</>
                }
              </button>
            )}
          </div>

          {/* Piattaforma + Tipo + Stato */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Piattaforma</label>
              <select className="select text-sm" value={platform} onChange={e => setPlatform(e.target.value)}>
                {PLATFORM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tipo</label>
              <select className="select text-sm" value={type} onChange={e => setType(e.target.value)}>
                {TYPE_OPTIONS.map(t => <option key={t} value={t}>{getTypeLabel(t)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Stato</label>
              <select className="select text-sm" value={status} onChange={e => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>
                    {getStatusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Caption */}
          <div>
            <label className="label">Caption</label>
            <textarea
              className="textarea h-36 text-sm"
              placeholder="Scrivi la caption..."
              value={caption}
              onChange={e => setCaption(e.target.value)}
            />
            <div className="text-xs text-gray-600 text-right mt-1">{caption.length} caratteri</div>
          </div>

          {/* Hashtags */}
          <div>
            <label className="label">Hashtag <span className="text-gray-500 font-normal">(separati da spazio)</span></label>
            <textarea
              className="textarea h-20 text-sm font-mono"
              placeholder="#smart #home #domotica..."
              value={hashtagsRaw}
              onChange={e => setHashtagsRaw(e.target.value)}
            />
            <div className="text-xs text-gray-600 mt-1">
              {hashtagsRaw.split(/\s+/).filter(h => h.trim().length > 0).length} hashtag
            </div>
          </div>

          {/* Data programmazione */}
          <div>
            <label className="label">
              <Calendar size={13} className="inline mr-1 text-gray-500" />
              Data programmazione <span className="text-gray-500 font-normal">(opzionale)</span>
            </label>
            <input
              type="datetime-local"
              className="input text-sm"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
            />
            {scheduledAt && editingMediaUrls.length === 0 && postMediaReady === 'PENDING' && (
              <p className="text-xs text-purple-400 mt-1">L&apos;AI genererà l&apos;immagine prima della pubblicazione.</p>
            )}
          </div>

          {/* Info AI */}
          {post.aiGenerated && (
            <div className="flex items-center gap-2 text-xs text-purple-400 bg-purple-500/8 border border-purple-500/20 rounded-lg px-3 py-2">
              <span>🤖 Post generato con AI</span>
            </div>
          )}

          {/* ── Dettagli Prompt Generazione ─────────────────────────────── */}
          {post.aiGenerated && (
            <div className="rounded-xl border border-gray-700/60 overflow-hidden">
              {/* Header collassabile */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setShowPromptSection(v => !v)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setShowPromptSection(v => !v); }}
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <FileText size={12} className="text-brand-400" />
                  <span>Dettagli Prompt Generazione</span>
                  {loadingJob && <div className="w-3 h-3 border border-gray-500/40 border-t-gray-400 rounded-full animate-spin" />}
                  {!loadingJob && genJob && (
                    <span className="text-[10px] bg-gray-800 text-gray-500 rounded px-1.5 py-0.5">
                      {genJob.type} · {genJob.status}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Toggle debug */}
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      const next = !debugMode;
                      setDebugMode(next);
                      localStorage.setItem('pineapple-debug-mode', next ? '1' : '0');
                    }}
                    className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-all ${
                      debugMode
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                        : 'bg-gray-800 border-gray-700 text-gray-600 hover:text-gray-400'
                    }`}
                    title="Toggle modalità debug"
                  >
                    <Bug size={10} />
                    {debugMode ? 'Debug ON' : 'Debug'}
                  </button>
                  <ChevronDown size={14} className={`transition-transform ${showPromptSection ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Contenuto espandibile */}
              {showPromptSection && (() => {
                if (!genJob) {
                  return (
                    <div className="px-3 py-3 text-xs text-gray-600 border-t border-gray-800 bg-gray-900/40">
                      {loadingJob ? 'Caricamento dettagli job…' : 'Nessun job di generazione trovato per questo post.'}
                    </div>
                  );
                }

                let resultData: Record<string, unknown> = {};
                try { resultData = JSON.parse(genJob.result ?? '{}'); } catch { /* */ }
                const pi = (resultData.promptInfo ?? null) as PromptInfo | null;

                const payloadData: Record<string, unknown> = (() => { try { return JSON.parse(genJob.payload ?? '{}'); } catch { return {}; } })();
                const hasGlobalRules = (pi?.globalRules?.length ?? 0) > 0;
                const hasConfig = pi?.config && Object.keys(pi.config).length > 0;

                return (
                  <div className="border-t border-gray-800 bg-gray-900/40 p-3 space-y-3">

                    {/* 1. Regole Globali */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">🌐 Regole Prompt Globali</span>
                        <span className={`text-[9px] rounded-full px-1.5 py-0.5 ${hasGlobalRules ? 'bg-blue-500/15 text-blue-400' : 'bg-gray-800 text-gray-600'}`}>
                          {pi?.globalRules?.length ?? 0} {hasGlobalRules ? 'attive' : 'nessuna'}
                        </span>
                      </div>
                      {hasGlobalRules ? (
                        <ul className="space-y-1">
                          {pi!.globalRules!.map((rule, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-300">
                              <span className="text-blue-500/60 flex-shrink-0 mt-0.5">▸</span>
                              <span>{rule}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[11px] text-gray-600 italic">
                          Nessuna regola globale configurata.{' '}
                          <a href="/prompts" className="text-blue-500/70 hover:text-blue-400 underline">Aggiungi →</a>
                        </p>
                      )}
                    </div>

                    {/* 2. Configurazione */}
                    {hasConfig && (
                      <div>
                        <div className="text-[10px] font-semibold text-teal-400 uppercase tracking-wide mb-1.5">⚙️ Configurazione</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          {Object.entries(pi!.config!).map(([k, v]) => {
                            if (v === null || v === undefined) return null;
                            return (
                              <div key={k} className="flex items-baseline gap-1.5 text-[11px]">
                                <span className="text-gray-600 min-w-[70px] flex-shrink-0">{k}:</span>
                                <span className="text-gray-300 truncate">{String(v)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 3+4: Only if no promptInfo but has payload (job non ancora processato) */}
                    {!pi && Object.keys(payloadData).length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">📦 Payload Job</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          {Object.entries(payloadData).filter(([,v]) => v !== null && v !== undefined).map(([k, v]) => (
                            <div key={k} className="flex items-baseline gap-1.5 text-[11px]">
                              <span className="text-gray-600 min-w-[70px] flex-shrink-0">{k}:</span>
                              <span className="text-gray-400 truncate max-w-[120px]">{String(v).slice(0, 80)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Debug: regole da codice */}
                    {debugMode && pi?.codeRules && pi.codeRules.length > 0 && (
                      <div className="border-t border-amber-500/10 pt-2">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">🔧 Regole Iniettate dal Codice</span>
                          <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded px-1.5 py-0.5">Debug</span>
                        </div>
                        <ul className="space-y-1">
                          {pi.codeRules.map((rule, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-400">
                              <span className="text-amber-500/50 flex-shrink-0 mt-0.5">▸</span>
                              <span>{rule}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Debug: prompt completo */}
                    {debugMode && (pi?.finalImagePrompt || pi?.systemPrompt || pi?.userPrompt) && (
                      <div className="border-t border-amber-500/10 pt-2 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold text-orange-400 uppercase tracking-wide">📝 Prompt Completo</span>
                          <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded px-1.5 py-0.5">Debug</span>
                        </div>
                        {pi?.finalImagePrompt && (
                          <pre className="bg-gray-950 rounded-lg px-3 py-2 text-[10px] text-green-300/80 overflow-x-auto whitespace-pre-wrap border border-gray-800 max-h-32">
                            {pi.finalImagePrompt}
                          </pre>
                        )}
                        {pi?.systemPrompt && (
                          <div>
                            <div className="text-[10px] text-gray-600 mb-0.5">System Prompt:</div>
                            <pre className="bg-gray-950 rounded-lg px-3 py-2 text-[10px] text-purple-300/70 overflow-x-auto whitespace-pre-wrap border border-gray-800 max-h-32">
                              {pi.systemPrompt}
                            </pre>
                          </div>
                        )}
                        {pi?.userPrompt && (
                          <div>
                            <div className="text-[10px] text-gray-600 mb-0.5">User Prompt:</div>
                            <pre className="bg-gray-950 rounded-lg px-3 py-2 text-[10px] text-cyan-300/70 overflow-x-auto whitespace-pre-wrap border border-gray-800 max-h-32">
                              {pi.userPrompt}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-gray-800">
          <button onClick={onClose} className="btn-secondary flex-1">Annulla</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">
            {saving
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Salvando...</>
              : <><Check size={15} /> Salva modifiche</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── AI GENERATOR TAB ────────────────────────────────────────────────────────

const PLATFORMS_AI: { value: Platform; label: string; icon: ReactNode; color: string }[] = [
  { value: 'INSTAGRAM', label: 'Instagram', icon: <PlatformIcon platform="INSTAGRAM" size={24} />, color: 'border-pink-500 bg-pink-500/10 text-pink-400' },
  { value: 'FACEBOOK',  label: 'Facebook',  icon: <PlatformIcon platform="FACEBOOK"  size={24} />, color: 'border-blue-500 bg-blue-500/10 text-blue-400' },
  { value: 'TIKTOK',    label: 'TikTok',    icon: <PlatformIcon platform="TIKTOK"    size={24} />, color: 'border-cyan-500 bg-cyan-500/10 text-cyan-400'  },
];

const POST_TYPES_BY_PLATFORM: Record<Platform, TypePickerItem<PostType>[]> = {
  INSTAGRAM: [
    { value: 'POST',     icon: '🖼️', label: 'Post' },
    { value: 'STORY',    icon: '📱', label: 'Story' },
    { value: 'REEL',     icon: '🎬', label: 'Reel' },
    { value: 'CAROUSEL', icon: '🎠', label: 'Carousel' },
  ],
  FACEBOOK: [
    { value: 'POST',  icon: '🖼️', label: 'Post' },
    { value: 'STORY', icon: '📱', label: 'Story' },
    { value: 'REEL',  icon: '🎬', label: 'Video/Reel' },
  ],
  TIKTOK: [
    { value: 'POST', icon: '🖼️', label: 'Foto' },
    { value: 'REEL', icon: '🎬', label: 'Video' },
  ],
};

// Tipi di post compatibili per ogni tipo di contenuto AI
const POST_TYPES_BY_AI_TAB: Record<AiTabId, PostType[]> = {
  caption:   ['POST', 'STORY', 'REEL', 'CAROUSEL'],
  hashtags:  ['POST', 'STORY', 'REEL', 'CAROUSEL'],
  full_post: ['POST', 'STORY', 'REEL', 'CAROUSEL'],
};

/**
 * Calcola il numero di clip necessarie per una data durata totale.
 * Replica la logica server-side di calculateClipDurations (video-stitching.ts)
 * per mostrare info accurate nell'UI senza importare moduli Node.js.
 * Ogni clip è tra 5s (min) e 8s (max).
 * Caso gap impossibile (es. 9s): arrotonda al prossimo multiplo valido.
 */
function calcNumClips(totalSeconds: number): number {
  const d = Math.max(5, Math.min(60, Math.round(totalSeconds)));
  if (d <= 8) return 1;
  const minClips = Math.ceil(d / 8); // ceil(d / VEO_CLIP_MAX)
  const maxClips = Math.floor(d / 5); // floor(d / VEO_CLIP_MIN)
  if (maxClips < minClips) {
    // Gap impossibile → arrotonda alla prima durata valida superiore
    return calcNumClips(minClips * 5);
  }
  return minClips;
}

function AIGeneratorTab({
  selectedTenant,
  tenants,
  selectedSite,
  sites,
}: {
  selectedTenant: string;
  tenants: TenantOption[];
  selectedSite: string;
  sites: SiteOption[];
}) {
  const [activeAiTab, setActiveAiTab] = useState<AiTabId>('full_post');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIGenerationResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Stato per chiarimento AI
  const [additionalContext, setAdditionalContext] = useState('');
  const [clarifyCustomInput, setClarifyCustomInput] = useState('');

  const [platform, setPlatform] = useState<Platform>('INSTAGRAM');
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState<AITone>('professional');
  const [language, setLanguage] = useState('it');
  const [siteUrl, setSiteUrl] = useState('');
  const [imageDesc, setImageDesc] = useState('');
  const [cta, setCta] = useState('');
  const [postType, setPostType] = useState<PostType>('POST');
  const [mediaRefs, setMediaRefs] = useState<AIMediaRef[]>([]);

  // Tipo media per Post/Carousel e numero slide carousel
  const [mediaType, setMediaType] = useState<'IMAGE' | 'VIDEO'>('IMAGE');
  // Aspect ratio per video (solo valori supportati da Veo: 9:16 e 16:9)
  const [videoAspectRatio, setVideoAspectRatio] = useState<'9:16' | '16:9'>('16:9');
  // Durata video in secondi (range valido Veo: 4–8s)
  const [videoDuration, setVideoDuration] = useState<number>(5);
  const [carouselCount, setCarouselCount] = useState(3);
  // Per il carousel: tipo media per ogni singola slide
  const [slideMediaTypes, setSlideMediaTypes] = useState<('IMAGE' | 'VIDEO')[]>(['IMAGE', 'IMAGE', 'IMAGE']);

  // Aggiorna slideMediaTypes quando cambia il numero di slide
  const updateCarouselCount = (n: number) => {
    setCarouselCount(n);
    setSlideMediaTypes(prev => {
      if (n > prev.length) return [...prev, ...Array(n - prev.length).fill('IMAGE')];
      return prev.slice(0, n);
    });
  };

  const setAllSlides = (type: 'IMAGE' | 'VIDEO') =>
    setSlideMediaTypes(Array(carouselCount).fill(type));

  // Auto-rimozione filigrana AI sui media generati
  const [autoWatermarkEnabled, setAutoWatermarkEnabled] = useState(false);
  const [wmPreset, setWmPreset] = useState('bottom-right');
  const [wmMethod, setWmMethod] = useState<RemovalMethod>('taglio');

  // Override modello MEDIA (immagine/video) per questa singola esecuzione — NON influenza la generazione testo
  const [overrideMediaModel, setOverrideMediaModel] = useState<string | null>(null);

  // Siti disponibili per il selettore URL (passati dal componente padre)
  const [showSiteDropdown, setShowSiteDropdown] = useState(false);
  // siteId traccia l'ID del sito associato (per il salvataggio del post)
  const [siteId, setSiteId] = useState('');

  // Auto-preselezione siteUrl quando cambia il sito selezionato nel filtro globale
  useEffect(() => {
    if (selectedSite) {
      const found = sites.find(s => s.id === selectedSite);
      if (found) { setSiteUrl(found.url); setSiteId(selectedSite); }
    } else {
      setSiteUrl(''); setSiteId('');
    }
  }, [selectedSite, sites]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showSiteDropdown) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-site-dropdown-ai]')) setShowSiteDropdown(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSiteDropdown]);


  const availableTypes = POST_TYPES_BY_PLATFORM[platform].filter(
    t => POST_TYPES_BY_AI_TAB[activeAiTab].includes(t.value)
  );
  // Mostra il selettore formato solo se ci sono 2+ opzioni reali da scegliere
  const showFormatPicker = availableTypes.length > 1;
  const safePostType: PostType = availableTypes.find(t => t.value === postType)?.value ?? availableTypes[0]?.value ?? 'POST';

  // Auto-aggiorna postType quando cambia piattaforma o tipo contenuto e la selezione non è più valida
  useEffect(() => {
    if (!availableTypes.find(t => t.value === postType) && availableTypes.length > 0) {
      setPostType(availableTypes[0].value);
    }
  }, [activeAiTab, platform]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async (ctxOverride?: string) => {
     if (!siteUrl) { toast.error('Seleziona o inserisci un URL sito prima di generare'); return; }
     const ctx = ctxOverride ?? additionalContext;
     setLoading(true); setResult(null);
     try {
       const res = await fetch('/api/ai/generate', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           type: activeAiTab, topic, tone, language,
           scrapeUrl: siteUrl || undefined,
           imageDescription: imageDesc || undefined,
           callToAction: cta || undefined,
           postType: safePostType,
           platform,
           mediaType: safePostType === 'CAROUSEL' ? undefined : mediaType,
           ...(safePostType === 'CAROUSEL' ? { carouselCount, slideMediaTypes } : {}),
           mediaRefs: mediaRefs.length > 0 ? mediaRefs : undefined,
           additionalContext: ctx || undefined,
           // Passa la durata reel all'AI così genera scene con durate coerenti
           ...(safePostType === 'REEL' ? { reelDuration: videoDuration } : {}),
           ...(selectedTenant ? { tenantId: selectedTenant } : {}),
           ...(siteId ? { siteId } : {}),
           // NON passare overrideMediaModel qui — è un modello Veo/image, non di testo
         }),
       });
      const json = await res.json();
      if (json.success) {
        setResult(json.data);
        if (!json.data?.needsClarification) {
          // Generazione riuscita: reset chiarimento
          setAdditionalContext('');
          setClarifyCustomInput('');
          toast.success('Contenuto generato! ✨');
        }
      } else toast.error(json.error ?? 'Errore generazione');
    } catch { toast.error('Errore di rete'); }
    finally { setLoading(false); }
  };

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key); toast.success('Copiato!');
    setTimeout(() => setCopied(null), 2000);
  };

   // Salva per un singolo tenantId (o undefined = globale)
   const savePostForTenant = async (tenantId?: string): Promise<boolean> => {
     if (!result) return false;
     try {
       const res = await fetch('/api/posts', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           platform,
           type: safePostType,
           status: 'DRAFT',
           caption: result.caption,
           hashtags: result.hashtags ?? [],
           mediaUrls: [],
           mediaType: safePostType === 'CAROUSEL' ? undefined : mediaType,
           ...(safePostType === 'CAROUSEL' ? { carouselCount, slideMediaTypes } : {}),
           // Aspect ratio e durata per VIDEO (compreso REEL — sempre 9:16 e durata configurabile)
           ...((mediaType === 'VIDEO' && safePostType !== 'CAROUSEL') || safePostType === 'REEL' ? {
             videoAspectRatio: safePostType === 'REEL' ? '9:16' : videoAspectRatio,
             videoDuration,
           } : {}),
           language,
           aiGenerated: true,
           aiPrompt: topic,
           imageDescription: imageDesc || undefined,
           // Storyboard REEL (JSON string) — salvato in notes e nel payload del job come _storyboard
           reelScript: (safePostType === 'REEL' && result.reelScript) ? result.reelScript : undefined,
           // Passa le immagini di riferimento scelte dall'utente al job di generazione media
           inputMediaRefs: mediaRefs.length > 0 ? mediaRefs : undefined,
           ...(tenantId ? { tenantId } : {}),
           // Usa siteId dal form locale se disponibile, altrimenti usa selectedSite globale
           ...(siteId || selectedSite ? { siteId: siteId || selectedSite } : {}),
          ...(autoWatermarkEnabled ? {
            autoRemoveWatermark: true,
            wmPreset,
            wmMethod,
          } : {}),
          // Override modello video: se l'utente ha selezionato un modello specifico nel ProviderSelectorWidget
          ...((overrideMediaModel && (safePostType === 'REEL' || mediaType === 'VIDEO')) ? { videoModel: overrideMediaModel } : {}),
        }),
      });
      const json = await res.json();
      return json.success === true;
    } catch {
      return false;
    }
  };

  // Intercetta "Salva bozza": se nessun tenant e ce ne sono più di uno, mostra bulk modal
  const handleSaveAsPost = () => {
    if (!result) return;
    if (siteUrl && !siteId && sites.length > 0) {
      toast.error('⚠️ Seleziona il sito da associare al post prima di salvare');
      return;
    }
    if (!selectedTenant && tenants.length > 1) {
      setShowBulkModal(true);
    } else {
      // Salva direttamente per il tenant corrente (o globale)
      savePostForTenant(selectedTenant || undefined).then(ok => {
        if (ok) toast.success(`✅ Salvato come bozza ${getPlatformLabel(platform)}! Vai nel tab Post Manager.`);
        else toast.error('Errore salvataggio');
      });
    }
  };

  // Salva globale (nessun tenant)
  const handleGlobalSave = async () => {
    setShowBulkModal(false);
    const ok = await savePostForTenant(undefined);
    if (ok) toast.success('✅ Bozza globale salvata! Vai nel tab Post Manager.');
    else toast.error('Errore salvataggio');
  };

  // Crea una bozza per ogni tenant
  const handleBulkSave = async () => {
    setShowBulkModal(false);
    setBulkSaving(true);
    let successCount = 0;
    for (const t of tenants) {
      const ok = await savePostForTenant(t.id);
      if (ok) successCount++;
    }
    setBulkSaving(false);
    if (successCount === tenants.length) {
      toast.success(`✅ Bozze create per tutti i ${tenants.length} clienti! Vai nel Post Manager.`);
    } else {
      toast.error(`Creato ${successCount}/${tenants.length} bozze. Alcuni salvataggi non sono riusciti.`);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Form */}
      <div className="space-y-5">

        {/* ── Selettore Piattaforma ── */}
        <div>
          <label className="label">Piattaforma di destinazione</label>
          <div className="grid grid-cols-3 gap-2">
            {PLATFORMS_AI.map(({ value, label, icon, color }) => (
              <button key={value}
                onClick={() => { setPlatform(value); setPostType('POST'); setResult(null); }}
                className={`p-2.5 rounded-xl border text-center transition-all text-xs font-medium flex flex-col items-center gap-1 ${
                  platform === value ? color : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600'
                }`}>
                <span className="flex items-center justify-center">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab tipo contenuto AI */}
        <div>
          <label className="label">Tipo contenuto</label>
          <TypePicker
            items={AI_TABS}
            value={activeAiTab}
            onChange={(v) => { setActiveAiTab(v); setResult(null); }}
          />
        </div>

        {/* Formato post per piattaforma — visibile solo se ci sono più opzioni */}
        {showFormatPicker && (
          <div>
            <label className="label">Formato post</label>
            <TypePicker
              items={availableTypes}
              value={safePostType}
              onChange={(v) => setPostType(v)}
            />
          </div>
        )}

        {/* Durata Reel — visibile solo per REEL */}
        {safePostType === 'REEL' && (
          <div>
            <label className="label flex items-center gap-1.5">
              <span>⏱️ Durata Reel</span>
              <span className="text-[10px] text-gray-500 font-normal">
                {videoDuration <= 8
                  ? `(singola clip — ${videoDuration}s)`
                  : `(multi-clip: ${calcNumClips(videoDuration)} clip da 5-8s → ${videoDuration}s totali)`}
              </span>
            </label>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={5}
                  max={60}
                  step={1}
                  value={videoDuration}
                  onChange={(e) => setVideoDuration(Number(e.target.value))}
                  className="flex-1 accent-teal-500"
                />
                <span className="w-16 text-center text-sm font-bold text-teal-300 bg-teal-500/10 border border-teal-500/20 rounded-lg px-2 py-1 flex-shrink-0">
                  {videoDuration}s
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-500 px-1">
                <span>5s (min)</span>
                <span className="text-teal-500/70">
                  {videoDuration > 8 ? `🎬 ${calcNumClips(videoDuration)} clip in sequenza` : '🎬 clip singola'}
                </span>
                <span>60s (max)</span>
              </div>
            </div>
          </div>
        )}

        {/* Tipo media — visibile per POST (non CAROUSEL, non REEL, non STORY) */}
        {safePostType === 'POST' && (
          <div>
            <label className="label">Tipo media da generare</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'IMAGE' as const, icon: '🖼️', label: 'Immagine', desc: 'Foto statica AI' },
                { value: 'VIDEO' as const, icon: '🎬', label: 'Video', desc: 'Clip animata AI' },
              ]).map(({ value, icon, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMediaType(value)}
                  className={`p-3 rounded-xl border text-sm transition-all flex items-center gap-3 ${
                    mediaType === value
                      ? 'border-brand-500/60 bg-brand-500/10 text-brand-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  <span className="text-xl">{icon}</span>
                  <div className="text-left">
                    <div className="font-medium text-xs">{label}</div>
                    <div className="text-[10px] opacity-60">{desc}</div>
                  </div>
                </button>
              ))}
            </div>
            {/* Selector aspect ratio + durata — visibili solo quando viene generato un VIDEO */}
            {mediaType === 'VIDEO' && (
              <div className="mt-3 space-y-3">
                {/* Formato */}
                <div>
                  <label className="label flex items-center gap-1.5">
                    <span>📐 Formato video</span>
                    <span className="text-[10px] text-gray-500 font-normal">(solo 9:16 e 16:9 supportati da Veo)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: '16:9' as const, icon: '📺', label: 'Orizzontale 16:9', desc: 'Landscape — YouTube, feed standard' },
                      { value: '9:16' as const, icon: '📱', label: 'Verticale 9:16',  desc: 'Portrait — Story, Reel, TikTok' },
                    ]).map(({ value, icon, label, desc }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setVideoAspectRatio(value)}
                        className={`p-3 rounded-xl border text-sm transition-all flex items-center gap-3 ${
                          videoAspectRatio === value
                            ? 'border-violet-500/60 bg-violet-500/10 text-violet-300'
                            : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600'
                        }`}
                      >
                        <span className="text-lg">{icon}</span>
                        <div className="text-left">
                          <div className="font-medium text-xs">{label}</div>
                          <div className="text-[10px] opacity-60">{desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Durata */}
                <div>
                  <label className="label flex items-center gap-1.5">
                    <span>⏱️ Durata video</span>
                    <span className="text-[10px] text-gray-500 font-normal">
                      {videoDuration <= 8
                        ? `(singola clip — ${videoDuration}s)`
                        : `(multi-clip: ${calcNumClips(videoDuration)} clip da 5-8s → ${videoDuration}s totali)`}
                    </span>
                  </label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={5}
                        max={60}
                        step={1}
                        value={videoDuration}
                        onChange={(e) => setVideoDuration(Number(e.target.value))}
                        className="flex-1 accent-teal-500"
                      />
                      <span className="w-16 text-center text-sm font-bold text-teal-300 bg-teal-500/10 border border-teal-500/20 rounded-lg px-2 py-1 flex-shrink-0">
                        {videoDuration}s
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-500 px-1">
                      <span>5s (min)</span>
                        <span className="text-teal-500/70">{videoDuration > 8 ? `🎬 ${calcNumClips(videoDuration)} clip in sequenza` : '🎬 clip singola'}</span>
                      <span>60s (max)</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Configuratore carousel — numero slide + tipo media per slide */}
        {safePostType === 'CAROUSEL' && (
          <div className="rounded-xl border border-gray-700 bg-gray-800/20 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">🎠 Configurazione Carousel</span>
            </div>

            {/* Numero slide */}
            <div>
              <label className="label">Numero slide</label>
              <div className="flex items-center gap-2 flex-wrap">
                {[2, 3, 4, 5, 6, 7, 8, 10].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => updateCarouselCount(n)}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold border transition-all ${
                      carouselCount === n
                        ? 'border-brand-500 bg-brand-500/20 text-brand-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-500 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <span className="text-xs text-gray-500 ml-1">{carouselCount} slide</span>
              </div>
            </div>

            {/* Tipo media per slide */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Tipo media per ogni slide</label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAllSlides('IMAGE')}
                    className="text-[10px] px-2 py-1 rounded-lg border border-gray-700 text-gray-400 hover:border-brand-500/50 hover:text-brand-300 transition-all"
                  >
                    🖼️ Tutte immagini
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllSlides('VIDEO')}
                    className="text-[10px] px-2 py-1 rounded-lg border border-gray-700 text-gray-400 hover:border-purple-500/50 hover:text-purple-300 transition-all"
                  >
                    🎬 Tutti video
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: carouselCount }).map((_, idx) => {
                  const slideType = slideMediaTypes[idx] ?? 'IMAGE';
                  return (
                      <div key={idx} className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40">
                      <span className="text-xs text-gray-500 w-12 flex-shrink-0 font-medium">
                        Slide {idx + 1}
                      </span>
                      <div className="flex gap-1.5 flex-1">
                        <button
                          type="button"
                          onClick={() => setSlideMediaTypes(prev => { const n = [...prev]; n[idx] = 'IMAGE'; return n; })}
                          className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                            slideType === 'IMAGE'
                              ? 'border-brand-500/60 bg-brand-500/15 text-brand-300'
                              : 'border-gray-700 text-gray-500 hover:border-gray-600'
                          }`}
                        >
                          🖼️ Img
                        </button>
                        <button
                          type="button"
                          onClick={() => setSlideMediaTypes(prev => { const n = [...prev]; n[idx] = 'VIDEO'; return n; })}
                          className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                            slideType === 'VIDEO'
                              ? 'border-purple-500/60 bg-purple-500/15 text-purple-300'
                              : 'border-gray-700 text-gray-500 hover:border-gray-600'
                          }`}
                        >
                          🎬 Vid
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Riepilogo rapido */}
              <div className="mt-2 flex gap-3 text-[10px] text-gray-500">
                <span>🖼️ {slideMediaTypes.filter(t => t === 'IMAGE').length} immagini</span>
                <span>🎬 {slideMediaTypes.filter(t => t === 'VIDEO').length} video</span>
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="label">Topic / Idea</label>
          <textarea className="textarea h-24"
            placeholder="es: Presentazione del nuovo dispositivo smart home, offerta speciale..."
            value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>

        {/* URL Sito con selettore siti del cliente */}
        <div className="space-y-2">
          <div>
            <label className="label flex items-center gap-2">
              <Globe size={14} className="text-gray-500" />URL Sito
              <span className="text-red-400 text-xs font-medium">* obbligatorio</span>
            </label>
            <div className="relative" data-site-dropdown-ai>
              <input type="url" className="input pr-9" placeholder="https://www.tuosito.it"
                value={siteUrl}
                onChange={(e) => { setSiteUrl(e.target.value); setSiteId(''); }} />
              {sites.length > 0 && (
                <button type="button"
                  onClick={() => setShowSiteDropdown(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                  title="Seleziona sito del cliente">
                  <ChevronDown size={15} />
                </button>
              )}
              {showSiteDropdown && sites.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-lg overflow-hidden">
                  <div className="p-1.5 border-b border-gray-700">
                    <p className="text-xs text-gray-500 px-2">Siti del cliente</p>
                  </div>
                  {sites.map(s => (
                    <button key={s.id} type="button"
                      className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors"
                      onClick={() => { setSiteUrl(s.url); setSiteId(s.id); setShowSiteDropdown(false); }}>
                      <div className="text-sm text-white font-medium truncate">{s.name}</div>
                      <div className="text-xs text-gray-400 truncate">{s.url}</div>
                    </button>
                  ))}
                  {siteUrl && (
                    <button type="button"
                      className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors border-t border-gray-700"
                      onClick={() => { setSiteUrl(''); setSiteId(''); setShowSiteDropdown(false); }}>
                      <span className="text-xs text-red-400">✕ Rimuovi URL</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Campo "Sito da associare" — visibile solo se URL è manuale (nessun siteId auto-rilevato) */}
          {siteUrl && !siteId && sites.length > 0 && (
            <div>
              <label className="label flex items-center gap-1.5">
                <Globe size={13} className="text-amber-400" />
                Sito da associare al post
                <span className="text-amber-400 text-xs font-medium">* obbligatorio per Salva bozza</span>
              </label>
              <select
                className="select text-sm"
                value={siteId}
                onChange={e => setSiteId(e.target.value)}
              >
                <option value="">Seleziona il sito...</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name} — {s.url}</option>
                ))}
              </select>
              <p className="text-[11px] text-amber-500/70 mt-1">
                ℹ️ Hai inserito l&apos;URL manualmente — seleziona il sito corrispondente per associare correttamente la bozza.
              </p>
            </div>
          )}

          {/* Indicatore sito associato */}
          {siteId && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
              <Check size={11} />
              Sito associato: <strong>{sites.find(s => s.id === siteId)?.name ?? siteId}</strong>
            </div>
          )}
        </div>

        <div>
          <label className="label">Tono comunicativo</label>
          <div className="grid grid-cols-3 gap-2">
            {TONES.map(({ value, label, emoji }) => (
              <button key={value} onClick={() => setTone(value)}
                className={`p-2 rounded-xl text-xs font-medium border transition-all ${
                  tone === value ? 'border-brand-500 bg-brand-500/10 text-brand-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600'
                }`}>
                {emoji} {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Lingua</label>
          <select className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="it">🇮🇹 Italiano</option>
            <option value="en">🇬🇧 English</option>
            <option value="es">🇪🇸 Español</option>
            <option value="fr">🇫🇷 Français</option>
            <option value="de">🇩🇪 Deutsch</option>
          </select>
        </div>

        <div>
          <label className="label">Descrizione immagine (opzionale)</label>
          <input type="text" className="input" placeholder="es: Foto del prodotto su sfondo bianco"
            value={imageDesc} onChange={(e) => setImageDesc(e.target.value)} />
        </div>

        <div>
          <label className="label">Call to Action (opzionale)</label>
          <input type="text" className="input" placeholder="es: Visita il sito per scoprire di più"
            value={cta} onChange={(e) => setCta(e.target.value)} />
        </div>

        {/* Selettore media dalla libreria */}
        <MediaPickerInline
          tenantId={selectedTenant || undefined}
          siteId={siteId || undefined}
          value={mediaRefs}
          onChange={setMediaRefs}
        />

        {/* ── Rimozione filigrana (sempre visibile) ── */}
        <WatermarkMediaCard
          mediaType={safePostType === 'REEL' ? 'video' : 'image'}
          tenantId={selectedTenant || undefined}
        />

        {/* ── Auto-rimozione filigrana AI (applicata in fase di generazione) ── */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert size={14} className="text-yellow-500 dark:text-yellow-400/70" />
              <span className="text-sm font-medium text-gray-800 dark:text-gray-300">Auto-rimozione filigrana AI</span>
              <span className="text-[10px] bg-yellow-100 dark:bg-yellow-500/10 border border-yellow-300/60 dark:border-yellow-500/20 text-yellow-700 dark:text-yellow-400 rounded px-1.5 py-0.5">al momento della generazione</span>
            </div>
            <button
              type="button"
              onClick={() => setAutoWatermarkEnabled(v => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${autoWatermarkEnabled ? 'bg-yellow-500' : 'bg-gray-700'}`}
              title={autoWatermarkEnabled ? 'Disabilita auto-rimozione' : 'Abilita auto-rimozione'}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoWatermarkEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {!autoWatermarkEnabled && (
            <p className="text-[11px] text-gray-500 dark:text-gray-600">
              Quando abilitato, la filigrana viene rimossa automaticamente appena il media AI viene generato dalla coda.
            </p>
          )}
          {autoWatermarkEnabled && (
            <div className="space-y-2 pt-1">
              <p className="text-[11px] text-yellow-700 dark:text-yellow-300/70">
                ⚠️ La rimozione sarà applicata automaticamente al media generato. Configura posizione e metodo:
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label text-xs">Posizione watermark</label>
                  <select className="select text-xs" value={wmPreset} onChange={e => setWmPreset(e.target.value)}>
                    <option value="bottom-right">↘️ Basso destra (Midjourney, Leonardo)</option>
                    <option value="bottom-left">↙️ Basso sinistra (Stable Diffusion)</option>
                    <option value="top-right">↗️ Alto destra (Bing, Gemini)</option>
                    <option value="top-left">↖️ Alto sinistra (Playground AI)</option>
                    <option value="center">📦 Centro (DALL-E, Adobe Firefly)</option>
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

        {/* Provider selector — override modello MEDIA (image/video) per questa esecuzione */}
        {selectedTenant && (
          <ProviderSelectorWidget
            tenantId={selectedTenant}
            jobType={mediaType === 'VIDEO' || safePostType === 'REEL' ? 'video' : 'image'}
            value={overrideMediaModel}
            onChange={setOverrideMediaModel}
            label="Provider / Modello AI"
          />
        )}

        <button onClick={() => generate()} disabled={loading} className="btn-primary w-full py-3">
          {loading ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generando...</>
          ) : (
            <><Bot size={16} />Genera con AI per {getPlatformLabel(platform)}</>
          )}
        </button>
      </div>

      {/* Risultato */}
      <div className="card p-5 flex flex-col gap-4 min-h-[400px]">
        <div className="flex items-center justify-between">
          <h3 className="section-title flex items-center gap-2">
            <Sparkles size={18} className="text-brand-400" />Risultato AI
          </h3>
          {result && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 mr-1">{result.tokens} token · {result.model}</span>
              <span className="badge text-xs" style={{ background: platform === 'INSTAGRAM' ? 'rgba(236,72,153,0.1)' : platform === 'FACEBOOK' ? 'rgba(59,130,246,0.1)' : 'rgba(6,182,212,0.1)' }}>
                {getPlatformIcon(platform)} {getPlatformLabel(platform)}
              </span>
            </div>
          )}
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mx-auto" />
              <p className="text-sm text-gray-400 mt-3">L&apos;AI sta generando per {getPlatformLabel(platform)}...</p>
            </div>
          </div>
        )}

        {!loading && !result && (
          <div className="flex-1 flex items-center justify-center text-center">
            <div>
              <Bot size={48} className="mx-auto text-gray-700 mb-3" />
              <p className="text-sm text-gray-500">Scegli la piattaforma e premi &quot;Genera con AI&quot;</p>
              <div className="flex items-center justify-center gap-2 mt-3">
                {PLATFORMS_AI.map(p => (
                  <span key={p.value} className="cursor-pointer flex items-center justify-center" onClick={() => setPlatform(p.value)}>{p.icon}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {!loading && result && (
          <div className="flex-1 space-y-4 overflow-y-auto">

            {/* ── UI CHIARIMENTO: L'AI ha fatto una domanda con opzioni ─────── */}
            {result.needsClarification && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Bot size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-300 uppercase tracking-wide mb-1">L&apos;AI ha bisogno di un chiarimento</p>
                    <p className="text-sm text-gray-200">{result.clarificationQuestion}</p>
                  </div>
                </div>

                {/* Opzioni cliccabili pre-compilate */}
                {result.clarificationOptions && result.clarificationOptions.length > 0 && (
                  <div className="space-y-2">
                    {result.clarificationOptions.map((opt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          const ctx = `${opt.label}: ${opt.description}`;
                          setAdditionalContext(ctx);
                          setClarifyCustomInput('');
                          generate(ctx);
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all text-sm ${
                          additionalContext.startsWith(opt.label)
                            ? 'border-brand-500 bg-brand-500/15 text-white'
                            : 'border-gray-700 bg-gray-800/60 text-gray-300 hover:border-brand-500/50 hover:bg-brand-500/8 hover:text-white'
                        }`}
                      >
                        <span className="font-medium text-brand-300">{opt.label}</span>
                        {opt.description && <span className="text-gray-400 ml-2">— {opt.description}</span>}
                      </button>
                    ))}
                  </div>
                )}

                {/* Risposta personalizzata */}
                <div className="pt-1">
                  <p className="text-xs text-gray-500 mb-1.5">Oppure scrivi una risposta personalizzata:</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={clarifyCustomInput}
                      onChange={e => setClarifyCustomInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && clarifyCustomInput.trim()) {
                          const ctx = clarifyCustomInput.trim();
                          setAdditionalContext(ctx);
                          generate(ctx);
                        }
                      }}
                      placeholder="Es: target giovani, prodotto luxury, tono informale..."
                      className="input flex-1 text-sm py-2"
                    />
                    <button
                      type="button"
                      disabled={!clarifyCustomInput.trim()}
                      onClick={() => {
                        const ctx = clarifyCustomInput.trim();
                        if (!ctx) return;
                        setAdditionalContext(ctx);
                        generate(ctx);
                      }}
                      className="btn-primary text-sm px-4 disabled:opacity-50"
                    >
                      <Bot size={14} /> Genera
                    </button>
                  </div>
                </div>
              </div>
            )}

            {result.caption && !result.needsClarification && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Caption</span>
                  <button onClick={() => copyToClipboard(result.caption!, 'caption')}
                    className="text-xs text-brand-400 flex items-center gap-1 hover:text-brand-300">
                    {copied === 'caption' ? <Check size={12} /> : <Copy size={12} />}
                    {copied === 'caption' ? 'Copiato!' : 'Copia'}
                  </button>
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                  {result.caption}
                </div>
              </div>
            )}

            {result.hashtags && result.hashtags.length > 0 && platform !== 'TIKTOK' && !result.needsClarification && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Hashtag ({result.hashtags.length})</span>
                  <button onClick={() => copyToClipboard(result.hashtags!.join(' '), 'hashtags')}
                    className="text-xs text-brand-400 flex items-center gap-1 hover:text-brand-300">
                    {copied === 'hashtags' ? <Check size={12} /> : <Copy size={12} />}
                    Copia tutti
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.hashtags.map((h, i) => (
                    <span key={i} className="badge bg-purple-500/10 text-purple-400 cursor-pointer hover:bg-purple-500/20"
                      onClick={() => copyToClipboard(h, `h${i}`)}>
                      {h}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.storyText && !result.needsClarification && (() => {
              // Prova a parsare JSON per display a slide
              let slides: { slide: number; type?: string; headline?: string; subtext?: string; cta?: string; backgroundColor?: string; sticker?: string }[] | null = null;
              try {
                const raw = result.storyText!;
                const s = raw.indexOf('['); const e = raw.lastIndexOf(']');
                const o = raw.indexOf('{'); const oe = raw.lastIndexOf('}');
                const jsonStr = (s !== -1 && e > s) ? raw.slice(s, e + 1) : (o !== -1 && oe > o) ? raw.slice(o, oe + 1) : null;
                if (jsonStr) {
                  const p = JSON.parse(jsonStr);
                  slides = Array.isArray(p) ? p : (p.slides ?? null);
                }
              } catch { /* fallback testo */ }

              if (slides && slides.length > 0) {
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                        📱 Story — {slides.length} slide
                      </span>
                      <button onClick={() => copyToClipboard(
                        slides!.map(s => [
                          `[SLIDE ${s.slide}${s.type ? ` · ${s.type.toUpperCase()}` : ''}]`,
                          s.headline ? `Titolo: ${s.headline}` : '',
                          s.subtext ? `Testo: ${s.subtext}` : '',
                          s.cta ? `CTA: ${s.cta}` : '',
                        ].filter(Boolean).join('\n')).join('\n\n'),
                        'storySlides'
                      )} className="text-xs text-brand-400 flex items-center gap-1 hover:text-brand-300">
                        {copied === 'storySlides' ? <Check size={12} /> : <Copy size={12} />}
                        {copied === 'storySlides' ? 'Copiato!' : 'Copia slide'}
                      </button>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {slides.map((s, i) => (
                        <div
                          key={i}
                          className="flex-shrink-0 w-44 rounded-2xl border border-gray-200 dark:border-gray-700 p-3 space-y-1.5 flex flex-col bg-white dark:bg-transparent"
                          style={{ background: s.backgroundColor ? `${s.backgroundColor}18` : undefined, borderColor: s.backgroundColor ?? undefined }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-brand-400 uppercase">Slide {s.slide}</span>
                            <span className="text-base leading-none">{s.sticker ?? ''}</span>
                          </div>
                          {s.type && <span className="text-[9px] uppercase tracking-widest text-gray-500">{s.type}</span>}
                          {s.headline && <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">{s.headline}</p>}
                          {s.subtext && <p className="text-xs text-gray-400 leading-snug">{s.subtext}</p>}
                          {s.cta && (
                            <p className="mt-auto pt-1 text-[10px] font-medium text-brand-300 border-t border-gray-700">👆 {s.cta}</p>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] text-gray-600 flex items-start gap-1.5">
                      <span>ℹ️</span>
                      <span>Guida visiva per creare le slide — riproduci ogni schermata nel tuo tool (Canva, Stories IG, ecc.).</span>
                    </div>
                  </div>
                );
              }
              // Fallback testo grezzo
              return (
                <div>
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide block mb-2">Story Structure</span>
                  <pre className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap">{result.storyText}</pre>
                </div>
              );
            })()}

            {result.reelScript && !result.needsClarification && (() => {
              // Prova a parsare il JSON per un display storyboard leggibile
              let parsed: {
                hook?: string; totalDuration?: string; music?: string; cta?: string;
                scenes?: { scene: number; duration: string; visual: string; script: string; onScreenText?: string; transition?: string }[];
              } | null = null;
              try {
                const raw = result.reelScript!;
                const startObj = raw.indexOf('{');
                const endObj = raw.lastIndexOf('}');
                if (startObj !== -1 && endObj > startObj) {
                  parsed = JSON.parse(raw.slice(startObj, endObj + 1));
                }
              } catch { /* mostra testo grezzo */ }

              if (parsed && (parsed.hook || parsed.scenes?.length)) {
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                        🎬 {platform === 'TIKTOK' ? 'Script Video TikTok' : 'Script Reel'}
                        {parsed.totalDuration && <span className="ml-2 text-brand-400 normal-case font-normal">· {parsed.totalDuration}</span>}
                      </span>
                      <button onClick={() => copyToClipboard(
                        [
                          parsed!.hook ? `🎣 HOOK: ${parsed!.hook}` : '',
                          ...(parsed!.scenes ?? []).map(s => `\n[SCENA ${s.scene} – ${s.duration}]\nVisuale: ${s.visual}\nScript: ${s.script}${s.onScreenText ? `\nTesto a schermo: ${s.onScreenText}` : ''}${s.transition ? `\nTransizione: ${s.transition}` : ''}`),
                          parsed!.music ? `\n🎵 Musica: ${parsed!.music}` : '',
                          parsed!.cta ? `\n📢 CTA: ${parsed!.cta}` : '',
                        ].filter(Boolean).join('\n'),
                        'reelScript'
                      )} className="text-xs text-brand-400 flex items-center gap-1 hover:text-brand-300">
                        {copied === 'reelScript' ? <Check size={12} /> : <Copy size={12} />}
                        {copied === 'reelScript' ? 'Copiato!' : 'Copia script'}
                      </button>
                    </div>

                    {/* Hook */}
                    {parsed.hook && (
                      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
                        <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest mb-1">🎣 Hook (primi 3 sec)</p>
                        <p className="text-sm text-white font-medium">{parsed.hook}</p>
                      </div>
                    )}

                    {/* Scene */}
                    {parsed.scenes && parsed.scenes.length > 0 && (
                      <div className="space-y-2">
                        {parsed.scenes.map((s, i) => (
                          <div key={i} className="rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">Scena {s.scene}</span>
                      <span className="text-[10px] text-gray-500 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">⏱ {s.duration}</span>
                              {s.transition && <span className="text-[10px] text-gray-500 italic ml-auto">→ {s.transition}</span>}
                            </div>
                            {s.visual && <p className="text-xs text-gray-400"><span className="text-gray-500">📷 Visuale:</span> {s.visual}</p>}
                            {s.script && <p className="text-xs text-gray-200"><span className="text-gray-500">🎙 Voce:</span> {s.script}</p>}
                            {s.onScreenText && <p className="text-xs text-brand-300"><span className="text-gray-500">📝 Testo:</span> {s.onScreenText}</p>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Footer info */}
                    <div className="flex flex-wrap gap-2">
                      {parsed.music && (
                        <div className="flex items-center gap-1.5 text-xs text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-1.5">
                          🎵 <span className="text-gray-400">Musica suggerita:</span> {parsed.music}
                        </div>
                      )}
                      {parsed.cta && (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5">
                          📢 <span className="text-gray-400">CTA:</span> {parsed.cta}
                        </div>
                      )}
                    </div>

                    {/* Nota utilizzo */}
                    <div className="text-[10px] text-gray-600 flex items-start gap-1.5 pt-1">
                      <span>ℹ️</span>
                      <span>Questo storyboard è una guida di produzione — usalo come riferimento durante le riprese e il montaggio (CapCut, Premiere, DaVinci, ecc.). Non è un formato di importazione diretta.</span>
                    </div>
                  </div>
                );
              }

              // Fallback: testo grezzo
              return (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                      {platform === 'TIKTOK' ? 'Script Video TikTok' : 'Script Reel'}
                    </span>
                  </div>
                  <pre className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap">{result.reelScript}</pre>
                </div>
              );
            })()}

            {result.ideas && result.ideas.length > 0 && !result.needsClarification && (
              <div>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide block mb-2">{result.ideas.length} Idee generate</span>
                <div className="space-y-2">
                  {result.ideas.map((idea, i) => (
                    <div key={i} className="bg-gray-800 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">{idea.type === 'POST' ? '🖼️' : idea.type === 'STORY' ? '📱' : '🎬'}</span>
                        <span className="text-sm font-medium text-white">{idea.title}</span>
                        <span className="ml-auto text-xs text-brand-400">★ {idea.priority}/10</span>
                      </div>
                      {idea.description && <p className="text-xs text-gray-500">{idea.description}</p>}
                      {idea.caption && <p className="text-xs text-gray-500 dark:text-gray-300 mt-1 italic">&quot;{idea.caption.slice(0, 80)}...&quot;</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}


            {/* Scope indicator + azioni — nascosti durante chiarimento */}
            {!result.needsClarification && (
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-200 dark:border-gray-800">
              {/* Scope info */}
              {!selectedTenant && tenants.length > 1 && (
                <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2">
                  <AlertTriangle size={12} />
                  <span>Nessun cliente selezionato — ti verrà chiesto come salvare la bozza</span>
                </div>
              )}
              {selectedTenant && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/8 border border-emerald-500/20 rounded-lg px-3 py-2">
                  <Check size={12} />
                  <span>Verrà salvata come bozza per: <strong>{tenants.find(t => t.id === selectedTenant)?.name ?? selectedTenant}</strong></span>
                </div>
              )}

              {/* ── Avviso se qualche media ha avuto filigrana rimossa ── */}

              <div className="flex gap-2">
                <button onClick={() => generate()} className="btn-secondary flex-1 text-xs">🔄 Rigenera</button>
                {activeAiTab === 'full_post' && (result.caption || result.hashtags?.length) && (
                  <button
                    onClick={handleSaveAsPost}
                    disabled={bulkSaving}
                    className="btn-primary flex-1 text-xs"
                  >
                    {bulkSaving
                      ? <><div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> Salvando...</>
                      : <>📝 Salva bozza {getPlatformIcon(platform)}</>
                    }
                  </button>
                )}
              </div>
            </div>
            )} {/* fine !result.needsClarification */}
          </div>
        )}
      </div>

      {/* Bulk scope modal */}
      {showBulkModal && (
        <BulkScopeModal
          tenants={tenants}
          onGlobal={handleGlobalSave}
          onBulk={handleBulkSave}
          onCancel={() => setShowBulkModal(false)}
        />
      )}
    </div>
  );
}

// ─── IDEAS TAB (Brainstorming) ────────────────────────────────────────────────

const IDEA_PLATFORMS: { value: Platform; icon: ReactNode; color: string }[] = [
  { value: 'INSTAGRAM', icon: <PlatformIcon platform="INSTAGRAM" size={24} />, color: 'border-pink-500 bg-pink-500/10 text-pink-400' },
  { value: 'FACEBOOK',  icon: <PlatformIcon platform="FACEBOOK"  size={24} />, color: 'border-blue-500 bg-blue-500/10 text-blue-400' },
  { value: 'TIKTOK',    icon: <PlatformIcon platform="TIKTOK"    size={24} />, color: 'border-cyan-500 bg-cyan-500/10 text-cyan-400' },
];

function IdeasTab({
  selectedTenant,
  tenants,
  selectedSite,
  sites,
}: {
  selectedTenant: string;
  tenants: TenantOption[];
  selectedSite: string;
  sites: SiteOption[];
}) {
  const [ideas, setIdeas] = useState<ContentIdeaData[]>([]);
  const [generating, setGenerating] = useState(false);
  const [topic, setTopic] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [tone, setTone] = useState<AITone>('auto');
  const [language, setLanguage] = useState('it');
  const [platform, setPlatform] = useState<Platform>('INSTAGRAM');
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const pendingIdeaRef = useRef<ContentIdeaData | null>(null);
  const [mediaRefs, setMediaRefs] = useState<AIMediaRef[]>([]);

  // Chiarimento AI
  const [clarification, setClarification] = useState<{
    question: string;
    options: { label: string; description: string }[];
  } | null>(null);
  const [additionalContext, setAdditionalContext] = useState('');
  const [clarifyCustomInput, setClarifyCustomInput] = useState('');

  // Override provider/modello per questa singola esecuzione
  const [overrideModel, setOverrideModel] = useState<string | null>(null);

  // Selezione multipla per eliminazione locale
  const [selectedIdeas, setSelectedIdeas] = useState<Set<string>>(new Set());

  const toggleSelectIdea = (id: string) => setSelectedIdeas(prev => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const toggleSelectAllIdeas = () => {
    setSelectedIdeas(prev => prev.size === ideas.length ? new Set() : new Set(ideas.map(i => i.id)));
  };
  const deleteSelectedIdeas = () => {
    setIdeas(prev => prev.filter(i => !selectedIdeas.has(i.id)));
    setSelectedIdeas(new Set());
  };

  // Siti disponibili per il selettore URL (passati dal componente padre)
  const [showSiteDropdown, setShowSiteDropdown] = useState(false);
  // siteId traccia l'ID del sito associato (per il salvataggio delle bozze)
  const [siteId, setSiteId] = useState('');

  // Auto-preselezione siteUrl quando cambia il sito selezionato nel filtro globale
  useEffect(() => {
    if (selectedSite) {
      const found = sites.find(s => s.id === selectedSite);
      if (found) { setSiteUrl(found.url); setSiteId(selectedSite); }
    } else {
      setSiteUrl(''); setSiteId('');
    }
  }, [selectedSite, sites]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showSiteDropdown) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-site-dropdown]')) setShowSiteDropdown(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSiteDropdown]);

   const generateIdeas = async (ctxOverride?: string) => {
     if (!siteUrl) { toast.error('Seleziona o inserisci un URL sito prima di generare'); return; }
     const ctx = ctxOverride ?? additionalContext;
     setGenerating(true);
     try {
       const res = await fetch('/api/ai/generate', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           type: 'ideas', topic, siteUrl: siteUrl || undefined,
           tone, language, platform,
           mediaRefs: mediaRefs.length > 0 ? mediaRefs : undefined,
           additionalContext: ctx || undefined,
           ...(selectedTenant ? { tenantId: selectedTenant } : {}),
           // Usa siteId dal form locale se disponibile, altrimenti usa selectedSite globale
           ...(siteId || selectedSite ? { siteId: siteId || selectedSite } : {}),
           ...(overrideModel ? { overrideModel } : {}),
         }),
       });
      const json = await res.json();
      if (json.success) {
        // Caso 1: l'AI chiede un chiarimento
        if (json.data?.needsClarification) {
          setClarification({
            question: json.data.clarificationQuestion ?? 'Puoi fornire più dettagli?',
            options: json.data.clarificationOptions ?? [],
          });
        // Caso 2: idee generate correttamente
        } else if (Array.isArray(json.data?.ideas)) {
          setClarification(null);
          setAdditionalContext('');
          setClarifyCustomInput('');
          setIdeas(json.data.ideas);
          if (json.data.ideas.length > 0) {
            toast.success(`${json.data.ideas.length} idee generate! ✨`);
          } else {
            toast.error('0 idee generate. Prova a riformulare il topic o controlla i log server.');
          }
        } else {
          toast.error('Risposta AI non valida — riprova');
        }
      } else {
        toast.error(json.error ?? 'Errore generazione');
      }
    } finally {
      setGenerating(false);
    }
  };

   const saveIdeaForTenant = async (idea: ContentIdeaData, tenantId?: string): Promise<boolean> => {
     try {
       // Stima automatica durata reel basata sulla lunghezza del contenuto:
       // ~10s ogni 100 caratteri di descrizione+caption, clamped a [15, 60]s
       const ideaTextLen = (idea.description?.length ?? 0) + (idea.caption?.length ?? 0);
       const estimatedReelDuration = Math.min(60, Math.max(15, Math.ceil(ideaTextLen / 100) * 10));

       const res = await fetch('/api/posts', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           platform, type: idea.type, status: 'DRAFT',
           caption: idea.caption, hashtags: idea.hashtags ?? [],
           mediaUrls: [], aiGenerated: true, aiPrompt: idea.title,
           notes: idea.description,
           // Storyboard REEL: usa videoPrompt come scena singola se disponibile
           reelScript: (idea.type === 'REEL' && idea.videoPrompt)
             ? JSON.stringify({ hook: idea.title, totalDuration: `${estimatedReelDuration}s`, scenes: [{ scene: 1, duration: `${estimatedReelDuration}s`, visual: idea.videoPrompt, script: idea.description ?? idea.title, onScreenText: idea.title }], music: null, cta: null })
             : undefined,
           // Per REEL: durata stimata automaticamente dal contenuto (aspect ratio 9:16 fisso)
           ...(idea.type === 'REEL' ? { videoDuration: estimatedReelDuration, videoAspectRatio: '9:16' } : {}),
           // Passa i media di riferimento selezionati dall'utente per la generazione AI dell'immagine
           inputMediaRefs: mediaRefs.length > 0 ? mediaRefs : undefined,
           ...(tenantId ? { tenantId } : {}),
           // Usa siteId dal form locale se disponibile, altrimenti usa selectedSite globale
           ...(siteId || selectedSite ? { siteId: siteId || selectedSite } : {}),
        }),
      });
      const json = await res.json();
      return json.success === true;
    } catch { return false; }
  };

  const handleApprove = (idea: ContentIdeaData) => {
    if (siteUrl && !siteId && sites.length > 0) {
      toast.error('⚠️ Seleziona il sito da associare alla bozza prima di approvare');
      return;
    }
    if (!selectedTenant && tenants.length > 1) {
      pendingIdeaRef.current = idea;
      setShowBulkModal(true);
    } else {
      saveIdeaForTenant(idea, selectedTenant || undefined).then(ok => {
        if (ok) {
          setIdeas(prev => prev.map(i => i.id === idea.id ? { ...i, status: 'USED' } : i));
          toast.success(`💾 Idea salvata come bozza ${getPlatformLabel(platform)}! Vai nel Post Manager.`);
        } else {
          toast.error('Errore salvataggio');
        }
      });
    }
  };

  const handleGlobalApprove = async () => {
    setShowBulkModal(false);
    const idea = pendingIdeaRef.current;
    if (!idea) return;
    const ok = await saveIdeaForTenant(idea, undefined);
    if (ok) {
      setIdeas(prev => prev.map(i => i.id === idea.id ? { ...i, status: 'USED' } : i));
      toast.success('✅ Idea salvata come bozza globale!');
    } else toast.error('Errore salvataggio');
    pendingIdeaRef.current = null;
  };

  const handleBulkApprove = async () => {
    setShowBulkModal(false);
    const idea = pendingIdeaRef.current;
    if (!idea) return;
    setBulkSaving(true);
    let successCount = 0;
    for (const t of tenants) {
      const ok = await saveIdeaForTenant(idea, t.id);
      if (ok) successCount++;
    }
    setBulkSaving(false);
    setIdeas(prev => prev.map(i => i.id === idea.id ? { ...i, status: 'USED' } : i));
    if (successCount === tenants.length) toast.success(`✅ Idea salvata per tutti i ${tenants.length} clienti!`);
    else toast.error(`Salvato ${successCount}/${tenants.length} clienti.`);
    pendingIdeaRef.current = null;
  };

  const dismissIdea = (id: string) => setIdeas(prev => prev.map(i => i.id === id ? { ...i, status: 'REJECTED' } : i));

  const pendingIdeas = ideas.filter(i => i.status === 'PENDING');
  const processedIdeas = ideas.filter(i => i.status !== 'PENDING');

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Form */}
      <div className="card p-5 space-y-4">
        <h3 className="section-title flex items-center gap-2">
          <Wand2 size={18} className="text-brand-400" />
          Genera nuove idee con AI
          <span className="ml-auto text-xs text-gray-500 font-normal">Le idee approvate vengono salvate nel Post Manager come bozze</span>
        </h3>

        {/* Platform selector */}
        <div>
          <label className="label">Piattaforma di destinazione</label>
          <div className="grid grid-cols-3 gap-2">
            {IDEA_PLATFORMS.map(({ value, icon, color }) => (
              <button key={value} onClick={() => setPlatform(value)}
                className={`p-2.5 rounded-xl border text-center transition-all text-xs font-medium flex flex-col items-center gap-1 ${
                  platform === value ? color : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600'
                }`}>
                <span className="flex items-center justify-center">{icon}</span>
                {getPlatformLabel(value)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">Topic</label>
            <input type="text" className="input"
              placeholder="es: smart home, sicurezza casa, domotica..."
              value={topic} onChange={e => setTopic(e.target.value)} />
          </div>
          <div>
            <label className="label">
              <Globe size={13} className="inline mr-1 text-gray-500" />URL Sito
              <span className="text-red-400 text-xs font-medium ml-1">* obbligatorio</span>
            </label>
            <div className="relative" data-site-dropdown>
              <input type="url" className="input pr-9" placeholder="https://www.tuosito.it"
                value={siteUrl}
                onChange={e => { setSiteUrl(e.target.value); setSiteId(''); }} />
              {sites.length > 0 && (
                <button type="button"
                  onClick={() => setShowSiteDropdown(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                  title="Seleziona sito del cliente">
                  <ChevronDown size={15} />
                </button>
              )}
              {showSiteDropdown && sites.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-lg overflow-hidden">
                  <div className="p-1.5 border-b border-gray-700">
                    <p className="text-xs text-gray-500 px-2">Siti del cliente</p>
                  </div>
                  {sites.map(s => (
                    <button key={s.id} type="button"
                      className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors"
                      onClick={() => { setSiteUrl(s.url); setSiteId(s.id); setShowSiteDropdown(false); }}>
                      <div className="text-sm text-white font-medium truncate">{s.name}</div>
                      <div className="text-xs text-gray-400 truncate">{s.url}</div>
                    </button>
                  ))}
                  {siteUrl && (
                    <button type="button"
                      className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors border-t border-gray-700"
                      onClick={() => { setSiteUrl(''); setSiteId(''); setShowSiteDropdown(false); }}>
                      <span className="text-xs text-red-400">✕ Rimuovi URL</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Campo "Sito da associare" — visibile solo se URL è manuale */}
            {siteUrl && !siteId && sites.length > 0 && (
              <div className="mt-2 space-y-1">
                <label className="label flex items-center gap-1.5">
                  <Globe size={13} className="text-amber-400" />
                  Sito da associare alla bozza
                  <span className="text-amber-400 text-xs font-medium">* obbligatorio</span>
                </label>
                <select
                  className="select text-sm"
                  value={siteId}
                  onChange={e => setSiteId(e.target.value)}
                >
                  <option value="">Seleziona il sito...</option>
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>{s.name} — {s.url}</option>
                  ))}
                </select>
                <p className="text-[11px] text-amber-500/70">
                  ℹ️ Hai inserito l&apos;URL manualmente — seleziona il sito corrispondente per associare correttamente le bozze.
                </p>
              </div>
            )}
            {siteId && (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 mt-1.5">
                <Check size={11} />
                Sito associato: <strong>{sites.find(s => s.id === siteId)?.name ?? siteId}</strong>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Tono</label>
            <select className="select" value={tone} onChange={e => setTone(e.target.value as AITone)}>
              <option value="auto">🎯 Automatico</option>
              <option value="professional">💼 Professionale</option>
              <option value="friendly">😊 Amichevole</option>
              <option value="inspirational">✨ Inspirazionale</option>
              <option value="luxury">👑 Luxury</option>
              <option value="funny">😄 Divertente</option>
              <option value="minimal">◻️ Minimal</option>
            </select>
          </div>
          <div>
            <label className="label">Lingua</label>
            <select className="select" value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="it">🇮🇹 Italiano</option>
              <option value="en">🇬🇧 English</option>
              <option value="es">🇪🇸 Español</option>
              <option value="fr">🇫🇷 Français</option>
            </select>
          </div>
        </div>

        {/* Selettore media dalla libreria */}
        <MediaPickerInline
          tenantId={selectedTenant || undefined}
          value={mediaRefs}
          onChange={setMediaRefs}
        />

        {/* Widget rimozione filigrana */}
        <WatermarkMediaCard
          tenantId={selectedTenant || undefined}
        />

        {/* Provider selector — override modello per questa esecuzione */}
        {selectedTenant && (
          <ProviderSelectorWidget
            tenantId={selectedTenant}
            jobType="text"
            value={overrideModel}
            onChange={setOverrideModel}
            label="Provider / Modello AI"
          />
        )}

        {/* ── UI CHIARIMENTO: l'AI ha fatto una domanda ── */}
        {clarification && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <Bot size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-300 uppercase tracking-wide mb-1">L&apos;AI ha bisogno di un chiarimento</p>
                <p className="text-sm text-gray-800 dark:text-gray-200">{clarification.question}</p>
              </div>
            </div>
            {clarification.options.length > 0 && (
              <div className="space-y-2">
                {clarification.options.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      const ctx = `${opt.label}: ${opt.description}`;
                      setAdditionalContext(ctx);
                      setClarifyCustomInput('');
                      generateIdeas(ctx);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all text-sm ${
                      additionalContext.startsWith(opt.label)
                        ? 'border-brand-500 bg-brand-500/15 text-white'
                        : 'border-gray-700 bg-gray-800/60 text-gray-300 hover:border-brand-500/50 hover:text-white'
                    }`}
                  >
                    <span className="font-medium text-brand-300">{opt.label}</span>
                    {opt.description && <span className="text-gray-400 ml-2">— {opt.description}</span>}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                value={clarifyCustomInput}
                onChange={e => setClarifyCustomInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && clarifyCustomInput.trim()) {
                    const ctx = clarifyCustomInput.trim();
                    setAdditionalContext(ctx);
                    generateIdeas(ctx);
                  }
                }}
                placeholder="Oppure scrivi una risposta personalizzata..."
                className="input flex-1 text-sm py-2"
              />
              <button
                type="button"
                disabled={!clarifyCustomInput.trim() || generating}
                onClick={() => {
                  const ctx = clarifyCustomInput.trim();
                  if (!ctx) return;
                  setAdditionalContext(ctx);
                  generateIdeas(ctx);
                }}
                className="btn-primary text-sm px-4 disabled:opacity-50"
              >
                <Bot size={14} /> Genera
              </button>
            </div>
          </div>
        )}

        <button onClick={() => generateIdeas()} disabled={generating} className="btn-primary w-full">
          {generating
            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generando 10 idee per {getPlatformLabel(platform)}...</>
            : <><Lightbulb size={16} /> Genera 10 idee {getPlatformIcon(platform)} {getPlatformLabel(platform)}</>
          }
        </button>
      </div>

      {/* Idee pending */}
      {pendingIdeas.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <h3 className="section-title flex-1">
              💡 {pendingIdeas.length} idee da valutare · <span className="text-gray-500 font-normal text-sm">{getPlatformIcon(platform)} {getPlatformLabel(platform)}</span>
              {!selectedTenant && tenants.length > 1 && (
                <span className="ml-2 badge bg-amber-500/10 text-amber-400 text-xs font-normal">🌐 Tutti i clienti — ti verrà chiesto come salvare</span>
              )}
              {selectedTenant && (
                <span className="ml-2 badge bg-emerald-500/10 text-emerald-400 text-xs font-normal">
                  ✓ {tenants.find(t => t.id === selectedTenant)?.name}
                </span>
              )}
            </h3>
            {/* Selezione/eliminazione */}
            {ideas.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSelectAllIdeas}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border bg-gray-100 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-all"
                >
                  {selectedIdeas.size === ideas.length ? <CheckSquare size={12} /> : <Square size={12} />}
                  {selectedIdeas.size > 0 ? `${selectedIdeas.size} selezionate` : 'Seleziona'}
                </button>
                {selectedIdeas.size > 0 && (
                  <button
                    type="button"
                    onClick={deleteSelectedIdeas}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all"
                  >
                    <Trash2 size={12} /> Elimina {selectedIdeas.size}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="grid gap-3">
            {pendingIdeas.map(idea => (
              <div key={idea.id} className={`card p-4 hover:border-gray-700 transition-all animate-slide-up ${selectedIdeas.has(idea.id) ? 'ring-1 ring-brand-500/50' : ''}`}>
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => toggleSelectIdea(idea.id)}
                    className="flex-shrink-0 mt-1 text-gray-500 hover:text-gray-200 transition-colors"
                  >
                    {selectedIdeas.has(idea.id) ? <CheckSquare size={16} className="text-brand-400" /> : <Square size={16} />}
                  </button>
                  <div className="text-2xl flex-shrink-0 mt-0.5">
                    {idea.type === 'POST' ? '🖼️' : idea.type === 'STORY' ? '📱' : '🎬'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-white text-sm">{idea.title}</span>
                      <span className="badge bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs">{idea.type}</span>
                      {idea.category && <span className="badge bg-blue-500/10 text-blue-400 text-xs">{idea.category}</span>}
                      <span className="badge bg-brand-500/10 text-brand-400 text-xs ml-auto">★ {idea.priority}/10</span>
                    </div>
                    {idea.description && <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{idea.description}</p>}
                    {idea.caption && (
                      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 mb-2">
                        <p className="text-xs text-gray-700 dark:text-gray-300 italic line-clamp-3">{idea.caption}</p>
                      </div>
                    )}
                    {idea.hashtags && idea.hashtags.length > 0 && platform !== 'TIKTOK' && (
                      <div className="flex flex-wrap gap-1">
                        {(idea.hashtags as string[]).slice(0, 8).map((h, i) => (
                          <span key={i} className="text-xs text-purple-400">{h}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
                  <button onClick={() => { dismissIdea(idea.id); setSelectedIdeas(prev => { const n = new Set(prev); n.delete(idea.id); return n; }); }} className="btn-ghost text-xs text-red-400 flex-1">
                    <XIcon size={13} /> Ignora
                  </button>
                  <button onClick={() => handleApprove(idea)} disabled={bulkSaving} className="btn-primary text-xs flex-1">
                    {bulkSaving
                      ? <><div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> Salvando...</>
                      : <><Check size={13} /> Approva → Bozza {getPlatformIcon(platform)}</>
                    }
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Idee processate */}
      {processedIdeas.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="section-title text-gray-500 flex-1">Già processate</h3>
            {processedIdeas.length > 0 && (
              <button
                type="button"
                onClick={() => setIdeas(prev => prev.filter(i => i.status === 'PENDING'))}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border bg-gray-100 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:border-red-500/30 transition-all"
              >
                <Trash2 size={12} /> Pulisci tutte
              </button>
            )}
          </div>
          <div className="space-y-2">
            {processedIdeas.map(idea => (
              <div key={idea.id} className={`flex items-center gap-3 p-3 rounded-xl bg-gray-100/60 dark:bg-gray-800/30 opacity-60 ${selectedIdeas.has(idea.id) ? 'ring-1 ring-brand-500/40 opacity-80' : ''}`}>
                <button
                  type="button"
                  onClick={() => toggleSelectIdea(idea.id)}
                  className="flex-shrink-0 text-gray-600 hover:text-gray-300 transition-colors"
                >
                  {selectedIdeas.has(idea.id) ? <CheckSquare size={14} className="text-brand-400" /> : <Square size={14} />}
                </button>
                <span className="text-lg">{idea.type === 'POST' ? '🖼️' : idea.type === 'STORY' ? '📱' : '🎬'}</span>
                <span className="text-sm text-gray-400 flex-1 truncate">{idea.title}</span>
                <span className={`badge text-xs ${idea.status === 'USED' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                  {idea.status === 'USED' ? '✓ Salvata' : '✗ Ignorata'}
                </span>
                <button
                  type="button"
                  onClick={() => { setIdeas(prev => prev.filter(i => i.id !== idea.id)); setSelectedIdeas(prev => { const n = new Set(prev); n.delete(idea.id); return n; }); }}
                  className="text-gray-600 hover:text-red-400 transition-colors"
                  title="Rimuovi"
                >
                  <XIcon size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!generating && ideas.length === 0 && (
        <div className="card p-12 text-center">
          <Lightbulb size={48} className="mx-auto text-gray-700 mb-3" />
          <p className="text-gray-400 text-sm">Nessuna idea generata</p>
          <p className="text-gray-600 text-xs mt-1">Scegli la piattaforma, inserisci un topic e premi &quot;Genera idee&quot;</p>
        </div>
      )}

      {showBulkModal && (
        <BulkScopeModal
          tenants={tenants}
          onGlobal={handleGlobalApprove}
          onBulk={handleBulkApprove}
          onCancel={() => { setShowBulkModal(false); pendingIdeaRef.current = null; }}
          globalLabel="Salva senza cliente (globale)"
          globalDescription="La bozza non sarà associata a nessun cliente"
          bulkLabel={`Approva per tutti i clienti (${tenants.length})`}
          bulkWarning={`Verranno create ${tenants.length} bozze separate, una per ogni cliente.`}
          bulkConfirmLabel={`💾 Salva per ${tenants.length} clienti`}
        />
      )}
    </div>
  );
}

