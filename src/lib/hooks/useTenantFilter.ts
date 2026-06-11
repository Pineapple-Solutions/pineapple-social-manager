'use client';
// src/lib/hooks/useTenantFilter.ts — Hook riusabile per filtrare dati per tenant (con persistenza cookie)

import { useState, useEffect, useCallback } from 'react';
import { getCookie, setCookie, deleteCookie, COOKIE_TENANT } from '@/lib/cookies';

export interface TenantOption { id: string; name: string; slug: string; }
export interface TenantFilterUser { role: string; tenantId: string | null; }

export function useTenantFilter() {
  const [currentUser, setCurrentUser] = useState<TenantFilterUser | null>(null);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [selectedTenant, setSelectedTenantState] = useState(''); // '' = tutti i tenant visibili
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me').then(r => r.json()),
      fetch('/api/tenants').then(r => r.json()),
    ]).then(([userJson, tenantsJson]) => {
      if (userJson.success) setCurrentUser(userJson.data);
      const tenantList: TenantOption[] = tenantsJson.success ? (tenantsJson.data ?? []) : [];
      setTenants(tenantList);

      // ── Ripristina tenant salvato nel cookie ──────────────────────────────
      const saved = getCookie(COOKIE_TENANT);
      if (saved && tenantList.some(t => t.id === saved)) {
        // Valore valido → ripristina
        setSelectedTenantState(saved);
      } else if (saved) {
        // Tenant non esiste più (es. eliminato) → cancella cookie
        deleteCookie(COOKIE_TENANT);
      }
      // Se saved === '' non facciamo nulla (rimane '')
      // ─────────────────────────────────────────────────────────────────────

      setReady(true);
    }).catch(() => setReady(true));
  }, []);

  /** Cambia il tenant selezionato e lo persiste nel cookie */
  const setSelectedTenant = useCallback((id: string) => {
    setSelectedTenantState(id);
    setCookie(COOKIE_TENANT, id);
  }, []);

  const isMaster = currentUser?.role === 'master';
  // Mostra il selettore solo se ci sono più tenant disponibili
  const showSelector = tenants.length > 1;
  // Query param da appendere alle chiamate API (con & per aggiungerlo facilmente)
  const tenantParam = selectedTenant ? `&tenantId=${selectedTenant}` : '';

  return {
    currentUser,
    tenants,
    selectedTenant,
    setSelectedTenant,
    isMaster,
    showSelector,
    ready,
    tenantParam,
  };
}
