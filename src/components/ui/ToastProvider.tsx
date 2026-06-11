'use client';
// src/components/ui/ToastProvider.tsx

import { Toaster } from 'react-hot-toast';

export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: '#1f2937',
          color: '#f3f4f6',
          border: '1px solid #374151',
          borderRadius: '12px',
          fontSize: '14px',
        },
        success: {
          iconTheme: { primary: '#f79009', secondary: '#1f2937' },
        },
        error: {
          iconTheme: { primary: '#ef4444', secondary: '#1f2937' },
        },
        duration: 4000,
      }}
    />
  );
}

