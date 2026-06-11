'use client';
// src/components/layout/Sidebar.tsx — responsive mobile drawer + desktop fixed

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard, Bot, Calendar, BarChart3, Settings,
  Zap, Globe, Users, Building2,
  Video, MessageSquare, Brain, LogOut, Shield, ImagePlay, ListVideo, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';

interface AuthUser {
  id: string; email: string; name: string; role: string;
  tenantId: string | null; tenantSlug: string | null;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const NAV_ITEMS = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard', section: 'main' },
  { href: '/posts', icon: Bot, label: 'Content Studio', section: 'main' },
  { href: '/calendar', icon: Calendar, label: 'Calendario', section: 'main' },
  { href: '/analytics', icon: BarChart3, label: 'Analytics', section: 'main' },
  { href: '/campaigns', icon: Zap, label: 'Campagne', section: 'main' },
  { href: '/video', icon: Video, label: 'Video AI', section: 'media' },
  { href: '/media', icon: ImagePlay, label: 'Libreria Media', section: 'media' },
  { href: '/queue', icon: ListVideo, label: 'Coda Generazione', section: 'media' },
  { href: '/sites', icon: Globe, label: 'Siti Collegati', section: 'media' },
  { href: '/prompts', icon: MessageSquare, label: 'Regole Prompt', section: 'settings' },
  { href: '/ai-providers', icon: Brain, label: 'Provider AI', section: 'settings' },
  { href: '/users', icon: Users, label: 'Utenti', section: 'settings', roles: ['master', 'admin'] },
  { href: '/tenants', icon: Building2, label: 'Clienti', section: 'settings', roles: ['master'] },
  { href: '/config', icon: Settings, label: 'Configurazione', section: 'settings' },
];

const SECTION_LABELS: Record<string, string> = {
  main: 'Contenuti',
  media: 'Media',
  settings: 'Impostazioni',
};

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [queueBadge, setQueueBadge] = useState<{ active: number; failed: number } | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const json = await res.json();
      if (json.success) setUser(json.data);
    } catch {}
  }, []);

  const fetchQueueBadge = useCallback(async () => {
    try {
      const res = await fetch('/api/generation-queue?limit=1');
      const json = await res.json();
      if (json.success && json.summary) {
        const { PENDING, PROCESSING, WAITING_TOKENS, MANUAL_UPLOAD, FAILED } = json.summary;
        setQueueBadge({
          active: (PENDING ?? 0) + (PROCESSING ?? 0) + (WAITING_TOKENS ?? 0) + (MANUAL_UPLOAD ?? 0),
          failed: FAILED ?? 0,
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchUser();
    fetchQueueBadge();
    const t = setInterval(fetchQueueBadge, 60_000);
    window.addEventListener('session-refreshed', fetchUser);
    return () => {
      clearInterval(t);
      window.removeEventListener('session-refreshed', fetchUser);
    };
  }, [fetchUser, fetchQueueBadge]);

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const sections = ['main', 'media', 'settings'];

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.roles) return true;
    if (!user) return false;
    return item.roles.includes(user.role);
  });

  const logoSrc = resolvedTheme === 'dark'
    ? '/logo/logo-pineapple-social-manager-h-white.svg'
    : '/logo/logo-pineapple-social-manager-h.svg';

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col border-r h-full',
        'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800',
        'w-[260px] flex-shrink-0',
        'transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : '-translate-x-full',
        'lg:relative lg:translate-x-0',
      )}
    >
      {/* Header sidebar: logo centrato + pulsante chiudi (solo mobile) */}
      <div className="relative flex items-center justify-center px-4 py-5 border-b border-gray-200 dark:border-gray-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          alt="Pineapple Social Manager"
          width={180}
          height={52}
          style={{ objectFit: 'contain', display: 'block', margin: '0 auto' }}
        />
        {/* Pulsante X visibile solo su mobile */}
        <button
          onClick={onClose}
          className="lg:hidden absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Chiudi menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Tenant badge */}
      {user?.tenantSlug && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-brand-500/10 border border-brand-500/20">
          <div className="flex items-center gap-2">
            <Building2 size={13} className="text-brand-500 dark:text-brand-400" />
            <span className="text-xs text-brand-600 dark:text-brand-300 font-medium truncate">{user.tenantSlug}</span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-3">
        {sections.map((section) => {
          const items = visibleItems.filter((i) => i.section === section);
          if (!items.length) return null;
          return (
            <div key={section}>
              <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wider">
                {SECTION_LABELS[section]}
              </div>
              <div className="space-y-0.5">
                {items.map(({ href, icon: Icon, label }) => {
                  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
                  const isQueue = href === '/queue';
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                        isActive
                          ? 'bg-brand-500/10 dark:bg-brand-500/15 text-brand-600 dark:text-brand-400 border border-brand-500/25 dark:border-brand-500/20'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                      )}
                    >
                      <Icon
                        className={cn('flex-shrink-0', isActive ? 'text-brand-500 dark:text-brand-400' : 'text-gray-400 dark:text-gray-500')}
                        size={17}
                      />
                      <span className="flex-1">{label}</span>
                      {isQueue && queueBadge && queueBadge.failed > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-500 dark:text-red-400 min-w-[18px] text-center leading-none">
                          {queueBadge.failed}
                        </span>
                      )}
                      {isQueue && queueBadge && queueBadge.failed === 0 && queueBadge.active > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 min-w-[18px] text-center leading-none">
                          {queueBadge.active}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer: utente + logout */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-1">
        {user && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800/50">
            <div className="w-8 h-8 rounded-full ig-gradient flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">{user.name?.[0]?.toUpperCase() ?? 'U'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{user.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-500 truncate flex items-center gap-1">
                {user.role === 'master' && <Shield size={10} className="text-yellow-500 dark:text-yellow-400" />}
                {user.role}
              </div>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/5 transition-colors"
        >
          <LogOut size={14} />
          {loggingOut ? 'Uscita...' : 'Esci'}
        </button>
        <div className="px-3">
          <div className="text-xs text-gray-400 dark:text-gray-700 text-center">Pineapple Social Manager v2.1 · AI-powered</div>
        </div>
      </div>
    </aside>
  );
}
