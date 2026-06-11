'use client';
// src/components/layout/Header.tsx

import { usePathname } from 'next/navigation';
import { Bell, RefreshCw, Menu, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/lib/theme';

const TITLES: Record<string, { title: string; desc: string }> = {
  '/': { title: 'Dashboard', desc: 'Panoramica attività e post schedulati' },
  '/posts': { title: 'Content Studio', desc: 'Gestisci post e genera contenuti con AI' },
  '/content': { title: 'Content Studio', desc: 'Gestisci post e genera contenuti con AI' },
  '/calendar': { title: 'Calendario Contenuti', desc: 'Pianifica e visualizza la tua strategia' },
  '/analytics': { title: 'Analytics', desc: 'Metriche e performance Instagram' },
  '/campaigns': { title: 'Campagne', desc: 'Gestisci campagne di marketing' },
  '/ideas': { title: 'Idee Contenuto', desc: "Idee generate dall'AI da approvare" },
  '/sites': { title: 'Siti Collegati', desc: 'Gestisci i siti da cui estrarre contenuto' },
  '/config': { title: 'Configurazione', desc: 'Impostazioni account e API' },
};

interface HeaderProps {
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const pathname = usePathname();
  const info = TITLES[pathname] ?? { title: 'Pineapple Social Manager', desc: '' };
  const { theme, resolvedTheme, toggle } = useTheme();

  const themeIcon = theme === 'light'
    ? <Sun className="w-4 h-4 text-secondary-400" />
    : theme === 'dark'
      ? <Moon className="w-4 h-4 text-brand-400" />
      : <Monitor className="w-4 h-4 text-gray-500 dark:text-gray-400" />;

  const themeLabel = theme === 'light'
    ? 'Tema chiaro — passa a scuro'
    : theme === 'dark'
      ? 'Tema scuro — passa ad automatico'
      : 'Tema automatico (sistema) — passa a chiaro';

  return (
    <header className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/50 backdrop-blur-sm flex-shrink-0 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger — visibile solo su mobile */}
        <button
          onClick={onMenuToggle}
          className="lg:hidden w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors flex-shrink-0"
          aria-label="Apri menu"
        >
          <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>

        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white truncate">{info.title}</h1>
          {info.desc && <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5 hidden sm:block truncate">{info.desc}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        {/* Status scheduler */}
        <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 rounded-full px-2.5 sm:px-3 py-1.5">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
          <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">Scheduler attivo</span>
        </div>

        {/* Toggle tema: light → dark → auto (sistema) */}
        <button
          onClick={toggle}
          className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
          title={themeLabel}
          aria-label="Cambia tema"
        >
          {themeIcon}
        </button>

        {/* Refresh */}
        <button
          onClick={() => window.location.reload()}
          className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
          title="Aggiorna"
        >
          <RefreshCw className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </button>

        {/* Notifiche */}
        <button className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors relative">
          <Bell className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-400" />
        </button>
      </div>
    </header>
  );
}
