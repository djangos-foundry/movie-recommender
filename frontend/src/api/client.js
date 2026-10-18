// API Client for Movie Recommendation & Tracking
// Base URL pointing to Django backend
// Same hostname as the page, so the session cookie is sent (localhost and
// 127.0.0.1 are different sites to the browser).
const API_HOST = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
// In production Django serves the UI and the API from the same origin.
const API_BASE = import.meta.env.PROD ? '/api' : `http://${API_HOST}:8000/api`;

let csrfToken = '';

function readCsrfCookie() {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * Helper to handle fetch requests with timeout and helpful fallback error handling
 */
async function fetchJson(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const method = (options.method || 'GET').toUpperCase();
  const config = {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // Django rotates the CSRF cookie when a session starts, so prefer the cookie
      ...(method === 'GET' ? {} : { 'X-CSRFToken': readCsrfCookie() || csrfToken }),
      ...(options.headers || {}),
    },
  };

  try {
    const res = await fetch(url, config);

    if (!res.ok) {
      let errMsg = `Request failed with status ${res.status}`;
      try {
        const errorData = await res.json();
        errMsg = errorData.error || errorData.detail || JSON.stringify(errorData);
      } catch (e) {
        // Non-JSON error body
      }
      const err = new Error(errMsg);
      err.status = res.status;
      throw err;
    }

    if (res.status === 204) {
      return null;
    }

    return await res.json();
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      // Backend is offline or unreachable
      console.warn(`[Backend Offline] Could not reach ${url}. Backend server may still be starting.`);
      const offlineError = new Error('Backend server is currently offline or unreachable at http://localhost:8000.');
      offlineError.isOffline = true;
      throw offlineError;
    }
    throw error;
  }
}

// 1. Lists
export async function getLists() {
  return await fetchJson('/lists/');
}

export async function createList({ name, description = '', color = '#f5c518', icon = 'Film' }) {
  return await fetchJson('/lists/', {
    method: 'POST',
    body: JSON.stringify({ name, description, color, icon }),
  });
}

export async function updateList(listId, data) {
  return await fetchJson(`/lists/${listId}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function reorderLists(orderedIds) {
  return await fetchJson('/lists/reorder/', {
    method: 'PATCH',
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
}

export async function deleteList(listId) {
  return await fetchJson(`/lists/${listId}/`, {
    method: 'DELETE',
  });
}

// 2. List Movies
export async function getListMovies(listId) {
  return await fetchJson(`/lists/${listId}/movies/`);
}

// Pseudo list id for "no list": the movie goes into the hidden Library, which
// still shows up under All Movies.
export const LIBRARY = 'library';

// Every movie the user has, across all lists and the hidden Library
export async function getLibraryMovies() {
  return await fetchJson('/library/movies/');
}

export async function addMovieToList(listId, movieData, status = 'plan_to_watch', userRating = null, userNotes = '') {
  const path = !listId || listId === LIBRARY ? '/library/movies/' : `/lists/${listId}/movies/`;
  return await fetchJson(path, {
    method: 'POST',
    body: JSON.stringify({
      tmdb_id: movieData.tmdb_id || movieData.id,
      movie: movieData,
      status,
      user_rating: userRating,
      user_notes: userNotes,
    }),
  });
}

// 3. List Items (Update / Delete)
export async function updateListItem(itemId, { status, user_rating, user_notes }) {
  const payload = {};
  if (status !== undefined) payload.status = status;
  if (user_rating !== undefined) payload.user_rating = user_rating;
  if (user_notes !== undefined) payload.user_notes = user_notes;

  return await fetchJson(`/list-items/${itemId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function removeListItem(itemId) {
  return await fetchJson(`/list-items/${itemId}/`, {
    method: 'DELETE',
  });
}

// 4. TMDB Search & Movie Details
export async function searchTMDB(query, page = 1) {
  if (!query || !query.trim()) return { results: [] };
  const encoded = encodeURIComponent(query.trim());
  return await fetchJson(`/tmdb/search/?q=${encoded}&page=${page}`);
}

export async function getTMDBMovie(tmdbId) {
  return await fetchJson(`/tmdb/movie/${tmdbId}/`);
}

// 5. Recommendations (random sampling without replacement over your library's genres)
export async function getRecommendationFilters(listId = null) {
  const params = new URLSearchParams();
  if (listId && listId !== 'all') params.set('list_id', String(listId));
  const qs = params.toString();
  return await fetchJson(`/recommendations/filters/${qs ? `?${qs}` : ''}`);
}

export async function getRecommendations(count = 5, listId = null, filters = {}) {
  const params = new URLSearchParams({ count: String(count) });
  if (listId && listId !== 'all') params.set('list_id', String(listId));

  // Multi-value filters repeat the key; scalars are sent only when set
  for (const key of ['genres', 'directors', 'actors', 'languages']) {
    for (const value of filters[key] || []) params.append(key, value);
  }
  for (const key of ['runtime_min', 'runtime_max', 'year_min', 'year_max', 'min_rating']) {
    const value = filters[key];
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }

  return await fetchJson(`/recommendations/?${params.toString()}`);
}

// 6. Natural-language chat recommendations
export async function sendChatMessage(message, history = [], listId = null, count = 5) {
  return await fetchJson('/chat/', {
    method: 'POST',
    body: JSON.stringify({
      message,
      history,
      count,
      list_id: listId && listId !== 'all' ? listId : null,
    }),
  });
}

// 8. Schedule (calendar of planned watch sessions)
export async function getScheduledWatches({ start, end } = {}) {
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  const qs = params.toString();
  return await fetchJson(`/schedule/${qs ? `?${qs}` : ''}`);
}

export async function createScheduledWatch({ movieId, startTime, endTime, notes = '' }) {
  return await fetchJson('/schedule/', {
    method: 'POST',
    body: JSON.stringify({
      movie_id: movieId,
      start_time: startTime,
      end_time: endTime,
      notes,
    }),
  });
}

export async function updateScheduledWatch(id, { movieId, startTime, endTime, notes, isWatched } = {}) {
  const payload = {};
  if (movieId !== undefined) payload.movie_id = movieId;
  if (startTime !== undefined) payload.start_time = startTime;
  if (endTime !== undefined) payload.end_time = endTime;
  if (notes !== undefined) payload.notes = notes;
  if (isWatched !== undefined) payload.is_watched = isWatched;

  return await fetchJson(`/schedule/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteScheduledWatch(id) {
  return await fetchJson(`/schedule/${id}/`, {
    method: 'DELETE',
  });
}

// 9. Trash (soft-deleted lists and list-items, 30-day retention)
export async function getTrash() {
  return await fetchJson('/trash/');
}

export async function restoreTrashEntry(kind, id) {
  return await fetchJson(`/trash/${kind}/${id}/restore/`, {
    method: 'POST',
  });
}

export async function permanentlyDeleteTrashEntry(kind, id) {
  return await fetchJson(`/trash/${kind}/${id}/`, {
    method: 'DELETE',
  });
}

// 10. Accounts (Google sign-in)
export async function getMe() {
  const data = await fetchJson('/auth/me/');
  csrfToken = data.csrf_token || csrfToken;
  return data; // { user: null | {name, email, picture}, google_client_id }
}

export async function loginWithGoogle(credential) {
  const data = await fetchJson('/auth/google/', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
  csrfToken = data.csrf_token || csrfToken;
  return data;
}

// 11. Google Calendar sync
export async function getCalendarStatus() {
  return await fetchJson('/calendar/status/');
}

export async function connectCalendar(code, timeZone) {
  return await fetchJson('/calendar/connect/', {
    method: 'POST',
    body: JSON.stringify({ code, time_zone: timeZone }),
  });
}

export async function syncCalendar() {
  return await fetchJson('/calendar/sync/', { method: 'POST' });
}

export async function disconnectCalendar(deleteCalendar = false) {
  return await fetchJson('/calendar/disconnect/', {
    method: 'POST',
    body: JSON.stringify({ delete_calendar: deleteCalendar }),
  });
}

export async function logout() {
  return await fetchJson('/auth/logout/', { method: 'POST' });
}
