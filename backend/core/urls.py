from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, Http404
from django.urls import path, include, re_path


def spa_index(request, *args, **kwargs):
    """Serve the built React app for any non-API path (client-side routing)."""
    index = settings.FRONTEND_DIST / 'index.html'
    if not index.is_file():
        raise Http404('Frontend not built. Run "npm run build".')
    return FileResponse(open(index, 'rb'), content_type='text/html')


def privacy(request):
    """Serve the built privacy page at /privacy (no .html needed)."""
    page = settings.FRONTEND_DIST / 'privacy.html'
    if not page.is_file():
        raise Http404('Frontend not built. Run "npm run build".')
    return FileResponse(open(page, 'rb'), content_type='text/html')


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('movies.urls')),
    path('privacy', privacy),
    path('privacy/', privacy),
    re_path(r'^(?!api/|admin/|static/).*$', spa_index),
]
