import React, { useState, useEffect } from 'react';
import {
  Film, Tv2, Star, Heart, Flame, Rocket, Bookmark,
  Music, Coffee, Trophy, Camera, Zap, Globe, BookOpen,
  Clapperboard, Gamepad2, Headphones, Tag, MonitorPlay, Sparkles,
  X, Check,
} from 'lucide-react';

// ── Icon catalogue ─────────────────────────────────────────────────────────
export const LIST_ICONS = [
  { key: 'Film',        Icon: Film },
  { key: 'Clapperboard',Icon: Clapperboard },
  { key: 'MonitorPlay', Icon: MonitorPlay },
  { key: 'Tv2',         Icon: Tv2 },
  { key: 'Star',        Icon: Star },
  { key: 'Heart',       Icon: Heart },
  { key: 'Flame',       Icon: Flame },
  { key: 'Rocket',      Icon: Rocket },
  { key: 'Bookmark',    Icon: Bookmark },
  { key: 'Music',       Icon: Music },
  { key: 'Coffee',      Icon: Coffee },
  { key: 'Trophy',      Icon: Trophy },
  { key: 'Camera',      Icon: Camera },
  { key: 'Zap',         Icon: Zap },
  { key: 'Globe',       Icon: Globe },
  { key: 'BookOpen',    Icon: BookOpen },
  { key: 'Gamepad2',    Icon: Gamepad2 },
  { key: 'Headphones',  Icon: Headphones },
  { key: 'Tag',         Icon: Tag },
  { key: 'Sparkles',    Icon: Sparkles },
];

export function getListIcon(key) {
  return LIST_ICONS.find((i) => i.key === key)?.Icon ?? Film;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function NewListModal({ isOpen, onClose, onCreate }) {
  const [name, setName]               = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Film');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError]             = useState('');

  // Reset on open
  useEffect(() => {
    if (isOpen) { setName(''); setSelectedIcon('Film'); setError(''); }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('List name is required'); return; }
    try {
      setIsSubmitting(true);
      setError('');
      await onCreate({ name: name.trim(), icon: selectedIcon, color: '#f5c518' });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create list');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="nlm">
        {/* Header */}
        <div className="nlm__header">
          <h3 className="nlm__title">Create New List</h3>
          <button type="button" onClick={onClose} className="nlm__close-btn">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="nlm__body">
          {error && <div className="nlm__error">{error}</div>}

          {/* List name */}
          <div className="nlm__field">
            <label className="nlm__label">
              LIST NAME <span className="nlm__required">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sci-Fi Classics, Must-Watch 2026…"
              className="nlm__input"
              autoFocus
            />
          </div>

          {/* Icon picker */}
          <div className="nlm__field">
            <div className="nlm__label-row">
              <span className="nlm__label">CHOOSE AN ICON</span>
              <span className="nlm__label-hint">
                {LIST_ICONS.find((i) => i.key === selectedIcon)?.key || 'Film'}
              </span>
            </div>
            <div className="nlm__icon-grid">
              {LIST_ICONS.map(({ key, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedIcon(key)}
                  className={`nlm__icon-cell ${selectedIcon === key ? 'nlm__icon-cell--active' : ''}`}
                  title={key}
                >
                  <Icon size={20} strokeWidth={1.75} />
                  {selectedIcon === key && (
                    <span className="nlm__icon-check">
                      <Check size={9} strokeWidth={3} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Footer actions */}
          <div className="nlm__actions">
            <button type="button" onClick={onClose} className="nlm__btn-cancel">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="nlm__btn-create">
              {isSubmitting ? 'Creating…' : 'Create List'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
