'use client';
// src/components/ui/SiteSelector.tsx — Selettore sito riusabile

import { Globe } from 'lucide-react';
import type { SiteOption } from '@/lib/hooks/useSiteFilter';

interface SiteSelectorProps {
  sites: SiteOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export function SiteSelector({ sites, value, onChange, className = '' }: SiteSelectorProps) {
  if (sites.length === 0) return null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Globe size={14} className="text-gray-500 flex-shrink-0" />
      <select
        className="select text-sm min-w-[150px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">🌐 Tutti i siti</option>
        {sites.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}

