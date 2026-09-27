// Pure logic for the Schedule section: no React, no network. Mirrors the
// style of discoverEngine.js.

/** Runtime in minutes, defaulting to 2h for movies TMDB didn't give one for. */
export function runtimeOf(movie) {
  const rt = Number(movie?.runtime);
  return rt > 0 ? rt : 120;
}

export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  if (rest === 0) return `${h}h`;
  return `${h}h ${rest}m`;
}

export function formatTime(date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDayLabel(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "2026-10-10" from a Date, in local time (not UTC, so the day never shifts). */
export function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "14:00" from a Date, in local time. */
export function toTimeInputValue(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Combine a "YYYY-MM-DD" and "HH:MM" pair (as produced by <input date>/<input time>) into a local Date. */
export function combineDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return null;
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

/** Combine a start Date with an "HH:MM" end-of-day time (as from <input time>)
 * into a full end Date — rolling over to the next day if that time is at or
 * before the start (e.g. an 11pm start with a 2h runtime ending "01:00"). */
export function combineEndTime(start, endTimeStr) {
  if (!start || !endTimeStr) return null;
  const [h, mi] = endTimeStr.split(':').map(Number);
  if ([h, mi].some((n) => Number.isNaN(n))) return null;
  let end = new Date(start);
  end.setHours(h, mi, 0, 0);
  if (end <= start) end = addMinutes(end, 24 * 60);
  return end;
}

/** Default start time for a freshly-dropped or freshly-opened schedule slot: next 7 PM. */
export function defaultStartTime(date = new Date()) {
  const d = new Date(date);
  d.setHours(19, 0, 0, 0);
  return d;
}

/** One distinct movie per key, deduped the same way Discover dedups list items. */
export function buildMovieOptions(items) {
  const byKey = new Map();
  for (const item of items) {
    const movie = item.movie;
    if (!movie) continue;
    const key = movie.tmdb_id || movie.id;
    if (!byKey.has(key)) byKey.set(key, movie);
  }
  return [...byKey.values()].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
}

/** Map a backend ScheduledWatch record into the shape our calendar components use. */
export function toEventRecord(watch) {
  return {
    id: watch.id,
    movie: watch.movie,
    start: new Date(watch.start_time),
    end: new Date(watch.end_time),
    notes: watch.notes || '',
    isWatched: Boolean(watch.is_watched),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Group events into Overdue / Today / This week / Next week / Later buckets for the agenda view. */
export function groupForAgenda(events) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfWeek = new Date(startOfToday.getTime() + (7 - startOfToday.getDay()) * DAY_MS);
  const endOfNextWeek = new Date(endOfWeek.getTime() + 7 * DAY_MS);

  const buckets = [
    { key: 'overdue', label: 'Needs a new time', items: [] },
    { key: 'today', label: 'Today', items: [] },
    { key: 'week', label: 'This week', items: [] },
    { key: 'nextWeek', label: 'Next week', items: [] },
    { key: 'later', label: 'Later', items: [] },
  ];

  const sorted = [...events].sort((a, b) => a.start - b.start);
  for (const ev of sorted) {
    if (ev.end < now && !ev.isWatched) buckets[0].items.push(ev);
    else if (ev.start < startOfToday.getTime() + DAY_MS && ev.start >= startOfToday) buckets[1].items.push(ev);
    else if (ev.start < endOfWeek) buckets[2].items.push(ev);
    else if (ev.start < endOfNextWeek) buckets[3].items.push(ev);
    else if (ev.start >= endOfNextWeek) buckets[4].items.push(ev);
  }
  return buckets.filter((b) => b.items.length > 0);
}

/** Group events by calendar month, most recent month first — used by the "Watched on plan" list. */
export function groupByMonth(events) {
  const sorted = [...events].sort((a, b) => b.start - a.start);
  const groups = [];
  const byKey = new Map();
  for (const ev of sorted) {
    const key = `${ev.start.getFullYear()}-${ev.start.getMonth()}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: ev.start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(ev);
  }
  return groups;
}

/** Google-style calendar title: "September 2026" if [start, end) stays inside one
 * month, "Sep – Oct 2026" if it crosses a month boundary (end is exclusive). */
export function formatCalendarTitle(start, end) {
  if (!start || !end) return '';
  const lastDay = new Date(end.getTime() - 1);
  const sameMonth = start.getMonth() === lastDay.getMonth() && start.getFullYear() === lastDay.getFullYear();
  if (sameMonth) {
    return start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  const startMonth = start.toLocaleDateString(undefined, { month: 'short' });
  const endMonth = lastDay.toLocaleDateString(undefined, { month: 'short' });
  return `${startMonth} – ${endMonth} ${lastDay.getFullYear()}`;
}

/** Summary stats for the "week at a glance" sidebar card: events inside [start, end). */
export function summarizeRange(events, start, end) {
  if (!start || !end) return null;
  const inRange = events.filter((e) => e.start >= start && e.start < end);
  const totalMinutes = inRange.reduce((sum, e) => sum + Math.max(0, (e.end - e.start) / 60000), 0);
  const now = new Date();
  const next = inRange.filter((e) => e.end >= now).sort((a, b) => a.start - b.start)[0] || null;
  return { count: inRange.length, totalMinutes, next };
}
