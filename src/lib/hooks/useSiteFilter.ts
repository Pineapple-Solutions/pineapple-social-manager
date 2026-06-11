'use client';
// src/lib/hooks/useSiteFilter.ts — Hook riusabile per filtrare dati per sito (con persistenza cookie)

import { useState, useEffect, useCallback } from 'react';
import { getCookie, setCookie, deleteCookie, COOKIE_SITE } from '@/lib/cookies';

export interface SiteOption {
  id: string;
  name: string;
  url: string;
  tenantId: string | null;
}

/**
 * Carica i siti disponibili per il tenant selezionato (o tutti i tenant se '').
 * Il sito selezionato viene persistito in un cookie e ripristinato automaticamente
 * se ancora disponibile nel contesto corrente (tenant).
 */
export function useSiteFilter(selectedTenant: string) {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSite, setSelectedSiteState] = useState('');
  const [loadingSites, setLoadingSites] = useState(false);

  useEffect(() => {
    setLoadingSites(true);
    const params = new URLSearchParams();
    if (selectedTenant) params.set('tenantId', selectedTenant);
    const url = `/api/sites${params.toString() ? '?' + params : ''}`;

    fetch(url)
      .then(r => r.json())
      .then(json => {
        const siteList: SiteOption[] = json.success ? (json.data ?? []) : [];
        setSites(siteList);

        // ── Ripristina sito salvato nel cookie (se valido nel contesto corrente) ──
        const saved = getCookie(COOKIE_SITE);
        if (saved && siteList.some(s => s.id === saved)) {
          // Sito valido per il tenant corrente → ripristina
          setSelectedSiteState(saved);
        } else {
          // Sito non disponibile in questo contesto → resetta
          setSelectedSiteState('');
          if (saved) deleteCookie(COOKIE_SITE); // cancella solo se c'era un valore non valido
        }
        // ─────────────────────────────────────────────────────────────────────────
      })
      .catch(() => {
        setSites([]);
        setSelectedSiteState('');
      })
      .finally(() => setLoadingSites(false));
  }, [selectedTenant]);

  /** Cambia il sito selezionato e lo persiste nel cookie */
  const setSelectedSite = useCallback((id: string) => {
    setSelectedSiteState(id);
    if (id) {
      setCookie(COOKIE_SITE, id);
    } else {
      deleteCookie(COOKIE_SITE); // '' = deseleziona → rimuovi cookie
    }
  }, []);

  const siteParam = selectedSite ? `&siteId=${selectedSite}` : '';

  return { sites, selectedSite, setSelectedSite, loadingSites, siteParam };
}
