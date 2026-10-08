from django.urls import path
from .auth_views import MeView, GoogleLoginView, LogoutView
from .calendar_views import (
    CalendarStatusView, CalendarConnectView, CalendarSyncView, CalendarDisconnectView,
)
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
    RecommendationFiltersView,
    ChatRecommendView,
    ScheduledWatchListCreateView,
    ScheduledWatchDetailView,
    TrashView,
    TrashRestoreView,
    TrashPermanentDeleteView,
)

urlpatterns = [
    # Accounts
    path('auth/me/', MeView.as_view(), name='auth-me'),
    path('auth/google/', GoogleLoginView.as_view(), name='auth-google'),
    path('auth/logout/', LogoutView.as_view(), name='auth-logout'),

    # Google Calendar sync
    path('calendar/status/', CalendarStatusView.as_view(), name='calendar-status'),
    path('calendar/connect/', CalendarConnectView.as_view(), name='calendar-connect'),
    path('calendar/sync/', CalendarSyncView.as_view(), name='calendar-sync'),
    path('calendar/disconnect/', CalendarDisconnectView.as_view(), name='calendar-disconnect'),

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
    path('recommendations/filters/', RecommendationFiltersView.as_view(), name='recommendation-filters'),

    # Natural-language chat
    path('chat/', ChatRecommendView.as_view(), name='chat-recommend'),

    # Schedule (calendar of planned watch sessions)
    path('schedule/', ScheduledWatchListCreateView.as_view(), name='schedule-index'),
    path('schedule/<int:pk>/', ScheduledWatchDetailView.as_view(), name='schedule-detail'),

    # Seed Database
    path('seed/', SeedDataView.as_view(), name='seed-data'),

    # Trash (soft-deleted lists and list-items, 30-day retention)
    path('trash/', TrashView.as_view(), name='trash-index'),
    path('trash/<str:kind>/<int:pk>/restore/', TrashRestoreView.as_view(), name='trash-restore'),
    path('trash/<str:kind>/<int:pk>/', TrashPermanentDeleteView.as_view(), name='trash-permanent-delete'),
]
