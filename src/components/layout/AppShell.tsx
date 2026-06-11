'use client';
// src/components/layout/AppShell.tsx
import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ThemeProvider } from '@/lib/theme';

const NO_SHELL_PATHS = ['/login'];

async function refreshSession() {
  try {
    const res = await fetch('/api/auth/refresh');
    if (!res.ok) return;
    const json = await res.json();
    if (json.success && json.changed) {
      window.dispatchEvent(new Event('session-refreshed'));
    }
  } catch {}
}

let schedulerBooted = false;
async function ensureScheduler() {
  if (schedulerBooted) return;
  schedulerBooted = true;
  try { await fetch('/api/scheduler/init'); } catch {}
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const noShell = NO_SHELL_PATHS.some((p) => pathname.startsWith(p));
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Chiudi sidebar mobile al cambio pagina
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // Blocca scroll body quando sidebar mobile è aperta
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  const handleToggle = useCallback(() => setSidebarOpen(v => !v), []);
  const handleClose  = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (noShell) return;
    ensureScheduler();
    refreshSession();
    const onFocus   = () => refreshSession();
    const onVisible = () => { if (document.visibilityState === 'visible') refreshSession(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [noShell]);

  if (noShell) return <ThemeProvider>{children}</ThemeProvider>;

  return (
    <ThemeProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Backdrop mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            onClick={handleClose}
            aria-hidden="true"
          />
        )}

        <Sidebar isOpen={sidebarOpen} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Header onMenuToggle={handleToggle} />
          <main className="flex-1 overflow-y-auto p-3 sm:p-6 bg-gray-50 dark:bg-gray-950 bg-grid">
            {children}
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
}
