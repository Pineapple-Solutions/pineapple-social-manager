'use client';
// src/components/ui/TenantSelector.tsx — Selettore tenant riusabile

import { Building2 } from 'lucide-react';

interface TenantOption { id: string; name: string; }

interface TenantSelectorProps {
  tenants: TenantOption[];
  value: string;
  onChange: (id: string) => void;
  isMaster: boolean;
  className?: string;
}

export function TenantSelector({
  tenants, value, onChange, className = '',
}: TenantSelectorProps) {
  if (tenants.length <= 1) return null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Building2 size={14} className="text-gray-500 flex-shrink-0" />
      <select
        className="select text-sm min-w-[160px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">🌐 Tutti i clienti</option>
        {tenants.map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </div>
  );
}

