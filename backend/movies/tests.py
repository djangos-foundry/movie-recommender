from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase, APIClient

from .models import MovieList, GoogleAccount


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
