
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AccountViewSet,
    CategoryViewSet,
    ContactViewSet,
    SapatiSplitViewSet,
    TransactionViewSet,
    WorkspaceViewSet,
    bs_dashboard_summary,
)

router = DefaultRouter()

router.register(r'workspaces', WorkspaceViewSet, basename='workspace')
router.register(r'accounts', AccountViewSet, basename='account')
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'contacts', ContactViewSet, basename='contact')
router.register(r'transactions', TransactionViewSet, basename='transaction')
router.register(r'sapati', SapatiSplitViewSet, basename='sapati')

urlpatterns = [
    path('', include(router.urls)),
    path('dashboard/', bs_dashboard_summary, name='bs-dashboard'),
]
