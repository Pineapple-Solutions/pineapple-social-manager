// src/lib/peak-hours.ts
// Calcola e suggerisce gli orari di punta per Instagram

import type { PeakHour, PeakHourSuggestion } from '@/types';

// Dataset basato su ricerche Instagram engagement (Europa/Italia)
const PEAK_HOURS_DATA: PeakHour[] = [
  // Lunedì
  { hour: 8, dayOfWeek: 1, score: 7.2, label: 'Mattina', reason: 'Utenti controllano feed prima del lavoro' },
  { hour: 12, dayOfWeek: 1, score: 8.1, label: 'Pranzo', reason: 'Pausa pranzo - alto traffico' },
  { hour: 17, dayOfWeek: 1, score: 7.8, label: 'Fine pomeriggio', reason: 'Fine giornata lavorativa' },
  { hour: 20, dayOfWeek: 1, score: 8.5, label: 'Sera', reason: 'Picco serale massimo engagement' },
  // Martedì
  { hour: 8, dayOfWeek: 2, score: 7.5, label: 'Mattina', reason: 'Check mattutino feed' },
  { hour: 12, dayOfWeek: 2, score: 8.3, label: 'Pranzo', reason: 'Pausa pranzo ottimale' },
  { hour: 17, dayOfWeek: 2, score: 8.0, label: 'Tardo pomeriggio', reason: 'Stacco lavorativo' },
  { hour: 20, dayOfWeek: 2, score: 8.8, label: 'Sera', reason: 'Picco massimo settimana' },
  // Mercoledì
  { hour: 9, dayOfWeek: 3, score: 7.0, label: 'Mattina', reason: 'Metà settimana - utenti attivi' },
  { hour: 12, dayOfWeek: 3, score: 8.0, label: 'Pranzo', reason: 'Pausa pranzo' },
  { hour: 18, dayOfWeek: 3, score: 8.2, label: 'Sera', reason: 'Pre-cena engagement alto' },
  { hour: 21, dayOfWeek: 3, score: 8.0, label: 'Notte', reason: 'Relax serale' },
  // Giovedì
  { hour: 8, dayOfWeek: 4, score: 7.3, label: 'Mattina', reason: 'Check mattutino' },
  { hour: 12, dayOfWeek: 4, score: 8.1, label: 'Pranzo', reason: 'Pausa pranzo' },
  { hour: 19, dayOfWeek: 4, score: 8.4, label: 'Sera', reason: 'Pre-weekend excitement' },
  { hour: 21, dayOfWeek: 4, score: 8.6, label: 'Serata', reason: 'Alto engagement pre-weekend' },
  // Venerdì
  { hour: 8, dayOfWeek: 5, score: 7.0, label: 'Mattina', reason: 'Inizio weekend mood' },
  { hour: 12, dayOfWeek: 5, score: 7.8, label: 'Pranzo', reason: 'Pausa pranzo venerdì' },
  { hour: 18, dayOfWeek: 5, score: 9.2, label: 'Aperitivo', reason: '🏆 Picco assoluto - inizio weekend' },
  { hour: 21, dayOfWeek: 5, score: 8.9, label: 'Sera', reason: 'Serata venerdì - massimo traffico' },
  // Sabato
  { hour: 10, dayOfWeek: 6, score: 8.8, label: 'Mattina tardi', reason: 'Weekend - utenti rilassati' },
  { hour: 13, dayOfWeek: 6, score: 8.5, label: 'Pranzo', reason: 'Pranzo sabato' },
  { hour: 18, dayOfWeek: 6, score: 9.0, label: 'Aperitivo', reason: 'Sabato sera - massimo social' },
  { hour: 21, dayOfWeek: 6, score: 8.7, label: 'Sera', reason: 'Serata del sabato' },
  // Domenica
  { hour: 10, dayOfWeek: 0, score: 8.3, label: 'Mattina', reason: 'Domenica rilassata - alto browsing' },
  { hour: 14, dayOfWeek: 0, score: 8.0, label: 'Pomeriggio', reason: 'Post pranzo domenica' },
  { hour: 20, dayOfWeek: 0, score: 8.4, label: 'Sera', reason: 'Pre-settimana - engagement recap' },
];

const DAY_LABELS: Record<number, string> = {
  0: 'Domenica', 1: 'Lunedì', 2: 'Martedì', 3: 'Mercoledì',
  4: 'Giovedì', 5: 'Venerdì', 6: 'Sabato',
};

export function getTopPeakHours(limit = 5): PeakHourSuggestion[] {
  return PEAK_HOURS_DATA
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((ph) => ({
      time: `${String(ph.hour).padStart(2, '0')}:00`,
      score: ph.score,
      label: ph.label,
      dayLabel: DAY_LABELS[ph.dayOfWeek],
      reason: ph.reason,
    }));
}

export function getPeakHoursForDay(dayOfWeek: number): PeakHourSuggestion[] {
  return PEAK_HOURS_DATA
    .filter((ph) => ph.dayOfWeek === dayOfWeek)
    .sort((a, b) => b.score - a.score)
    .map((ph) => ({
      time: `${String(ph.hour).padStart(2, '0')}:00`,
      score: ph.score,
      label: ph.label,
      dayLabel: DAY_LABELS[ph.dayOfWeek],
      reason: ph.reason,
    }));
}

export function getWeeklySchedule(
  postsPerDay: number,
  storiesPerDay: number,
  activeDays: number[] = [1, 2, 3, 4, 5, 6, 0]
): { day: number; dayLabel: string; times: string[]; types: string[] }[] {
  const schedule = [];

  for (const day of activeDays) {
    const dayPeaks = PEAK_HOURS_DATA
      .filter((ph) => ph.dayOfWeek === day)
      .sort((a, b) => b.score - a.score);

    const totalSlots = postsPerDay + storiesPerDay;
    const times: string[] = [];
    const types: string[] = [];

    for (let i = 0; i < Math.min(totalSlots, dayPeaks.length); i++) {
      const ph = dayPeaks[i];
      times.push(`${String(ph.hour).padStart(2, '0')}:00`);
      types.push(i < postsPerDay ? 'POST' : 'STORY');
    }

    schedule.push({ day, dayLabel: DAY_LABELS[day], times, types });
  }

  return schedule;
}

export function generateNextScheduledTimes(
  postsPerDay: number,
  storiesPerDay: number,
  preferredTimes: string[],
  timezone = 'Europe/Rome',
  daysAhead = 7
): Date[] {
  const times: Date[] = [];
  const now = new Date();

  for (let d = 0; d < daysAhead; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);

    const todayTimes = preferredTimes.length > 0 ? preferredTimes : getDefaultTimes(postsPerDay + storiesPerDay);

    for (const time of todayTimes) {
      const [h, m] = time.split(':').map(Number);
      const scheduled = new Date(date);
      scheduled.setHours(h, m, 0, 0);
      if (scheduled > now) {
        times.push(scheduled);
      }
    }
  }

  return times.sort((a, b) => a.getTime() - b.getTime());
}

function getDefaultTimes(count: number): string[] {
  const defaults = ['08:00', '12:00', '18:00', '20:00', '21:00'];
  return defaults.slice(0, count);
}

