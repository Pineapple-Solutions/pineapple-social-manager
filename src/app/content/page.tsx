'use client';
// src/app/content/page.tsx — Reindirizza al Content Studio unificato

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ContentRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/posts');
  }, [router]);
  return (
    <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
      Reindirizzamento...
    </div>
  );
}
