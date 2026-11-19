from rest_framework import serializers
from .models import (
    Account,
    Category,
    Contact,
    SapatiSplit,
    Transaction,
    Workspace,
)
from .services import FinancialService


class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ['id', 'name', 'workspace_type', 'invite_code', 'created_at']
        read_only_fields = ['id', 'invite_code', 'created_at']


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = ['id', 'workspace', 'name', 'account_type', 'balance', 'currency', 'is_archived']


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'icon_name', 'is_expense']


class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = ['id', 'workspace', 'name', 'phone']


class SapatiSplitSerializer(serializers.ModelSerializer):
    contact_name = serializers.CharField(source='contact.name', read_only=True)

    class Meta:
        model = SapatiSplit
        fields = ['id', 'contact', 'contact_name', 'direction', 'amount', 'is_settled', 'settled_at']
        read_only_fields = ['id', 'is_settled', 'settled_at']


class TransactionSerializer(serializers.ModelSerializer):
    splits = SapatiSplitSerializer(many=True, required=False)
    source_account_name = serializers.CharField(source='source_account.name', read_only=True)
    destination_account_name = serializers.CharField(source='destination_account.name', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = Transaction
        fields = [
            'id', 'workspace', 'transaction_type', 'source_account', 'source_account_name',
            'destination_account', 'destination_account_name', 'total_amount',
            'personal_expense_amount', 'category', 'category_name', 'note',
            'ad_date', 'bs_year', 'bs_month', 'bs_day', 'splits', 'idempotency_key', 'created_at'
        ]
        read_only_fields = ['id', 'bs_year', 'bs_month', 'bs_day', 'created_at']

    def create(self, validated_data):
        splits_data = validated_data.pop('splits', [])
        user = self.context['request'].user

        # Format splits for the FinancialService
        formatted_splits = [
            {
                'contact_id': s['contact'].id,
                'direction': s['direction'],
                'amount': s['amount'],
            }
            for s in splits_data
        ]

        return FinancialService.create_transaction(
            workspace=validated_data['workspace'],
            user=user if user.is_authenticated else None,
            transaction_type=validated_data['transaction_type'],
            source_account_id=validated_data['source_account'].id,
            destination_account_id=validated_data['destination_account'].id if validated_data.get('destination_account') else None,
            total_amount=validated_data['total_amount'],
            personal_expense_amount=validated_data.get('personal_expense_amount'),
            category=validated_data.get('category'),
            note=validated_data.get('note', ''),
            ad_date=validated_data['ad_date'],
            splits_data=formatted_splits,
            idempotency_key=validated_data.get('idempotency_key'),
        )