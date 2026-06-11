// src/components/ui/PlatformIcon.tsx
// Icone SVG ufficiali brand per Instagram, Facebook e TikTok

interface Props {
  platform: string;
  size?: number;
  className?: string;
}

/**
 * Renderizza l'icona ufficiale della piattaforma social.
 * Dimensione controllata via `size` (default 20px).
 */
export function PlatformIcon({ platform, size = 20, className = '' }: Props) {
  const p = platform.toUpperCase();
  if (p === 'INSTAGRAM') return <InstagramIcon size={size} className={className} />;
  if (p === 'FACEBOOK')  return <FacebookIcon  size={size} className={className} />;
  if (p === 'TIKTOK')    return <TikTokIcon    size={size} className={className} />;
  return <span style={{ fontSize: size * 0.8 }} className={className}>📱</span>;
}

// ─── Instagram ────────────────────────────────────────────────────────────────
// Sfondo gradiente ufficiale (arancio → rosa → viola) + icona fotocamera bianca

function InstagramIcon({ size, className }: { size: number; className: string }) {
  const inner = Math.round(size * 0.64);
  return (
    <div
      className={`flex-shrink-0 flex items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.24),
        background:
          'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)',
      }}
    >
      <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none">
        {/* Quadrato arrotondato */}
        <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" stroke="white" strokeWidth="2.1" />
        {/* Obiettivo */}
        <circle cx="12" cy="12" r="5" stroke="white" strokeWidth="2.1" />
        {/* Punto flash */}
        <circle cx="17.5" cy="6.5" r="1.5" fill="white" />
      </svg>
    </div>
  );
}

// ─── Facebook ─────────────────────────────────────────────────────────────────
// Percorso ufficiale Meta – include il cerchio blu + lettera "f" bianca ritagliata
// Fonte: Simple Icons (CC0) — https://simpleicons.org

const FB_PATH =
  'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 ' +
  '10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 ' +
  '1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328' +
  'l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z';

function FacebookIcon({ size, className }: { size: number; className: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#1877F2"
      className={`flex-shrink-0 rounded-[22%] ${className}`}
    >
      <path d={FB_PATH} />
    </svg>
  );
}

// ─── TikTok ───────────────────────────────────────────────────────────────────
// Tre layer sovrapposti (cyan + rosso + bianco) per l'effetto doppia-ombra del brand
// Percorso nota: Simple Icons (CC0) — https://simpleicons.org

const TT_PATH =
  'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 ' +
  '1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93' +
  '-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.1' +
  '-1.37-.05-2.71-.52-3.83-1.33-1.98-1.48-3.14-3.87-3.1-6.29.03-2.02.87-3.99 2.26-5.43' +
  ' 1.57-1.64 3.83-2.59 6.13-2.49v4.07c-.91-.35-1.93-.47-2.9-.26-.77.17-1.49.53-2.04 1.08' +
  '-1.09 1.07-1.69 2.61-1.61 4.14.07 1.54.86 3.01 2.09 3.92 1.14.83 2.63 1.14 4.02.84' +
  ' 1.35-.29 2.57-1.14 3.3-2.29.52-.82.76-1.82.72-2.82l.02-12.36z';

function TikTokIcon({ size, className }: { size: number; className: string }) {
  const inner = Math.round(size * 0.7);
  return (
    <div
      className={`flex-shrink-0 flex items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.24),
        backgroundColor: '#010101',
      }}
    >
      <svg width={inner} height={inner} viewBox="0 0 24 24">
        {/* Layer cyan (spostato a sinistra) */}
        <path d={TT_PATH} fill="#69C9D0" transform="translate(-1.2, 0)" />
        {/* Layer rosso (spostato a destra) */}
        <path d={TT_PATH} fill="#EE1D52" transform="translate(1.2, 0)" />
        {/* Layer bianco (principale) */}
        <path d={TT_PATH} fill="white" />
      </svg>
    </div>
  );
}

