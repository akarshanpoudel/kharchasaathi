import uuid
from django.contrib.auth.models import User
from django.db import models


class Workspace(models.Model):
    WORKSPACE_TYPES = [
        ('PERSONAL', 'Personal Tracker'),
        ('SHARED', 'Shared Space (Flat/Family)'),
    ]
    name = models.CharField(max_length=100)
    workspace_type = models.CharField(
        max_length=20, choices=WORKSPACE_TYPES, default='PERSONAL'
    )
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='owned_workspaces'
    )
    invite_code = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.workspace_type})"


class WorkspaceMember(models.Model):
    ROLE_CHOICES = [
        ('OWNER', 'Owner'),
        ('EDITOR', 'Editor'),
        ('VIEWER', 'Viewer'),
    ]
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='members'
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='workspace_memberships'
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='EDITOR')
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('workspace', 'user')


class Account(models.Model):
    ACCOUNT_TYPES = [
        ('CASH', 'Cash in Hand'),
        ('WALLET', 'Digital Wallet (eSewa/Khalti)'),
        ('BANK', 'Bank Account'),
        ('SAHAKARI', 'Sahakari / Cooperative'),
    ]
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='accounts'
    )
    name = models.CharField(
        max_length=100
    )  # e.g., "eSewa Main", "Nabil Bank", "Cash"
    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPES)
    balance = models.DecimalField(
        max_digits=14, decimal_places=2, default=0.00
    )  # Supports Lakh/Crore scales safely
    currency = models.CharField(max_length=5, default='NPR')
    is_archived = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.name} - Rs. {self.balance} [{self.workspace.name}]"


class Category(models.Model):
    name = models.CharField(
        max_length=50
    )  # e.g., Food & Chiya, Transport, Rent
    icon_name = models.CharField(
        max_length=50, blank=True, null=True
    )  # For UI mapping
    is_expense = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class Transaction(models.Model):
    TRANSACTION_TYPES = [
        ('EXPENSE', 'Expense'),
        ('INCOME', 'Income'),
        ('TRANSFER', 'Self-Transfer'),
    ]
    id = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False
    )  # UUID for offline PWA sync
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='transactions'
    )
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)

    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    source_account = models.ForeignKey(
        Account, on_delete=models.CASCADE, related_name='outbound_transactions'
    )
    destination_account = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='inbound_transactions',
    )

    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    personal_expense_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=0.00
    )

    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, blank=True
    )
    note = models.TextField(blank=True, null=True)

    # Gregorian Date + Pre-computed Bikram Sambat fields for instant monthly queries
    ad_date = models.DateField()
    bs_year = models.IntegerField(db_index=True)
    bs_month = models.IntegerField(
        db_index=True
    )  # 1 to 12 (e.g., 8 for Mangsir)
    bs_day = models.IntegerField()

    created_at = models.DateTimeField(auto_now_add=True)
    idempotency_key = models.CharField(
        max_length=100, unique=True, null=True, blank=True
    )

    def __str__(self):
        return f"Rs. {self.total_amount} ({self.transaction_type}) - BS {self.bs_year}/{self.bs_month}"


class Contact(models.Model):
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='contacts'
    )
    name = models.CharField(max_length=100)  # e.g., Sujan Shrestha
    phone = models.CharField(max_length=20, blank=True, null=True)

    def __str__(self):
        return f"{self.name} ({self.workspace.name})"


class SapatiSplit(models.Model):
    DIRECTION_CHOICES = [
        ('RECEIVABLE', 'To Receive (Owes You)'),
        ('PAYABLE', 'To Pay (You Owe)'),
    ]
    transaction = models.ForeignKey(
        Transaction, on_delete=models.CASCADE, related_name='splits'
    )
    contact = models.ForeignKey(
        Contact, on_delete=models.CASCADE, related_name='sapati_records'
    )
    direction = models.CharField(max_length=20, choices=DIRECTION_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    is_settled = models.BooleanField(default=False)
    settled_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.contact.name} - {self.direction}: Rs. {self.amount} (Settled: {self.is_settled})"