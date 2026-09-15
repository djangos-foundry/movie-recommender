import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p"

GENRE_MAP = {
    28: "Action",
    12: "Adventure",
    16: "Animation",
    35: "Comedy",
    80: "Crime",
    99: "Documentary",
    18: "Drama",
    10751: "Family",
    14: "Fantasy",
    36: "History",
    27: "Horror",
    10402: "Music",
    9648: "Mystery",
    10749: "Romance",
    878: "Science Fiction",
    10770: "TV Movie",
    53: "Thriller",
    10752: "War",
    37: "Western",
}

# High-fidelity realistic mock database for popular movies
MOCK_MOVIES = [
    {
        "id": 157336,
        "tmdb_id": 157336,
        "title": "Interstellar",
        "original_title": "Interstellar",
        "overview": "The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel and conquer the vast distances involved in an interstellar voyage.",
        "poster_path": "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/xJHokMbljvjADYdit5fK5VQsXEG.jpg",
        "release_date": "2014-11-05",
        "vote_average": 8.4,
        "vote_count": 34500,
        "genres": ["Adventure", "Drama", "Science Fiction"],
        "runtime": 169,
    },
    {
        "id": 27205,
        "tmdb_id": 27205,
        "title": "Inception",
        "original_title": "Inception",
        "overview": "Cobb, a skilled thief who steals corporate secrets through use of dream-sharing technology, is given the inverse task of planting an idea into the mind of a C.E.O., but his tragic past may doom the project and his team to disaster.",
        "poster_path": "https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg",
        "release_date": "2010-07-15",
        "vote_average": 8.4,
        "vote_count": 36000,
        "genres": ["Action", "Science Fiction", "Adventure"],
        "runtime": 148,
    },
    {
        "id": 693134,
        "tmdb_id": 693134,
        "title": "Dune: Part Two",
        "original_title": "Dune: Part Two",
        "overview": "Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a path of revenge against the conspirators who destroyed his family.",
        "poster_path": "https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/xOMo8BRK7PfcJv9JCnx7s520frZ.jpg",
        "release_date": "2024-02-27",
        "vote_average": 8.2,
        "vote_count": 5200,
        "genres": ["Science Fiction", "Adventure"],
        "runtime": 166,
    },
    {
        "id": 155,
        "tmdb_id": 155,
        "title": "The Dark Knight",
        "original_title": "The Dark Knight",
        "overview": "Batman raises the stakes in his war on crime. With the help of Lt. Jim Gordon and District Attorney Harvey Dent, Batman sets out to dismantle the remaining criminal organizations that plague the streets.",
        "poster_path": "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/dqK9Hag1054tghRQSqLSfrkvQnA.jpg",
        "release_date": "2008-07-16",
        "vote_average": 8.5,
        "vote_count": 32000,
        "genres": ["Drama", "Action", "Crime", "Thriller"],
        "runtime": 152,
    },
    {
        "id": 872585,
        "tmdb_id": 872585,
        "title": "Oppenheimer",
        "original_title": "Oppenheimer",
        "overview": "The story of J. Robert Oppenheimer's role in the development of the atomic bomb during World War II.",
        "poster_path": "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg",
        "release_date": "2023-07-19",
        "vote_average": 8.1,
        "vote_count": 8900,
        "genres": ["Drama", "History"],
        "runtime": 181,
    },
    {
        "id": 569094,
        "tmdb_id": 569094,
        "title": "Spider-Man: Across the Spider-Verse",
        "original_title": "Spider-Man: Across the Spider-Verse",
        "overview": "After reuniting with Gwen Stacy, Brooklyn’s full-time, friendly neighborhood Spider-Man is catapulted across the Multiverse, where he encounters the Spider-Society, a team of Spider-People charged with protecting its very existence.",
        "poster_path": "https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/4HodYYKEIsGOdinkGi2Ucz6X9i0.jpg",
        "release_date": "2023-05-31",
        "vote_average": 8.4,
        "vote_count": 6700,
        "genres": ["Animation", "Action", "Adventure", "Science Fiction"],
        "runtime": 140,
    },
    {
        "id": 335984,
        "tmdb_id": 335984,
        "title": "Blade Runner 2049",
        "original_title": "Blade Runner 2049",
        "overview": "Thirty years after the events of the first film, a new blade runner, LAPD Officer K, unearths a long-buried secret that has the potential to plunge what's left of society into chaos.",
        "poster_path": "https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/sAtoMqDVhNDQBc3QJL3RF6hl7q8.jpg",
        "release_date": "2017-10-04",
        "vote_average": 8.0,
        "vote_count": 13000,
        "genres": ["Science Fiction", "Mystery", "Drama"],
        "runtime": 164,
    },
    {
        "id": 603,
        "tmdb_id": 603,
        "title": "The Matrix",
        "original_title": "The Matrix",
        "overview": "Set in the 22nd century, The Matrix tells the story of a computer hacker who joins a group of underground insurgents fighting the vast and powerful computers who now rule the earth.",
        "poster_path": "https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/hEpWvX6Bp79eLxY1W95UR72780U.jpg",
        "release_date": "1999-03-30",
        "vote_average": 8.2,
        "vote_count": 25000,
        "genres": ["Action", "Science Fiction"],
        "runtime": 136,
    },
    {
        "id": 129,
        "tmdb_id": 129,
        "title": "Spirited Away",
        "original_title": "千と千尋の神隠し",
        "overview": "A young girl, Chihiro, becomes trapped in a strange new world of spirits. When her parents undergo a mysterious transformation, she must call upon the courage she never knew she had to free her family.",
        "poster_path": "https://image.tmdb.org/t/p/w500/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/mSDsSDwaP3E7dEfUPWy4J0djt4O.jpg",
        "release_date": "2001-07-20",
        "vote_average": 8.5,
        "vote_count": 16000,
        "genres": ["Animation", "Family", "Fantasy"],
        "runtime": 125,
    },
    {
        "id": 680,
        "tmdb_id": 680,
        "title": "Pulp Fiction",
        "original_title": "Pulp Fiction",
        "overview": "A burger-loving hit man, his philosophical partner, a drug-addled gangster's moll and a washed-up boxer converge in this sprawling, comedic crime caper.",
        "poster_path": "https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg",
        "release_date": "1994-09-10",
        "vote_average": 8.5,
        "vote_count": 27000,
        "genres": ["Thriller", "Crime"],
        "runtime": 154,
    },
]


def format_poster_url(path):
    if not path:
        return ""
    if path.startswith("http://") or path.startswith("https://"):
        return path
    return f"{TMDB_IMAGE_BASE_URL}/w500{path}"


def format_backdrop_url(path):
    if not path:
        return ""
    if path.startswith("http://") or path.startswith("https://"):
        return path
    return f"{TMDB_IMAGE_BASE_URL}/original{path}"


def normalize_genres(raw_genres, genre_ids=None):
    if raw_genres and isinstance(raw_genres, list):
        if len(raw_genres) > 0 and isinstance(raw_genres[0], dict):
            return [g.get("name") for g in raw_genres if g.get("name")]
        return [str(g) for g in raw_genres]
    if genre_ids and isinstance(genre_ids, list):
        return [GENRE_MAP.get(gid, "Movie") for gid in genre_ids if gid in GENRE_MAP]
    return []


class TMDBService:
    BASE_URL = "https://api.themoviedb.org/3"

    def __init__(self, api_key=None):
        self.api_key = api_key or getattr(settings, "TMDB_API_KEY", "")

    def search_movies(self, query, page=1):
        """Search movies from TMDB API or fallback to mock data."""
        clean_query = (query or "").strip().lower()

        if self.api_key:
            try:
                response = requests.get(
                    f"{self.BASE_URL}/search/movie",
                    params={
                        "api_key": self.api_key,
                        "query": query,
                        "page": page,
                        "include_adult": False,
                    },
                    timeout=4,
                )
                if response.status_code == 200:
                    data = response.json()
                    formatted_results = []
                    for item in data.get("results", []):
                        genres = normalize_genres(None, item.get("genre_ids", []))
                        formatted_results.append({
                            "id": item.get("id"),
                            "tmdb_id": item.get("id"),
                            "title": item.get("title", ""),
                            "original_title": item.get("original_title", ""),
                            "overview": item.get("overview", ""),
                            "poster_path": format_poster_url(item.get("poster_path")),
                            "backdrop_path": format_backdrop_url(item.get("backdrop_path")),
                            "release_date": item.get("release_date", ""),
                            "vote_average": float(item.get("vote_average", 0.0)),
                            "vote_count": int(item.get("vote_count", 0)),
                            "genres": genres,
                            "runtime": 0,
                        })
                    return {
                        "page": data.get("page", 1),
                        "results": formatted_results,
                        "total_results": data.get("total_results", len(formatted_results)),
                        "total_pages": data.get("total_pages", 1),
                    }
                else:
                    logger.warning(
                        "TMDB search returned %s: %s. Falling back to mock data.",
                        response.status_code,
                        response.text,
                    )
            except Exception as e:
                logger.warning("TMDB search request failed (%s). Falling back to mock data.", e)

        # Fallback to rich mock search
        return self._mock_search(clean_query, page=page)

    def get_movie_details(self, tmdb_id):
        """Fetch movie details by TMDB ID from API or fallback mock data."""
        try:
            tmdb_id_int = int(tmdb_id)
        except (ValueError, TypeError):
            return None

        if self.api_key:
            try:
                response = requests.get(
                    f"{self.BASE_URL}/movie/{tmdb_id_int}",
                    params={"api_key": self.api_key},
                    timeout=4,
                )
                if response.status_code == 200:
                    data = response.json()
                    genres = normalize_genres(data.get("genres", []), data.get("genre_ids", []))
                    return {
                        "id": data.get("id"),
                        "tmdb_id": data.get("id"),
                        "title": data.get("title", ""),
                        "original_title": data.get("original_title", ""),
                        "overview": data.get("overview", ""),
                        "poster_path": format_poster_url(data.get("poster_path")),
                        "backdrop_path": format_backdrop_url(data.get("backdrop_path")),
                        "release_date": data.get("release_date", ""),
                        "vote_average": float(data.get("vote_average", 0.0)),
                        "vote_count": int(data.get("vote_count", 0)),
                        "genres": genres,
                        "runtime": data.get("runtime") or 0,
                    }
                else:
                    logger.warning(
                        "TMDB movie details returned %s. Falling back to mock.",
                        response.status_code,
                    )
            except Exception as e:
                logger.warning("TMDB detail request failed (%s). Falling back to mock.", e)

        # Fallback to mock lookup
        for m in MOCK_MOVIES:
            if m["tmdb_id"] == tmdb_id_int:
                return dict(m)

        # If not found in mock list, generate a plausible mock record
        return {
            "id": tmdb_id_int,
            "tmdb_id": tmdb_id_int,
            "title": f"Movie #{tmdb_id_int}",
            "original_title": f"Movie #{tmdb_id_int}",
            "overview": "Information is currently unavailable for this title.",
            "poster_path": "",
            "backdrop_path": "",
            "release_date": "",
            "vote_average": 0.0,
            "vote_count": 0,
            "genres": ["Drama"],
            "runtime": 120,
        }

    def _mock_search(self, query, page=1):
        if not query:
            results = list(MOCK_MOVIES)
        else:
            matches = []
            for m in MOCK_MOVIES:
                q = query.lower()
                genres_str = " ".join(m.get("genres", [])).lower()
                if (
                    q in m["title"].lower()
                    or q in m["original_title"].lower()
                    or q in m["overview"].lower()
                    or q in genres_str
                ):
                    matches.append(m)
            results = matches if matches else list(MOCK_MOVIES)

        return {
            "page": page,
            "results": results,
            "total_results": len(results),
            "total_pages": 1,
        }


# Singleton instance
tmdb_service = TMDBService()
