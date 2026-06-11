'use client';
// src/components/ui/ScopeBanner.tsx — Banner scope tenant/sito riutilizzabile

import { Info } from 'lucide-react';
import type { TenantOption } from '@/lib/hooks/useTenantFilter';
import type { SiteOption } from '@/lib/hooks/useSiteFilter';

interface ScopeBannerProps {
  selectedTenant: string;
  tenants: TenantOption[];
  /** Messaggio aggiuntivo mostrato nel banner "tutti i clienti" */
  allClientsHint?: string;
  /** Messaggio aggiuntivo mostrato nel banner "cliente specifico" */
  specificClientHint?: string;
  /** Sito correntemente selezionato (opzionale) */
  selectedSite?: string;
  /** Lista siti disponibili (opzionale) */
  sites?: SiteOption[];
}

export function ScopeBanner({
  selectedTenant,
  tenants,
  allClientsHint = 'I nuovi contenuti non saranno associati a un cliente specifico (ti verrà chiesto prima di salvare)',
  specificClientHint = 'I contenuti creati saranno associati a questo cliente',
  selectedSite,
  sites,
}: ScopeBannerProps) {
  // Non mostrare nulla se c'è un solo tenant
  if (tenants.length <= 1) return null;

  const tenantName = selectedTenant ? tenants.find(t => t.id === selectedTenant)?.name : null;
  const siteName   = selectedSite && sites ? sites.find(s => s.id === selectedSite)?.name : null;
  const isAllClients = !tenantName;

  return (
    <div className={`rounded-xl px-4 py-2.5 flex items-center gap-3 text-sm border ${
      isAllClients
        ? 'bg-amber-500/8 border-amber-500/25'
        : 'bg-emerald-500/8 border-emerald-500/25'
    }`}>
      <span className="text-base flex-shrink-0">{isAllClients ? '🌐' : '✓'}</span>
      <div className="flex items-center gap-2 flex-wrap flex-1">
        {isAllClients ? (
          <>
            <span className="text-amber-400 font-medium">Tutti i clienti ({tenants.length})</span>
            {siteName
              ? <span className="text-gray-400">/ {siteName}</span>
              : sites && sites.length > 0 && (
                  <span className="text-gray-500">/ Tutti i siti ({sites.length})</span>
                )
            }
            <span className="text-gray-500 text-xs">— {allClientsHint}</span>
          </>
        ) : (
          <>
            <span className="text-emerald-400 font-medium">{tenantName}</span>
            {siteName
              ? <span className="text-gray-400">/ {siteName}</span>
              : sites && sites.length > 0 && <span className="text-gray-500">/ Tutti i siti</span>
            }
            <span className="text-gray-500 text-xs">— {specificClientHint}</span>
          </>
        )}
      </div>
      <Info size={13} className={`flex-shrink-0 ${isAllClients ? 'text-amber-500' : 'text-emerald-600'}`} />
    </div>
  );
}

