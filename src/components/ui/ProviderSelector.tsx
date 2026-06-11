import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTenant } from '@/lib/hooks/useTenant';
import { AIProviderConfig } from '@prisma/client';

interface ProviderSelectorProps {
  value: string; // ID del provider selezionato
  onChange: (providerId: string) => void;
  contentType: 'image' | 'video' | 'text';
  className?: string;
}

export function ProviderSelector({ value, onChange, contentType, className }: ProviderSelectorProps) {
  const { tenant } = useTenant();
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);
  const [defaultProvider, setDefaultProvider] = useState<AIProviderConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProviders() {
      if (!tenant?.id) return;
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/ai/providers/list?tenantId=${tenant.id}&type=${contentType}`);
        const data = await res.json();
        if (data.success) {
          setProviders(data.data.providers);
          setDefaultProvider(data.data.defaultProvider);
          // Se il valore corrente non è tra i provider disponibili, imposta il default
          if (!data.data.providers.some((p: AIProviderConfig) => p.id === value)) {
            onChange(data.data.defaultProvider?.id ?? '');
          }
        } else {
          setError(data.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Errore nel caricamento dei provider');
      } finally {
        setIsLoading(false);
      }
    }
    fetchProviders();
  }, [tenant?.id, contentType, onChange, value]);

  if (isLoading) {
    return <Select disabled><SelectTrigger className={className}><SelectValue placeholder="Caricamento provider..." /></SelectTrigger></Select>;
  }

  if (error) {
    return <div className="text-red-500 text-sm">Errore: {error}</div>;
  }

  const options = providers.map(p => (
    <SelectItem key={p.id} value={p.id}>
      {p.isDefault ? 'Default: ' : ''}{p.provider} ({p.model})
      {p.tenantId === tenant?.id ? '' : ` (${tenant?.name})`}
    </SelectItem>
  ));

  return (
    <Select value={value} onValueChange={onChange} disabled={isLoading || providers.length === 0}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Seleziona provider AI" />
      </SelectTrigger>
      <SelectContent>
        {options}
      </SelectContent>
    </Select>
  );
}

