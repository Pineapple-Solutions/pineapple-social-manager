// src/components/ui/TypePicker.tsx
// Componente pill-tab riutilizzabile per selezionare un tipo (AI tab, post format, ecc.)
import React from 'react';
import { cn } from '@/lib/utils';

export interface TypePickerItem<T extends string = string> {
  value: T;
  label: string;
  /** Emoji string oppure elemento React (es. icona Lucide) */
  icon?: React.ReactNode;
}

interface TypePickerProps<T extends string = string> {
  items: TypePickerItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** Se true il wrapper ha il background card; default true */
  withCard?: boolean;
}

export function TypePicker<T extends string = string>({
  items,
  value,
  onChange,
  className,
  withCard = true,
}: TypePickerProps<T>) {
  return (
    <div
      className={cn(
        'flex flex-wrap gap-1',
        withCard && 'card p-1',
        className,
      )}
    >
      {items.map(({ value: itemValue, label, icon }) => (
        <button
          key={itemValue}
          type="button"
          onClick={() => onChange(itemValue)}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all',
            value === itemValue
              ? 'bg-brand-500 text-white shadow'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800',
          )}
        >
          {icon && <span className="flex items-center leading-none">{icon}</span>}
          {label}
        </button>
      ))}
    </div>
  );
}

