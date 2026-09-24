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

# Reverse lookup so a stored genre name can be turned back into a TMDB genre id
GENRE_NAME_TO_ID = {name.lower(): gid for gid, name in GENRE_MAP.items()}

# High-fidelity realistic mock database for popular movies
MOCK_MOVIES = [
    {
        "id": 157336,
        "tmdb_id": 157336,
        "title": "Interstellar",
        "original_title": "Interstellar",
        "tagline": "Mankind was born on Earth. It was never meant to die here.",
        "overview": "The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel and conquer the vast distances involved in an interstellar voyage.",
        "poster_path": "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/xJHokMbljvjADYdit5fK5VQsXEG.jpg",
        "release_date": "2014-11-05",
        "vote_average": 8.4,
        "vote_count": 34500,
        "popularity": 145.2,
        "genres": ["Adventure", "Drama", "Science Fiction"],
        "runtime": 169,
        "director": "Christopher Nolan",
        "crew": [
            {"name": "Christopher Nolan", "job": "Director", "department": "Directing"},
            {"name": "Jonathan Nolan", "job": "Writer", "department": "Writing"},
            {"name": "Emma Thomas", "job": "Producer", "department": "Production"},
            {"name": "Lynda Obst", "job": "Producer", "department": "Production"},
        ],
        "release_status": "Released",
        "original_language": "en",
        "production_countries": [
            {"iso_3166_1": "US", "name": "United States of America"},
            {"iso_3166_1": "GB", "name": "United Kingdom"},
        ],
        "cast": [
            {"id": 10297, "name": "Matthew McConaughey", "character": "Joseph Cooper", "profile_path": "https://image.tmdb.org/t/p/w500/sY2mwpafcwqyYS1sOySu19IfFu6.jpg"},
            {"id": 1813, "name": "Anne Hathaway", "character": "Dr. Amelia Brand", "profile_path": "https://image.tmdb.org/t/p/w500/tLel4qkSJvKKEUQrqMu8Kp86rwn.jpg"},
            {"id": 83002, "name": "Jessica Chastain", "character": "Murphy Cooper", "profile_path": "https://image.tmdb.org/t/p/w500/lodMzLKSdrpBgMiXWIEugakG1zl.jpg"},
            {"id": 3895, "name": "Michael Caine", "character": "Professor John Brand", "profile_path": "https://image.tmdb.org/t/p/w500/h5O0v5254yqU9bMLu5w5mF5g8eA.jpg"},
        ],
        "imdb_id": "tt0816692",
        "budget": 165000000,
        "revenue": 701729206,
        "homepage": "http://www.interstellarmovie.net/",
        "spoken_languages": [{"english_name": "English", "iso_639_1": "en", "name": "English"}],
        "production_companies": [
            {"id": 923, "name": "Legendary Pictures"},
            {"id": 9996, "name": "Syncopy"},
            {"id": 4, "name": "Paramount"},
            {"id": 6194, "name": "Warner Bros. Pictures"},
        ],
    },
    {
        "id": 27205,
        "tmdb_id": 27205,
        "title": "Inception",
        "original_title": "Inception",
        "tagline": "Your mind is the scene of the crime.",
        "overview": "Cobb, a skilled thief who steals corporate secrets through use of dream-sharing technology, is given the inverse task of planting an idea into the mind of a C.E.O., but his tragic past may doom the project and his team to disaster.",
        "poster_path": "https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg",
        "release_date": "2010-07-15",
        "vote_average": 8.4,
        "vote_count": 36000,
        "popularity": 138.5,
        "genres": ["Action", "Science Fiction", "Adventure"],
        "runtime": 148,
        "director": "Christopher Nolan",
        "crew": [
            {"name": "Christopher Nolan", "job": "Director", "department": "Directing"},
            {"name": "Emma Thomas", "job": "Producer", "department": "Production"},
        ],
        "release_status": "Released",
        "original_language": "en",
        "production_countries": [
            {"iso_3166_1": "US", "name": "United States of America"},
            {"iso_3166_1": "GB", "name": "United Kingdom"},
        ],
        "cast": [
            {"id": 6193, "name": "Leonardo DiCaprio", "character": "Dom Cobb", "profile_path": "https://image.tmdb.org/t/p/w500/wo2hJpn04vbtmh0B9utCFdsQhxM.jpg"},
            {"id": 24045, "name": "Joseph Gordon-Levitt", "character": "Arthur", "profile_path": "https://image.tmdb.org/t/p/w500/4G2t19Yc2c8f18k1n7m0j9.jpg"},
            {"id": 27578, "name": "Elliot Page", "character": "Ariadne", "profile_path": "https://image.tmdb.org/t/p/w500/tp1n6eYyEwFhKqjLwFp3VvKk1lU.jpg"},
            {"id": 2524, "name": "Tom Hardy", "character": "Eames", "profile_path": "https://image.tmdb.org/t/p/w500/d81K0Rh8UX7tZjY9EN08g9.jpg"},
        ],
        "imdb_id": "tt1375666",
        "budget": 160000000,
        "revenue": 836836967,
        "homepage": "https://www.warnerbros.com/movies/inception",
        "spoken_languages": [{"english_name": "English", "iso_639_1": "en", "name": "English"}],
        "production_companies": [
            {"id": 923, "name": "Legendary Pictures"},
            {"id": 9996, "name": "Syncopy"},
        ],
    },
    {
        "id": 693134,
        "tmdb_id": 693134,
        "title": "Dune: Part Two",
        "original_title": "Dune: Part Two",
        "tagline": "Long live the fighters.",
        "overview": "Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a path of revenge against the conspirators who destroyed his family.",
        "poster_path": "https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/xOMo8BRK7PfcJv9JCnx7s520frZ.jpg",
        "release_date": "2024-02-27",
        "vote_average": 8.2,
        "vote_count": 5200,
        "popularity": 160.0,
        "genres": ["Science Fiction", "Adventure"],
        "runtime": 166,
        "director": "Denis Villeneuve",
        "crew": [
            {"name": "Denis Villeneuve", "job": "Director", "department": "Directing"},
            {"name": "Jon Spaihts", "job": "Writer", "department": "Writing"},
            {"name": "Mary Parent", "job": "Producer", "department": "Production"},
        ],
        "release_status": "Released",
        "original_language": "en",
        "production_countries": [{"iso_3166_1": "US", "name": "United States of America"}],
        "cast": [
            {"id": 1190668, "name": "Timothée Chalamet", "character": "Paul Atreides", "profile_path": "https://image.tmdb.org/t/p/w500/BE2sdjpgsa2rNTFa66ABviq5BR.jpg"},
            {"id": 505710, "name": "Zendaya", "character": "Chani", "profile_path": "https://image.tmdb.org/t/p/w500/rS7d3q8V2k89c1J.jpg"},
        ],
        "imdb_id": "tt15239678",
        "budget": 190000000,
        "revenue": 711844358,
        "homepage": "https://www.dunemovie.com",
        "spoken_languages": [{"english_name": "English", "iso_639_1": "en", "name": "English"}],
        "production_companies": [{"id": 923, "name": "Legendary Pictures"}],
    },
    {
        "id": 155,
        "tmdb_id": 155,
        "title": "The Dark Knight",
        "original_title": "The Dark Knight",
        "tagline": "Why so serious?",
        "overview": "Batman raises the stakes in his war on crime. With the help of Lt. Jim Gordon and District Attorney Harvey Dent, Batman sets out to dismantle the remaining criminal organizations that plague the streets.",
        "poster_path": "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/dqK9Hag1054tghRQSqLSfrkvQnA.jpg",
        "release_date": "2008-07-16",
        "vote_average": 8.5,
        "vote_count": 32000,
        "popularity": 125.0,
        "genres": ["Drama", "Action", "Crime", "Thriller"],
        "runtime": 152,
        "director": "Christopher Nolan",
        "crew": [
            {"name": "Christopher Nolan", "job": "Director", "department": "Directing"},
            {"name": "Jonathan Nolan", "job": "Writer", "department": "Writing"},
            {"name": "Charles Roven", "job": "Producer", "department": "Production"},
        ],
        "release_status": "Released",
        "original_language": "en",
        "production_countries": [
            {"iso_3166_1": "US", "name": "United States of America"},
            {"iso_3166_1": "GB", "name": "United Kingdom"},
        ],
        "cast": [
            {"id": 3894, "name": "Christian Bale", "character": "Bruce Wayne / Batman"},
            {"id": 1810, "name": "Heath Ledger", "character": "Joker"},
            {"id": 3895, "name": "Aaron Eckhart", "character": "Harvey Dent"},
        ],
        "imdb_id": "tt0468569",
        "budget": 185000000,
        "revenue": 1004558444,
        "homepage": "https://www.warnerbros.com/movies/dark-knight",
        "spoken_languages": [{"english_name": "English", "iso_639_1": "en", "name": "English"}],
        "production_companies": [{"id": 9996, "name": "Syncopy"}, {"id": 6194, "name": "Warner Bros. Pictures"}],
    },
    {
        "id": 872585,
        "tmdb_id": 872585,
        "title": "Oppenheimer",
        "original_title": "Oppenheimer",
        "tagline": "The world forever changes.",
        "overview": "The story of J. Robert Oppenheimer's role in the development of the atomic bomb during World War II.",
        "poster_path": "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg",
        "release_date": "2023-07-19",
        "vote_average": 8.1,
        "vote_count": 8900,
        "popularity": 130.0,
        "genres": ["Drama", "History"],
        "runtime": 181,
        "director": "Christopher Nolan",
        "crew": [
            {"name": "Christopher Nolan", "job": "Director", "department": "Directing"},
            {"name": "Emma Thomas", "job": "Producer", "department": "Production"},
        ],
        "release_status": "Released",
        "original_language": "en",
        "production_countries": [
            {"iso_3166_1": "US", "name": "United States of America"},
            {"iso_3166_1": "GB", "name": "United Kingdom"},
        ],
        "cast": [
            {"id": 2037, "name": "Cillian Murphy", "character": "J. Robert Oppenheimer"},
            {"id": 5081, "name": "Emily Blunt", "character": "Kitty Oppenheimer"},
        ],
        "imdb_id": "tt15398776",
        "budget": 100000000,
        "revenue": 957000000,
        "homepage": "https://www.oppenheimermovie.com",
        "spoken_languages": [{"english_name": "English", "iso_639_1": "en", "name": "English"}],
        "production_companies": [{"id": 9996, "name": "Syncopy"}, {"id": 33, "name": "Universal Pictures"}],
    },
    {
        "id": 569094,
        "tmdb_id": 569094,
        "title": "Spider-Man: Across the Spider-Verse",
        "original_title": "Spider-Man: Across the Spider-Verse",
        "tagline": "It's how you wear the mask that matters.",
        "overview": "After reuniting with Gwen Stacy, Brooklyn’s full-time, friendly neighborhood Spider-Man is catapulted across the Multiverse, where he encounters the Spider-Society, a team of Spider-People charged with protecting its very existence.",
        "poster_path": "https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/4HodYYKEIsGOdinkGi2Ucz6X9i0.jpg",
        "release_date": "2023-05-31",
        "vote_average": 8.4,
        "vote_count": 6700,
        "popularity": 140.0,
        "genres": ["Animation", "Action", "Adventure", "Science Fiction"],
        "runtime": 140,
        "director": "Joaquim Dos Santos",
        "crew": [
            {"name": "Joaquim Dos Santos", "job": "Director", "department": "Directing"},
            {"name": "Kemp Powers", "job": "Director", "department": "Directing"},
            {"name": "Justin K. Thompson", "job": "Director", "department": "Directing"},
            {"name": "Phil Lord", "job": "Writer", "department": "Writing"},
        ],
        "release_status": "Released",
        "original_language": "en",
        "production_countries": [{"iso_3166_1": "US", "name": "United States of America"}],
        "cast": [
            {"id": 587506, "name": "Shameik Moore", "character": "Miles Morales / Spider-Man"},
            {"id": 54693, "name": "Hailee Steinfeld", "character": "Gwen Stacy / Spider-Woman"},
        ],
        "imdb_id": "tt9362722",
        "budget": 100000000,
        "revenue": 690516673,
        "homepage": "https://www.acrossthespiderverse.movie",
        "spoken_languages": [{"english_name": "English", "iso_639_1": "en", "name": "English"}],
        "production_companies": [{"id": 5, "name": "Columbia Pictures"}, {"id": 2251, "name": "Sony Pictures Animation"}],
    },
    {
        "id": 335984,
        "tmdb_id": 335984,
        "title": "Blade Runner 2049",
        "original_title": "Blade Runner 2049",
        "tagline": "There's still a page left.",
        "overview": "Thirty years after the events of the first film, a new blade runner, LAPD Officer K, unearths a long-buried secret that has the potential to plunge what's left of society into chaos.",
        "poster_path": "https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/sAtoMqDVhNDQBc3QJL3RF6hl7q8.jpg",
        "release_date": "2017-10-04",
        "vote_average": 8.0,
        "vote_count": 13000,
        "popularity": 95.0,
        "genres": ["Science Fiction", "Mystery", "Drama"],
        "runtime": 164,
        "director": "Denis Villeneuve",
        "crew": [
            {"name": "Denis Villeneuve", "job": "Director", "department": "Directing"},
            {"name": "Hampton Fancher", "job": "Writer", "department": "Writing"},
            {"name": "Ridley Scott", "job": "Producer", "department": "Production"},
        ],
        "release_status": "Released",
        "original_language": "en",
        "production_countries": [{"iso_3166_1": "US", "name": "United States of America"}],
        "cast": [
            {"id": 30614, "name": "Ryan Gosling", "character": "K"},
            {"id": 3, "name": "Harrison Ford", "character": "Rick Deckard"},
        ],
        "imdb_id": "tt1856101",
        "budget": 150000000,
        "revenue": 267500000,
        "homepage": "http://bladerunnermovie.com",
        "spoken_languages": [{"english_name": "English", "iso_639_1": "en", "name": "English"}],
        "production_companies": [{"id": 491, "name": "Alcon Entertainment"}, {"id": 5, "name": "Columbia Pictures"}],
    },
    {
        "id": 603,
        "tmdb_id": 603,
        "title": "The Matrix",
        "original_title": "The Matrix",
        "tagline": "Welcome to the Real World.",
        "overview": "Set in the 22nd century, The Matrix tells the story of a computer hacker who joins a group of underground insurgents fighting the vast and powerful computers who now rule the earth.",
        "poster_path": "https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/hEpWvX6Bp79eLxY1W95UR72780U.jpg",
        "release_date": "1999-03-30",
        "vote_average": 8.2,
        "vote_count": 25000,
        "popularity": 110.0,
        "genres": ["Action", "Science Fiction"],
        "runtime": 136,
        "director": "Lana Wachowski",
        "crew": [
            {"name": "Lana Wachowski", "job": "Director", "department": "Directing"},
            {"name": "Lilly Wachowski", "job": "Director", "department": "Directing"},
            {"name": "Joel Silver", "job": "Producer", "department": "Production"},
        ],
        "release_status": "Released",
        "original_language": "en",
        "production_countries": [
            {"iso_3166_1": "US", "name": "United States of America"},
            {"iso_3166_1": "AU", "name": "Australia"},
        ],
        "cast": [
            {"id": 6384, "name": "Keanu Reeves", "character": "Neo"},
            {"id": 2975, "name": "Laurence Fishburne", "character": "Morpheus"},
        ],
        "imdb_id": "tt0133093",
        "budget": 63000000,
        "revenue": 463517383,
        "homepage": "https://www.warnerbros.com/movies/matrix",
        "spoken_languages": [{"english_name": "English", "iso_639_1": "en", "name": "English"}],
        "production_companies": [{"id": 79, "name": "Village Roadshow Pictures"}, {"id": 174, "name": "Warner Bros."}],
    },
    {
        "id": 129,
        "tmdb_id": 129,
        "title": "Spirited Away",
        "original_title": "千と千尋の神隠し",
        "tagline": "The tunnel led to a mysterious world.",
        "overview": "A young girl, Chihiro, becomes trapped in a strange new world of spirits. When her parents undergo a mysterious transformation, she must call upon the courage she never knew she had to free her family.",
        "poster_path": "https://image.tmdb.org/t/p/w500/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/mSDsSDwaP3E7dEfUPWy4J0djt4O.jpg",
        "release_date": "2001-07-20",
        "vote_average": 8.5,
        "vote_count": 16000,
        "popularity": 105.0,
        "genres": ["Animation", "Family", "Fantasy"],
        "runtime": 125,
        "director": "Hayao Miyazaki",
        "crew": [
            {"name": "Hayao Miyazaki", "job": "Director", "department": "Directing"},
            {"name": "Toshio Suzuki", "job": "Producer", "department": "Production"},
        ],
        "release_status": "Released",
        "original_language": "ja",
        "production_countries": [{"iso_3166_1": "JP", "name": "Japan"}],
        "cast": [
            {"id": 19588, "name": "Rumi Hiiragi", "character": "Chihiro Ogino (voice)"},
            {"id": 19589, "name": "Miyu Irino", "character": "Haku (voice)"},
        ],
        "imdb_id": "tt0245429",
        "budget": 19000000,
        "revenue": 395580000,
        "homepage": "https://www.ghibli.jp/works/chihiro/",
        "spoken_languages": [{"english_name": "Japanese", "iso_639_1": "ja", "name": "日本語"}],
        "production_companies": [{"id": 10342, "name": "Studio Ghibli"}],
    },
    {
        "id": 680,
        "tmdb_id": 680,
        "title": "Pulp Fiction",
        "original_title": "Pulp Fiction",
        "tagline": "Just because you are a character doesn't mean you have character.",
        "overview": "A burger-loving hit man, his philosophical partner, a drug-addled gangster's moll and a washed-up boxer converge in this sprawling, comedic crime caper.",
        "poster_path": "https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg",
        "backdrop_path": "https://image.tmdb.org/t/p/original/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg",
        "release_date": "1994-09-10",
        "vote_average": 8.5,
        "vote_count": 27000,
        "popularity": 115.0,
        "genres": ["Thriller", "Crime"],
        "runtime": 154,
        "director": "Quentin Tarantino",
        "crew": [
            {"name": "Quentin Tarantino", "job": "Director", "department": "Directing"},
            {"name": "Lawrence Bender", "job": "Producer", "department": "Production"},
        ],
        "release_status": "Released",
        "original_language": "en",
        "production_countries": [{"iso_3166_1": "US", "name": "United States of America"}],
        "cast": [
            {"id": 8891, "name": "John Travolta", "character": "Vincent Vega"},
            {"id": 2231, "name": "Samuel L. Jackson", "character": "Jules Winnfield"},
        ],
        "imdb_id": "tt0110912",
        "budget": 8000000,
        "revenue": 213928762,
        "homepage": "https://www.miramax.com/movie/pulp-fiction/",
        "spoken_languages": [{"english_name": "English", "iso_639_1": "en", "name": "English"}],
        "production_companies": [{"id": 14, "name": "Miramax"}, {"id": 59, "name": "A Band Apart"}],
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
                    params={"api_key": self.api_key, "append_to_response": "credits"},
                    timeout=5,
                )
                if response.status_code == 200:
                    data = response.json()
                    genres = normalize_genres(data.get("genres", []), data.get("genre_ids", []))
                    cast_list = []
                    for c in data.get("credits", {}).get("cast", [])[:12]:
                        cast_list.append({
                            "id": c.get("id"),
                            "name": c.get("name"),
                            "character": c.get("character", ""),
                            "profile_path": format_poster_url(c.get("profile_path")),
                        })
                    credits_data = data.get("credits", {})
                    raw_crew = credits_data.get("crew", [])
                    director = ""
                    for member in raw_crew:
                        if member.get("job") == "Director":
                            director = member.get("name", "")
                            break

                    top_crew = []
                    target_jobs = {"Director", "Writer", "Screenplay", "Producer", "Executive Producer"}
                    for member in raw_crew:
                        job = member.get("job", "")
                        dept = member.get("department", "")
                        if job in target_jobs or dept in {"Directing", "Writing"}:
                            top_crew.append({
                                "id": member.get("id"),
                                "name": member.get("name", ""),
                                "job": job,
                                "department": dept,
                                "profile_path": format_poster_url(member.get("profile_path")),
                            })
                            if len(top_crew) >= 15:
                                break

                    release_status = data.get("status", "")
                    original_language = data.get("original_language", "")
                    production_countries = data.get("production_countries", [])

                    return {
                        "id": data.get("id"),
                        "tmdb_id": data.get("id"),
                        "title": data.get("title", ""),
                        "original_title": data.get("original_title", ""),
                        "tagline": data.get("tagline", ""),
                        "overview": data.get("overview", ""),
                        "poster_path": format_poster_url(data.get("poster_path")),
                        "backdrop_path": format_backdrop_url(data.get("backdrop_path")),
                        "release_date": data.get("release_date", ""),
                        "vote_average": float(data.get("vote_average", 0.0)),
                        "vote_count": int(data.get("vote_count", 0)),
                        "popularity": float(data.get("popularity", 0.0)),
                        "genres": genres,
                        "runtime": data.get("runtime") or 0,
                        "imdb_id": data.get("imdb_id", ""),
                        "budget": int(data.get("budget") or 0),
                        "revenue": int(data.get("revenue") or 0),
                        "homepage": data.get("homepage", ""),
                        "spoken_languages": data.get("spoken_languages", []),
                        "production_companies": data.get("production_companies", []),
                        "cast": cast_list,
                        "director": director,
                        "crew": top_crew,
                        "release_status": release_status,
                        "original_language": original_language,
                        "production_countries": production_countries,
                        "raw_data": data,
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
            "director": "",
            "crew": [],
            "release_status": "Released",
            "original_language": "en",
            "production_countries": [],
            "tagline": "",
            "cast": [],
            "imdb_id": "",
            "budget": 0,
            "revenue": 0,
            "homepage": "",
            "spoken_languages": [],
            "production_companies": [],
            "raw_data": {},
        }

    def discover_movies(self, genre_names=None, page=1, min_votes=100, criteria=None,
                        status_out=None, attempts=2):
        """
        Fetch a pool of candidate movies matching a set of discovery criteria.

        `criteria` is an optional dict of extra constraints, any of which may be
        omitted: language, runtime_min, runtime_max, year_min, year_max,
        min_rating, cast_ids, crew_ids.

        Falls back to the local mock catalogue when no API key is configured or
        the call fails, applying the same constraints locally so behaviour stays
        consistent either way. When it does fall back, `status_out['degraded']`
        is set to True so callers can tell "TMDB is unreachable" apart from
        "there genuinely are no matches" - the two need very different messages.
        """
        criteria = criteria or {}
        if status_out is None:
            status_out = {}

        genre_ids = []
        for name in genre_names or []:
            gid = GENRE_NAME_TO_ID.get(str(name).strip().lower())
            if gid and gid not in genre_ids:
                genre_ids.append(gid)

        if self.api_key:
            params = {
                "api_key": self.api_key,
                "page": page,
                "sort_by": "popularity.desc",
                "vote_count.gte": min_votes,
                "include_adult": False,
            }
            if genre_ids:
                # "|" is TMDB's OR operator - match any of these genres
                params["with_genres"] = "|".join(str(g) for g in genre_ids)

            language = criteria.get("language")
            if language:
                params["with_original_language"] = language

            if criteria.get("runtime_min"):
                params["with_runtime.gte"] = int(criteria["runtime_min"])
            if criteria.get("runtime_max"):
                params["with_runtime.lte"] = int(criteria["runtime_max"])

            if criteria.get("year_min"):
                params["primary_release_date.gte"] = f"{int(criteria['year_min'])}-01-01"
            if criteria.get("year_max"):
                params["primary_release_date.lte"] = f"{int(criteria['year_max'])}-12-31"

            if criteria.get("min_rating"):
                params["vote_average.gte"] = float(criteria["min_rating"])

            cast_ids = [c for c in (criteria.get("cast_ids") or []) if c]
            if cast_ids:
                params["with_cast"] = "|".join(str(c) for c in cast_ids)

            crew_ids = [c for c in (criteria.get("crew_ids") or []) if c]
            if crew_ids:
                params["with_crew"] = "|".join(str(c) for c in crew_ids)

            # Transient connection resets are common; one cheap retry recovers most
            last_error = None
            for attempt in range(max(1, attempts)):
                try:
                    response = requests.get(
                        f"{self.BASE_URL}/discover/movie",
                        params=params,
                        timeout=6,
                    )
                except Exception as e:
                    last_error = e
                    continue

                if response.status_code == 200:
                    data = response.json()
                    results = []
                    for item in data.get("results", []):
                        results.append({
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
                            "popularity": float(item.get("popularity", 0.0)),
                            "genres": normalize_genres(None, item.get("genre_ids", [])),
                            "original_language": item.get("original_language", ""),
                            "runtime": 0,
                        })
                    status_out["degraded"] = status_out.get("degraded", False)
                    return results

                last_error = f"HTTP {response.status_code}: {response.text[:200]}"

            logger.warning("TMDB discover failed (%s). Falling back to mock data.", last_error)

        status_out["degraded"] = True
        return self._mock_discover(genre_names, criteria)

    # Backwards-compatible alias
    def discover_by_genres(self, genre_names, page=1, min_votes=100):
        return self.discover_movies(genre_names=genre_names, page=page, min_votes=min_votes)

    def _mock_discover(self, genre_names, criteria=None):
        """Mock candidate pool, with the same constraints applied locally."""
        criteria = criteria or {}
        wanted = {str(n).strip().lower() for n in (genre_names or [])}

        pool = list(MOCK_MOVIES)
        if wanted:
            matched = [
                m for m in pool
                if wanted & {g.lower() for g in m.get("genres", [])}
            ]
            pool = matched if matched else list(MOCK_MOVIES)

        def keeps(m):
            lang = criteria.get("language")
            if lang and m.get("original_language") and m["original_language"] != lang:
                return False
            rt = m.get("runtime") or 0
            if criteria.get("runtime_min") and rt and rt < int(criteria["runtime_min"]):
                return False
            if criteria.get("runtime_max") and rt and rt > int(criteria["runtime_max"]):
                return False
            year = (m.get("release_date") or "")[:4]
            if year.isdigit():
                if criteria.get("year_min") and int(year) < int(criteria["year_min"]):
                    return False
                if criteria.get("year_max") and int(year) > int(criteria["year_max"]):
                    return False
            if criteria.get("min_rating") and float(m.get("vote_average") or 0) < float(criteria["min_rating"]):
                return False
            return True

        filtered = [m for m in pool if keeps(m)]
        return filtered

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
