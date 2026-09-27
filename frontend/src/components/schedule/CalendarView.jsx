import React, { forwardRef, useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Film } from 'lucide-react';
import { formatTime, toDateInputValue } from '../../lib/scheduleEngine';

// Thin wrapper around FullCalendar for the Month and Week views. All chrome
// (title, prev/next, Today, the Month/Week/Agenda switch, "Schedule a watch")
// lives in Schedule.jsx's own topbar — headerToolbar is off here.
const CalendarView = forwardRef(function CalendarView(
  { view, events, onDateClick, onEventClick, onEventReceive, onEventDrop, onDatesSet },
  ref,
) {
  const fcEvents = events.map((ev) => ({
    id: String(ev.id),
    title: ev.movie?.title || 'Untitled',
    start: ev.start,
    end: ev.end,
    editable: !ev.isPending,
    classNames: ['sc-fc-event', ev.isWatched ? 'sc-fc-event--watched' : '', ev.isPending ? 'sc-fc-event--pending' : ''],
    extendedProps: { record: ev },
  }));

  // FullCalendar caches its layout size and doesn't notice its flex container
  // resizing on its own (e.g. the left nav or right library panel toggling) —
  // without this, the day columns stay the old width and leave dead space.
  // The observer's own first callback (fired once as soon as it starts
  // observing) is skipped: calling updateSize() that early races with
  // FullCalendar's own initial scrollTime positioning and was resetting the
  // week view's scroll to midnight instead of 7am.
  const containerRef = useRef(null);
  const skippedFirstResize = useRef(false);
  useEffect(() => {
    if (!containerRef.current) return undefined;
    skippedFirstResize.current = false;
    const ro = new ResizeObserver(() => {
      if (!skippedFirstResize.current) {
        skippedFirstResize.current = true;
        return;
      }
      if (ref && typeof ref !== 'function' && ref.current) {
        ref.current.getApi().updateSize();
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [ref]);

  // Captured by `drop` (which always carries the native mouse event) just
  // before `eventReceive` fires for the same interaction, so Schedule.jsx can
  // anchor the create dialog right next to where the movie was dropped.
  const lastDropPoint = useRef(null);

  // The dialog should snap to the whole day-column's edge, not the exact
  // pixel clicked inside it — clicking near the left edge of Monday and
  // opening "beside" it should still start at the Monday/Tuesday boundary,
  // not overlap most of Monday's own column. Looked up by FullCalendar's own
  // `data-date` attribute rather than hit-testing the click/drop coordinate:
  // during a drop, `document.elementFromPoint` at that pixel often hits the
  // drag "mirror" element following the cursor instead of the day column
  // underneath it, silently falling back to the raw (wrong) click position.
  function dayColumnRectForDate(date) {
    const iso = toDateInputValue(date);
    const col = document.querySelector(`.fc-timegrid-col[data-date="${iso}"], .fc-daygrid-day[data-date="${iso}"]`);
    return col ? col.getBoundingClientRect() : null;
  }

  return (
    <div ref={containerRef} style={{ height: '100%' }}>
      <FullCalendar
        ref={ref}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={view === 'week' ? 'timeGridWeek' : 'dayGridMonth'}
        headerToolbar={false}
        height="100%"
        events={fcEvents}
        editable
        droppable
        dayMaxEvents={3}
        eventDisplay="block"
        nowIndicator
        allDaySlot={false}
        slotMinTime="00:00:00"
        slotMaxTime="24:00:00"
        slotDuration="01:00:00"
        scrollTime="07:00:00"
        slotLabelContent={(arg) => arg.date.toLocaleTimeString(undefined, { hour: 'numeric', hour12: true })}
        dayHeaderContent={view === 'week' ? (arg) => (
          <div className="sc-fc-daycol">
            <span className="sc-fc-daycol__day">{arg.date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</span>
            <span className="sc-fc-daycol__num">{arg.date.getDate()}</span>
          </div>
        ) : undefined}
        firstDay={0}
        dateClick={(info) => {
          if (!info.jsEvent) { onDateClick?.(info.date, null); return; }
          const rect = dayColumnRectForDate(info.date);
          onDateClick?.(info.date, {
            x: info.jsEvent.clientX,
            y: info.jsEvent.clientY,
            dayLeft: rect?.left ?? info.jsEvent.clientX,
            dayRight: rect?.right ?? info.jsEvent.clientX,
          });
        }}
        eventClick={(info) => {
          const record = info.event.extendedProps.record;
          if (record?.isPending) return; // the placeholder isn't a real, clickable event yet
          onEventClick?.(record);
        }}
        drop={(info) => {
          if (!info.jsEvent) { lastDropPoint.current = null; return; }
          const rect = dayColumnRectForDate(info.date);
          lastDropPoint.current = {
            x: info.jsEvent.clientX,
            y: info.jsEvent.clientY,
            dayLeft: rect?.left ?? info.jsEvent.clientX,
            dayRight: rect?.right ?? info.jsEvent.clientX,
          };
        }}
        eventReceive={(info) => {
          const movieId = info.event.extendedProps.movieId;
          const date = info.event.start;
          // FullCalendar adds this event to its own internal store as part
          // of the native drag-receive; removing it (so our own pending +
          // saved-event React state can take over) leaves its props-driven
          // `events` array unable to sync in newly created events for the
          // rest of this instance's life — confirmed via getEvents() truly
          // missing them, not just a paint glitch. Deferring the removal a
          // tick doesn't avoid it; Schedule.jsx forces a remount after the
          // save completes instead (see `calendarKey`).
          setTimeout(() => info.event.remove());
          onEventReceive?.(movieId, date, lastDropPoint.current);
        }}
        eventDrop={(info) => onEventDrop?.(info.event.extendedProps.record.id, info.event.start, info.event.end)}
        eventResize={(info) => onEventDrop?.(info.event.extendedProps.record.id, info.event.start, info.event.end)}
        datesSet={onDatesSet}
        eventContent={(arg) => {
          const rec = arg.event.extendedProps.record;
          const movie = rec?.movie;
          const isWeek = arg.view.type === 'timeGridWeek';
          return (
            <div className="sc-fc-event__inner">
              {isWeek && (
                <div className="sc-fc-event__poster">
                  {movie?.poster_path
                    ? <img src={movie.poster_path} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    : <Film size={12} opacity={0.6} />}
                </div>
              )}
              <div className="sc-fc-event__text">
                <b>{arg.event.title}</b>
                <small>
                  {arg.event.start ? formatTime(arg.event.start) : ''}
                  {isWeek && arg.event.end ? ` – ${formatTime(arg.event.end)}` : ''}
                </small>
              </div>
            </div>
          );
        }}
      />
    </div>
  );
});

export default CalendarView;
