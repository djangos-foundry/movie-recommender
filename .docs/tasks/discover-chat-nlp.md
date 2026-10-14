# Task: Discover chat — text-to-filter parsing (no LLM)

**Status:** design agreed, not yet built. Extends the existing chat box
(`backend/movies/services/chat.py`, `frontend/src/components/ChatModal.jsx`)
rather than replacing it. See also [../mockups](../mockups) for the Discover
UI this plugs into ("Ask" mode in the composer).

## Why this exists

The chat box already has two parsers (`parse_with_claude`, `parse_with_keywords`)
and falls back to `parse_with_keywords` whenever `ANTHROPIC_API_KEY` is unset —
which is the only path this project actually runs on today. That fallback has
one structural problem: everything it matches (genres, directors, actors,
languages) is clamped to values that already exist in **your own library**
(`_clamp_to_library()` in `chat.py`). That's correct for the *Library* source
— filtering to a director you've never saved should find nothing — but it's
wrong for the *Web* source, where TMDB has every genre/language/year/person
whether or not you own a matching movie yet.

This doc is the design for a better, still-dependency-light parser, used when
the Discover source is **Web** and the composer is in **Ask** mode.

## Decision: rule-based pipeline + small embedding model, no LLM, no training

No generative model, local or hosted, is needed for the scope this project
wants (turn a sentence into structured filters). A classic
information-retrieval pipeline covers the overwhelming majority of real
phrasing, with one small pretrained model bolted on for mood/synonym words
that a hand-written dictionary would never fully cover.

### Why not the alternatives
- **More regex** — not the right tool past the 3–4 structural patterns below
  (year, "under 2 hours", decades). Everything else is a dictionary lookup,
  not a regex — see "Pipeline" below.
- **spaCy** — a real pretrained NLP library (~15MB, no training), but its
  NER still needs a hand-written genre/country dictionary underneath it to
  be useful here. It adds install weight and per-request latency without
  removing the part that's actually hard (the synonym/mood gap).
- **Self-hosted local LLM** (Ollama + Llama 3.2 1B/3B, Qwen2.5, Phi-3-mini) —
  works, needs no API key, but on a free/CPU-only host expect multi-second
  replies and a multi-GB container image. Worth revisiting as an opt-in
  "smarter search" mode later; wrong default for now.
- **Client-side LLM (transformers.js/WebLLM)** — zero backend cost, but a
  large first-load download and inconsistent WebGPU support. Same verdict:
  interesting later, not now.

## Pipeline

```
sentence
  -> tokenize
  -> strip stopwords
  -> stem (Porter/Snowball)
  -> for each surviving token:
       exact dictionary hit?  -> use it directly (genre / country / language / decade)
       proper-noun span?      -> resolve via TMDB /search/person -> with_cast / with_crew
       no exact hit?          -> compare embedding to genre/mood embeddings -> nearest match above threshold
  -> regex pass for year / date-range phrases (independent of tokenizing above)
  -> assemble into the same filters dict the filter panel already produces
  -> discover_movies(criteria=...)  [unchanged — already accepts all of these]
```

Two independent halves feed the same filters dict: **exact-vocabulary
lookup** (cheap, deterministic) and **embedding fallback** (catches words the
dictionary doesn't have). Person names are a third, separate path because
the vocabulary there is unbounded — see below.

### 1. Tokenize / stopword strip / stem
Split the sentence into words, drop noise words (`a`, `the`, `something`,
`movie`, `show me`, `recommend`), reduce to root form (`actions` → `action`)
so the dictionary only needs one entry per concept. Porter/Snowball stemmer
— a small, well-known algorithm, not a model. No training, no download
beyond a tiny pip package.

### 2. Exact-match dictionaries (gazetteers)
Finite, hand-written lookup tables — checking a token against a `dict`/`set`
is O(1) regardless of table size, so this never turns into "thousands of
regex":
- **Genres** — already exists: `GENRE_MAP` / `GENRE_NAME_TO_ID` in
  `backend/movies/services/tmdb.py` (all 19 TMDB genres, not just the
  library's subset).
- **Country → language** — new, ~50 entries (`korean → ko`, `japanese → ja`,
  `french → fr`, ...). This is the real fix for "Korean action movie" —
  match on nationality words, not just language names.
- **Decades / relative years** — new, a small phrase table: `"90s"` →
  1990–1999, `"2010s"` → 2010–2019, `"early 2000s"` → 2000–2004, `"late
  2000s"` → 2005–2009, `"before 2010"` → `year_max=2009`, `"after 2015"` →
  `year_min=2016`, plus the existing bare `\b(19|20)\d{2}\b` year regex for a
  literal year. `"between 2000 and 2010s"` parses as two endpoints —
  `2000` (literal year) and `2010s` (decade) — and takes the union:
  `year_min=2000, year_max=2019`.
- **Runtime / rating hints** — already exist in `chat.py`
  (`RUNTIME_HINTS`, `RATING_HINTS`); kept as-is.

### 3. Embedding fallback for mood/synonym words
A token with no exact dictionary hit (`"spooky"`, `"heartwarming"`,
`"mind-bending"`) is compared by meaning, not spelling, against precomputed
genre/mood embeddings using a small pretrained sentence-embedding model
(`sentence-transformers/all-MiniLM-L6-v2`).
- **Size:** ~80MB, pretrained — no training run, no fine-tuning.
- **Cost:** ~10–50ms per query on CPU. Fine on a free-tier host.
- **What it buys:** `"spooky"` lands near `"Horror"` in vector space even
  though it was never typed into the genre dictionary by hand.
- **What it doesn't buy:** it's a similarity match, not reasoning — see
  Limitations.

### 4. Person names (actors / directors) — a genuinely different case
Genre/country/language are finite, so a dictionary works. People are not —
there are hundreds of thousands of actors and directors, so no fixed
gazetteer is viable. This needs its own two-step path, using TMDB's
existing API key (a second endpoint on the service you already call, not a
new dependency):
1. **Extract a candidate name span** — a simple capitalization heuristic:
   consecutive Title-Case words that aren't the first word of the sentence
   (`"show me Brad Pitt movies"` → `Brad Pitt`). No model needed; this is a
   regex/heuristic, and it's fine if it occasionally over- or under-grabs a
   span, because the next step verifies it.
2. **Resolve via `TMDB /search/person`** (new method on `tmdb_service`,
   same pattern as the existing `search_movies`) — confirms the name is a
   real person, gets back their canonical name, id, and known-for
   department (Acting vs Directing), and tolerates minor
   misspellings/casing since it's TMDB's own fuzzy search, not ours.
3. **Feed the id into `with_cast` / `with_crew`** — `discover_movies()`
   already accepts both (`backend/movies/services/tmdb.py:681-685`); no
   change needed there.

This is also strictly better than the current `parse_with_keywords` person
matching, which only works if the name is already a director/actor
somewhere in your saved library.

### Worked examples

| Sentence | Extracted | Result |
|---|---|---|
| "korean action movie in 2026" | `action` (dict) · `korean→ko` (dict) · `2026` (regex) | `genres=[Action], language=ko, year_min=2026, year_max=2026` |
| "something spooky with subtitles that won't take all night" | `spooky→Horror` (embedding, not dict) · "won't take all night" → short (regex) | `genres=[Horror], runtime_max=100` (language left unset — see Open questions) |
| "show me brad pitt movies from the early 2000s" | `Brad Pitt` (capitalization span → TMDB person search → id) · `early 2000s` (decade phrase) | `cast_ids=[<id>], year_min=2000, year_max=2004` |
| "recommend me leonardo dicaprio movies between 2000 and 2010s" | `Leonardo DiCaprio` (person search → id) · `2000` + `2010s` (two endpoints, union) | `cast_ids=[<id>], year_min=2000, year_max=2019` |

Both actor examples work under this design. They do **not** work under
today's `parse_with_keywords` unless that exact actor is already saved in
your library, because of `_clamp_to_library()`.

## Where this plugs in

- **Library source:** keep today's behaviour (`parse_with_keywords` +
  `_clamp_to_library`) — filtering to what you don't own should find
  nothing, that's correct.
- **Web source, Ask mode:** use this pipeline instead, skipping the library
  clamp, feeding straight into `discover_movies(criteria=...)`
  (`backend/movies/services/recommender.py:284`) — which already accepts
  genres, language, year range, runtime, rating, cast/crew ids. No changes
  needed on the TMDB call side, only in how the filters dict gets built.

## Limitations — what this will and won't understand

**In range:** genre/mood words (dictionary, with embedding fallback for
synonyms), country/language, year/decade/relative-date phrases, runtime
language ("short", "under 2 hours"), rating language ("highly rated"),
director/actor names in reasonably literal form (typos and casing tolerated
via TMDB's own person search).

**Out of range — won't understand:**
- **Negation** — "not horror", "nothing with Tom Cruise" will likely still
  match Horror / Tom Cruise unless negation words are explicitly detected
  (a deliberate future addition, not something this pipeline gives for
  free).
- **Comparison to a specific work** — "something like the Nolan films I
  saved" needs *movie-to-movie* embedding similarity, a distinct feature
  built on the same embedding model, not something this pipeline produces
  on its own.
- **Multi-turn refinement** — "more like that but funnier" needs
  conversation-state tracking and a filter diff; not naturally handled by a
  single-sentence parser.
- **Open-world reasoning** — "something my dad would like", "a movie about
  grief that isn't too heavy" requires judgment a fixed vocabulary plus
  similarity matching can't produce. This is the real ceiling — past it,
  a generative model is genuinely required, not just nice to have.
- **Generated prose replies** — the confirmation sentence stays templated
  from the filters (as `_keyword_reply()` does today), not freshly written.

## Open questions (decide before building)
- "With subtitles" / "in English" as a language signal — worth an explicit
  rule (`subtitles` → `language != en` is a weaker, different kind of
  filter than the others, which are all positive matches) or leave unset
  until asked for directly.
- Embedding similarity threshold — needs tuning against real queries once
  built, to avoid false-positive genre matches on vague sentences.
- Whether "between 2000 and 2010s"-style dual-endpoint parsing should favor
  the literal year as `year_min` and the decade as `year_max` by written
  order, or always take min/max regardless of order — recommend the latter
  (order-independent) so "between 2010s and 2000" still works.

## Library + Ask: a second, simpler pipeline

Everything above is the **Web** source. **Library** is deliberately more
restrictive — it should only ever answer from what you've actually
shortlisted — and it turns out to need no backend work at all, because
`frontend/src/lib/discoverEngine.js` already does exactly what this needs:

- `applyFilters(records, filters)` already supports `lists` and `statuses`
  as filter keys, matching each record against the user's own list
  membership and per-item status.
- `drawFromBag(pool, seen, count)` already is "shuffle the filtered pool,
  take `count`, no replacement" — a uniform random draw, precisely the
  "chat sets filters, recommendation randomly picks" model this project
  wants.

So Library-Ask is: **parse the sentence into the same `EMPTY_FILTERS`
shape the filter panel already produces** (`lists`, `statuses`, `genres`,
`directors`, `actors`, `languages`, `yearMin`, `yearMax`, `minRating`,
`runtimeMax`), call `handleFiltersChange()`, then run the existing
`drawFromLibrary()` unchanged. No TMDB call, no new backend endpoint —
this can run entirely client-side against data already loaded in the
browser.

Two small, new dictionary-style pieces, same pattern as the Web pipeline:

- **List-name matching** — not a fixed table (unlike genres/countries),
  because list names are the user's own. Computed at query time from
  `options.lists` (typically a handful of entries per user): normalize
  casing/punctuation on both the sentence and each list name, match by
  substring/overlap. Small, bounded search space — no fuzzy-search API
  needed, unlike person names.
- **Status phrase → status enum** — a short fixed table: "haven't
  watched"/"still need to"/"to watch" → `plan_to_watch`; "already
  watched"/"seen it" → `completed`; "watching now"/"currently watching" →
  `watching`; "dropped"/"gave up on" → `dropped`.
- Existing runtime regex gains "less than" as a synonym for "under".

### Worked examples

| Query | Parsed | Result |
|---|---|---|
| "suggest me movies in my rom-com list" | `"rom-com"` → matched against the user's own list names → `lists=[id]` | `applyFilters` narrows to that list; `drawFromBag` picks randomly |
| "from the saturday-night watch list, movies I haven't watched yet, less than 2 hours" | `"saturday-night watch"` → `lists=[id]` · "haven't watched yet" → `statuses=['plan_to_watch']` · "less than 2 hours" → `runtimeMax=120` | Narrows to list + status + runtime, then random pick |

### Library vs. Web, side by side

| | Library + Ask | Web + Ask |
|---|---|---|
| Vocabulary | The user's own lists/statuses/genres/people/languages | All of TMDB's |
| Runs where | Client-side (`discoverEngine.js`), against already-loaded data | Backend, one `discover_movies()` call |
| Network | None | One TMDB request |
| Restrictive by design? | Yes — only what's shortlisted | No |

## Reference: methods considered, ranked by effort

| # | Method | Effort | Verdict |
|---|---|---|---|
| 1 | Tokenize + stopwords + stem + exact-match dictionaries | Easiest | **Adopted** — base layer |
| 2 | Fuzzy matching (RapidFuzz) for typo tolerance | Easy | Optional add-on later |
| 3 | Flexible date/decade phrases (hand-written table, as above) | Easy–Medium | **Adopted** — part of the dictionary layer |
| 4 | Small sentence-embedding model (MiniLM, ~80MB) for mood/synonym fallback | Medium | **Adopted** — synonym layer |
| 5 | spaCy NER (~15MB, pretrained) | Medium–Hard | Not adopted — doesn't remove the need for the dictionary |
| 6 | Self-hosted local LLM (Ollama, 1–3B params, containerized) | Hard | Future/optional "smarter search" mode, not default |
| 7 | Client-side LLM (transformers.js/WebLLM) | Hard | Not adopted — large download, inconsistent browser support |
