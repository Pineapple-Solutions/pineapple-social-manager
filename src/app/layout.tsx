// src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'Pineapple Social Manager',
  description: 'AI-powered Social Media Manager',
  // favicon: Next.js rileva automaticamente src/app/icon.png
};

// Script inline per prevenire il flash di tema errato (FOUC)
const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('psm-theme');
    var isDark = t === 'dark' || ((!t || t === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  } catch(e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <head>
        {/* Anti-flash: applica il tema prima del primo paint */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100" suppressHydrationWarning>
        <AppShell>{children}</AppShell>
        <ToastProvider />
      </body>
    </html>
  );
}
