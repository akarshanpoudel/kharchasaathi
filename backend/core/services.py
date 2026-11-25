import datetime
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
        elif isinstance(ad_date, str):
            ad_date = datetime.date.fromisoformat(ad_date[:10])
        elif isinstance(ad_date, datetime.datetime):
            ad_date = ad_date.date()

        nepali_dt = nepali_datetime.date.from_datetime_date(ad_date)
        return {
            'bs_year': nepali_dt.year,
            'bs_month': nepali_dt.month,  # 1 (Baisakh) to 12 (Chaitra)
            'bs_day': nepali_dt.day,
        }

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
        with transaction.atomic():
            if idempotency_key and Transaction.objects.filter(idempotency_key=idempotency_key).exists():
                return Transaction.objects.get(idempotency_key=idempotency_key)

            source_account = Account.objects.select_for_update().get(
                id=source_account_id, workspace=workspace
            )

            destination_account = None
            if destination_account_id:
                destination_account = Account.objects.select_for_update().get(
                    id=destination_account_id, workspace=workspace
                )

            bs_info = cls.get_current_bs_date(ad_date)

            if personal_expense_amount is None:
                personal_expense_amount = total_amount

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

            if splits_data and transaction_type == 'EXPENSE':
                for split in splits_data:
                    SapatiSplit.objects.create(
                        transaction=txn,
                        contact_id=split['contact_id'],
                        direction=split['direction'],
                        amount=split['amount'],
                    )

            return txn

    @classmethod
    def settle_sapati_split(cls, split_id, account_id, workspace_id):
        """Marks a Sapati split as settled and updates the target wallet/cash balance."""
        with transaction.atomic():
            split = SapatiSplit.objects.select_for_update().get(
                id=split_id, transaction__workspace_id=workspace_id
            )
            if split.is_settled:
                return split

            account = Account.objects.select_for_update().get(
                id=account_id, workspace_id=workspace_id
            )

            if split.direction == 'RECEIVABLE':
                account.balance += split.amount
            elif split.direction == 'PAYABLE':
                account.balance -= split.amount

            account.save()
            split.is_settled = True
            split.settled_at = timezone.now()
            split.save()
            return split