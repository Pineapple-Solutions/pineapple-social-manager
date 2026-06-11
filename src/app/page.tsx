'use client';
// src/app/page.tsx — Dashboard principale

import { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, Clock, CheckCircle2, AlertCircle,
  FileEdit, Users, Zap, Image, Share2, RefreshCw, Plus
} from 'lucide-react';
import Link from 'next/link';
import { formatNumber, formatRelativeTime, getTypeIcon, getTypeLabel, getStatusLabel, getStatusColor, getPlatformIcon, cn } from '@/lib/utils';
import { PeakHoursCard } from '@/components/dashboard/PeakHoursCard';
import { QuickCreateModal } from '@/components/content/QuickCreateModal';
import { TenantSelector } from '@/components/ui/TenantSelector';
import { SiteSelector } from '@/components/ui/SiteSelector';
import { useTenantFilter } from '@/lib/hooks/useTenantFilter';
import { useSiteFilter } from '@/lib/hooks/useSiteFilter';

interface DashboardData {
  totalScheduled: number;
  publishedToday: number;
  pendingApproval: number;
  failedPosts: number;
  totalFollowers: number;
  followersGrowth: number;
  avgEngagementRate: number;
  postsThisWeek: number;
  storiesThisWeek: number;
  platformsConnected?: { instagram: boolean; facebook: boolean; tiktok: boolean };
  account?: { username: string; profilePicture?: string };
  recentPosts?: Array<{
    id: string; type: string; status: string; caption?: string;
    scheduledAt?: string; publishedAt?: string; platform?: string;
  }>;
}

function StatCard({
  icon: Icon, label, value, sub, trend, color = 'brand',
}: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; trend?: number; color?: string;
}) {
  const colors: Record<string, string> = {
    brand: 'text-brand-400 bg-brand-400/10',
    blue: 'text-blue-400 bg-blue-400/10',
    green: 'text-green-400 bg-green-400/10',
    red: 'text-red-400 bg-red-400/10',
    purple: 'text-purple-400 bg-purple-400/10',
    yellow: 'text-yellow-400 bg-yellow-400/10',
  };
  return (
    <div className="stat-card animate-slide-up">
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
          <Icon size={20} />
        </div>
        {trend !== undefined && (
          <span className={cn('flex items-center gap-0.5 text-xs font-medium', trend >= 0 ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
            {trend >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
        <div className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const { tenants, selectedTenant, setSelectedTenant, isMaster, showSelector, ready } = useTenantFilter();
  const { sites, selectedSite, setSelectedSite } = useSiteFilter(selectedTenant);

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedTenant) params.set('tenantId', selectedTenant);
      if (selectedSite) params.set('siteId', selectedSite);
      const qs = params.toString() ? '?' + params : '';
      const res = await fetch(`/api/dashboard/stats${qs}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedTenant, selectedSite]);

  useEffect(() => {
    if (ready) {
      fetchStats();
      const interval = setInterval(fetchStats, 30000);
      return () => clearInterval(interval);
    }
  }, [fetchStats, ready]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="stat-card">
            <div className="w-10 h-10 rounded-xl shimmer" />
            <div className="space-y-2 mt-2">
              <div className="h-7 w-16 shimmer rounded" />
              <div className="h-3 w-24 shimmer rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Buongiorno! 👋
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {data?.account?.username
              ? `@${data.account.username} • ${new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}`
              : new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
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
          <button onClick={fetchStats} className="btn-ghost text-xs">
            <RefreshCw size={14} />
            Aggiorna
          </button>
          <button onClick={() => setShowQuickCreate(true)} className="btn-primary">
            <Plus size={16} />
            Nuovo Post
          </button>
        </div>
      </div>

      {/* Banner account non configurati */}
      {data && !data.platformsConnected?.instagram && !data.platformsConnected?.facebook && !data.platformsConnected?.tiktok && (
        <div className="card border-brand-500/30 bg-brand-500/5 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center flex-shrink-0">
            <Share2 size={20} className="text-brand-400" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-900 dark:text-white">Nessun account social configurato</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Collega Instagram, Facebook o TikTok per iniziare a pubblicare</div>
          </div>
          <Link href="/config" className="btn-primary text-xs">
            Configura ora
          </Link>
        </div>
      )}
      {data?.platformsConnected && (data.platformsConnected.instagram || data.platformsConnected.facebook || data.platformsConnected.tiktok) && (
        <div className="flex items-center gap-2 flex-wrap">
          {data.platformsConnected.instagram && <span className="badge bg-pink-100 dark:bg-pink-500/10 text-pink-600 dark:text-pink-400 text-xs">📸 Instagram connesso</span>}
          {data.platformsConnected.facebook && <span className="badge bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs">🔵 Facebook connesso</span>}
          {data.platformsConnected.tiktok && <span className="badge bg-cyan-100 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-xs">🎵 TikTok connesso</span>}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Clock} label="Post schedulati" value={data?.totalScheduled ?? 0} color="blue" />
        <StatCard icon={CheckCircle2} label="Pubblicati oggi" value={data?.publishedToday ?? 0} color="green" />
        <StatCard icon={FileEdit} label="Bozze pendenti" value={data?.pendingApproval ?? 0} color="yellow" />
        <StatCard icon={AlertCircle} label="Errori" value={data?.failedPosts ?? 0} color="red" />
        <StatCard
          icon={Users} label="Follower totali"
          value={formatNumber(data?.totalFollowers ?? 0)}
          trend={data?.followersGrowth}
          color="purple"
        />
        <StatCard icon={Zap} label="Engagement rate" value={`${(data?.avgEngagementRate ?? 0).toFixed(1)}%`} color="brand" />
        <StatCard icon={Image} label="Post questa settimana" value={data?.postsThisWeek ?? 0} color="blue" />
        <StatCard icon={Share2} label="Storie questa settimana" value={data?.storiesThisWeek ?? 0} color="purple" />
      </div>

      {/* Content area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Prossimi post */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">Prossime pubblicazioni</h3>
            <Link href="/posts" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
              Vedi tutti →
            </Link>
          </div>

          {!data?.recentPosts?.length ? (
            <div className="text-center py-10 text-gray-500">
              <Clock size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nessun post schedulato</p>
              <Link href="/posts" className="btn-primary text-xs mt-3 inline-flex">
                <Plus size={14} /> Crea il primo post
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {data.recentPosts.map((post) => (
                <div key={post.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-100 dark:bg-gray-800/50 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                  <div className="text-2xl">{getTypeIcon(post.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{getTypeLabel(post.type)}</span>
                      <span className={`badge ${getStatusColor(post.status)}`}>{getStatusLabel(post.status)}</span>
                      {post.platform && post.platform !== 'INSTAGRAM' && (
                        <span className="text-xs text-gray-500">{getPlatformIcon(post.platform)}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {post.caption?.slice(0, 60) ?? 'Nessuna caption'}
                    </p>
                  </div>
                  <div className="text-xs text-gray-500 text-right flex-shrink-0">
                    {formatRelativeTime(post.scheduledAt ?? post.publishedAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Orari di punta */}
        <PeakHoursCard />
      </div>

      {/* Quick actions */}
      <div className="card p-5">
        <h3 className="section-title mb-4">Azioni rapide</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            { href: '/posts', icon: '🤖', label: 'Content Studio', desc: 'Post, AI generator, bozze' },
            { href: '/calendar', icon: '📅', label: 'Pianifica', desc: 'Calendario contenuti' },
            { href: '/analytics', icon: '📊', label: 'Analytics', desc: 'Metriche e insight' },
            { href: '/config', icon: '⚙️', label: 'Impostazioni', desc: 'Account e scheduler' },
          ]).map(({ href, icon, label, desc }) => (
            <Link
              key={href}
              href={href}
              className="card-hover p-4 flex flex-col gap-2 cursor-pointer"
            >
              <div className="text-2xl">{icon}</div>
              <div>
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</div>
                <div className="text-xs text-gray-500">{desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {showQuickCreate && (
        <QuickCreateModal
          onClose={() => setShowQuickCreate(false)}
          onSuccess={fetchStats}
          tenantId={selectedTenant || undefined}
        />
      )}
    </div>
  );
}
