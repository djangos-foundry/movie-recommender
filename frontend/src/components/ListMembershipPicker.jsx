import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Library, Loader2 } from 'lucide-react';
import { getListIcon } from './NewListModal';

// The list pill on a movie's page: a menu of tick boxes, one per custom list, so a movie can
// sit in several lists at once. "Library only" is ticked when it is in no custom list, and
// picking it takes the movie out of every list. Styled like ListPicker (.lp classes).
export default function ListMembershipPicker({ lists = [], memberIds = [], onChange, isSaving = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const member = new Set(memberIds.map(String));
  const inLists = lists.filter((l) => member.has(String(l.id)));

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

  const toggle = (id) => {
    const next = new Set(member);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange?.([...next].map(Number));
  };

  const first = inLists[0];
  const PillIcon = first ? getListIcon(first.icon || 'Film') : Library;
  let pillName = 'Library';
  if (first) pillName = inLists.length > 1 ? `${first.name} +${inLists.length - 1}` : first.name;

  return (
    <div className="lp lp--members" ref={rootRef}>
      <button
        type="button"
        className={`mdp-list-pill ${isOpen ? 'is-open' : ''}`}
        title={inLists.length ? `In ${inLists.map((l) => l.name).join(', ')}` : 'In your library, no list'}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
      >
        <span className="mdp-list-pill__icon">
          {isSaving ? <Loader2 size={12} className="dz-spinner" /> : <PillIcon size={12} />}
        </span>
        <span className="mdp-list-pill__name">{pillName}</span>
        <ChevronDown size={13} className="lp__chevron" />
      </button>

      {isOpen && (
        <div className="lp__menu custom-scrollbar" role="group" aria-label="Lists this movie is in">
          {lists.map((l) => {
            const id = String(l.id);
            const isOn = member.has(id);
            const Icon = getListIcon(l.icon || 'Film');
            return (
              <button
                key={id}
                type="button"
                role="checkbox"
                aria-checked={isOn}
                aria-label={l.name}
                className={`lp__option ${isOn ? 'is-on' : ''}`}
                onClick={() => toggle(id)}
              >
                <span className={`lp__box ${isOn ? 'is-on' : ''}`}>{isOn && <Check size={11} />}</span>
                <Icon size={14} className="lp__option-icon" />
                <span className="lp__option-name">{l.name}</span>
              </button>
            );
          })}
          <button
            type="button"
            role="checkbox"
            aria-checked={inLists.length === 0}
            className={`lp__option lp__option--library ${inLists.length === 0 ? 'is-on' : ''}`}
            onClick={() => { if (inLists.length) onChange?.([]); }}
          >
            <span className={`lp__box ${inLists.length === 0 ? 'is-on' : ''}`}>{inLists.length === 0 && <Check size={11} />}</span>
            <Library size={14} className="lp__option-icon" />
            <span className="lp__option-name">Library only</span>
            <span className="lp__option-meta">No list</span>
          </button>
        </div>
      )}
    </div>
  );
}
