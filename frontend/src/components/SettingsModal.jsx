import React, { useState, useEffect } from 'react';
import { X, Keyboard, RotateCcw, Check } from 'lucide-react';

export const DEFAULT_SHORTCUTS = {
  toggleSidebar: 'Alt+B',
  search:        'Ctrl+K',
  settings:      'Ctrl+,',
  addMovie:      'Alt+N',
};

const SHORTCUT_LABELS = [
  {
    key: 'toggleSidebar',
    label: 'Toggle Left Sidebar',
    description: 'Expand or collapse the navigation sidebar',
  },
  {
    key: 'search',
    label: 'Search / Add Movie',
    description: 'Focus search bar or open the Add Movie dialog',
  },
  {
    key: 'addMovie',
    label: 'Add Movie to List',
    description: 'Open Add Movie dialog directly',
  },
  {
    key: 'settings',
    label: 'Open Settings',
    description: 'Open this settings dialog (VS Code standard: Ctrl+,)',
  },
];

export default function SettingsModal({
  isOpen,
  onClose,
  shortcuts = DEFAULT_SHORTCUTS,
  onSaveShortcuts,
  onResetShortcuts,
}) {
  const [local, setLocal]             = useState(shortcuts);
  const [recording, setRecording]     = useState(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => { setLocal(shortcuts); }, [shortcuts]);

  useEffect(() => {
    if (!recording) return;
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
      const parts = [];
      if (e.ctrlKey)  parts.push('Ctrl');
      if (e.altKey)   parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (e.metaKey)  parts.push('Cmd');
      let key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      parts.push(key);
      setLocal((prev) => ({ ...prev, [recording]: parts.join('+') }));
      setRecording(null);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recording]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveShortcuts(local);
    setSavedSuccess(true);
    setTimeout(() => { setSavedSuccess(false); onClose(); }, 800);
  };

  const handleReset = () => {
    setLocal(DEFAULT_SHORTCUTS);
    if (onResetShortcuts) onResetShortcuts();
  };

  return (
    <div className="modal-overlay">
      <div className="stg">
        {/* Header */}
        <div className="stg__header">
          <div className="stg__header-left">
            <div className="stg__icon-badge">
              <Keyboard size={15} />
            </div>
            <div>
              <h3 className="stg__title">Settings &amp; Keyboard Shortcuts</h3>
              <p className="stg__subtitle">Customize global shortcuts to control CineTrack</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="stg__close">
            <X size={16} />
          </button>
        </div>

        {/* Shortcuts list */}
        <div className="stg__body custom-scrollbar">
          {SHORTCUT_LABELS.map((item) => {
            const isRec = recording === item.key;
            const val   = local[item.key] || DEFAULT_SHORTCUTS[item.key];
            return (
              <div key={item.key} className="stg__row">
                <div className="stg__row-info">
                  <p className="stg__row-label">{item.label}</p>
                  <p className="stg__row-desc">{item.description}</p>
                </div>
                <div className="stg__row-action">
                  {isRec ? (
                    <span className="stg__recording">Press keys…</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRecording(item.key)}
                      className="stg__kbd-btn"
                      title="Click to reassign"
                    >
                      {val}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {recording && (
            <p className="stg__tip">
              Hold modifier keys (Ctrl, Alt, Shift) then press a key to assign the shortcut.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="stg__footer">
          <button type="button" onClick={handleReset} className="stg__reset-btn">
            <RotateCcw size={13} />
            <span>Reset Defaults</span>
          </button>
          <div className="stg__footer-right">
            <button type="button" onClick={onClose} className="stg__cancel-btn">Cancel</button>
            <button type="button" onClick={handleSave} className="stg__save-btn">
              {savedSuccess ? <><Check size={13} /><span>Saved!</span></> : <span>Save Changes</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
