from django.contrib import admin
from .models import (
    Account,
    Category,
    Contact,
    SapatiSplit,
    Transaction,
    Workspace,
    WorkspaceMember,
)

admin.site.register(Workspace)
admin.site.register(WorkspaceMember)
admin.site.register(Account)
admin.site.register(Category)
admin.site.register(Transaction)
admin.site.register(Contact)
admin.site.register(SapatiSplit)