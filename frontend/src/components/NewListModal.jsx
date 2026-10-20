import React, { useState, useEffect, useRef } from 'react';
import {
  Film, Tv2, Star, Heart, Flame, Rocket, Bookmark,
  Music, Coffee, Trophy, Camera, Zap, Globe, BookOpen,
  Clapperboard, Gamepad2, Headphones, Tag, MonitorPlay, Sparkles,
  Ghost, Laugh, Drama, Skull, Swords, Wand2, Bot, Atom, Fingerprint, HeartCrack,
  Baby, Bomb, Castle, Telescope, PawPrint, Siren,
  Popcorn, Moon, Sun, Snowflake, Gift, PartyPopper, Users, Pizza, Smile, Hourglass, Infinity,
  Plane, Mountain, Waves, TreePine, Ticket, Crown, Gem, Medal, Car, Ship, Train,
  X, Check, ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Icon catalogue ─────────────────────────────────────────────────────────
// A list stores its icon by key, so keys must never be renamed or removed.
// The picker shows POPULAR_ICONS up front and the rest, grouped, under More.
const ICON_COMPONENTS = {
  Film, Clapperboard, MonitorPlay, Tv2, Star, Heart, Flame, Rocket, Bookmark, Music,
  Coffee, Trophy, Camera, Zap, Globe, BookOpen, Gamepad2, Headphones, Tag, Sparkles,
  Ghost, Laugh, Drama, Skull, Swords, Wand2, Bot, Atom, Fingerprint, HeartCrack,
  Baby, Bomb, Castle, Telescope, PawPrint, Siren,
  Popcorn, Moon, Sun, Snowflake, Gift, PartyPopper, Users, Pizza, Smile, Hourglass, Infinity,
  Plane, Mountain, Waves, TreePine, Ticket, Crown, Gem, Medal, Car, Ship, Train,
};

export const LIST_ICONS = Object.entries(ICON_COMPONENTS).map(([key, Icon]) => ({ key, Icon }));

const POPULAR_ICONS = ['Film', 'Star', 'Heart', 'Flame', 'Ghost', 'Rocket', 'Laugh', 'Drama', 'Bookmark'];

const ICON_GROUPS = [
  {
    label: 'Genres',
    keys: ['Skull', 'Swords', 'Bomb', 'Wand2', 'Bot', 'Atom', 'Fingerprint', 'Siren', 'HeartCrack', 'Baby', 'PawPrint', 'Castle', 'Telescope', 'Sparkles', 'Zap', 'Clapperboard'],
  },
  {
    label: 'Mood and occasions',
    keys: ['Popcorn', 'Moon', 'Sun', 'Snowflake', 'Gift', 'PartyPopper', 'Users', 'Smile', 'Coffee', 'Pizza', 'Hourglass', 'Infinity'],
  },
  {
    label: 'Places and things',
    keys: ['Globe', 'Plane', 'Mountain', 'Waves', 'TreePine', 'Car', 'Ship', 'Train', 'Ticket', 'Trophy', 'Medal', 'Crown', 'Gem', 'Music', 'Headphones', 'Camera', 'Tv2', 'MonitorPlay', 'Gamepad2', 'BookOpen', 'Tag'],
  },
];

export function getListIcon(key) {
  return ICON_COMPONENTS[key] ?? Film;
}

// Readable name for the picker hint, e.g. "PartyPopper" → "Party popper"
function iconLabel(key) {
  const words = key.replace(/\d+$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ── Component ──────────────────────────────────────────────────────────────
// Creates a list, or edits one when `editingList` is given (opened from the sidebar's
// list menu: Rename focuses the name, Change icon opens straight on the icons).
export default function NewListModal({ isOpen, onClose, onCreate, editingList = null, onSave, focus = 'name' }) {
  const isEditing = !!editingList;
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Film');
  const [showMore, setShowMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef(null);

  // Reset on open (pre-filled when editing)
  useEffect(() => {
    if (!isOpen) return;
    const icon = editingList?.icon && ICON_COMPONENTS[editingList.icon] ? editingList.icon : 'Film';
    setName(editingList?.name || '');
    setSelectedIcon(icon);
    // Open More straight away when the list's current icon lives there
    setShowMore(!POPULAR_ICONS.includes(icon));
    setError('');
    if (focus === 'name') setTimeout(() => { nameRef.current?.focus(); nameRef.current?.select(); }, 30);
  }, [isOpen, editingList, focus]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Enter a list name'); return; }
    try {
      setIsSubmitting(true);
      setError('');
      if (isEditing) {
        await onSave?.(editingList.id, { name: name.trim(), icon: selectedIcon });
      } else {
        await onCreate({ name: name.trim(), icon: selectedIcon, color: '#f5c518' });
      }
      onClose();
    } catch (err) {
      setError(err.message || (isEditing ? 'Could not save the list' : 'Could not create the list'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderIcon = (key, size) => {
    const Icon = ICON_COMPONENTS[key];
    const isOn = selectedIcon === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setSelectedIcon(key)}
        className={`nlm__icon-cell nlm__icon-cell--${size} ${isOn ? 'nlm__icon-cell--active' : ''}`}
        title={iconLabel(key)}
        aria-label={iconLabel(key)}
        aria-pressed={isOn}
      >
        <Icon size={size === 'sm' ? 15 : 18} strokeWidth={1.75} />
        {isOn && (
          <span className="nlm__icon-check">
            <Check size={8} strokeWidth={3.5} />
          </span>
        )}
      </button>
    );
  };

  return (
    // Clicking the dimmed backdrop closes the dialog, like Escape
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="nlm" role="dialog" aria-modal="true" aria-label={isEditing ? 'Edit list' : 'Create new list'}>
        {/* Header */}
        <div className="nlm__header">
          <h3 className="nlm__title">{isEditing ? 'Edit list' : 'Create New List'}</h3>
          <button type="button" onClick={onClose} className="nlm__close-btn" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="nlm__body">
          {error && <div className="nlm__error">{error}</div>}

          {/* List name */}
          <div className="nlm__field">
            <label className="nlm__label" htmlFor="nlm-name">
              LIST NAME <span className="nlm__required">*</span>
            </label>
            <input
              id="nlm-name"
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="e.g. Sci-Fi Classics, Must-Watch 2026…"
              className="nlm__input"
            />
          </div>

          {/* Icon picker: popular icons, then the rest grouped under More */}
          <div className="nlm__field">
            <div className="nlm__label-row">
              <span className="nlm__label">CHOOSE AN ICON</span>
              <span className="nlm__label-hint">{iconLabel(selectedIcon)}</span>
            </div>
            <div className="nlm__icon-grid">
              {POPULAR_ICONS.map((key) => renderIcon(key, 'md'))}
              <button
                type="button"
                className={`nlm__icon-cell nlm__icon-cell--md nlm__icon-more ${showMore ? 'is-open' : ''}`}
                onClick={() => setShowMore((v) => !v)}
                aria-expanded={showMore}
              >
                {showMore ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span>{showMore ? 'Less' : 'More'}</span>
              </button>
            </div>

            {showMore && (
              <div className="nlm__more custom-scrollbar">
                {ICON_GROUPS.map((group) => (
                  <div key={group.label} className="nlm__group">
                    <p className="nlm__group-label">{group.label}</p>
                    <div className="nlm__icon-grid nlm__icon-grid--sm">
                      {group.keys.map((key) => renderIcon(key, 'sm'))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="nlm__actions">
            <button type="button" onClick={onClose} className="nlm__btn-cancel">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="nlm__btn-create">
              {isSubmitting ? (isEditing ? 'Saving…' : 'Creating…') : (isEditing ? 'Save' : 'Create List')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
