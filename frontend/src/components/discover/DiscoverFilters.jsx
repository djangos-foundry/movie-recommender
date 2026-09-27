import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { STATUS_LABELS, activeFilterCount, EMPTY_FILTERS, languageLabel } from '../../lib/discoverEngine';

const GENRES_SHOWN = 8;

function toggle(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Chip({ active, onClick, children }) {
  return (
    <button type="button" className={`dz-chip ${active ? 'is-on' : ''}`} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}

function Group({ label, children }) {
  return (
    <div className="dz-filters__group">
      <div className="dz-label"><span>{label}</span></div>
      {children}
    </div>
  );
}

// `fillFrom="end"` shades the track to the right of the thumb (used by "From year")
function RangeRow({ label, valueLabel, min, max, step = 1, value, onChange, fillFrom = 'start' }) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="dz-range">
      <div className="dz-range__head">
        <span>{label}</span>
        <span className="dz-mute">{valueLabel}</span>
      </div>
      <input
        type="range"
        className="dz-range__input"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={{ '--pct': `${pct}%` }}
        data-fill={fillFrom}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

// Director / Actor / Language: a collapsed row that opens into a searchable chip list
function CollapsibleChips({ label, options, selected, onToggle, format = (v) => v }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  if (!options.length) return null;

  const q = query.trim().toLowerCase();
  const visible = q ? options.filter((o) => format(o.value).toLowerCase().includes(q)) : options;
  const Icon = open ? ChevronDown : ChevronRight;

  return (
    <div>
      <button type="button" className="dz-collapse__row" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{label}</span>
        <span className="dz-collapse__meta">
          {selected.length > 0 && <span className="dz-badge">{selected.length}</span>}
          <Icon size={16} />
        </span>
      </button>
      {open && (
        <div className="dz-collapse__panel">
          {options.length > 8 && (
            <input
              type="search"
              className="dz-search"
              placeholder={`Search ${label.toLowerCase()}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={`Search ${label}`}
            />
          )}
          <div className="dz-chips dz-chips--scroll">
            {visible.map((o) => (
              <Chip key={o.value} active={selected.includes(o.value)} onClick={() => onToggle(o.value)}>
                {format(o.value)} <small>{o.count}</small>
              </Chip>
            ))}
            {visible.length === 0 && <span className="dz-mute">No matches</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DiscoverFilters({
  isOpen,
  options,
  filters,
  onChange,
  poolSize,
  totalSize,
  showChips,
  onToggleShowChips,
  onClose,
}) {
  const [allGenres, setAllGenres] = useState(false);
  const count = activeFilterCount(filters);

  const set = (patch) => onChange({ ...filters, ...patch });

  const genres = allGenres ? options.genres : options.genres.slice(0, GENRES_SHOWN);
  const hiddenGenres = options.genres.length - GENRES_SHOWN;

  const { years, runtime } = options;
  const showYears = years.max > years.min;
  const showRuntime = runtime.max > 0;

  const yearMin = filters.yearMin ?? years.min;
  const yearMax = filters.yearMax ?? years.max;
  const runtimeMax = filters.runtimeMax ?? runtime.max;

  return (
    <aside
      className={`dz-filters ${isOpen ? 'dz-filters--open' : 'dz-filters--closed'}`}
      aria-label="Filters"
      aria-hidden={!isOpen}
      inert={!isOpen}
    >
      <div className="dz-filters__inner">
        <div className="dz-filters__head">
          <h2 className="dz-heading dz-filters__title">Filters</h2>
          <div className="dz-filters__head-actions">
            <button
              type="button"
              className="dz-btn"
              style={{ height: 28, padding: '0 10px' }}
              disabled={count === 0}
              onClick={() => onChange({ ...EMPTY_FILTERS })}
            >
              Reset
            </button>
            <button type="button" className="dz-btn dz-btn--icon" aria-label="Collapse filters" onClick={onClose}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="dz-filters__body">
          {options.statuses.length > 0 && (
            <Group label="Status">
              <div className="dz-chips">
                {options.statuses.map((s) => (
                  <Chip
                    key={s.value}
                    active={filters.statuses.includes(s.value)}
                    onClick={() => set({ statuses: toggle(filters.statuses, s.value) })}
                  >
                    {STATUS_LABELS[s.value] || s.value} <small>{s.count}</small>
                  </Chip>
                ))}
              </div>
            </Group>
          )}

          {options.genres.length > 0 && (
            <Group label="Genre">
              <div className="dz-chips">
                {genres.map((g) => (
                  <Chip
                    key={g.value}
                    active={filters.genres.includes(g.value)}
                    onClick={() => set({ genres: toggle(filters.genres, g.value) })}
                  >
                    {g.value} <small>{g.count}</small>
                  </Chip>
                ))}
                {hiddenGenres > 0 && (
                  <button type="button" className="dz-chip dz-mute" onClick={() => setAllGenres((v) => !v)}>
                    {allGenres ? 'Show less' : `+${hiddenGenres} more`}
                  </button>
                )}
              </div>
            </Group>
          )}

          {options.lists.length > 0 && (
            <Group label="Your lists">
              <div className="dz-chips">
                {options.lists.map((l) => (
                  <Chip
                    key={l.id}
                    active={filters.lists.includes(String(l.id))}
                    onClick={() => set({ lists: toggle(filters.lists, String(l.id)) })}
                  >
                    {l.name} <small>{l.count}</small>
                  </Chip>
                ))}
              </div>
            </Group>
          )}

          {(showYears || showRuntime) && (
            <div className="dz-filters__group" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {showYears && (
                <>
                  <RangeRow
                    label="From year"
                    fillFrom="end"
                    valueLabel={yearMin}
                    min={years.min}
                    max={years.max}
                    value={yearMin}
                    onChange={(v) => set({ yearMin: v <= years.min ? null : Math.min(v, yearMax) })}
                  />
                  <RangeRow
                    label="To year"
                    valueLabel={yearMax}
                    min={years.min}
                    max={years.max}
                    value={yearMax}
                    onChange={(v) => set({ yearMax: v >= years.max ? null : Math.max(v, yearMin) })}
                  />
                </>
              )}
              <RangeRow
                label="Minimum rating"
                valueLabel={filters.minRating === null ? 'Any' : `${filters.minRating.toFixed(1)}+`}
                min={0}
                max={9}
                step={0.5}
                value={filters.minRating ?? 0}
                onChange={(v) => set({ minRating: v === 0 ? null : v })}
              />
              {showRuntime && (
                <RangeRow
                  label="Runtime"
                  valueLabel={filters.runtimeMax === null ? 'Any length' : `up to ${runtimeMax} min`}
                  min={60}
                  max={Math.max(runtime.max, 61)}
                  step={5}
                  value={runtimeMax}
                  onChange={(v) => set({ runtimeMax: v >= runtime.max ? null : v })}
                />
              )}
            </div>
          )}

          <div className="dz-collapse">
            <CollapsibleChips
              label="Director"
              options={options.directors}
              selected={filters.directors}
              onToggle={(v) => set({ directors: toggle(filters.directors, v) })}
            />
            <CollapsibleChips
              label="Actor"
              options={options.actors}
              selected={filters.actors}
              onToggle={(v) => set({ actors: toggle(filters.actors, v) })}
            />
            <CollapsibleChips
              label="Language"
              options={options.languages}
              selected={filters.languages}
              format={languageLabel}
              onToggle={(v) => set({ languages: toggle(filters.languages, v) })}
            />
          </div>
        </div>

        <div className="dz-filters__foot">
          <div>
            <b style={{ fontWeight: 600 }}>{poolSize} of {totalSize}</b>{' '}
            <span className="dz-mute">movies match these filters</span>
          </div>
          <div className="dz-filters__switch-row">
            <span id="dz-show-chips-label">Show active filters under the input</span>
            <button
              type="button"
              role="switch"
              aria-checked={showChips}
              aria-labelledby="dz-show-chips-label"
              className="dz-switch"
              onClick={onToggleShowChips}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
