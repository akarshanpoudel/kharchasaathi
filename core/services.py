import nepali_datetime
from django.db import transaction
from django.utils import timezone
from .models import Account, SapatiSplit, Transaction


class FinancialService:

    @staticmethod
    def get_current_bs_date(ad_date=None):
        """Converts a standard Python date (AD) to Bikram Sambat year, month, day."""
        if ad_date is None:
            ad_date = timezone.now().date()

        # Convert AD date to Nepali datetime
        nepali_dt = nepali_datetime.date.from_datetime_date(ad_date)
        return {
            'bs_year': nepali_dt.year,
            'bs_month': nepali_dt.month,  # 1 (Baisakh) to 12 (Chaitra)
            'bs_day': nepali_dt.day,
        }

    @staticmethod
    @transaction.atomic

    @classmethod
    def create_transaction(
        cls,
        workspace,
        user,
        transaction_type,
        source_account_id,
        total_amount,
        ad_date,
        category=None,
        destination_account_id=None,
        personal_expense_amount=None,
        note='',
        splits_data=None,
        idempotency_key=None,
    ):
        """Creates a transaction atomically, updating account balances and Sapati splits safely."""

        # 1. Check idempotency to prevent duplicate double-submits from offline PWA queue
        if idempotency_key and Transaction.objects.filter(idempotency_key=idempotency_key).exists():
            return Transaction.objects.get(idempotency_key=idempotency_key)

        # 2. Fetch and lock source account row to prevent race conditions
        source_account = Account.objects.select_for_update().get(
            id=source_account_id, workspace=workspace
        )

        destination_account = None
        if destination_account_id:
            destination_account = Account.objects.select_for_update().get(
                id=destination_account_id, workspace=workspace
            )

        # 3. Compute Bikram Sambat fields
        bs_info = cls.get_current_bs_date(ad_date)

        # 4. Handle default personal expense amount if not explicitly split
        if personal_expense_amount is None:
            personal_expense_amount = total_amount

        # 5. Create the Transaction record
        txn = Transaction.objects.create(
            workspace=workspace,
            created_by=user,
            transaction_type=transaction_type,
            source_account=source_account,
            destination_account=destination_account,
            total_amount=total_amount,
            personal_expense_amount=personal_expense_amount,
            category=category,
            note=note,
            ad_date=ad_date,
            bs_year=bs_info['bs_year'],
            bs_month=bs_info['bs_month'],
            bs_day=bs_info['bs_day'],
            idempotency_key=idempotency_key,
        )

        # 6. Adjust Account Balances based on transaction type
        if transaction_type == 'EXPENSE':
            source_account.balance -= total_amount
            source_account.save()

        elif transaction_type == 'INCOME':
            source_account.balance += total_amount
            source_account.save()

        elif transaction_type == 'TRANSFER':
            if not destination_account:
                raise ValueError("Self-transfer requires a destination account.")
            source_account.balance -= total_amount
            source_account.save()
            destination_account.balance += total_amount
            destination_account.save()

        # 7. Handle Sapati / Bill Splits if provided
        if splits_data and transaction_type == 'EXPENSE':
            for split in splits_data:
                # split = {'contact_id': 1, 'direction': 'RECEIVABLE', 'amount': 500}
                SapatiSplit.objects.create(
                    transaction=txn,
                    contact_id=split['contact_id'],
                    direction=split['direction'],
                    amount=split['amount'],
                )

        return txn

    def settle_sapati_split(cls, split_id, account_id, workspace):
        """Marks a Sapati split as settled and updates the target wallet/cash balance."""
        split = SapatiSplit.objects.select_for_update().get(
            id=split_id, transaction__workspace=workspace
        )
        if split.is_settled:
            return split

        account = Account.objects.select_for_update().get(
            id=account_id, workspace=workspace
        )

        # If friend owed you (RECEIVABLE), settling adds money to your wallet/cash
        if split.direction == 'RECEIVABLE':
            account.balance += split.amount
        # If you owed friend (PAYABLE), settling deducts money from your wallet/cash
        elif split.direction == 'PAYABLE':
            account.balance -= split.amount

        account.save()
        split.is_settled = True
        split.settled_at = timezone.now()
        split.save()
        return split