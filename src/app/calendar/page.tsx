'use client';
// src/app/calendar/page.tsx — Calendario contenuti visivo (tenant-scoped)

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { getTypeIcon, getStatusColor, formatRelativeTime } from '@/lib/utils';
import { QuickCreateModal } from '@/components/content/QuickCreateModal';
import { TenantSelector } from '@/components/ui/TenantSelector';
import { SiteSelector } from '@/components/ui/SiteSelector';
import { useTenantFilter } from '@/lib/hooks/useTenantFilter';
import { useSiteFilter } from '@/lib/hooks/useSiteFilter';

interface CalendarPost {
  id: string; type: string; status: string;
  caption?: string; scheduledAt?: string;
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const { tenants, selectedTenant, setSelectedTenant, isMaster, showSelector, ready } = useTenantFilter();
  const { sites, selectedSite, setSelectedSite } = useSiteFilter(selectedTenant);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const fetchPosts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (selectedTenant) params.set('tenantId', selectedTenant);
      if (selectedSite) params.set('siteId', selectedSite);
      const res = await fetch(`/api/posts?${params}`);
      const json = await res.json();
      if (json.success) setPosts(json.data ?? []);
    } catch { /* ignore */ }
  }, [selectedTenant, selectedSite]);

  useEffect(() => {
    if (ready) fetchPosts();
  }, [fetchPosts, ready]);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const getPostsForDay = (day: number) => {
    return posts.filter(p => {
      if (!p.scheduledAt) return false;
      const d = new Date(p.scheduledAt);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header calendario */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <button onClick={prevMonth} className="btn-ghost w-8 h-8 p-0"><ChevronLeft size={16} /></button>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{MONTHS[month]} {year}</h2>
            <button onClick={nextMonth} className="btn-ghost w-8 h-8 p-0"><ChevronRight size={16} /></button>
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
            <button onClick={() => setCurrentDate(new Date())} className="btn-secondary text-xs">Oggi</button>
            <button onClick={() => setShowCreate(true)} className="btn-primary text-xs">
              <Plus size={13} /> Nuovo post
            </button>
          </div>
        </div>

        {/* Intestazioni giorni */}
        <div className="grid grid-cols-7 mb-2">
          {DAYS.map(d => (
            <div key={d} className="text-xs font-medium text-gray-500 text-center py-2">{d}</div>
          ))}
        </div>

        {/* Griglia giorni */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="h-24 rounded-xl" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayPosts = getPostsForDay(day);
            const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
            const isSelected = selectedDay === day;
            return (
              <div
                key={day}
                onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                className={`h-24 rounded-xl p-1.5 cursor-pointer transition-all ${
                  isToday ? 'bg-brand-500/20 border border-brand-500/40'
                  : isSelected ? 'bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600'
                  : 'bg-gray-100 dark:bg-gray-800/40 hover:bg-gray-200 dark:hover:bg-gray-800 border border-transparent'
                }`}
              >
                <div className={`text-xs font-medium mb-1 ${isToday ? 'text-brand-600 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400'}`}>{day}</div>
                <div className="space-y-0.5 overflow-hidden">
                  {dayPosts.slice(0, 3).map(post => (
                    <div key={post.id} className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-gray-300/60 dark:bg-gray-700/60 truncate">
                      <span className="text-xs">{getTypeIcon(post.type)}</span>
                      <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{post.caption?.slice(0, 12) ?? post.type}</span>
                    </div>
                  ))}
                  {dayPosts.length > 3 && (
                    <div className="text-xs text-gray-500 px-1">+{dayPosts.length - 3} altri</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dettaglio giorno selezionato */}
      {selectedDay && (
        <div className="card p-5">
          <h3 className="section-title mb-4">{selectedDay} {MONTHS[month]} {year}</h3>
          {getPostsForDay(selectedDay).length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <p className="text-sm">Nessun post per questo giorno</p>
              <button onClick={() => setShowCreate(true)} className="btn-primary text-xs mt-3">
                <Plus size={13} /> Aggiungi post
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {getPostsForDay(selectedDay).map(post => (
                <div key={post.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-100 dark:bg-gray-800/50">
                  <div className="text-2xl">{getTypeIcon(post.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`badge ${getStatusColor(post.status)} text-xs`}>{post.status}</span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 truncate mt-0.5">
                      {post.caption?.slice(0, 80) ?? 'Nessuna caption'}
                    </p>
                  </div>
                  <div className="text-xs text-gray-500">{formatRelativeTime(post.scheduledAt)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Legenda */}
      <div className="flex items-center gap-4 card p-4">
        <span className="text-xs text-gray-500">Legenda:</span>
        {(
          [
            { icon: '🖼️', label: 'Post' }, { icon: '📱', label: 'Story' },
            { icon: '🎬', label: 'Reel' }, { icon: '🎠', label: 'Carousel' },
          ]
        ).map(({ icon, label }) => (
          <div key={label} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            {icon} {label}
          </div>
        ))}
      </div>

      {showCreate && (
        <QuickCreateModal
          onClose={() => setShowCreate(false)}
          onSuccess={fetchPosts}
          tenantId={selectedTenant || undefined}
        />
      )}
    </div>
  );
}
