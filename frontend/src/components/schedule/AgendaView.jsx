import React, { useState } from 'react';
import { Film, Clock, CheckCircle2, MoreVertical, Pencil, Trash2, CalendarClock } from 'lucide-react';
import { groupForAgenda, groupByMonth, formatDayLabel, formatTime, formatDuration, runtimeOf, toDateInputValue } from '../../lib/scheduleEngine';

// A light "days away" hint for upcoming cards — Today/overdue already read
// clearly from their group heading, so this only kicks in for the next week.
function daysAwayLabel(date) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((startOfDay - startOfToday) / 86400000);
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff <= 7) return `In ${diff} days`;
  return null;
}

const STATUS_META = {
  plan_to_watch: { label: 'Plan to Watch', cls: 'badge--blue' },
  watching: { label: 'Watching', cls: 'badge--amber' },
  completed: { label: 'Completed', cls: 'badge--green' },
  dropped: { label: 'Dropped', cls: 'badge--red' },
};

const EMPTY_COPY = {
  plan: {
    title: 'Nothing scheduled yet',
    body: 'Drag a movie from the sidebar onto a date, or use "Schedule a watch" to plan your next session.',
  },
  upcoming: {
    title: 'Nothing upcoming',
    body: 'Everything on your plan is watched. Schedule your next session to see it here.',
  },
  watched: {
    title: 'Nothing watched yet',
    body: 'Sessions you mark watched will show up here, most recent first.',
  },
};

// The "Watch plan" list view: events grouped into Needs a new time / Today /
// This week / Next week / Later, each rendered as a card. A lighter-weight,
// more scannable alternative to the grid views for a mostly-empty calendar.
// `mode` picks both the filter and the grouping: 'plan' (default, everything,
// grouped by when), 'upcoming' (not-yet-watched only), 'watched' (watched
// only, grouped by month, most recent first).
export default function AgendaView({
  events,
  mode = 'plan',
  onEdit,
  onToggleWatched,
  onDelete,
  movieListInfo = new Map(),
  showList = true,
  showStatus = false,
}) {
  const [openMenuId, setOpenMenuId] = useState(null);

  const filtered = mode === 'upcoming' ? events.filter((e) => !e.isWatched)
    : mode === 'watched' ? events.filter((e) => e.isWatched)
    : events;
  const groups = mode === 'watched' ? groupByMonth(filtered) : groupForAgenda(filtered);

  if (groups.length === 0) {
    const copy = EMPTY_COPY[mode] || EMPTY_COPY.plan;
    return (
      <div className="sc-empty">
        <CalendarClock size={32} opacity={0.35} />
        <h2 className="sc-empty__title">{copy.title}</h2>
        <p className="sc-empty__body">{copy.body}</p>
      </div>
    );
  }

  return (
    <div className="sc-agenda">
      {groups.map((group) => (
        <section key={group.key} className="sc-agenda__group">
          <h4 className="sc-agenda__group-title">{group.label}</h4>
          {group.items.map((ev) => {
            const daysAway = !ev.isWatched ? daysAwayLabel(ev.start) : null;
            const infoKey = ev.movie?.tmdb_id || ev.movie?.id;
            const info = movieListInfo.get(infoKey);
            const statusMeta = info?.status ? STATUS_META[info.status] : null;
            const isMenuOpen = openMenuId === ev.id;
            return (
              <article
                key={ev.id}
                className={`sc-agenda-card ${ev.isWatched ? 'is-watched' : ''}`}
                data-date={toDateInputValue(ev.start)}
              >
                <div className="sc-agenda-card__when">
                  <span>{formatDayLabel(ev.start).split(' ')[0].replace(',', '')}</span>
                  <b>{ev.start.getDate()}</b>
                  <span className="sc-mute">{ev.start.toLocaleDateString(undefined, { month: 'short' })}</span>
                </div>

                <button type="button" className="sc-agenda-card__poster" onClick={() => onEdit(ev)}>
                  {ev.movie?.poster_path
                    ? <img src={ev.movie.poster_path} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    : <Film size={20} opacity={0.4} />}
                </button>

                <div className="sc-agenda-card__body">
                  <button type="button" className="sc-agenda-card__title" onClick={() => onEdit(ev)}>
                    {ev.movie?.title}
                  </button>
                  <div className="sc-agenda-card__meta">
                    <Clock size={12} />
                    {formatTime(ev.start)} – {formatTime(ev.end)}
                    <span>·</span>
                    {formatDuration(runtimeOf(ev.movie))}
                    {ev.isWatched && <span className="sc-pill sc-pill--green"><CheckCircle2 size={11} />Watched</span>}
                    {daysAway && <span className="sc-pill">{daysAway}</span>}
                  </div>
                  {(showList || showStatus) && (info?.list || statusMeta) && (
                    <div className="sc-agenda-card__tags">
                      {showList && info?.list && (
                        <span className="sc-pill sc-pill--list">
                          <span className="sc-pill__dot" style={{ background: info.list.color }} />
                          {info.list.name}
                        </span>
                      )}
                      {showStatus && statusMeta && (
                        <span className={`badge ${statusMeta.cls}`}>{statusMeta.label}</span>
                      )}
                    </div>
                  )}
                  {ev.notes && <p className="sc-agenda-card__notes">{ev.notes}</p>}
                </div>

                <div className="sc-agenda-card__actions">
                  <button
                    type="button"
                    className="sc-btn sc-btn--sm"
                    onClick={() => onToggleWatched(ev)}
                  >
                    <CheckCircle2 size={13} />{ev.isWatched ? 'Watched' : 'Mark watched'}
                  </button>
                  <div className="sc-kebab">
                    <button
                      type="button"
                      className="sc-btn sc-btn--icon sc-btn--sm"
                      aria-label="More actions"
                      onClick={() => setOpenMenuId(isMenuOpen ? null : ev.id)}
                    >
                      <MoreVertical size={15} />
                    </button>
                    {isMenuOpen && (
                      <>
                        <div className="sc-kebab__backdrop" onClick={() => setOpenMenuId(null)} />
                        <div className="sc-kebab__menu">
                          <button type="button" onClick={() => { setOpenMenuId(null); onEdit(ev); }}>
                            <Pencil size={13} />Edit
                          </button>
                          <button type="button" className="is-danger" onClick={() => { setOpenMenuId(null); onDelete(ev); }}>
                            <Trash2 size={13} />Remove
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}
