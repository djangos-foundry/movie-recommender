import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Film, Star, Trash2, Calendar as CalendarIcon } from 'lucide-react';
import {
  runtimeOf,
  formatDuration,
  toDateInputValue,
  toTimeInputValue,
  combineDateTime,
  combineEndTime,
  addMinutes,
} from '../../lib/scheduleEngine';

const ANCHORED_WIDTH = 460;
const ANCHORED_HEIGHT_ESTIMATE = 520;
const ANCHOR_MARGIN = 16;
const ANCHOR_GAP = 20; // breathing room between the day column's edge and the panel

// Given the clicked/dropped day column's edges (plus which side Schedule.jsx
// wants, based on the event's weekday — Sun/Mon/Tue open right, the rest open
// left), place the panel just past that column's boundary — e.g. a Monday
// event opening right starts at the Monday/Tuesday border, not wherever
// within Monday's own column you happened to click — only flipping the
// preferred side if it would run off screen and the other side has room.
function anchorStyleFor(point) {
  if (!point) return undefined;
  const style = {};
  const dayLeft = point.dayLeft ?? point.x;
  const dayRight = point.dayRight ?? point.x;
  const fitsRight = dayRight + ANCHOR_GAP + ANCHORED_WIDTH + ANCHOR_MARGIN <= window.innerWidth;
  const fitsLeft = dayLeft - ANCHOR_GAP - ANCHORED_WIDTH - ANCHOR_MARGIN >= 0;
  let openRight = point.side !== 'left';
  if (openRight && !fitsRight && fitsLeft) openRight = false;
  if (!openRight && !fitsLeft && fitsRight) openRight = true;
  if (openRight) {
    style.left = dayRight + ANCHOR_GAP;
  } else {
    style.right = Math.max(ANCHOR_MARGIN, window.innerWidth - dayLeft + ANCHOR_GAP);
  }
  const maxTop = Math.max(ANCHOR_MARGIN, window.innerHeight - ANCHORED_HEIGHT_ESTIMATE - ANCHOR_MARGIN);
  style.top = Math.min(Math.max(ANCHOR_MARGIN, point.y - 60), maxTop);
  return style;
}

// "Schedule a watch" dialog: create a new session, or edit/reschedule/delete
// an existing one. Normally the app's usual centered .modal-overlay shell;
// when `anchorPoint` is set (drag-drop or click-to-create on the calendar)
// it instead docks right beside that point, non-blocking, next to the
// pending event block Schedule.jsx is showing on the calendar underneath.
export default function ScheduleModal({
  isOpen,
  onClose,
  anchorPoint = null, // null | { x, y }
  movieOptions = [],
  initialMovie = null,
  initialDate = null,
  editingEvent = null, // { id, movie, start, end, notes }
  onSave,
  onDelete,
}) {
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [movie, setMovie] = useState(null);
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [endTimeStr, setEndTimeStr] = useState('');
  const [endTouched, setEndTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const panelRef = useRef(null);

  const isEditing = Boolean(editingEvent);
  const isAnchored = Boolean(anchorPoint) && !isEditing;
  const anchorStyle = useMemo(() => (isAnchored ? anchorStyleFor(anchorPoint) : undefined), [isAnchored, anchorPoint]);

  useEffect(() => {
    if (!isOpen) return;
    if (editingEvent) {
      setMovie(editingEvent.movie);
      setDateStr(toDateInputValue(editingEvent.start));
      setTimeStr(toTimeInputValue(editingEvent.start));
      setEndTimeStr(toTimeInputValue(editingEvent.end));
    } else {
      setMovie(initialMovie);
      const base = initialDate || new Date();
      setDateStr(toDateInputValue(base));
      setTimeStr(initialDate ? toTimeInputValue(initialDate) : '14:00');
      setEndTimeStr(initialMovie ? toTimeInputValue(addMinutes(base, runtimeOf(initialMovie))) : '');
    }
    setNotes(editingEvent?.notes || '');
    setQuery('');
    setPickerOpen(!editingEvent && !initialMovie);
    setEndTouched(false);
    setError('');
  }, [isOpen, editingEvent, initialMovie, initialDate]);

  // The end time auto-fills from the movie's runtime whenever the movie or
  // start time changes — but stops the moment you edit it yourself, so a
  // manual tweak isn't clobbered by the next keystroke in the start field.
  useEffect(() => {
    if (endTouched) return;
    const s = combineDateTime(dateStr, timeStr);
    if (movie && s) setEndTimeStr(toTimeInputValue(addMinutes(s, runtimeOf(movie))));
  }, [movie, dateStr, timeStr, endTouched]);

  const filteredMovies = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return movieOptions.slice(0, 40);
    return movieOptions.filter((m) => (m.title || '').toLowerCase().includes(q)).slice(0, 40);
  }, [movieOptions, query]);

  // Outside-click closes the anchored panel (it has no dimming backdrop to
  // catch that click for us, unlike the centered modal).
  useEffect(() => {
    if (!isOpen || !isAnchored) return undefined;
    const onPointerDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose?.();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isOpen, isAnchored, onClose]);

  // Esc closes the dialog either way (centered or anchored).
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const start = combineDateTime(dateStr, timeStr);
  const end = combineEndTime(start, endTimeStr);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!movie) { setError('Pick a movie from your library first.'); return; }
    if (!start) { setError('Choose a date and start time.'); return; }
    try {
      setIsSubmitting(true);
      setError('');
      await onSave({
        movieId: movie.id,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        notes: notes.trim(),
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to schedule this watch.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingEvent || !onDelete) return;
    try {
      setIsSubmitting(true);
      await onDelete(editingEvent.id);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to remove this event.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const year = (movie?.release_date || '').slice(0, 4);
  const rating = movie?.vote_average > 0 ? Number(movie.vote_average).toFixed(1) : null;

  const Wrapper = isAnchored ? React.Fragment : 'div';
  const wrapperProps = isAnchored ? {} : { className: 'modal-overlay' };

  return (
    <Wrapper {...wrapperProps}>
      <div
        ref={panelRef}
        className={isAnchored ? 'sc-modal sc-modal--anchored' : 'sc-modal'}
        style={anchorStyle}
      >
        <div className="sc-modal__header">
          <h3 className="sc-modal__title">{isEditing ? 'Edit scheduled watch' : 'Schedule a watch'}</h3>
          <button type="button" onClick={onClose} className="sc-modal__close" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="sc-modal__body">
          {error && <div className="nlm__error">{error}</div>}

          <div className="sc-field">
            <label className="sc-field__label">Movie (from your library)</label>
            {movie && !pickerOpen ? (
              <div className="sc-pick">
                <div className="sc-pick__poster">
                  {movie.poster_path
                    ? <img src={movie.poster_path} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    : <Film size={18} opacity={0.4} />}
                </div>
                <div className="sc-pick__info">
                  <strong>{movie.title}</strong>
                  <span>
                    {year} · {formatDuration(runtimeOf(movie))}
                    {rating && <> · <Star size={11} className="sc-star" fill="currentColor" /> {rating}</>}
                  </span>
                </div>
                <button type="button" className="sc-pick__change" onClick={() => setPickerOpen(true)}>
                  Change
                </button>
              </div>
            ) : (
              <div className="sc-picker">
                <div className="sc-search">
                  <Search size={14} />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search your library…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="sc-picker__list custom-scrollbar">
                  {filteredMovies.length === 0 ? (
                    <p className="sc-picker__empty">No movies match.</p>
                  ) : (
                    filteredMovies.map((m) => (
                      <button
                        key={m.tmdb_id || m.id}
                        type="button"
                        className="sc-picker__row"
                        onClick={() => { setMovie(m); setPickerOpen(false); setEndTouched(false); }}
                      >
                        <div className="sc-pick__poster sc-pick__poster--sm">
                          {m.poster_path
                            ? <img src={m.poster_path} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            : <Film size={14} opacity={0.4} />}
                        </div>
                        <div className="sc-picker__row-info">
                          <strong>{m.title}</strong>
                          <span>{(m.release_date || '').slice(0, 4)} · {formatDuration(runtimeOf(m))}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="sc-row">
            <div className="sc-field">
              <label className="sc-field__label">Date</label>
              <input
                type="date"
                className="sc-input"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
              />
            </div>
            <div className="sc-field">
              <label className="sc-field__label">Starts</label>
              <input
                type="time"
                className="sc-input"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
              />
            </div>
            <div className="sc-field">
              <label className="sc-field__label">Ends</label>
              <input
                type="time"
                className={`sc-input ${!endTouched ? 'sc-input--calc' : ''}`}
                value={endTimeStr}
                onChange={(e) => { setEndTimeStr(e.target.value); setEndTouched(true); }}
              />
            </div>
          </div>

          <div className="sc-field">
            <label className="sc-field__label">Note (optional)</label>
            <textarea
              className="sc-input sc-textarea"
              rows={2}
              placeholder="Popcorn night with family…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="sc-gcal">
            <CalendarIcon size={16} />
            <span>Also add to Google Calendar</span>
            <span className="sc-gcal__soon">Coming soon</span>
          </div>

          <div className="sc-modal__actions">
            {isEditing && onDelete && (
              <button type="button" className="sc-btn sc-btn--danger" onClick={handleDelete} disabled={isSubmitting}>
                <Trash2 size={14} />Remove
              </button>
            )}
            <div className="sc-modal__spacer" />
            <button type="button" className="sc-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="sc-btn sc-btn--primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEditing ? 'Save changes' : 'Schedule'}
            </button>
          </div>
        </form>
      </div>
    </Wrapper>
  );
}
