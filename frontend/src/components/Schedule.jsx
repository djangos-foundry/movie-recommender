import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Loader2, PanelRight } from 'lucide-react';
import '../schedule.css';
import ScheduleSidebar from './schedule/ScheduleSidebar';
import ScheduleLibraryPanel from './schedule/ScheduleLibraryPanel';
import CalendarView from './schedule/CalendarView';
import AgendaView from './schedule/AgendaView';
import AgendaCalendarPanel from './schedule/AgendaCalendarPanel';
import ScheduleModal from './schedule/ScheduleModal';
import {
  buildMovieOptions,
  toEventRecord,
  summarizeRange,
  formatCalendarTitle,
  addMinutes,
  runtimeOf,
  toDateInputValue,
} from '../lib/scheduleEngine';
import {
  getScheduledWatches,
  createScheduledWatch,
  updateScheduledWatch,
  deleteScheduledWatch,
} from '../api/client';
import { loadJson, saveJson } from '../lib/prefs';
import { matchesShortcut } from '../lib/shortcuts';

const TOGGLE_LIBRARY_SHORTCUT = 'Ctrl+Alt+B';

const STORE_KEY = 'cinetrack_schedule';
const VIEWS = [
  { id: 'week', label: 'Week', hotkey: 'W' },
  { id: 'month', label: 'Month', hotkey: 'M' },
  { id: 'agenda', label: 'Agenda', hotkey: 'A' },
];
const VIEW_KEYS = { w: 'week', m: 'month', a: 'agenda' };

const HEADER_COPY = {
  upcoming: { strong: 'Upcoming', sub: "Scheduled watches you haven't seen yet" },
  watched: { strong: 'Watched on plan', sub: "Sessions you've marked watched" },
};

const isCoreListName = (name) => ['plan to watch', 'watching', 'completed'].includes((name || '').toLowerCase().trim());

// "Zero-hour" drops (a whole day picked in Month view, or the tray dropped
// there) carry no time of day; default those to the 2 PM slot from the mockup.
function withDefaultTime(date) {
  if (!date) return date;
  if (date.getHours() === 0 && date.getMinutes() === 0) {
    const d = new Date(date);
    d.setHours(14, 0, 0, 0);
    return d;
  }
  return date;
}

export default function Schedule({ visible = true, items = [], lists = [], isSidebarOpen = true, prefs = {} }) {
  const [viewMode, setViewMode] = useState(() => loadJson(STORE_KEY, {}).viewMode || 'week');
  const [navMode, setNavMode] = useState(() => loadJson(STORE_KEY, {}).navMode || 'calendar');

  const [rawEvents, setRawEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [selectedListId, setSelectedListId] = useState(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(() => loadJson(STORE_KEY, {}).isLibraryOpen ?? true);
  useEffect(() => { saveJson(STORE_KEY, { viewMode, navMode, isLibraryOpen }); }, [viewMode, navMode, isLibraryOpen]);
  const calendarRef = useRef(null);
  const agendaScrollRef = useRef(null);
  const handleSelectAgendaDate = (date) => {
    const dateStr = toDateInputValue(date);
    const card = agendaScrollRef.current?.querySelector(`[data-date="${dateStr}"]`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const title = useMemo(() => formatCalendarTitle(dateRange.start, dateRange.end), [dateRange]);
  // Bumped after creating a new event to force CalendarView to remount.
  // FullCalendar's own drag-and-drop (Draggable + eventReceive) adds a
  // "sourceless" event internally; removing it (so our own pending-block +
  // saved-event React state can take over) leaves the props-driven `events`
  // array unable to sync in a newly created event afterwards — confirmed via
  // FullCalendar's own getEvents() genuinely missing it, not just a paint
  // issue. A full remount is the reliable fix; it costs the view's current
  // scroll position, which is an acceptable trade for a correct calendar.
  const [calendarKey, setCalendarKey] = useState(0);

  const [modal, setModal] = useState({ isOpen: false, editingEvent: null, initialMovie: null, initialDate: null, anchorPoint: null });
  // A not-yet-saved event shown on the calendar the instant you drop a movie
  // or click an empty slot, so you see it land in place while the dialog is
  // still open — replaced by the real thing once you hit Schedule, or
  // dropped entirely if you cancel.
  const [pending, setPending] = useState(null);

  const movieOptions = useMemo(() => buildMovieOptions(items), [items]);
  const customLists = useMemo(() => lists.filter((l) => !isCoreListName(l.name)), [lists]);
  const activeListName = useMemo(
    () => (selectedListId != null ? customLists.find((l) => l.id === selectedListId)?.name : null),
    [customLists, selectedListId],
  );
  const libraryOptions = useMemo(() => {
    if (selectedListId == null) return movieOptions;
    const scoped = items.filter((it) => it.list === selectedListId || it.list === Number(selectedListId));
    return buildMovieOptions(scoped);
  }, [items, movieOptions, selectedListId]);

  // Per-movie "which list / what status" lookup for Agenda cards. The list
  // pill only ever names a CUSTOM list (e.g. "Adventure") — a core list
  // (Plan to Watch/Watching/Completed) is the same information the separate
  // status pill already shows, so it's left out here to avoid saying the
  // same thing twice.
  const movieListInfo = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const movie = item.movie;
      if (!movie) continue;
      const key = movie.tmdb_id || movie.id;
      const list = lists.find((l) => l.id === item.list);
      const isCustom = !!list && !isCoreListName(list.name);
      const current = map.get(key);
      if (!current) {
        map.set(key, { list: isCustom ? list : null, status: item.status });
      } else if (isCustom && !current.list) {
        map.set(key, { list, status: current.status });
      }
    }
    return map;
  }, [items, lists]);

  const events = useMemo(() => {
    const real = rawEvents.map(toEventRecord);
    if (!pending) return real;
    return [...real, { id: 'pending', movie: pending.movie, start: pending.start, end: pending.end, notes: '', isWatched: false, isPending: true }];
  }, [rawEvents, pending]);
  const savedEvents = useMemo(() => events.filter((e) => !e.isPending), [events]);
  const navCounts = useMemo(() => ({
    calendar: savedEvents.length,
    upcoming: savedEvents.filter((e) => !e.isWatched).length,
    watched: savedEvents.filter((e) => e.isWatched).length,
  }), [savedEvents]);
  const weekGlance = useMemo(
    () => (navMode === 'calendar' && viewMode === 'week' ? summarizeRange(savedEvents, dateRange.start, dateRange.end) : null),
    [savedEvents, dateRange, navMode, viewMode],
  );

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await getScheduledWatches();
      setRawEvents(Array.isArray(data) ? data : (data?.results || []));
    } catch (err) {
      setError(err.message || 'Could not load your calendar.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const openCreate = (initialMovie = null, initialDate = null) => {
    setPending(null);
    setModal({ isOpen: true, editingEvent: null, initialMovie, initialDate: withDefaultTime(initialDate), anchorPoint: null });
  };
  const openEdit = (record) => {
    setPending(null);
    setModal({ isOpen: true, editingEvent: record, initialMovie: null, initialDate: null, anchorPoint: null });
  };
  // Drag-drop (movie already known) and clicking an empty slot (movie not
  // chosen yet) both land here: a placeholder block appears on the calendar
  // right away, and the dialog opens beside it. Which side is picked by the
  // event's weekday (Sun/Mon/Tue open to the right, Wed–Sat open to the
  // left) rather than raw pixel position, so it reads consistently instead
  // of flipping based on exactly where within a day you clicked.
  const openAnchoredCreate = (movie, rawDate, point) => {
    const start = withDefaultTime(rawDate);
    const end = addMinutes(start, movie ? runtimeOf(movie) : 120);
    const side = [0, 1, 2].includes(start.getDay()) ? 'right' : 'left';
    setPending({ movie, start, end });
    setModal({ isOpen: true, editingEvent: null, initialMovie: movie, initialDate: start, anchorPoint: point ? { ...point, side } : null });
  };
  const closeModal = () => {
    setModal((m) => ({ ...m, isOpen: false }));
    setPending(null);
  };

  const handleSave = async ({ movieId, startTime, endTime, notes }) => {
    const isNew = !modal.editingEvent;
    if (modal.editingEvent) {
      await updateScheduledWatch(modal.editingEvent.id, { movieId, startTime, endTime, notes });
    } else {
      await createScheduledWatch({ movieId, startTime, endTime, notes });
    }
    await refresh();
    if (isNew) setCalendarKey((k) => k + 1);
  };

  const handleDelete = async (id) => {
    await deleteScheduledWatch(id);
    await refresh();
  };

  const handleToggleWatched = async (record) => {
    await updateScheduledWatch(record.id, { isWatched: !record.isWatched });
    await refresh();
  };

  const handleReschedule = async (id, start, end) => {
    try {
      await updateScheduledWatch(id, { startTime: start.toISOString(), endTime: end.toISOString() });
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not reschedule that event.');
      await refresh(); // snap the calendar back to the saved time
    }
  };

  const movieById = useMemo(() => {
    const map = new Map();
    for (const m of movieOptions) map.set(m.id, m);
    return map;
  }, [movieOptions]);

  const goPrev = () => calendarRef.current?.getApi().prev();
  const goNext = () => calendarRef.current?.getApi().next();
  const goToday = () => calendarRef.current?.getApi().today();

  const isCalendarNav = navMode === 'calendar';
  const isAgendaView = isCalendarNav && viewMode === 'agenda';
  const isListNav = navMode === 'upcoming' || navMode === 'watched';
  const canPageDates = isCalendarNav && !isAgendaView;

  // View shortcuts: W/M/A jump straight to that calendar view, P/N page the
  // visible range like Google Calendar — all ignored while typing in a field
  // or while the schedule dialog is open.
  useEffect(() => {
    if (!visible) return undefined;
    const isTypingTarget = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    const onKeyDown = (e) => {
      if (modal.isOpen) return;
      if (matchesShortcut(e, TOGGLE_LIBRARY_SHORTCUT)) {
        e.preventDefault();
        setIsLibraryOpen((prev) => !prev);
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (isTypingTarget(document.activeElement)) return;
      const key = e.key.toLowerCase();
      if ((key === 'p' || key === 'n') && canPageDates) {
        e.preventDefault();
        if (key === 'p') goPrev(); else goNext();
        return;
      }
      const next = VIEW_KEYS[key];
      if (!next) return;
      e.preventDefault();
      setNavMode('calendar');
      setViewMode(next);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, modal.isOpen, canPageDates]);

  return (
    <div className="sc" style={{ display: visible ? 'contents' : 'none' }}>
      <ScheduleSidebar
        isOpen={isSidebarOpen}
        navMode={navMode}
        onSelectNav={setNavMode}
        counts={navCounts}
        lists={customLists}
        selectedListId={selectedListId}
        onSelectList={setSelectedListId}
        glance={weekGlance}
      />

      <main className="sc-main">
        <header className="sc-topbar">
          <div className="sc-topbar__left">
            {isListNav ? (
              <div>
                <div className="sc-topbar__strong">{HEADER_COPY[navMode].strong}</div>
                <div className="sc-topbar__sub">{HEADER_COPY[navMode].sub}</div>
              </div>
            ) : isAgendaView ? (
              <div className="sc-topbar__title-row">
                <span className="sc-topbar__strong">Watch plan</span>
              </div>
            ) : (
              <div className="sc-datenav">
                <button type="button" className="sc-btn" onClick={goToday}>Today</button>
                <button type="button" className="sc-btn sc-btn--icon sc-btn--round" aria-label="Previous" title="Previous (P)" onClick={goPrev}>
                  <ChevronLeft size={16} />
                </button>
                <button type="button" className="sc-btn sc-btn--icon sc-btn--round" aria-label="Next" title="Next (N)" onClick={goNext}>
                  <ChevronRight size={16} />
                </button>
                <span className="sc-topbar__title">{title}</span>
              </div>
            )}
          </div>

          <div className="sc-topbar__right">
            {isCalendarNav && (
              <div className="sc-segs" role="group" aria-label="View">
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`sc-seg ${viewMode === v.id ? 'is-on' : ''}`}
                    aria-pressed={viewMode === v.id}
                    title={`${v.label} (${v.hotkey})`}
                    onClick={() => setViewMode(v.id)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className={`sc-btn sc-btn--icon ${isLibraryOpen ? 'is-on' : ''}`}
              aria-label={isLibraryOpen ? 'Hide library panel' : 'Show library panel'}
              title={`${isLibraryOpen ? 'Hide' : 'Show'} library panel (${TOGGLE_LIBRARY_SHORTCUT})`}
              onClick={() => setIsLibraryOpen((prev) => !prev)}
            >
              <PanelRight size={16} />
            </button>
            <button type="button" className="sc-btn sc-btn--primary" onClick={() => openCreate()}>
              <Plus size={15} />Schedule a watch
            </button>
          </div>
        </header>

        {error && <p className="sc-notice sc-notice--error" style={{ margin: '12px 20px 0' }}>{error}</p>}

        <div className="sc-content">
          {isLoading && rawEvents.length === 0 ? (
            <div className="sc-empty">
              <Loader2 size={26} className="sc-spinner" />
              <p className="sc-empty__body">Loading your calendar…</p>
            </div>
          ) : isListNav ? (
            <div className="sc-agenda-scroll custom-scrollbar">
              <AgendaView
                events={savedEvents}
                mode={navMode}
                onEdit={openEdit}
                onToggleWatched={handleToggleWatched}
                onDelete={(ev) => handleDelete(ev.id)}
                movieListInfo={movieListInfo}
                showList={prefs.showEventList}
                showStatus={prefs.showEventStatus}
              />
            </div>
          ) : isAgendaView ? (
            <div className="sc-agenda-layout custom-scrollbar" ref={agendaScrollRef}>
              <div className="sc-agenda-scroll">
                <AgendaView
                  events={savedEvents}
                  mode="plan"
                  onEdit={openEdit}
                  onToggleWatched={handleToggleWatched}
                  onDelete={(ev) => handleDelete(ev.id)}
                  movieListInfo={movieListInfo}
                  showList={prefs.showEventList}
                  showStatus={prefs.showEventStatus}
                />
              </div>
              <AgendaCalendarPanel events={savedEvents} onSelectDate={handleSelectAgendaDate} />
            </div>
          ) : (
            <div className="sc-calendar-wrap">
              <CalendarView
                key={`${viewMode}-${calendarKey}`}
                ref={calendarRef}
                view={viewMode}
                events={events}
                onDateClick={(date, point) => openAnchoredCreate(null, date, point)}
                onEventClick={openEdit}
                onEventReceive={(movieId, date, point) => openAnchoredCreate(movieById.get(movieId) || null, date, point)}
                onEventDrop={handleReschedule}
                onDatesSet={(info) => setDateRange({ start: info.view.currentStart, end: info.view.currentEnd })}
              />
            </div>
          )}
        </div>
      </main>

      <ScheduleLibraryPanel
        isOpen={isLibraryOpen}
        movieOptions={libraryOptions}
        activeListName={activeListName}
        onClearList={() => setSelectedListId(null)}
        onQuickSchedule={(movie) => openCreate(movie, null)}
      />

      <ScheduleModal
        isOpen={modal.isOpen}
        onClose={closeModal}
        anchorPoint={modal.anchorPoint}
        movieOptions={movieOptions}
        initialMovie={modal.initialMovie}
        initialDate={modal.initialDate}
        editingEvent={modal.editingEvent}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
