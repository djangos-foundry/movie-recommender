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
