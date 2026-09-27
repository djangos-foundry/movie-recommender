import React from 'react';
import { Film, Globe, Plus, X } from 'lucide-react';
import BrandHeader from '../BrandHeader';

// Uses the Library sidebar classes so the two sections match exactly.
export default function DiscoverSidebar({
  isOpen,
  keepHistory,
  rounds,
  viewedRoundId,
  onSelectRound,
  onClearHistory,
  shortlist,
  onOpenShortlisted,
  onAddShortlisted,
  onRemoveShortlisted,
  onClearShortlist,
  source,
  onSourceChange,
}) {
  return (
    <aside
      className={`sidebar ${isOpen ? 'sidebar--open' : 'sidebar--closed'}`}
      aria-label="Discover"
      aria-hidden={!isOpen}
      inert={!isOpen}
    >
      <BrandHeader />

      <nav className="sidebar__nav">
        {keepHistory && (
          <>
            <div className="sidebar__section-header">
              <span className="sidebar__section-label" style={{ padding: 0 }}>Rounds</span>
              {rounds.length > 0 && (
                <button type="button" className="dz-link" onClick={onClearHistory}>Clear</button>
              )}
            </div>
            {rounds.length === 0 ? (
              <p className="dz-hint">Rounds you draw will be kept here.</p>
            ) : (
              [...rounds].reverse().map((r) => {
                const isActive = viewedRoundId === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`}
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => onSelectRound(r.id)}
                  >
                    {r.source === 'web'
                      ? <Globe size={14} className="sidebar__nav-icon" aria-label="Web" />
                      : <Film size={14} className="sidebar__nav-icon" aria-label="Library" />}
                    <span className="sidebar__nav-label">Round {r.n}</span>
                    <span className={`sidebar__nav-badge ${isActive ? 'sidebar__nav-badge--active' : ''}`}>{r.count}</span>
                  </button>
                );
              })
            )}
          </>
        )}

        <div className="sidebar__section-header">
          <span className="sidebar__section-label" style={{ padding: 0 }}>Shortlist</span>
          {shortlist.length > 0 && (
            <button type="button" className="dz-link" onClick={onClearShortlist}>Clear</button>
          )}
        </div>
        {shortlist.length === 0 ? (
          <p className="dz-hint">Bookmark a card to keep it across rounds.</p>
        ) : (
          shortlist.map((s) => {
            const isWeb = s.source === 'web';
            return (
              <div key={`${s.source}-${s.key}`} className="dz-sl-row">
                <button
                  type="button"
                  className="sidebar__nav-item"
                  disabled={isWeb}
                  onClick={() => onOpenShortlisted(s)}
                  title={isWeb ? 'Not in your library yet' : 'Open movie'}
                >
                  {isWeb
                    ? <Globe size={14} className="sidebar__nav-icon" aria-label="Web" />
                    : <Film size={14} className="sidebar__nav-icon" aria-label="Library" />}
                  <span className="sidebar__nav-label">{s.title}</span>
                  <span className="sidebar__nav-badge">{s.year}</span>
                </button>
                <div className="dz-sl-actions">
                  {isWeb && (
                    <button
                      type="button"
                      className="dz-sl-btn"
                      aria-label={`Add ${s.title} to a list`}
                      title="Add to list"
                      onClick={() => onAddShortlisted(s)}
                    >
                      <Plus size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="dz-sl-btn"
                    aria-label={`Remove ${s.title} from shortlist`}
                    title="Remove"
                    onClick={() => onRemoveShortlisted(s)}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </nav>

      <div className="dz-sidebar__footer">
        <div className="sidebar__section-label" style={{ padding: '0 0 8px' }}>Source</div>
        <div className="dz-segs" role="group" aria-label="Source">
          <button
            type="button"
            className={`dz-seg ${source === 'library' ? 'is-on' : ''}`}
            aria-pressed={source === 'library'}
            onClick={() => onSourceChange('library')}
          >
            <Film size={13} />Library
          </button>
          <button
            type="button"
            className={`dz-seg ${source === 'web' ? 'is-on' : ''}`}
            aria-pressed={source === 'web'}
            onClick={() => onSourceChange('web')}
          >
            <Globe size={13} />Web
          </button>
        </div>
        <p className="dz-hint" style={{ padding: '8px 2px 0' }}>
          {source === 'web'
            ? 'Searches TMDB using your filters and taste.'
            : 'Draws from the movies in your lists.'}
        </p>
      </div>
    </aside>
  );
}
