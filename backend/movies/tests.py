from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase, APIClient

from django.test import SimpleTestCase

from .models import MovieList, GoogleAccount
from .services import chat
from .services.tmdb import tmdb_service


def google_info(sub, email='a@example.com', name='Ann Example'):
    return {'sub': sub, 'email': email, 'name': name, 'picture': '', 'email_verified': True}


@override_settings(GOOGLE_CLIENT_ID='test-client-id')
class AccountsTests(APITestCase):
    def sign_in(self, client, sub, **kw):
        with patch('movies.auth_views.id_token.verify_oauth2_token', return_value=google_info(sub, **kw)):
            return client.post('/api/auth/google/', {'credential': 'x'}, format='json')

    def test_browsing_creates_no_rows_and_sees_nothing(self):
        MovieList.objects.create(name='Legacy')  # pre-accounts row, no owner
        res = APIClient().get('/api/lists/')
        self.assertEqual(res.json(), [])
        self.assertEqual(get_user_model().objects.count(), 0)

    def test_guest_data_is_private(self):
        a, b = APIClient(), APIClient()
        created = a.post('/api/lists/', {'name': 'Mine'}, format='json')
        self.assertEqual(created.status_code, 201)
        self.assertEqual([l['name'] for l in a.get('/api/lists/').json()], ['Mine'])
        self.assertEqual(b.get('/api/lists/').json(), [])
        self.assertEqual(b.get(f"/api/lists/{created.json()['id']}/").status_code, 404)

    def test_bad_token_rejected(self):
        with patch('movies.auth_views.id_token.verify_oauth2_token', side_effect=ValueError('bad')):
            res = APIClient().post('/api/auth/google/', {'credential': 'x'}, format='json')
        self.assertEqual(res.status_code, 401)

    def test_guest_is_upgraded_and_keeps_lists(self):
        c = APIClient()
        c.post('/api/lists/', {'name': 'Mine'}, format='json')
        res = self.sign_in(c, 'sub-A')
        self.assertEqual(res.json()['user']['email'], 'a@example.com')
        self.assertEqual(c.get('/api/auth/me/').json()['user']['name'], 'Ann Example')
        self.assertEqual([l['name'] for l in c.get('/api/lists/').json()], ['Mine'])
        self.assertEqual(GoogleAccount.objects.count(), 1)

    def test_returning_user_gets_guest_data_merged_on_new_device(self):
        c1 = APIClient()
        c1.post('/api/lists/', {'name': 'First'}, format='json')
        self.sign_in(c1, 'sub-A')

        c2 = APIClient()  # new browser, did some guest browsing
        c2.post('/api/lists/', {'name': 'Guest list'}, format='json')
        self.sign_in(c2, 'sub-A')
        names = sorted(l['name'] for l in c2.get('/api/lists/').json())
        self.assertEqual(names, ['First', 'Guest list'])
        self.assertEqual(GoogleAccount.objects.count(), 1)

    def test_two_google_users_are_separate_and_legacy_goes_to_first(self):
        MovieList.objects.create(name='Legacy')
        a, b = APIClient(), APIClient()
        self.sign_in(a, 'sub-A')
        self.sign_in(b, 'sub-B', email='b@example.com', name='Bob')
        self.assertEqual([l['name'] for l in a.get('/api/lists/').json()], ['Legacy'])
        self.assertEqual(b.get('/api/lists/').json(), [])

    def test_logout_clears_session(self):
        c = APIClient()
        self.sign_in(c, 'sub-A')
        c.post('/api/auth/logout/')
        self.assertIsNone(c.get('/api/auth/me/').json()['user'])
        self.assertEqual(c.get('/api/lists/').json(), [])


class EntityResolutionTests(SimpleTestCase):
    """Leftover words are resolved through TMDB's own searches (mocked here)."""

    def run_parse(self, message, collections=(), keywords=(), companies=(), people=(), has_movies=True):
        def named(items):
            return lambda q: [{"id": i, "name": n} for i, n in items]

        with patch.object(tmdb_service, 'search_collection', side_effect=named(collections)), \
             patch.object(tmdb_service, 'search_keyword', side_effect=named(keywords)), \
             patch.object(tmdb_service, 'search_company', side_effect=named(companies)), \
             patch.object(tmdb_service, 'search_person',
                          return_value=[{"id": i, "name": n, "department": "Acting"} for i, n in people]), \
             patch.object(tmdb_service, 'has_movies', return_value=has_movies):
            return chat.parse_open_vocabulary(message)

    def test_franchise_found_by_name(self):
        filters, _, chips = self.run_parse('insidious', collections=[(228446, 'Insidious Collection')])
        self.assertEqual(filters['collection_ids'], [228446])
        self.assertEqual(chips, ['Insidious Collection'])

    def test_franchise_outranks_person_with_same_name(self):
        filters, _, _ = self.run_parse(
            'john wick', collections=[(404609, 'John Wick Collection')], people=[(1, 'John Wick')])
        self.assertEqual(filters['collection_ids'], [404609])
        self.assertEqual(filters['cast_ids'], [])

    def test_keyword_must_match_exactly(self):
        filters, _, _ = self.run_parse('zombie movies', keywords=[(1, 'zombie sex'), (12377, 'zombie')])
        self.assertEqual(filters['keyword_ids'], [12377])

    def test_empty_keyword_falls_through_to_studio(self):
        # a "marvel" keyword with no movies must not hide Marvel Studios
        def has(with_keywords=None, with_companies=None):
            return with_companies is not None

        with patch.object(tmdb_service, 'search_collection', return_value=[]), \
             patch.object(tmdb_service, 'search_keyword', return_value=[{"id": 9, "name": "marvel"}]), \
             patch.object(tmdb_service, 'search_company', return_value=[{"id": 420, "name": "Marvel Studios"}]), \
             patch.object(tmdb_service, 'has_movies', side_effect=has):
            filters, _, chips = chat.parse_open_vocabulary('marvel movies')
        self.assertEqual(filters['company_ids'], [420])
        self.assertEqual(filters['keyword_ids'], [])
        self.assertEqual(chips, ['Marvel Studios'])

    def test_unrelated_search_hit_is_ignored(self):
        filters, _, chips = self.run_parse('xyzzyplugh movies', keywords=[(5, 'something else')])
        self.assertEqual(chips, [])
        self.assertEqual(filters['keyword_ids'], [])

    def test_stray_words_do_not_match_a_random_person(self):
        filters, _, chips = self.run_parse('thriller but not horror', people=[(7, 'Philip Blake')])
        self.assertEqual(filters['cast_ids'], [])
        self.assertNotIn('Philip Blake', chips)

    def test_decade_is_not_looked_up_as_a_keyword(self):
        filters, _, _ = self.run_parse('comedy from the 2010s', keywords=[(3, '2010s')])
        self.assertEqual(filters['keyword_ids'], [])
        self.assertEqual((filters['year_min'], filters['year_max']), (2010, 2019))

    def test_connector_words_stay_inside_a_name(self):
        self.assertEqual(chat._leftover_phrases('lord of the rings'), ['lord of the rings'])


class MoviesLikeTests(SimpleTestCase):
    def search(self, *titles):
        results = [{"id": i, "tmdb_id": i, "title": t, "original_title": t, "vote_count": v} for i, t, v in titles]
        return patch.object(tmdb_service, 'search_movies', return_value={"results": results})

    def test_like_clause_is_extracted_and_removed(self):
        with self.search((157336, 'Interstellar', 30000)):
            movie, rest = chat._split_similar('movies like Interstellar from the 2010s')
        self.assertEqual(movie['id'], 157336)
        self.assertNotIn('interstellar', rest.lower())
        self.assertIn('2010s', rest)

    def test_remake_resolves_to_the_best_known_title(self):
        with self.search((1, 'Dune', 900), (2, 'Dune', 9000)):
            movie, _ = chat._split_similar('movies like Dune')
        self.assertEqual(movie['id'], 2)

    def test_everyday_phrase_is_not_a_movie(self):
        with self.search((9, 'Watching', 12)):  # barely-voted title is ignored
            movie, rest = chat._split_similar('feel like watching something funny')
        self.assertIsNone(movie)
        self.assertEqual(rest, 'feel like watching something funny')

    def test_title_words_are_not_also_read_as_a_studio_or_keyword(self):
        with self.search((245891, 'John Wick', 8000)), \
             patch.object(tmdb_service, 'search_collection', return_value=[{"id": 404609, "name": "John Wick Collection"}]):
            filters, _, chips = chat.parse_open_vocabulary('movies like John Wick')
        self.assertEqual(filters['similar_to']['id'], 245891)
        self.assertEqual(filters['collection_ids'], [])
        self.assertEqual(chips, ['Like John Wick'])


class WebAskFeatureTests(APITestCase):
    """Negation, TMDB lists, directors and the never-go-silent response."""

    def parse(self, message, **patches):
        with patch.object(tmdb_service, 'search_collection', return_value=[]), \
             patch.object(tmdb_service, 'search_keyword', return_value=[]), \
             patch.object(tmdb_service, 'search_company', return_value=[]), \
             patch.object(tmdb_service, 'search_person', return_value=patches.get('people', [])):
            return chat.parse_open_vocabulary(message)

    def test_negation_excludes_instead_of_including(self):
        filters, _, chips = self.parse('thriller but not horror')
        self.assertEqual(filters['genres'], ['Thriller'])
        self.assertEqual(filters['exclude_genres'], ['Horror'])
        self.assertEqual(chips, ['Thriller', 'Not Horror'])

    def test_negated_mood_word_and_fillers(self):
        filters, _, _ = self.parse('nothing too scary')
        self.assertEqual(filters['exclude_genres'], ['Horror'])
        self.assertEqual(filters['genres'], [])

    def test_list_phrases(self):
        cases = {
            'trending this week': 'trending_week', 'trending today': 'trending_day',
            'in theatres now': 'now_playing', 'coming soon': 'upcoming', 'popular right now': 'popular',
        }
        for text, kind in cases.items():
            self.assertEqual(self.parse(text)[0]['list_kind'], kind, text)

    def test_list_words_are_not_unmatched_leftovers(self):
        self.assertEqual(self.parse('trending horror movies')[0]['unmatched'], [])

    def test_director_uses_directing_credits(self):
        people = [{"id": 525, "name": "Christopher Nolan", "department": "Directing", "popularity": 9.2}]
        filters, _, _ = self.parse('Christopher Nolan movies', people=people)
        self.assertEqual(filters['director_ids'], [525])
        self.assertEqual(filters['crew_ids'], [])

    def test_lone_surname_needs_a_well_known_person(self):
        known = [{"id": 138, "name": "Quentin Tarantino", "department": "Directing", "popularity": 6.9}]
        obscure = [{"id": 9, "name": "Time Winters", "department": "Acting", "popularity": 1.4}]
        self.assertEqual(self.parse('tarantino', people=known)[0]['director_ids'], [138])
        self.assertEqual(self.parse('time', people=obscure)[0]['cast_ids'], [])

    def test_unrecognised_text_is_reported_not_answered_with_random_movies(self):
        with patch.object(chat, 'parse_open_vocabulary',
                          return_value=({"unmatched": ["xyzzy"]}, 'x', [])), \
             patch('movies.views.get_web_recommendations') as draw:
            res = APIClient().post('/api/chat/', {'message': 'xyzzy movies'}, format='json').json()
        draw.assert_not_called()
        self.assertEqual(res['results'], [])
        self.assertIn('xyzzy', res['message'])
        self.assertEqual(res['unmatched'], ['xyzzy'])

    def test_random_requests_still_draw(self):
        with patch.object(chat, 'parse_open_vocabulary', return_value=({"unmatched": []}, 'x', [])), \
             patch('movies.views.parse_open_vocabulary', return_value=({"unmatched": []}, 'x', [])), \
             patch('movies.views.get_web_recommendations',
                   return_value={"results": [{"title": "A"}], "message": ""}) as draw:
            APIClient().post('/api/chat/', {'message': 'surprise me'}, format='json')
        draw.assert_called_once()


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


def _calendar_settings():
    from cryptography.fernet import Fernet
    return override_settings(
        GOOGLE_CLIENT_ID='cid', GOOGLE_CLIENT_SECRET='sec', TOKEN_ENCRYPTION_KEY=Fernet.generate_key().decode(),
    )


@_calendar_settings()
class CalendarSyncTests(APITestCase):
    def setUp(self):
        from .models import Movie
        from django.core.cache import cache
        cache.clear()
        self.client_a = APIClient()
        with patch('movies.auth_views.id_token.verify_oauth2_token', return_value=google_info('sub-A')):
            self.client_a.post('/api/auth/google/', {'credential': 'x'}, format='json')
        self.movie = Movie.objects.create(tmdb_id=1, title='Interstellar', imdb_id='tt0816692')

    def watch_payload(self):
        return {'movie_id': self.movie.id, 'start_time': '2030-01-01T18:00:00Z', 'end_time': '2030-01-01T20:49:00Z'}

    def connect(self):
        token = FakeResponse(200, {
            'access_token': 'at', 'refresh_token': 'rt-secret', 'expires_in': 3600,
            'scope': 'openid https://www.googleapis.com/auth/calendar.app.created',
        })
        made = FakeResponse(200, {'id': 'cal-1'})
        with patch('movies.services.gcal._token_request', return_value=token), \
             patch('movies.services.gcal._call', return_value=made) as call:
            res = self.client_a.post('/api/calendar/connect/', {'code': 'c', 'time_zone': 'Asia/Kolkata'}, format='json')
        return res, call

    def test_guest_cannot_connect(self):
        res = APIClient().post('/api/calendar/connect/', {'code': 'c'}, format='json')
        self.assertEqual(res.status_code, 403)

    def test_connect_stores_encrypted_token_and_creates_calendar(self):
        from .models import GoogleCalendarConnection
        res, call = self.connect()
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['connected'])
        conn = GoogleCalendarConnection.objects.get()
        self.assertEqual(conn.calendar_id, 'cal-1')
        self.assertNotIn('rt-secret', conn.refresh_token_enc)
        self.assertEqual(call.call_args_list[0].kwargs['json']['timeZone'], 'Asia/Kolkata')

    def test_connect_rejects_missing_scope_or_refresh_token(self):
        no_scope = FakeResponse(200, {'access_token': 'a', 'refresh_token': 'r', 'scope': 'openid'})
        with patch('movies.services.gcal._token_request', return_value=no_scope):
            res = self.client_a.post('/api/calendar/connect/', {'code': 'c'}, format='json')
        self.assertEqual(res.status_code, 400)
        scope = 'https://www.googleapis.com/auth/calendar.app.created'
        no_refresh = FakeResponse(200, {'access_token': 'a', 'scope': scope})
        with patch('movies.services.gcal._token_request', return_value=no_refresh):
            res = self.client_a.post('/api/calendar/connect/', {'code': 'c'}, format='json')
        self.assertIn('permissions', res.json()['error'])

    def test_without_connection_nothing_is_called(self):
        with patch('movies.services.gcal._call') as call:
            res = self.client_a.post('/api/schedule/', self.watch_payload(), format='json')
        self.assertEqual(res.status_code, 201)
        call.assert_not_called()
        self.assertEqual(res.json()['sync_status'], 'not_synced')

    def test_create_update_delete_follow_to_google(self):
        self.connect()
        with patch('movies.services.gcal._access_token', return_value='at'), \
             patch('movies.services.gcal._call', return_value=FakeResponse(200, {'id': 'evt-1'})) as call:
            created = self.client_a.post('/api/schedule/', self.watch_payload(), format='json').json()
            self.assertEqual(created['sync_status'], 'synced')
            self.assertEqual(created['google_event_id'], 'evt-1')
            body = call.call_args.kwargs['json']
            self.assertEqual(body['summary'], 'Movie: Interstellar')
            self.assertEqual(body['extendedProperties']['private']['cinetrackWatchId'], str(created['id']))

            self.client_a.patch(f"/api/schedule/{created['id']}/", {'notes': 'popcorn'}, format='json')
            self.assertEqual(call.call_args.args[0], 'PATCH')

            self.client_a.delete(f"/api/schedule/{created['id']}/")
            self.assertEqual(call.call_args.args[0], 'DELETE')
        self.assertEqual(self.client_a.get('/api/schedule/').json(), [])

    def test_event_deleted_in_google_is_recreated(self):
        self.connect()
        with patch('movies.services.gcal._access_token', return_value='at'), \
             patch('movies.services.gcal._call', return_value=FakeResponse(200, {'id': 'evt-1'})):
            created = self.client_a.post('/api/schedule/', self.watch_payload(), format='json').json()
        replies = [FakeResponse(404), FakeResponse(200, {'id': 'evt-2'})]
        with patch('movies.services.gcal._access_token', return_value='at'), \
             patch('movies.services.gcal._call', side_effect=replies):
            res = self.client_a.patch(f"/api/schedule/{created['id']}/", {'notes': 'x'}, format='json').json()
        self.assertEqual(res['google_event_id'], 'evt-2')
        self.assertEqual(res['sync_status'], 'synced')

    def test_google_failure_still_saves_the_watch(self):
        self.connect()
        with patch('movies.services.gcal._access_token', return_value='at'), \
             patch('movies.services.gcal._call', return_value=FakeResponse(500)):
            res = self.client_a.post('/api/schedule/', self.watch_payload(), format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()['sync_status'], 'error')
        self.assertTrue(res.json()['sync_error'])

    def test_revoked_access_marks_connection_broken(self):
        from django.core.cache import cache
        self.connect()
        cache.clear()
        with patch('movies.services.gcal._token_request', return_value=FakeResponse(400, {'error': 'invalid_grant'})):
            res = self.client_a.post('/api/schedule/', self.watch_payload(), format='json')
        self.assertEqual(res.json()['sync_status'], 'error')
        self.assertTrue(self.client_a.get('/api/calendar/status/').json()['needs_reconnect'])

    def test_disconnect_keeps_calendar_and_reconnect_reuses_it(self):
        from .models import GoogleCalendarConnection
        self.connect()
        with patch('movies.services.gcal._access_token', return_value='at'), \
             patch('movies.services.gcal.requests.post'):
            res = self.client_a.post('/api/calendar/disconnect/', {}, format='json')
        self.assertFalse(res.json()['connected'])
        conn = GoogleCalendarConnection.objects.get()
        self.assertEqual((conn.status, conn.calendar_id, conn.refresh_token_enc), ('disconnected', 'cal-1', ''))

        _, call = self.connect()
        methods = [c.args[0] for c in call.call_args_list]
        self.assertEqual(methods, ['GET'])  # checked the old calendar, did not create another

    def test_connect_pushes_existing_upcoming_watches(self):
        self.client_a.post('/api/schedule/', self.watch_payload(), format='json')
        scope = 'https://www.googleapis.com/auth/calendar.app.created'
        token = FakeResponse(200, {'access_token': 'at', 'refresh_token': 'rt', 'expires_in': 3600, 'scope': scope})
        replies = iter([FakeResponse(200, {'id': 'cal-1'}), FakeResponse(200, {'id': 'evt-9'})])
        with patch('movies.services.gcal._token_request', return_value=token), \
             patch('movies.services.gcal._call', side_effect=lambda *a, **k: next(replies)):
            res = self.client_a.post('/api/calendar/connect/', {'code': 'c'}, format='json').json()
        self.assertEqual((res['synced'], res['failed']), (1, 0))


class LibraryWithoutListsTests(APITestCase):
    """Adding a movie must work for a user who has no lists at all."""

    MOVIE = {'tmdb_id': 604, 'title': 'Test Movie', 'overview': 'x', 'cast': [{'name': 'A'}], 'director': 'D'}

    def add(self, client, **extra):
        with patch.object(tmdb_service, 'get_movie_details', return_value=None):
            return client.post('/api/library/movies/', {**self.MOVIE, **extra}, format='json')

    def test_add_with_no_lists_shows_in_all_movies(self):
        c = APIClient()
        self.assertEqual(c.get('/api/lists/').json(), [])
        res = self.add(c)
        self.assertEqual(res.status_code, 201)
        library = c.get('/api/library/movies/').json()
        self.assertEqual([i['movie']['tmdb_id'] for i in library], [604])
        self.assertEqual(library[0]['status'], 'plan_to_watch')

    def test_library_list_is_hidden_and_protected(self):
        c = APIClient()
        self.add(c)
        self.assertEqual(c.get('/api/lists/').json(), [])
        library_id = c.get('/api/library/movies/').json()[0]['list']
        self.assertEqual(c.get(f'/api/lists/{library_id}/').status_code, 404)
        self.assertEqual(c.delete(f'/api/lists/{library_id}/').status_code, 404)

    def test_adding_twice_reuses_one_library_and_rejects_duplicate(self):
        c = APIClient()
        self.assertEqual(self.add(c).status_code, 201)
        self.assertEqual(self.add(c).status_code, 400)
        self.assertEqual(MovieList.all_objects.filter(is_system=True).count(), 1)

    def test_all_movies_merges_library_and_custom_lists(self):
        c = APIClient()
        self.add(c)
        lst = c.post('/api/lists/', {'name': 'Mine'}, format='json').json()
        with patch.object(tmdb_service, 'get_movie_details', return_value=None):
            c.post(f"/api/lists/{lst['id']}/movies/", {**self.MOVIE, 'tmdb_id': 605, 'title': 'Other'}, format='json')
        ids = sorted(i['movie']['tmdb_id'] for i in c.get('/api/library/movies/').json())
        self.assertEqual(ids, [604, 605])
        # A trashed list's movies drop out of All Movies, like before
        c.delete(f"/api/lists/{lst['id']}/")
        ids = [i['movie']['tmdb_id'] for i in c.get('/api/library/movies/').json()]
        self.assertEqual(ids, [604])

    def test_library_is_private_per_user(self):
        a, b = APIClient(), APIClient()
        self.add(a)
        self.assertEqual(b.get('/api/library/movies/').json(), [])
        self.assertEqual(a.get('/api/library/movies/').status_code, 200)

    def test_visitor_with_no_session_sees_empty_library(self):
        self.assertEqual(APIClient().get('/api/library/movies/').json(), [])


class PasswordAccountTests(APITestCase):
    PASSWORD = 'correct-horse-9'

    def setUp(self):
        from django.core.cache import cache
        cache.clear()

    def register(self, client, username='snehal', password=None, **extra):
        return client.post('/api/auth/register/', {
            'username': username, 'password': password or self.PASSWORD, **extra,
        }, format='json')

    def login(self, client, username='snehal', password=None):
        return client.post('/api/auth/login/', {
            'username': username, 'password': password or self.PASSWORD,
        }, format='json')

    def test_register_signs_in_and_me_reports_password_account(self):
        c = APIClient()
        res = self.register(c, email='s@example.com')
        self.assertEqual(res.status_code, 200)
        me = c.get('/api/auth/me/').json()['user']
        self.assertEqual((me['name'], me['email'], me['kind']), ('snehal', 's@example.com', 'password'))

    def test_register_without_a_session_creates_no_guest_rows(self):
        User = get_user_model()
        c = APIClient()
        self.login(c, password='whatever-wrong')  # failed attempt from a fresh visitor
        self.assertEqual(User.objects.count(), 0)
        self.register(c)
        self.assertEqual(User.objects.count(), 1)

    def test_password_is_stored_hashed(self):
        self.register(APIClient())
        stored = get_user_model().objects.get(username='snehal').password
        self.assertTrue(stored.startswith('pbkdf2_'))
        self.assertNotIn(self.PASSWORD, stored)

    def test_username_rules_and_case_insensitive_uniqueness(self):
        c = APIClient()
        for bad in ['ab', 'has space', 'dash-name', 'x' * 31, 'guest-abc', 'émile']:
            self.assertEqual(self.register(c, username=bad).status_code, 400, bad)
        self.assertEqual(self.register(APIClient(), username='Snehal').status_code, 200)
        self.assertEqual(self.register(APIClient(), username='SNEHAL').status_code, 400)
        self.assertEqual(self.login(APIClient(), username='sNeHaL').status_code, 200)

    def test_weak_passwords_and_bad_email_rejected(self):
        c = APIClient()
        self.assertEqual(self.register(c, password='short1').status_code, 400)
        self.assertEqual(self.register(c, password='1234567890').status_code, 400)       # numeric
        self.assertEqual(self.register(c, password='password123').status_code, 400)      # common
        self.assertEqual(self.register(c, password='snehal1234').status_code, 400)    # too like the username
        self.assertEqual(self.register(c, email='not-an-email').status_code, 400)
        self.assertEqual(get_user_model().objects.count(), 0)

    def test_login_logout_and_wrong_credentials(self):
        self.register(APIClient())
        c = APIClient()
        wrong = self.login(c, password='nope-nope-nope')
        self.assertEqual(wrong.status_code, 401)
        self.assertEqual(self.login(c, username='ghost').json()['error'], wrong.json()['error'])
        self.assertEqual(self.login(c).status_code, 200)
        self.assertEqual(c.get('/api/auth/me/').json()['user']['name'], 'snehal')
        c.post('/api/auth/logout/')
        self.assertIsNone(c.get('/api/auth/me/').json()['user'])

    def test_guest_and_google_accounts_cannot_use_password_login(self):
        g = APIClient()
        g.post('/api/lists/', {'name': 'x'}, format='json')  # starts a guest
        guest = get_user_model().objects.get()
        empty = APIClient().post('/api/auth/login/', {'username': guest.username, 'password': ''}, format='json')
        self.assertEqual(empty.status_code, 400)
        self.assertEqual(self.login(APIClient(), username=guest.username, password='anything-long-1').status_code, 401)

    def test_guest_lists_come_along_when_registering(self):
        c = APIClient()
        c.post('/api/lists/', {'name': 'Mine'}, format='json')
        self.register(c)
        self.assertEqual([l['name'] for l in c.get('/api/lists/').json()], ['Mine'])
        self.assertEqual(get_user_model().objects.count(), 1)

    def test_guest_lists_merge_into_account_on_login(self):
        a = APIClient()
        a.post('/api/lists/', {'name': 'First'}, format='json')
        self.register(a)
        a.post('/api/auth/logout/')
        b = APIClient()  # new device, guest browsing
        b.post('/api/lists/', {'name': 'Guest list'}, format='json')
        self.login(b)
        self.assertEqual(sorted(l['name'] for l in b.get('/api/lists/').json()), ['First', 'Guest list'])

    def test_accounts_are_separate(self):
        a, b = APIClient(), APIClient()
        self.register(a, username='ann')
        a.post('/api/lists/', {'name': 'Ann list'}, format='json')
        self.register(b, username='bob')
        self.assertEqual(b.get('/api/lists/').json(), [])

    def test_signed_in_user_cannot_register_again(self):
        c = APIClient()
        self.register(c)
        self.assertEqual(self.register(c, username='second').status_code, 400)

    def test_failed_logins_lock_the_username_for_a_while(self):
        self.register(APIClient())
        c = APIClient()
        for _ in range(10):
            self.assertEqual(self.login(c, password='wrong-wrong-1').status_code, 401)
        self.assertEqual(self.login(c).status_code, 429)  # even the right password is paused

    def test_register_is_rate_limited(self):
        c = APIClient()
        codes = [self.register(c, username='abc').status_code for _ in range(12)]
        self.assertIn(429, codes)

    def test_csrf_is_enforced_for_login(self):
        self.register(APIClient())
        strict = APIClient(enforce_csrf_checks=True)
        res = strict.post('/api/auth/login/', {'username': 'snehal', 'password': self.PASSWORD}, format='json')
        self.assertEqual(res.status_code, 403)
        strict.get('/api/auth/me/')  # sets the csrf cookie
        token = strict.cookies['csrftoken'].value
        ok = strict.post('/api/auth/login/', {'username': 'snehal', 'password': self.PASSWORD},
                         format='json', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(ok.status_code, 200)

    def test_password_users_cannot_connect_google_calendar(self):
        c = APIClient()
        self.register(c)
        res = c.post('/api/calendar/connect/', {'code': 'x', 'time_zone': 'UTC'}, format='json')
        self.assertEqual(res.status_code, 403)


class TvShowTests(APITestCase):
    """TV shows live in the same lists as movies, keyed apart by media_type."""

    SHOW = {
        'tmdb_id': 604, 'media_type': 'tv', 'title': 'Test Show', 'overview': 'x', 'cast': [{'name': 'A'}],
        'director': 'Creator', 'number_of_seasons': 2, 'number_of_episodes': 19, 'runtime': 50,
        'seasons': [{'season_number': 1, 'episode_count': 9}, {'season_number': 2, 'episode_count': 10}],
    }
    MOVIE = {'tmdb_id': 604, 'title': 'Test Movie', 'overview': 'x', 'cast': [{'name': 'A'}], 'director': 'D'}

    def add(self, client, payload):
        with patch.object(tmdb_service, 'get_movie_details', return_value=None), \
             patch.object(tmdb_service, 'get_tv_details', return_value=None):
            return client.post('/api/library/movies/', {'movie': payload}, format='json')

    def test_show_and_movie_with_the_same_tmdb_id_are_separate(self):
        c = APIClient()
        self.assertEqual(self.add(c, self.MOVIE).status_code, 201)
        res = self.add(c, self.SHOW)
        self.assertEqual(res.status_code, 201)
        show = res.json()['movie']
        self.assertEqual((show['media_type'], show['title'], show['number_of_seasons']), ('tv', 'Test Show', 2))
        kinds = sorted(i['movie']['media_type'] for i in c.get('/api/library/movies/').json())
        self.assertEqual(kinds, ['movie', 'tv'])

    def test_existing_payloads_without_media_type_are_movies(self):
        res = self.add(APIClient(), self.MOVIE)
        self.assertEqual(res.json()['movie']['media_type'], 'movie')

    def test_progress_is_saved_and_cleared(self):
        c = APIClient()
        item = self.add(c, self.SHOW).json()
        res = c.patch(f"/api/list-items/{item['id']}/", {'current_season': 2, 'current_episode': 5}, format='json')
        self.assertEqual((res.json()['current_season'], res.json()['current_episode']), (2, 5))
        res = c.patch(f"/api/list-items/{item['id']}/", {'current_season': None, 'current_episode': None}, format='json')
        self.assertIsNone(res.json()['current_episode'])
        bad = c.patch(f"/api/list-items/{item['id']}/", {'current_episode': 'x'}, format='json')
        self.assertEqual(bad.status_code, 400)

    def test_scheduled_episode_keeps_its_season_and_episode(self):
        c = APIClient()
        movie_id = self.add(c, self.SHOW).json()['movie']['id']
        res = c.post('/api/schedule/', {
            'movie_id': movie_id, 'season_number': 2, 'episode_number': 6,
            'start_time': '2030-01-01T20:00:00Z', 'end_time': '2030-01-01T20:50:00Z',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual((res.json()['season_number'], res.json()['episode_number']), (2, 6))

    def test_discover_leaves_shows_out(self):
        from .services.recommender import get_filter_options
        c = APIClient()
        self.add(c, self.MOVIE)
        self.add(c, self.SHOW)
        from django.contrib.auth import get_user_model
        user = get_user_model().objects.get()
        self.assertEqual(get_filter_options(user=user)['directors'], [{'value': 'D', 'count': 1}])

    def test_search_type_multi_uses_multi_search(self):
        with patch.object(tmdb_service, 'search_multi', return_value={'results': [{'id': 1, 'media_type': 'tv'}]}) as multi, \
             patch.object(tmdb_service, 'search_movies', return_value={'results': []}) as movies:
            self.assertEqual(self.client.get('/api/tmdb/search/?q=office&type=multi').json()['results'][0]['media_type'], 'tv')
            self.client.get('/api/tmdb/search/?q=office')
        multi.assert_called_once()
        movies.assert_called_once()


class TvDetailsMappingTests(SimpleTestCase):
    """/tv/{id} is mapped onto the movie detail shape."""

    PAYLOAD = {
        'id': 95396, 'name': 'Severance', 'original_name': 'Severance', 'first_air_date': '2022-02-17',
        'last_air_date': '2025-03-20', 'status': 'Returning Series', 'episode_run_time': [],
        'last_episode_to_air': {'season_number': 2, 'episode_number': 10, 'runtime': 76, 'name': 'Cold Harbor'},
        'next_episode_to_air': None, 'number_of_seasons': 2, 'number_of_episodes': 19,
        'created_by': [{'id': 1, 'name': 'Dan Erickson'}], 'networks': [{'id': 2552, 'name': 'Apple TV+'}],
        'genres': [{'id': 18, 'name': 'Drama'}],
        'seasons': [{'season_number': 1, 'name': 'Season 1', 'episode_count': 9, 'air_date': '2022-02-17'}],
        'aggregate_credits': {'cast': [{'id': 9, 'name': 'Adam Scott', 'roles': [{'character': 'Mark S.'}]}]},
        'external_ids': {'imdb_id': 'tt11280740'},
    }

    def test_show_fields_map_onto_movie_shape(self):
        with patch.object(tmdb_service, 'api_key', 'k'), \
             patch('movies.services.tmdb._http.get', return_value=FakeResponse(200, self.PAYLOAD)):
            d = tmdb_service.get_tv_details(95396)
        self.assertEqual(d['media_type'], 'tv')
        self.assertEqual((d['title'], d['release_date'], d['director']), ('Severance', '2022-02-17', 'Dan Erickson'))
        self.assertEqual(d['runtime'], 76)  # empty episode_run_time falls back to the last episode
        self.assertEqual(d['cast'][0]['character'], 'Mark S.')
        self.assertEqual((d['imdb_id'], d['networks'][0]['name']), ('tt11280740', 'Apple TV+'))
        self.assertEqual(d['seasons'][0]['episode_count'], 9)


class ListMembershipAndTrashTests(APITestCase):
    """Tick boxes for a movie's lists, deleting lists, and emptying Trash."""

    def setUp(self):
        self.c = APIClient()
        self.a = self.c.post('/api/lists/', {'name': 'A'}, format='json').json()
        self.b = self.c.post('/api/lists/', {'name': 'B'}, format='json').json()

    def add(self, list_id, tmdb_id=604, **extra):
        movie = {'tmdb_id': tmdb_id, 'title': f'M{tmdb_id}', 'overview': 'x', 'cast': [{'name': 'A'}], 'director': 'D'}
        with patch.object(tmdb_service, 'get_movie_details', return_value=None):
            return self.c.post(f'/api/lists/{list_id}/movies/', {'movie': movie, **extra}, format='json').json()

    def library(self):
        return self.c.get('/api/library/movies/').json()

    def test_ticking_lists_adds_and_removes_entries_and_copies_status(self):
        item = self.add(self.a['id'], status='completed')
        res = self.c.put(f"/api/list-items/{item['id']}/lists/", {'list_ids': [self.a['id'], self.b['id']]}, format='json')
        self.assertEqual(res.status_code, 200)
        entries = self.library()
        self.assertEqual(sorted(e['list'] for e in entries), sorted([self.a['id'], self.b['id']]))
        self.assertTrue(all(e['status'] == 'completed' for e in entries))
        # Unticking A keeps the movie, now only in B; the response points at a surviving entry
        res = self.c.put(f"/api/list-items/{item['id']}/lists/", {'list_ids': [self.b['id']]}, format='json').json()
        self.assertEqual(res['item']['list'], self.b['id'])
        self.assertEqual([e['list'] for e in self.library()], [self.b['id']])

    def test_no_lists_means_library_only(self):
        item = self.add(self.a['id'])
        res = self.c.put(f"/api/list-items/{item['id']}/lists/", {'list_ids': []}, format='json').json()
        library_id = MovieList.all_objects.get(is_system=True).id
        self.assertEqual([e['list'] for e in self.library()], [library_id])
        # ...and ticking a list again moves it out of Library-only
        self.c.put(f"/api/list-items/{res['item']['id']}/lists/", {'list_ids': [self.a['id']]}, format='json')
        self.assertEqual([e['list'] for e in self.library()], [self.a['id']])

    def test_unknown_or_foreign_list_is_rejected(self):
        item = self.add(self.a['id'])
        other = APIClient().post('/api/lists/', {'name': 'Theirs'}, format='json').json()
        res = self.c.put(f"/api/list-items/{item['id']}/lists/", {'list_ids': [other['id']]}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_deleting_a_list_keeps_movies_that_are_in_another_list(self):
        shared = self.add(self.a['id'], tmdb_id=1)
        self.c.put(f"/api/list-items/{shared['id']}/lists/", {'list_ids': [self.a['id'], self.b['id']]}, format='json')
        self.add(self.a['id'], tmdb_id=2)  # only in A
        self.c.delete(f"/api/lists/{self.a['id']}/")
        self.assertEqual([e['movie']['tmdb_id'] for e in self.library()], [1])
        trashed = self.c.get('/api/trash/').json()['results']
        self.assertEqual((trashed[0]['items_count'], trashed[0]['only_here_count']), (2, 1))
        self.c.delete(f"/api/trash/list/{self.a['id']}/")
        self.assertEqual([e['movie']['tmdb_id'] for e in self.library()], [1])

    def test_empty_trash_deletes_everything_in_it(self):
        item = self.add(self.a['id'], tmdb_id=1)
        self.add(self.b['id'], tmdb_id=2)
        self.c.delete(f"/api/list-items/{item['id']}/")
        self.c.delete(f"/api/lists/{self.b['id']}/")
        self.assertEqual(self.c.get('/api/trash/').json()['count'], 2)
        self.assertEqual(self.c.delete('/api/trash/').json()['deleted'], 2)
        self.assertEqual(self.c.get('/api/trash/').json()['count'], 0)
        self.assertFalse(MovieList.all_objects.filter(id=self.b['id']).exists())


class EpisodeProgressTests(APITestCase):
    """Binge blocks and ticking a scheduled episode off."""

    SHOW = {
        'tmdb_id': 95396, 'media_type': 'tv', 'title': 'Show', 'overview': 'x', 'cast': [{'name': 'A'}],
        'seasons': [{'season_number': 0, 'episode_count': 1}, {'season_number': 1, 'episode_count': 9},
                    {'season_number': 2, 'episode_count': 10}],
    }

    def setUp(self):
        self.c = APIClient()
        with patch.object(tmdb_service, 'get_tv_details', return_value=None):
            self.item = self.c.post('/api/library/movies/', {'movie': self.SHOW}, format='json').json()

    def schedule(self, season, episode, count=1):
        return self.c.post('/api/schedule/', {
            'movie_id': self.item['movie']['id'], 'season_number': season, 'episode_number': episode,
            'episode_count': count, 'start_time': '2030-01-01T20:00:00Z', 'end_time': '2030-01-01T23:00:00Z',
        }, format='json').json()

    def test_labels_and_block_ends(self):
        from .models import Movie
        from .services.episodes import episode_label, block_end
        movie = Movie.objects.get(media_type='tv')
        self.assertEqual(episode_label(movie, 2, 8), 'S2E8')
        self.assertEqual(episode_label(movie, 2, 8, 3), 'S2E8–E10')
        self.assertEqual(episode_label(movie, 1, 8, 3), 'S1E8–S2E1')
        self.assertEqual(block_end(movie, 2, 9, 5), (2, 10))  # stops at the last known episode

    def test_watched_block_moves_progress_and_status(self):
        watch = self.schedule(1, 8, count=3)
        self.c.patch(f"/api/schedule/{watch['id']}/", {'is_watched': True}, format='json')
        item = self.c.get(f"/api/list-items/{self.item['id']}/").json()
        self.assertEqual((item['current_season'], item['current_episode'], item['status']), (2, 1, 'watching'))

    def test_watched_episode_never_moves_progress_back(self):
        self.c.patch(f"/api/list-items/{self.item['id']}/", {'current_season': 2, 'current_episode': 5}, format='json')
        watch = self.schedule(1, 3)
        self.c.patch(f"/api/schedule/{watch['id']}/", {'is_watched': True}, format='json')
        item = self.c.get(f"/api/list-items/{self.item['id']}/").json()
        self.assertEqual((item['current_season'], item['current_episode']), (2, 5))

    def test_episode_count_is_bounded(self):
        res = self.c.post('/api/schedule/', {
            'movie_id': self.item['movie']['id'], 'season_number': 1, 'episode_number': 1, 'episode_count': 0,
            'start_time': '2030-01-01T20:00:00Z', 'end_time': '2030-01-01T21:00:00Z',
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_season_endpoint_maps_episodes(self):
        from django.core.cache import cache
        cache.clear()
        payload = {'season_number': 2, 'name': 'Season 2', 'episodes': [
            {'episode_number': 1, 'name': 'Hello, Ms. Cobel', 'air_date': '2025-01-17', 'runtime': 56, 'still_path': '/x.jpg'},
        ]}
        with patch.object(tmdb_service, 'api_key', 'k'), \
             patch('movies.services.tmdb._http.get', return_value=FakeResponse(200, payload)):
            res = self.client.get('/api/tmdb/tv/95396/season/2/').json()
        self.assertEqual(res['episodes'][0]['name'], 'Hello, Ms. Cobel')
        self.assertTrue(res['episodes'][0]['still_path'].endswith('/x.jpg'))
