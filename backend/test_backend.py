import os
import sys
import django

# Setup django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from rest_framework.test import APIClient
from movies.models import MovieList, Movie, MovieListItem

client = APIClient()

print("--- 1. Testing /api/seed/ ---")
seed_res = client.post('/api/seed/')
print(f"Seed status: {seed_res.status_code}")
assert seed_res.status_code == 200, f"Seed failed: {seed_res.data}"
print(f"Seeded lists count: {len(seed_res.data['lists'])}")
print(f"Seeded lists: {[l['name'] for l in seed_res.data['lists']]}")

adventure_list = MovieList.objects.get(name="Adventure")
items = adventure_list.items.all()
print(f"Adventure items count: {items.count()}")
assert items.count() >= 1, "Adventure list should have at least 1 item"
item1 = items.first()
print(f"Item: {item1.movie.title}, status: {item1.status}, rating: {item1.user_rating}, notes: {item1.user_notes}")
assert item1.movie.title == "Interstellar"
assert item1.status == "completed"
assert item1.user_rating == 10

print("\n--- 2. Testing /api/lists/ GET ---")
lists_res = client.get('/api/lists/')
print(f"Lists GET status: {lists_res.status_code}")
assert lists_res.status_code == 200
print(f"Fetched {len(lists_res.data)} lists")

print("\n--- 3. Testing /api/tmdb/search/?q=inception ---")
search_res = client.get('/api/tmdb/search/?q=inception')
print(f"Search status: {search_res.status_code}")
assert search_res.status_code == 200
results = search_res.data.get('results', [])
print(f"Search results found: {len(results)}")
assert len(results) > 0, "Should have search results"
print(f"First result: {results[0]['title']} (id: {results[0]['tmdb_id']})")
print(f"Poster URL: {results[0]['poster_path']}")

print("\n--- 4. Testing /api/tmdb/movie/27205/ (Inception) ---")
movie_detail_res = client.get('/api/tmdb/movie/27205/')
print(f"Movie detail status: {movie_detail_res.status_code}")
assert movie_detail_res.status_code == 200
print(f"Movie title: {movie_detail_res.data['title']}, runtime: {movie_detail_res.data['runtime']} mins")
assert movie_detail_res.data['title'] == "Inception"

print("\n--- 5. Testing adding Inception to Sci-Fi list ---")
scifi_list, _ = MovieList.objects.get_or_create(name="Sci-Fi", defaults={"color": "#8b5cf6", "order": 4})
scifi_list.items.all().delete()
add_res = client.post(f'/api/lists/{scifi_list.id}/movies/', {
    'tmdb_id': 27205,
    'status': 'watching',
    'user_rating': 9,
    'user_notes': 'Mind bending dream levels'
}, format='json')
print(f"Add movie status: {add_res.status_code}")
assert add_res.status_code == 201, f"Failed to add movie: {add_res.data}"
print(f"Added item ID: {add_res.data['id']}, movie title: {add_res.data['movie']['title']}")

print("\n--- 6. Testing duplicate check in list ---")
dup_res = client.post(f'/api/lists/{scifi_list.id}/movies/', {
    'tmdb_id': 27205,
}, format='json')
print(f"Duplicate status: {dup_res.status_code}")
assert dup_res.status_code == 400, "Should reject duplicate movie in list"
print("Duplicate was correctly rejected!")

print("\n--- 7. Testing updating list item (PATCH) ---")
item_id = add_res.data['id']
patch_res = client.patch(f'/api/list-items/{item_id}/', {
    'status': 'completed',
    'user_rating': 10,
    'user_notes': 'Finished it! 10/10 masterwork'
}, format='json')
print(f"Patch status: {patch_res.status_code}")
assert patch_res.status_code == 200
assert patch_res.data['status'] == 'completed'
assert patch_res.data['user_rating'] == 10
print("Item updated successfully!")

print("\n--- 8. Testing /api/lists/<id>/movies/ GET ---")
list_movies_res = client.get(f'/api/lists/{scifi_list.id}/movies/')
print(f"List movies GET status: {list_movies_res.status_code}")
assert list_movies_res.status_code == 200
print(f"Movies in Sci-Fi: {[m['movie']['title'] for m in list_movies_res.data]}")

print("\nALL BACKEND TESTS PASSED SUCCESSFULLY! Everything is functioning properly.")
