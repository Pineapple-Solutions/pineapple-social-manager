// src/lib/ai-models.ts — Costanti condivise modelli AI (ai-providers + queue)

export const PROVIDER_INFO = {
  openai: {
    name: 'OpenAI', color: 'text-green-400 bg-green-400/10',
    models: [
      'o1-pro', 'o3', 'o4-mini', 'o3-mini', 'o1', 'o1-mini',
      'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
      'gpt-4o', 'gpt-4o-mini',
      'gpt-4-turbo', 'gpt-3.5-turbo',
    ],
    // Modelli per generazione IMMAGINI statiche
    imageModels: [
      'gpt-image-1',
      'dall-e-3',
      'dall-e-2',
    ],
    // Modelli per generazione VIDEO
    videoModels: [] as string[],
    docsUrl: 'https://platform.openai.com/api-keys',
    desc: 'o1-pro, o3, o4-mini, GPT-4.1',
  },
  anthropic: {
    name: 'Claude (Anthropic)', color: 'text-orange-400 bg-orange-400/10',
    models: [
      'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5',
      'claude-opus-4-5', 'claude-sonnet-4-5', 'claude-opus-4-0', 'claude-sonnet-4-0',
      'claude-3-7-sonnet-20250219', 'claude-3-5-haiku-20241022',
    ],
    imageModels: [] as string[],
    videoModels: [] as string[],
    docsUrl: 'https://console.anthropic.com/keys',
    desc: 'Claude Opus 4.7, Sonnet 4.6, Haiku 4.5',
  },
  google: {
    name: 'Google Gemini / Veo', color: 'text-blue-400 bg-blue-400/10',
    models: [
      'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-pro', 'gemini-3-flash',
      'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite',
      'gemini-2.0-flash', 'gemini-2.0-flash-lite',
      'gemini-1.5-pro', 'gemini-1.5-flash',
    ],
    // Modelli per generazione IMMAGINI statiche (gemini-image + imagen)
    // Nomi esatti come restituiti dall'API Google (usare /api/ai/providers/[id]/models per scoprirli)
    imageModels: [
      'gemini-2.5-flash-image',        // Nano Banana — 500 RPM, 2K/giorno ⭐
      'gemini-3.1-flash-image-preview', // Nano Banana 2 — 100 RPM, 1K/giorno
      'gemini-3-pro-image-preview',     // Nano Banana Pro — 20 RPM, 250/giorno
      'imagen-4.0-generate-001',
      'imagen-4.0-fast-generate-001',
      'imagen-4.0-ultra-generate-001',
    ],
    // Modelli per generazione VIDEO (Veo ONLY)
    // ✅ = confermati funzionanti via Gemini Developer API (generativelanguage.googleapis.com)
    // ⚠️  = preview/sperimentali — potrebbero richiedere accesso speciale o Vertex AI
    videoModels: [
      'veo-2.0-generate-001',          // ✅ Stabile
      'veo-3.0-generate-preview',      // ✅ Veo 3 preview (Gemini API)
      'veo-3.0-generate-001',          // ✅ Veo 3 stabile
      'veo-3.0-fast-generate-001',     // ✅ Veo 3 Fast stabile
      'veo-3.1-generate-preview',      // ⚠️ Potrebbe richiedere Vertex AI
      'veo-3.1-fast-generate-preview', // ⚠️ Potrebbe richiedere Vertex AI
      'veo-3.1-lite-generate-preview', // ⚠️ Potrebbe richiedere Vertex AI
    ],
    docsUrl: 'https://aistudio.google.com/app/apikey',
    desc: 'Gemini 3.5 Flash, 3.1 Pro, Imagen 4, Veo 3.1',
  },
} as const;


// Label leggibili per ogni modello
export const MODEL_LABELS: Record<string, string> = {
  // OpenAI — Reasoning
  'o1-pro':           'o1 Pro — Massima capacità (Mar 2025) ⭐',
  'o3':               'o3 — Ragionamento avanzato (Apr 2025)',
  'o4-mini':          'o4-mini — Ragionamento veloce (Apr 2025)',
  'o3-mini':          'o3-mini — Ragionamento economico (Gen 2025)',
  'o1':               'o1 — Ragionamento (Dic 2024)',
  'o1-mini':          'o1-mini — Ragionamento base',
  // OpenAI — GPT-4.1
  'gpt-4.1':          'GPT-4.1 — Flagship (Apr 2025) ⭐',
  'gpt-4.1-mini':     'GPT-4.1 Mini — Veloce & economico',
  'gpt-4.1-nano':     'GPT-4.1 Nano — Ultra veloce',
  // OpenAI — GPT-4o
  'gpt-4o':           'GPT-4o — Stabile',
  'gpt-4o-mini':      'GPT-4o Mini — Base',
  // OpenAI — Legacy
  'gpt-4-turbo':      'GPT-4 Turbo — (legacy)',
  'gpt-3.5-turbo':    'GPT-3.5 Turbo — (legacy)',
  // OpenAI — Image
  'gpt-image-1':      'gpt-image-1 — Immagini alta qualità (Apr 2025) ⭐',
  'dall-e-3':         'DALL-E 3 — Immagini (legacy)',
  'dall-e-2':         'DALL-E 2 — Immagini economico (legacy)',
  // Anthropic — Claude 4.x
  'claude-opus-4-7':              'Claude Opus 4.7 — Flagship ⭐',
  'claude-opus-4-6':              'Claude Opus 4.6',
  'claude-sonnet-4-6':            'Claude Sonnet 4.6 — Bilanciato',
  'claude-haiku-4-5':             'Claude Haiku 4.5 — Veloce',
  'claude-opus-4-5':              'Claude Opus 4.5',
  'claude-sonnet-4-5':            'Claude Sonnet 4.5',
  'claude-opus-4-0':              'Claude Opus 4.0 — Mag 2025',
  'claude-sonnet-4-0':            'Claude Sonnet 4.0 — Mag 2025',
  'claude-3-7-sonnet-20250219':   'Claude 3.7 Sonnet — Feb 2025',
  'claude-3-5-haiku-20241022':    'Claude 3.5 Haiku — Economico',
  // Google — Gemini 3.x
  'gemini-3.5-flash':             'Gemini 3.5 Flash — 1K RPM · 10K/giorno ⭐',
  'gemini-3.1-flash-lite':        'Gemini 3.1 Flash-Lite — 4K RPM · 150K/giorno 🚀',
  'gemini-3.1-pro':               'Gemini 3.1 Pro — 25 RPM · 250/giorno',
  'gemini-3-flash':               'Gemini 3 Flash — 1K RPM · 10K/giorno',
  // Google — Gemini 2.5
  'gemini-2.5-pro':               'Gemini 2.5 Pro — 150 RPM · 1K/giorno',
  'gemini-2.5-flash':             'Gemini 2.5 Flash — 1K RPM · 10K/giorno',
  'gemini-2.5-flash-lite':        'Gemini 2.5 Flash-Lite — 4K RPM · Illimitato',
  // Google — Gemini 2.0
  'gemini-2.0-flash':             'Gemini 2 Flash — 2K RPM · Illimitato',
  'gemini-2.0-flash-lite':        'Gemini 2 Flash-Lite — 4K RPM · Illimitato',
  // Google — Legacy
  'gemini-1.5-pro':               'Gemini 1.5 Pro — (legacy)',
  'gemini-1.5-flash':             'Gemini 1.5 Flash — (legacy)',
  // Google — Immagini Gemini (nomi esatti API)
  'gemini-2.5-flash-image':            'Nano Banana — Gemini 2.5 Flash Image · 500 RPM · 2K img/giorno ⭐',
  'gemini-3.1-flash-image-preview':    'Nano Banana 2 — Gemini 3.1 Flash Image · 100 RPM · 1K img/giorno',
  'gemini-3-pro-image-preview':        'Nano Banana Pro — Gemini 3 Pro Image · 20 RPM · 250 img/giorno',
  // Google — Imagen 4
  'imagen-4.0-generate-001':          'Imagen 4 — Alta qualità · 10 RPM · 70 img/giorno ⭐',
  'imagen-4.0-fast-generate-001':     'Imagen 4 Fast — Veloce · 10 RPM · 70 img/giorno',
  'imagen-4.0-ultra-generate-001':    'Imagen 4 Ultra — Massima qualità · 5 RPM · 30 img/giorno',
  // Google — Veo 3.1 (preview — potrebbe richiedere Vertex AI)
  'veo-3.1-generate-preview':         'Veo 3.1 — Video massima qualità ⚠️ (potrebbe richiedere Vertex AI)',
  'veo-3.1-fast-generate-preview':    'Veo 3.1 Fast — Video veloce ⚠️ (potrebbe richiedere Vertex AI)',
  'veo-3.1-lite-generate-preview':    'Veo 3.1 Lite — Video economico ⚠️ (potrebbe richiedere Vertex AI)',
  // Google — Veo 3.0 (stabile ✅)
  'veo-3.0-generate-preview':         'Veo 3 Preview — Video alta qualità ✅',
  'veo-3.0-generate-001':             'Veo 3 — Video stabile ✅ · 2 RPM · 10/giorno ⭐',
  'veo-3.0-fast-generate-001':        'Veo 3 Fast — Video veloce ✅ · 2 RPM · 10/giorno',
  // Google — Veo 2
  'veo-2.0-generate-001':             'Veo 2 — Video stabile ✅',
};

// Consumo relativo per modello (1× = ultra economico, 15× = massima potenza)
export const MODEL_COST: Record<string, number> = {
  'o1-pro': 15, 'o1': 10, 'o3': 9, 'o4-mini': 3, 'o3-mini': 3, 'o1-mini': 3,
  'gpt-4.1': 4, 'gpt-4.1-mini': 2, 'gpt-4.1-nano': 1,
  'gpt-4o': 4, 'gpt-4o-mini': 1, 'gpt-4-turbo': 9, 'gpt-3.5-turbo': 2,
  'gpt-image-1': 6, 'dall-e-3': 4, 'dall-e-2': 2,
  'claude-opus-4-7': 15, 'claude-opus-4-6': 14, 'claude-opus-4-5': 14, 'claude-opus-4-0': 10,
  'claude-sonnet-4-6': 10, 'claude-sonnet-4-5': 10, 'claude-sonnet-4-0': 5,
  'claude-3-7-sonnet-20250219': 5, 'claude-haiku-4-5': 2, 'claude-3-5-haiku-20241022': 1,
  'gemini-3.5-flash': 2, 'gemini-3.1-pro': 3, 'gemini-3.1-flash-lite': 1,
  'gemini-2.5-pro': 3, 'gemini-2.5-flash': 1, 'gemini-2.5-flash-lite': 1,
  'gemini-2.0-flash': 1, 'gemini-2.0-flash-lite': 1,
  'gemini-1.5-pro': 3, 'gemini-1.5-flash': 1,
  'gemini-3.1-flash-image-preview': 4, 'gemini-3-pro-image-preview': 5,
  'gemini-2.5-flash-image': 3,
  'gemini-2.0-flash-preview-image-generation': 2, 'gemini-2.0-flash-exp-image-generation': 2,
  'veo-3.1-generate-preview': 15, 'veo-3.1-fast-generate-preview': 12, 'veo-3.1-lite-generate-preview': 9,
  'veo-3.0-generate-001': 13, 'veo-3.0-fast-generate-001': 10,
  'veo-2.0-generate-001': 8,
  'imagen-4.0-generate-001': 4, 'imagen-4.0-ultra-generate-001': 6, 'imagen-4.0-fast-generate-001': 2,
};

export const MAX_COST = 15;

export function costBadgeClass(cost: number): string {
  const pct = cost / MAX_COST;
  if (pct <= 0.13) return 'bg-green-500/15 text-green-400 border-green-500/20';
  if (pct <= 0.27) return 'bg-teal-500/15 text-teal-400 border-teal-500/20';
  if (pct <= 0.47) return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
  if (pct <= 0.67) return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20';
  if (pct <= 0.87) return 'bg-orange-500/15 text-orange-400 border-orange-500/20';
  return 'bg-red-500/15 text-red-400 border-red-500/20';
}

/** Categorizza un nome modello nelle 4 categorie principali */
export function categorizeModel(m: string): 'gemini-image' | 'imagen' | 'video' | 'other' {
  if (m.startsWith('imagen-')) return 'imagen';
  if (m.startsWith('veo-') || m.includes('video')) return 'video';
  if (m.includes('image-generation') || m.includes('image-preview') || m.includes('image')) return 'gemini-image';
  return 'other';
}

/** Ritorna true se il modello è per generazione VIDEO (Veo) */
export function isVideoModel(m: string): boolean {
  return m.startsWith('veo-') || m.includes('video-generate');
}

/** Ritorna true se il modello è per generazione IMMAGINI statiche */
export function isImageModel(m: string): boolean {
  return m.startsWith('imagen-') || m.startsWith('dall-e') || m === 'gpt-image-1' ||
    m.includes('image-generation') || m.includes('image-preview');
}

