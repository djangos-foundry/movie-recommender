"""
Natural-language front door to the recommendation filters.

The chat box does not invent a new recommendation engine. Its only job is to
turn a sentence like "something short and scary for tonight" into the same
filter dict the filter panel produces, then hand that to the existing sampler.
That keeps the feature small and means chat and the filter UI can never drift
apart - there is one engine, with two ways to drive it.

    "short and scary"  ->  {"genres": ["Horror"], "runtime_max": 100}
                       ->  get_recommendations(filters=...)   [unchanged]

Two parsers implement that step:

  * parse_with_claude - one Claude call using structured outputs, so the model
    returns schema-validated JSON rather than prose we would have to scrape.
    It is given the user's OWN library vocabulary (their genres, directors,
    actors, languages) and told to choose only from it, so it cannot filter on
    a director they have never saved.

  * parse_with_keywords - a dependency-free fallback used when no API key is
    configured, so the chat box still does something useful out of the box.
"""

import logging
import re

from django.conf import settings

from .recommender import get_filter_options
from .tmdb import GENRE_MAP, tmdb_service

logger = logging.getLogger(__name__)

MODEL = "claude-opus-5"

# Extraction from a short sentence against a supplied vocabulary is a simple
# task, and a chat box is latency-sensitive, so low effort is the right trade.
# Raise this to "high" if you start asking it genuinely hard questions.
EFFORT = "low"

MAX_TOKENS = 2048

# Words people actually use for runtime, mapped to minutes
RUNTIME_HINTS = [
    (r"\b(short|quick|brief)\b", {"runtime_max": 100}),
    (r"\b(long|epic|lengthy)\b", {"runtime_min": 150}),
    (r"\bunder (?:an? )?(\d+)\s*(?:hours?|hrs?)\b", None),
    (r"\bunder (\d+)\s*(?:minutes?|mins?)\b", None),
]

RATING_HINTS = [
    (r"\b(highly[- ]rated|best|top[- ]rated|acclaimed|great)\b", 7.5),
    (r"\b(masterpiece|classic)\b", 8.0),
]

# Mood words mapped onto genre names. Shared by the library-clamped keyword
# parser and the open-vocabulary parser below - it's the same dictionary
# either way, just checked against a different (owned vs. TMDB-wide) list of
# genres that actually exist.
MOOD_GENRES = {
    "scary": "horror", "spooky": "horror", "creepy": "horror",
    "funny": "comedy", "laugh": "comedy", "hilarious": "comedy",
    "romantic": "romance", "love": "romance",
    "sci-fi": "science fiction", "scifi": "science fiction",
    "space": "science fiction", "futuristic": "science fiction",
    "thrilling": "thriller", "tense": "thriller", "suspense": "thriller",
    "animated": "animation", "cartoon": "animation",
    "documentary": "documentary", "gangster": "crime", "heist": "crime",
}

# Nationality/language words -> ISO-639-1 code. Deliberately a flat word list,
# not an NLP model: see docs/tasks/discover-chat-nlp.md for why this is the
# right size of tool for "korean action movie" style requests.
LANGUAGE_WORDS = {
    "english": "en", "american": "en", "british": "en",
    "japanese": "ja", "hindi": "hi", "indian": "hi", "korean": "ko",
    "french": "fr", "spanish": "es", "german": "de", "italian": "it",
    "chinese": "zh", "mandarin": "zh", "cantonese": "zh", "russian": "ru",
    "portuguese": "pt", "tamil": "ta", "telugu": "te", "malayalam": "ml",
    "swedish": "sv", "danish": "da", "dutch": "nl", "polish": "pl",
    "turkish": "tr", "thai": "th", "arabic": "ar", "persian": "fa", "iranian": "fa",
}

# Words the open-vocabulary parser never treats as part of a person's name -
# common function words, plus every word this module already assigns a
# meaning to (genres, languages, runtime/rating/date vocabulary). Whatever is
# left over after stripping these out is what gets tried against TMDB's own
# person search (see _extract_name_candidates).
_NAME_STOPWORDS = {
    "a", "an", "the", "movie", "movies", "film", "films", "show", "shows", "me",
    "recommend", "suggest", "find", "give", "some", "something", "please",
    "for", "of", "with", "and", "in", "on", "at", "is", "are", "to", "from",
    "that", "this", "it", "its", "i", "want", "would", "can", "you", "my",
    "list", "lists", "tonight", "watch", "watching", "or",
    "under", "less", "than", "more", "hours", "hour", "hrs", "minutes",
    "minute", "mins", "short", "quick", "brief", "long", "epic", "lengthy",
    "highly", "rated", "best", "top", "acclaimed", "great", "masterpiece",
    "classic", "early", "late", "before", "after", "between",
    "directed", "director", "directing", "by", "starring", "stars",
    "featuring", "cast", "like",
}
_NAME_STOPWORDS |= set(LANGUAGE_WORDS)
for _genre_name in GENRE_MAP.values():
    _NAME_STOPWORDS |= {w.lower() for w in _genre_name.split()}

# Readable name for the reply sentence only - filters keep the ISO code,
# which is what TMDB's with_original_language actually wants.
LANGUAGE_DISPLAY = {
    "en": "English", "ja": "Japanese", "hi": "Hindi", "ko": "Korean",
    "fr": "French", "es": "Spanish", "de": "German", "it": "Italian",
    "zh": "Chinese", "ru": "Russian", "pt": "Portuguese", "ta": "Tamil",
    "te": "Telugu", "ml": "Malayalam", "sv": "Swedish", "da": "Danish",
    "nl": "Dutch", "pl": "Polish", "tr": "Turkish", "th": "Thai",
    "ar": "Arabic", "fa": "Persian",
}


def _system_prompt(options):
    """
    Build the instruction, embedding the user's own library vocabulary.

    Listing the valid values inline is what keeps the model grounded: it is
    choosing from a closed set that exists in this database, not free-writing
    filter values that would match nothing.
    """
    def values(key):
        return [o["value"] for o in options.get(key, [])]

    runtime = options.get("runtime") or {}

    return (
        "You turn a movie watcher's request into structured filters for their "
        "own saved movie library.\n\n"
        "Choose ONLY from these values, which are the ones that actually exist "
        "in this user's library. Never invent a value outside these lists.\n\n"
        f"Genres: {values('genres')}\n"
        f"Directors: {values('directors')}\n"
        f"Actors: {values('actors')}\n"
        f"Language codes: {values('languages')}\n"
        f"Runtime in their library ranges {runtime.get('min', 0)}-{runtime.get('max', 0)} minutes.\n\n"
        "Rules:\n"
        "- Leave a list empty when the request says nothing about it. Empty is "
        "normal and better than a wrong guess.\n"
        "- Map mood words onto genres you were given (scary -> Horror, "
        "funny -> Comedy, mind-bending -> Science Fiction or Mystery).\n"
        "- 'short' means runtime_max around 100; 'long' means runtime_min "
        "around 150. Convert stated hours to minutes.\n"
        "- Only set min_rating when they ask for quality (0-10 scale).\n"
        "- If they name a person not in the lists above, ignore that part and "
        "say so warmly in your reply.\n"
        "- reply: one friendly sentence, max 25 words, saying what you are "
        "looking for. No preamble, no lists, no markdown."
    )


def parse_with_claude(message, options, history=None):
    """
    Ask Claude for schema-validated filters.

    Returns (filters_dict, reply_text) or None when Claude is unavailable, so
    the caller can fall back to keywords rather than failing the request.
    """
    api_key = getattr(settings, "ANTHROPIC_API_KEY", "")
    if not api_key:
        return None

    try:
        import anthropic
        from pydantic import BaseModel, Field
    except ImportError:
        logger.warning("anthropic/pydantic not installed; using keyword parser.")
        return None

    class MovieFilters(BaseModel):
        """Filters extracted from the user's request."""
        genres: list[str] = Field(default_factory=list)
        directors: list[str] = Field(default_factory=list)
        actors: list[str] = Field(default_factory=list)
        languages: list[str] = Field(default_factory=list)
        runtime_min: int | None = None
        runtime_max: int | None = None
        min_rating: float | None = None
        reply: str = ""

    messages = []
    for turn in (history or [])[-6:]:  # a little context, not the whole log
        role = turn.get("role")
        content = (turn.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.parse(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=_system_prompt(options),
            messages=messages,
            output_format=MovieFilters,
            output_config={"effort": EFFORT},
        )
    except Exception as e:
        logger.warning("Claude chat parse failed (%s). Falling back to keywords.", e)
        return None

    if response.stop_reason == "refusal":
        logger.warning("Claude declined the chat request.")
        return None

    parsed = response.parsed_output
    if parsed is None:
        return None

    filters = {
        "genres": parsed.genres or [],
        "directors": parsed.directors or [],
        "actors": parsed.actors or [],
        "languages": parsed.languages or [],
        "runtime_min": parsed.runtime_min,
        "runtime_max": parsed.runtime_max,
        "min_rating": parsed.min_rating,
    }
    return _clamp_to_library(filters, options), (parsed.reply or "").strip()


def parse_with_keywords(message, options):
    """
    Dependency-free fallback parser.

    Deliberately literal: it matches the library's own genre, director, actor
    and language names against the sentence, plus a few runtime and quality
    hints. It will miss nuance, which is exactly why the Claude path exists.
    """
    text = (message or "").lower()
    filters = {
        "genres": [], "directors": [], "actors": [], "languages": [],
        "runtime_min": None, "runtime_max": None, "min_rating": None,
    }

    def match(key):
        found = []
        for option in options.get(key, []):
            value = option["value"]
            if re.search(rf"\b{re.escape(value.lower())}\b", text):
                found.append(value)
        return found

    filters["genres"] = match("genres")
    filters["directors"] = match("directors")
    filters["actors"] = match("actors")

    # Languages are stored as codes, so match on the readable name too
    language_names = {
        "en": "english", "ja": "japanese", "hi": "hindi", "ko": "korean",
        "fr": "french", "es": "spanish", "de": "german", "it": "italian",
        "zh": "chinese", "ru": "russian", "pt": "portuguese", "ta": "tamil",
        "te": "telugu", "ml": "malayalam", "sv": "swedish", "da": "danish",
        "nl": "dutch", "pl": "polish", "tr": "turkish", "th": "thai",
        "ar": "arabic", "fa": "persian",
    }
    for option in options.get("languages", []):
        code = option["value"]
        name = language_names.get(code, code)
        if re.search(rf"\b{re.escape(name)}\b", text) or re.search(rf"\b{re.escape(code)}\b", text):
            filters["languages"].append(code)

    # Mood words that map onto genres the user actually owns
    owned = {o["value"].lower(): o["value"] for o in options.get("genres", [])}
    for word, genre in MOOD_GENRES.items():
        if word in text and genre in owned and owned[genre] not in filters["genres"]:
            filters["genres"].append(owned[genre])

    # Runtime
    hours = re.search(r"\bunder (?:an? |two |three )?(\d+)?\s*(?:hours?|hrs?)\b", text)
    if hours:
        n = int(hours.group(1)) if hours.group(1) else (2 if "two" in text else 1)
        filters["runtime_max"] = n * 60
    else:
        minutes = re.search(r"\bunder (\d+)\s*(?:minutes?|mins?)\b", text)
        if minutes:
            filters["runtime_max"] = int(minutes.group(1))
        elif re.search(r"\b(short|quick|brief)\b", text):
            filters["runtime_max"] = 100
        elif re.search(r"\b(long|epic|lengthy)\b", text):
            filters["runtime_min"] = 150

    # Quality
    for pattern, rating in RATING_HINTS:
        if re.search(pattern, text):
            filters["min_rating"] = rating
            break

    return _clamp_to_library(filters, options), _keyword_reply(filters)


def _clamp_to_library(filters, options):
    """
    Drop any value that is not in the user's library.

    The model is told not to invent values, but this makes it structural
    rather than a matter of the model behaving - a hallucinated director
    would otherwise filter the library down to zero with no explanation.
    """
    for key in ("genres", "directors", "actors", "languages"):
        valid = {o["value"].lower(): o["value"] for o in options.get(key, [])}
        filters[key] = [
            valid[str(v).lower()] for v in (filters.get(key) or [])
            if str(v).lower() in valid
        ]
    return filters


def _keyword_reply(filters):
    parts = []
    if filters["genres"]:
        parts.append(" / ".join(filters["genres"]))
    if filters["directors"]:
        parts.append(f"directed by {', '.join(filters['directors'])}")
    if filters["actors"]:
        parts.append(f"starring {', '.join(filters['actors'])}")
    if filters["languages"]:
        parts.append(f"in {', '.join(filters['languages'])}")
    if filters["runtime_max"]:
        parts.append(f"under {filters['runtime_max']} min")
    if filters["runtime_min"]:
        parts.append(f"over {filters['runtime_min']} min")
    if filters["min_rating"]:
        parts.append(f"rated {filters['min_rating']}+")

    if not parts:
        return "Here's a random pick from your library."
    return "Looking for " + ", ".join(parts) + "."


def _parse_year_range(text):
    """
    Literal years, decades and relative-date phrases -> (year_min, year_max).

    Handles "2026" (a single year), "90s" / "early 2000s" / "late 2000s",
    "before 2010", "after 2015", and "between 2000 and 2010" - and a literal
    year alongside a decade phrase (e.g. "between 2000 and 2010s") is taken
    as a second endpoint, min/max regardless of which came first.
    """
    year_min = year_max = None

    decade = re.search(r"\b(19|20)(\d0)s\b", text)
    if decade:
        base = int(decade.group(1) + decade.group(2))
        if re.search(r"\blate\b", text):
            year_min, year_max = base + 5, base + 9
        elif re.search(r"\bearly\b", text):
            year_min, year_max = base, base + 4
        else:
            year_min, year_max = base, base + 9

    before = re.search(r"\bbefore (\d{4})\b", text)
    if before:
        year_max = int(before.group(1)) - 1
    after = re.search(r"\bafter (\d{4})\b", text)
    if after:
        year_min = int(after.group(1)) + 1

    between = re.search(r"\bbetween (\d{4}) and (\d{4})\b", text)
    if between:
        a, b = int(between.group(1)), int(between.group(2))
        year_min, year_max = min(a, b), max(a, b)

    # A bare year (not already consumed by "before"/"after"/"between" above)
    # is either the one date the sentence names, or a second endpoint next
    # to a decade phrase - either way, fold it into the min/max so far.
    literal_years = [int(y) for y in re.findall(r"\b(?:19|20)\d{2}\b", text)]
    for y in literal_years:
        year_min = y if year_min is None else min(year_min, y)
        year_max = y if year_max is None else max(year_max, y)

    return year_min, year_max


def _extract_name_candidates(message):
    """
    Whatever words are left after removing known vocabulary and stopwords,
    grouped back into phrases. Only phrases of 2+ words are returned - a
    single leftover word is too likely to be noise (a mood word this
    module's dictionaries don't happen to cover, a typo, "tonight") to spend
    a TMDB lookup resolving it as a person. Casing is irrelevant; TMDB's own
    /search/person does the fuzzy matching once a candidate is sent to it.
    """
    words = re.findall(r"[A-Za-z']+", message)
    groups, current = [], []
    for w in words:
        if w.lower() in _NAME_STOPWORDS:
            if current:
                groups.append(current)
                current = []
            continue
        current.append(w)
    if current:
        groups.append(current)

    phrases = [" ".join(g) for g in groups if len(g) >= 2]
    return phrases[:2]  # cap TMDB lookups per message


def _describe_filters(filters, matched_people):
    """
    One short label per matched piece of the request - a genre stays its
    own chip rather than being joined into a slash-separated string, so the
    Discover UI can show these as individual "Understood as" chips under a
    round, not just buried in the reply sentence.
    """
    chips = []
    chips.extend(filters["genres"])
    chips.extend(matched_people)
    if filters["language"]:
        chips.append(LANGUAGE_DISPLAY.get(filters["language"], filters["language"]))
    if filters["year_min"] or filters["year_max"]:
        if filters["year_min"] and filters["year_max"] and filters["year_min"] != filters["year_max"]:
            chips.append(f"{filters['year_min']}-{filters['year_max']}")
        else:
            chips.append(str(filters["year_min"] or filters["year_max"]))
    if filters["runtime_max"]:
        chips.append(f"Under {filters['runtime_max']} min")
    if filters["min_rating"]:
        chips.append(f"Rated {filters['min_rating']}+")

    seen = set()
    deduped = []
    for chip in chips:
        key = chip.lower()
        if key not in seen:
            seen.add(key)
            deduped.append(chip)
    return deduped


def _open_vocab_reply(chips):
    if not chips:
        return "Searching the web for something to watch."
    return "Looking for " + ", ".join(chips) + " on the web."


def parse_open_vocabulary(message):
    """
    Turn a free-form sentence into TMDB discover criteria - open vocabulary,
    not clamped to the user's library. This is the Web-source "Ask" parser;
    contrast parse_with_keywords, which deliberately only matches values the
    user already owns (correct for Library, wrong for Web - see
    docs/tasks/discover-chat-nlp.md).

    No training, no ML model: dictionary lookup for the finite vocabularies
    (every TMDB genre, a language/nationality word list, decade/year
    phrases, runtime and rating hints), plus TMDB's own /search/person for
    the one genuinely open-ended field, people.

    Returns (filters, reply, understood). filters has: genres (list[str]),
    language (str|None, ISO-639-1), year_min/year_max (int|None),
    runtime_max (int|None), min_rating (float|None), cast_ids/crew_ids
    (list[int]). understood is a list[str] of short human-readable labels -
    one per matched genre/person/language/date/runtime/rating - for the
    Discover UI's "Understood as" chips.
    """
    text = (message or "").lower()

    genres = []
    for name in GENRE_MAP.values():
        if re.search(rf"\b{re.escape(name.lower())}\b", text) and name not in genres:
            genres.append(name)
    genres_lower = {n.lower(): n for n in GENRE_MAP.values()}
    for word, genre in MOOD_GENRES.items():
        if re.search(rf"\b{re.escape(word)}\b", text) and genres_lower[genre] not in genres:
            genres.append(genres_lower[genre])

    language = None
    for word, code in LANGUAGE_WORDS.items():
        if re.search(rf"\b{re.escape(word)}\b", text):
            language = code
            break

    year_min, year_max = _parse_year_range(text)

    runtime_max = None
    hours = re.search(r"\b(?:under|less than) (?:an? |two |three )?(\d+)?\s*(?:hours?|hrs?)\b", text)
    minutes = re.search(r"\b(?:under|less than) (\d+)\s*(?:minutes?|mins?)\b", text)
    if hours:
        n = int(hours.group(1)) if hours.group(1) else (2 if "two" in text else 1)
        runtime_max = n * 60
    elif minutes:
        runtime_max = int(minutes.group(1))
    elif re.search(r"\b(short|quick|brief)\b", text):
        runtime_max = 100

    min_rating = None
    for pattern, rating in RATING_HINTS:
        if re.search(pattern, text):
            min_rating = rating
            break

    # People: the one open-ended field. A leftover multi-word span gets
    # checked against TMDB's own person search; "directed"/"director"
    # anywhere in the sentence steers a match to crew instead of cast.
    cast_ids, crew_ids, matched_people = [], [], []
    wants_director = bool(re.search(r"\bdirect", text))
    for phrase in _extract_name_candidates(message):
        results = tmdb_service.search_person(phrase)
        if not results:
            continue
        person = results[0]
        matched_people.append(person["name"])
        if wants_director or person.get("department") == "Directing":
            crew_ids.append(person["id"])
        else:
            cast_ids.append(person["id"])

    filters = {
        "genres": genres,
        "language": language,
        "year_min": year_min,
        "year_max": year_max,
        "runtime_max": runtime_max,
        "min_rating": min_rating,
        "cast_ids": cast_ids,
        "crew_ids": crew_ids,
    }
    understood = _describe_filters(filters, matched_people)
    return filters, _open_vocab_reply(understood), understood


def interpret(message, list_id=None, history=None, user=None):
    """
    Turn a chat message into filters, preferring Claude and falling back to
    keywords. Returns (filters, reply, source).
    """
    options = get_filter_options(list_id=list_id, user=user)

    result = parse_with_claude(message, options, history=history)
    if result is not None:
        filters, reply = result
        return filters, (reply or _keyword_reply(filters)), "claude"

    filters, reply = parse_with_keywords(message, options)
    return filters, reply, "keywords"
