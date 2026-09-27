import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toDateInputValue } from '../../lib/scheduleEngine';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

// Right-column companion for Agenda view: a compact month calendar with a dot
// under any day that has a scheduled watch. Clicking a marked day scrolls the
// agenda list to that day's first card; unmarked days are just not clickable.
export default function AgendaCalendarPanel({ events = [], onSelectDate }) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const eventDates = useMemo(() => {
    const set = new Set();
    for (const ev of events) set.add(toDateInputValue(ev.start));
    return set;
  }, [events]);

  const todayStr = toDateInputValue(new Date());

  const weeks = useMemo(() => {
    const first = startOfMonth(cursor);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());
    const gridEnd = new Date(last);
    gridEnd.setDate(last.getDate() + (6 - last.getDay()));

    const days = [];
    for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }
    const rows = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    return rows;
  }, [cursor]);

  return (
    <div className="sc-agenda-cal">
      <div className="sc-agenda-cal__header">
        <span className="sc-agenda-cal__title">
          {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
        <div className="sc-agenda-cal__nav">
          <button
            type="button"
            className="sc-btn sc-btn--icon sc-btn--round"
            aria-label="Previous month"
            onClick={() => setCursor((c) => addMonths(c, -1))}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            className="sc-btn sc-btn--icon sc-btn--round"
            aria-label="Next month"
            onClick={() => setCursor((c) => addMonths(c, 1))}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="sc-agenda-cal__weekdays">
        {WEEKDAY_LETTERS.map((letter, i) => <span key={i}>{letter}</span>)}
      </div>

      <div className="sc-agenda-cal__grid">
        {weeks.map((week, wi) => (
          <div className="sc-agenda-cal__row" key={wi}>
            {week.map((day) => {
              const dateStr = toDateInputValue(day);
              const inMonth = day.getMonth() === cursor.getMonth();
              const isToday = dateStr === todayStr;
              const hasEvents = eventDates.has(dateStr);
              return (
                <button
                  type="button"
                  key={dateStr}
                  className={`sc-agenda-cal__day ${inMonth ? '' : 'is-muted'} ${isToday ? 'is-today' : ''}`}
                  onClick={() => hasEvents && onSelectDate?.(day)}
                >
                  {day.getDate()}
                  {hasEvents && <span className="sc-agenda-cal__dot" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
