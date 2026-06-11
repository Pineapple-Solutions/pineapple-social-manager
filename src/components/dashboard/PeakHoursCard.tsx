'use client';
// src/components/dashboard/PeakHoursCard.tsx

import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { PeakHourSuggestion } from '@/types';

export function PeakHoursCard() {
  const [peaks, setPeaks] = useState<PeakHourSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ai/suggest-times')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setPeaks(json.data.slice(0, 6));
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={18} className="text-brand-400" />
        <h3 className="section-title">Orari di punta</h3>
      </div>
      <p className="text-xs text-gray-500 mb-4">Migliori momenti per pubblicare su Instagram (Italia)</p>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 shimmer rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {peaks.map((peak, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-100 dark:bg-gray-800/50">
              <div className="w-12 text-center">
                <div className="text-sm font-bold text-gray-900 dark:text-white">{peak.time}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{peak.dayLabel}</span>
                  <span className="text-xs text-brand-600 dark:text-brand-400 font-bold">{peak.score.toFixed(1)}★</span>
                </div>
                <div className="mt-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-gradient rounded-full"
                    style={{ width: `${(peak.score / 10) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-600 mt-3 text-center">
        💡 Basato su dati engagement europei
      </p>
    </div>
  );
}

