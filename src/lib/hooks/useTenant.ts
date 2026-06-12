'use client';
// src/lib/hooks/useTenant.ts — Hook per ottenere il tenant corrente dell'utente autenticato

import { useState, useEffect } from 'react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

export function useTenant() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchTenant() {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.success && data.data?.tenantId) {
          const tenantRes = await fetch(`/api/tenants/${data.data.tenantId}`);
          const tenantData = await tenantRes.json();
          if (tenantData.success) {
            setTenant(tenantData.data);
          }
        }
      } catch {
        // ignore errors
      } finally {
        setIsLoading(false);
      }
    }
    fetchTenant();
  }, []);

  return { tenant, isLoading };
}

