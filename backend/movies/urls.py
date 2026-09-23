from django.urls import path
from .views import (
    MovieListIndexView,
    MovieListReorderView,
    MovieListDetailView,
    MovieListMoviesView,
    MovieListItemDetailView,
    TMDBSearchView,
    TMDBMovieDetailView,
    SeedDataView,
    RecommendationView,
)

urlpatterns = [
    # Lists
    path('lists/', MovieListIndexView.as_view(), name='movie-list-index'),
    path('lists/reorder/', MovieListReorderView.as_view(), name='movie-list-reorder'),
    path('lists/<int:pk>/', MovieListDetailView.as_view(), name='movie-list-detail'),
    path('lists/<int:pk>/movies/', MovieListMoviesView.as_view(), name='movie-list-movies'),

    # List items
    path('list-items/<int:pk>/', MovieListItemDetailView.as_view(), name='movie-list-item-detail'),

    # TMDB Integration
    path('tmdb/search/', TMDBSearchView.as_view(), name='tmdb-search'),
    path('tmdb/movie/<int:tmdb_id>/', TMDBMovieDetailView.as_view(), name='tmdb-movie-detail'),

    # Recommendations
    path('recommendations/', RecommendationView.as_view(), name='recommendations'),

    # Seed Database
    path('seed/', SeedDataView.as_view(), name='seed-data'),
]
