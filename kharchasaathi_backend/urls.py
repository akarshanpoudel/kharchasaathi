from django.contrib import admin
from django.urls import include, path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from core.views import register_user

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/register/', register_user, name='register'),
    path('api/v1/auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/v1/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/v1/', include('core.urls')),
]