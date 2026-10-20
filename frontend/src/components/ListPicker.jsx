import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Library } from 'lucide-react';
import { LIBRARY } from '../api/client';
import { getListIcon } from './NewListModal';

// Rounded "Add to <list>" pill that opens a menu of lists, styled like the sidebar.
// Replaces the browser's native <select> wherever a destination list is picked.
export default function ListPicker({ lists = [], value, onChange, label = 'Add to', className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);

  const options = [
    ...lists.map((l) => ({ id: String(l.id), name: l.name, Icon: getListIcon(l.icon || 'Film'), count: l.items_count })),
    { id: LIBRARY, name: 'Library only', Icon: Library, hint: 'No list' },
  ];
  const selected = options.find((o) => o.id === String(value)) || options[options.length - 1];
  const SelectedIcon = selected.Icon;

  // Close on outside click; Escape closes just the menu, not the dialog behind it
  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointer = (e) => { if (!rootRef.current?.contains(e.target)) setIsOpen(false); };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [isOpen]);

  return (
    <div className={`lp ${className}`} ref={rootRef}>
      <button
        type="button"
        className={`lp__pill ${isOpen ? 'is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
      >
        {label && <span className="lp__label">{label}</span>}
        <span className="lp__dot"><SelectedIcon size={12} /></span>
        <span className="lp__name">{selected.name}</span>
        <ChevronDown size={14} className="lp__chevron" />
      </button>

      {isOpen && (
        <div className="lp__menu custom-scrollbar" role="listbox" aria-label="Lists">
          {options.map(({ id, name, Icon, count, hint }) => {
            const isOn = id === selected.id;
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={isOn}
                className={`lp__option ${isOn ? 'is-on' : ''}`}
                onClick={() => { onChange?.(id); setIsOpen(false); }}
              >
                <Icon size={14} className="lp__option-icon" />
                <span className="lp__option-name">{name}</span>
                {hint ? <span className="lp__option-meta">{hint}</span>
                  : count != null && <span className="lp__option-meta">{count}</span>}
                {isOn && <Check size={13} className="lp__option-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
