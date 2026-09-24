import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Star, Plus, Check, Loader2, Film, Send, MessageSquare, Sparkles, Cpu,
} from 'lucide-react';
import { sendChatMessage } from '../api/client';

const SUGGESTIONS = [
  'Something short and scary for tonight',
  'A long epic drama',
  'Highly rated crime movies under 2 hours',
  'Something like the Nolan films I saved',
];

export default function ChatModal({
  isOpen,
  onClose,
  lists = [],
  currentList,
  onAddMovie,
  existingMovieIds = new Set(),
}) {
  const [turns, setTurns] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [targetListId, setTargetListId] = useState('');
  const [addedIds, setAddedIds] = useState(new Set());
  const [addingId, setAddingId] = useState(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (currentList && currentList.id !== 'all' && lists.some((l) => l.id === currentList.id)) {
      setTargetListId(currentList.id);
    } else if (lists.length > 0) {
      const def = lists.find((l) => l.name.toLowerCase() === 'plan to watch') || lists[0];
      setTargetListId(def.id);
    }
  }, [currentList, lists]);

  useEffect(() => {
    if (isOpen) {
      setTurns([]);
      setInput('');
      setError('');
      setAddedIds(new Set());
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  // Keep the newest turn in view as the conversation grows
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, isLoading]);

  const send = useCallback(async (text) => {
    const message = (text ?? '').trim();
    if (!message || isLoading) return;

    // Only the text turns go back as history - the model doesn't need the posters
    const history = turns.map((t) => ({ role: t.role, content: t.text }));

    setTurns((prev) => [...prev, { role: 'user', text: message }]);
    setInput('');
    setIsLoading(true);
    setError('');

    try {
      const res = await sendChatMessage(message, history);
      setTurns((prev) => [...prev, {
        role: 'assistant',
        text: res.reply || 'Here are some picks.',
        results: res.results || [],
        filters: res.filters || {},
        source: res.source,
        librarySize: res.library_size,
        libraryTotal: res.library_total,
        chatMessage: res.message,
      }]);
    } catch (err) {
      setError(err.message || 'Could not reach the chat service.');
    } finally {
      setIsLoading(false);
    }
  }, [turns, isLoading]);

  if (!isOpen) return null;

  const handleAdd = async (movie) => {
    const listId = targetListId || lists[0]?.id;
    if (!listId) { setError('Please select a list first'); return; }
    try {
      setAddingId(movie.tmdb_id);
      setError('');
      await onAddMovie(listId, movie);
      setAddedIds((prev) => new Set([...prev, movie.tmdb_id]));
    } catch (err) {
      setError(err.message || 'Failed to add movie');
    } finally {
      setAddingId(null);
    }
  };

  const activeFilters = (filters) =>
    Object.entries(filters || {})
      .filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
      .flatMap(([k, v]) => (Array.isArray(v) ? v : [`${k.replace(/_/g, ' ')}: ${v}`]));

  return (
    <div className="modal-overlay">
      <div className="chat">
        {/* ── Header ── */}
        <div className="rec__header">
          <div className="rec__header-left">
            <span className="rec__header-icon"><MessageSquare size={15} /></span>
            <div>
              <h3 className="rec__title">Ask for a Recommendation</h3>
              <p className="rec__subtitle">
                Describe what you feel like watching — it filters your library for you
              </p>
            </div>
          </div>

          <div className="rec__header-right">
            <div className="amm__list-selector">
              <span className="amm__list-label">Add to</span>
              <div className="amm__list-select-wrap">
                <select
                  value={targetListId}
                  onChange={(e) => setTargetListId(e.target.value)}
                  className="amm__list-select"
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <span className="amm__list-select-caret">▾</span>
              </div>
            </div>
            <button onClick={onClose} className="amm__close-btn" aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {error && (
          <div className="amm__error">
            <span>{error}</span>
            <button onClick={() => setError('')} className="amm__error-dismiss">Dismiss</button>
          </div>
        )}

        {/* ── Conversation ── */}
        <div className="chat__body custom-scrollbar" ref={scrollRef}>
          {turns.length === 0 && !isLoading && (
            <div className="chat__intro">
              <div className="amm__state-icon"><Sparkles size={26} /></div>
              <p className="amm__state-title">What are you in the mood for?</p>
              <p className="amm__state-hint">
                Ask in your own words. Try one of these:
              </p>
              <div className="chat__suggestions">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="chat__suggestion"
                    onClick={() => send(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn, i) => (
            <div key={i} className={`chat__turn chat__turn--${turn.role}`}>
              <div className={`chat__bubble chat__bubble--${turn.role}`}>
                {turn.text}
              </div>

              {turn.role === 'assistant' && (
                <>
                  {/* What the request was understood as */}
                  {activeFilters(turn.filters).length > 0 && (
                    <div className="chat__filters">
                      <span className="rec__seeds-label">Understood as</span>
                      {activeFilters(turn.filters).map((f) => (
                        <span key={f} className="rec__seed-chip">{f}</span>
                      ))}
                      {turn.libraryTotal > 0 && (
                        <span className="chat__narrowed">
                          {turn.librarySize} of {turn.libraryTotal} movies
                        </span>
                      )}
                    </div>
                  )}

                  {turn.results?.length === 0 && (
                    <p className="chat__nothing">
                      {turn.chatMessage || 'Nothing matched that — try widening it.'}
                    </p>
                  )}

                  {turn.results?.map((movie) => {
                    const year = movie.release_date?.substring(0, 4) || '';
                    const rating = movie.vote_average ? Number(movie.vote_average).toFixed(1) : null;
                    const added = existingMovieIds.has(movie.tmdb_id) || addedIds.has(movie.tmdb_id);
                    const busy = addingId === movie.tmdb_id;

                    return (
                      <div key={movie.tmdb_id} className="rec__row chat__row">
                        <div className="rec__poster">
                          {movie.poster_path ? (
                            <img
                              src={movie.poster_path}
                              alt={movie.title}
                              loading="lazy"
                              className="rec__poster-img"
                              onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/70x105/1a1a1a/555?text=N/A'; }}
                            />
                          ) : (
                            <Film size={18} className="amm__result-poster-placeholder" />
                          )}
                        </div>

                        <div className="rec__info">
                          <div className="rec__title-row">
                            <span className="rec__movie-title">{movie.title}</span>
                            {year && <span className="amm__result-year">{year}</span>}
                            {rating && (
                              <span className="rec__rating">
                                <Star size={11} className="amm__result-star" />
                                <span>{rating}</span>
                              </span>
                            )}
                          </div>
                          {movie.overview && <p className="amm__result-overview">{movie.overview}</p>}
                        </div>

                        <div className="amm__result-action">
                          {added ? (
                            <span className="amm__result-added"><Check size={12} /> Added</span>
                          ) : (
                            <button
                              onClick={() => handleAdd(movie)}
                              disabled={busy}
                              className="amm__result-add-btn"
                            >
                              {busy ? <Loader2 size={13} className="amm__spinner" /> : <Plus size={13} />}
                              <span>Add</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Honest about which parser ran */}
                  {turn.source === 'keywords' && (
                    <span className="chat__source">
                      <Cpu size={10} /> keyword matching — add an ANTHROPIC_API_KEY for full language understanding
                    </span>
                  )}
                </>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="chat__turn chat__turn--assistant">
              <div className="chat__bubble chat__bubble--assistant chat__bubble--thinking">
                <Loader2 size={13} className="amm__spinner" />
                <span>Thinking…</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Composer ── */}
        <form
          className="chat__composer"
          onSubmit={(e) => { e.preventDefault(); send(input); }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. something short and funny for tonight…"
            className="chat__input"
            disabled={isLoading}
          />
          <button
            type="submit"
            className="chat__send"
            disabled={isLoading || !input.trim()}
            aria-label="Send"
          >
            {isLoading ? <Loader2 size={15} className="amm__spinner" /> : <Send size={15} />}
          </button>
        </form>
      </div>
    </div>
  );
}
