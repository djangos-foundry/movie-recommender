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
    moods = {
        "scary": "horror", "spooky": "horror", "creepy": "horror",
        "funny": "comedy", "laugh": "comedy", "hilarious": "comedy",
        "romantic": "romance", "love": "romance",
        "sci-fi": "science fiction", "scifi": "science fiction",
        "space": "science fiction", "futuristic": "science fiction",
        "thrilling": "thriller", "tense": "thriller", "suspense": "thriller",
        "animated": "animation", "cartoon": "animation",
        "documentary": "documentary", "gangster": "crime", "heist": "crime",
    }
    for word, genre in moods.items():
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


def interpret(message, list_id=None, history=None):
    """
    Turn a chat message into filters, preferring Claude and falling back to
    keywords. Returns (filters, reply, source).
    """
    options = get_filter_options(list_id=list_id)

    result = parse_with_claude(message, options, history=history)
    if result is not None:
        filters, reply = result
        return filters, (reply or _keyword_reply(filters)), "claude"

    filters, reply = parse_with_keywords(message, options)
    return filters, reply, "keywords"
