// API Client for Movie Recommendation & Tracking
// Base URL pointing to Django backend
const API_BASE = 'http://localhost:8000/api';

/**
 * Helper to handle fetch requests with timeout and helpful fallback error handling
 */
async function fetchJson(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
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

export async function addMovieToList(listId, movieData, status = 'plan_to_watch', userRating = null, userNotes = '') {
  return await fetchJson(`/lists/${listId}/movies/`, {
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

// 7. Seed sample data
export async function seedSampleData() {
  return await fetchJson('/seed/', {
    method: 'POST',
  });
}
