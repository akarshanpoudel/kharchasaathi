import Dexie from 'dexie';

export const db = new Dexie('KharchaSaathiOfflineDB');

db.version(1).stores({
  transactions: '++id, uuid, workspace, bs_year, bs_month, synced',
  accounts: '++id, workspace, name',
  categories: '++id, name',
  sapati: '++id, workspace, is_settled',
  syncQueue: '++id, idempotency_key, created_at',
});