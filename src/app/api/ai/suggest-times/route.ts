// src/app/api/ai/suggest-times/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { suggestBestTimes } from '@/lib/openai';
import { getTopPeakHours, getPeakHoursForDay } from '@/lib/peak-hours';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const niche = searchParams.get('niche') ?? undefined;
    const day = searchParams.get('day');
    const useAI = searchParams.get('ai') === 'true';

    let times;
    if (day !== null) {
      times = getPeakHoursForDay(parseInt(day));
    } else if (useAI && niche) {
      // Usa AI per suggerimenti specifici per niche
      const aiTimes = await suggestBestTimes(niche);
      times = aiTimes.map((t, i) => ({
        time: t,
        score: 10 - i,
        label: 'AI Suggestion',
        dayLabel: 'Tutti i giorni',
        reason: `Ottimale per il settore ${niche}`,
      }));
    } else {
      times = getTopPeakHours(8);
    }

    return NextResponse.json({ success: true, data: times });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Errore' },
      { status: 500 }
    );
  }
}

