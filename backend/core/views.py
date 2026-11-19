
from django.contrib.auth.models import User
from django.db import transaction as db_transaction
from django.db.models import Sum

from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from .models import (
    Account,
    Category,
    Contact,
    SapatiSplit,
    Transaction,
    Workspace,
    WorkspaceMember,
)

from .serializers import (
    AccountSerializer,
    CategorySerializer,
    ContactSerializer,
    SapatiSplitSerializer,
    TransactionSerializer,
    WorkspaceSerializer,
)

from .services import FinancialService


# ==========================================
# USER REGISTRATION
# ==========================================

@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):

    username = (request.data.get('username') or '').strip()
    password = request.data.get('password') or ''
    email = (request.data.get('email') or '').strip()

    if not username or not password:
        return Response(
            {'error': 'Username and password are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(password) < 8:
        return Response(
            {'error': 'Password must be at least 8 characters.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(username=username).exists():
        return Response(
            {'error': 'Username already exists.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        with db_transaction.atomic():

            user = User.objects.create_user(
                username=username,
                password=password,
                email=email,
            )

            # Create default Personal Hisab workspace
            workspace = Workspace.objects.create(
                name=f"{username}'s Hisab",
                workspace_type='PERSONAL',
                owner=user,
            )

            # Add user as workspace owner
            WorkspaceMember.objects.create(
                workspace=workspace,
                user=user,
                role='OWNER',
            )

            # Default Cash Account
            Account.objects.create(
                workspace=workspace,
                name='Cash in Hand',
                account_type='CASH',
                balance=0,
            )

            # Default eSewa Wallet
            Account.objects.create(
                workspace=workspace,
                name='eSewa',
                account_type='WALLET',
                balance=0,
            )

        return Response(
            {
                'message': 'Account created successfully',
                'user_id': user.id,
                'username': user.username,
                'workspace_id': workspace.id,
            },
            status=status.HTTP_201_CREATED,
        )

    except Exception:
        return Response(
            {'error': 'Registration failed'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# ==========================================
# JWT TOKEN ENDPOINTS
# ==========================================

class CustomTokenObtainPairView(TokenObtainPairView):
    permission_classes = [AllowAny]


class CustomTokenRefreshView(TokenRefreshView):
    permission_classes = [AllowAny]


# ==========================================
# WORKSPACE VIEWSET
# ==========================================

class WorkspaceViewSet(viewsets.ModelViewSet):

    queryset = Workspace.objects.all()
    serializer_class = WorkspaceSerializer

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


# ==========================================
# ACCOUNT VIEWSET
# ==========================================

class AccountViewSet(viewsets.ModelViewSet):

    serializer_class = AccountSerializer

    def get_queryset(self):
        queryset = Account.objects.filter(is_archived=False)

        workspace_id = self.request.query_params.get('workspace')

        if workspace_id:
            queryset = queryset.filter(workspace_id=workspace_id)

        return queryset


# ==========================================
# CATEGORY VIEWSET
# ==========================================

class CategoryViewSet(viewsets.ModelViewSet):

    queryset = Category.objects.all()
    serializer_class = CategorySerializer


# ==========================================
# CONTACT VIEWSET
# ==========================================

class ContactViewSet(viewsets.ModelViewSet):

    serializer_class = ContactSerializer

    def get_queryset(self):
        queryset = Contact.objects.all()

        workspace_id = self.request.query_params.get('workspace')

        if workspace_id:
            queryset = queryset.filter(workspace_id=workspace_id)

        return queryset


# ==========================================
# TRANSACTION VIEWSET
# ==========================================

class TransactionViewSet(viewsets.ModelViewSet):

    serializer_class = TransactionSerializer

    def get_queryset(self):
        queryset = Transaction.objects.select_related(
            'source_account',
            'destination_account',
            'category'
        ).prefetch_related(
            'splits__contact'
        ).order_by(
            '-ad_date',
            '-created_at'
        )

        workspace_id = self.request.query_params.get('workspace')
        bs_year = self.request.query_params.get('bs_year')
        bs_month = self.request.query_params.get('bs_month')

        if workspace_id:
            queryset = queryset.filter(workspace_id=workspace_id)

        if bs_year:
            queryset = queryset.filter(bs_year=bs_year)

        if bs_month:
            queryset = queryset.filter(bs_month=bs_month)

        return queryset


# ==========================================
# SAPATI SPLIT VIEWSET
# ==========================================

class SapatiSplitViewSet(viewsets.ReadOnlyModelViewSet):

    serializer_class = SapatiSplitSerializer

    def get_queryset(self):
        queryset = SapatiSplit.objects.select_related(
            'contact',
            'transaction'
        )

        workspace_id = self.request.query_params.get('workspace')

        if workspace_id:
            queryset = queryset.filter(
                transaction__workspace_id=workspace_id
            )

        return queryset

    @action(detail=True, methods=['post'])
    def settle(self, request, pk=None):

        account_id = request.data.get('account_id')
        workspace_id = request.data.get('workspace_id')

        if not account_id or not workspace_id:
            return Response(
                {'error': 'account_id and workspace_id are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        split = FinancialService.settle_sapati_split(
            split_id=pk,
            account_id=account_id,
            workspace_id=workspace_id
        )

        return Response(SapatiSplitSerializer(split).data)


# ==========================================
# BS DASHBOARD SUMMARY
# ==========================================

@api_view(['GET'])
def bs_dashboard_summary(request):

    workspace_id = request.query_params.get('workspace')

    if not workspace_id:
        return Response(
            {'error': 'workspace query param is required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    current_bs = FinancialService.get_current_bs_date()

    try:
        bs_year = int(
            request.query_params.get(
                'bs_year',
                current_bs['bs_year']
            )
        )

        bs_month = int(
            request.query_params.get(
                'bs_month',
                current_bs['bs_month']
            )
        )

        if not 1 <= bs_month <= 12:
            raise ValueError

    except (ValueError, TypeError):
        return Response(
            {'error': 'Invalid bs_year or bs_month'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Total account balance
    total_balance = Account.objects.filter(
        workspace_id=workspace_id,
        is_archived=False
    ).aggregate(
        total=Sum('balance')
    )['total'] or 0

    # Current BS month personal expense
    monthly_spend = Transaction.objects.filter(
        workspace_id=workspace_id,
        transaction_type='EXPENSE',
        bs_year=bs_year,
        bs_month=bs_month
    ).aggregate(
        total=Sum('personal_expense_amount')
    )['total'] or 0

    # Pending Sapati to receive
    to_receive = SapatiSplit.objects.filter(
        transaction__workspace_id=workspace_id,
        direction='RECEIVABLE',
        is_settled=False
    ).aggregate(
        total=Sum('amount')
    )['total'] or 0

    # Pending Sapati to pay
    to_pay = SapatiSplit.objects.filter(
        transaction__workspace_id=workspace_id,
        direction='PAYABLE',
        is_settled=False
    ).aggregate(
        total=Sum('amount')
    )['total'] or 0

    return Response({
        'bs_year': bs_year,
        'bs_month': bs_month,
        'total_balance': total_balance,
        'monthly_personal_spend': monthly_spend,
        'sapati_to_receive': to_receive,
        'sapati_to_pay': to_pay
    })
