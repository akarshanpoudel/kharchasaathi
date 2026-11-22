
import axios from 'axios';
import { db } from '../db/offlineStore';

const API_BASE_URL = 'http://127.0.0.1:8000/api/v1/';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);


// ==========================================
// AUTH SERVICE
// ==========================================

export const authService = {
  login: async (username, password) => {
    const response = await api.post('/auth/login/', {
      username,
      password,
    });

    if (response.data.access) {
      localStorage.setItem('access_token', response.data.access);
      localStorage.setItem('refresh_token', response.data.refresh);
    }

    // Fetch user's workspace if not already saved
    if (!localStorage.getItem('workspace_id')) {
      try {
        const wsRes = await api.get('/workspaces/');

        const list = Array.isArray(wsRes.data)
          ? wsRes.data
          : wsRes.data.results || [];

        if (list.length > 0) {
          localStorage.setItem(
            'workspace_id',
            String(list[0].id)
          );
        }
      } catch (e) {
        console.warn(
          'Could not fetch workspaces immediately after login:',
          e
        );
      }
    }

    return response.data;
  },

  register: async (username, password, email) => {
    const response = await api.post('/auth/register/', {
      username,
      password,
      email,
    });

    if (response.data.workspace_id) {
      localStorage.setItem(
        'workspace_id',
        String(response.data.workspace_id)
      );
    }

    return response.data;
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('workspace_id');
  },

  getWorkspaceId: () =>
    Number(localStorage.getItem('workspace_id') || 1),
};


// ==========================================
// FINANCE SERVICE
// ==========================================

export const financeService = {
  // ------------------------------------------
  // DASHBOARD
  // ------------------------------------------

  getDashboard: async (
    workspaceId = authService.getWorkspaceId()
  ) => {
    const response = await api.get(
      `/dashboard/?workspace=${workspaceId}`
    );

    return response.data;
  },


  // ------------------------------------------
  // TRANSACTIONS
  // ------------------------------------------

  getTransactions: async (
    workspaceId = authService.getWorkspaceId()
  ) => {
    const response = await api.get(
      `/transactions/?workspace=${workspaceId}`
    );

    const data = Array.isArray(response.data)
      ? response.data
      : response.data.results || [];

    await db.transactions.clear();

    await db.transactions.bulkAdd(
      data.map((tx) => ({
        ...tx,
        synced: true,
      }))
    );

    return data;
  },


  // ------------------------------------------
  // ACCOUNTS
  // ------------------------------------------

  getAccounts: async (
    workspaceId = authService.getWorkspaceId()
  ) => {
    const response = await api.get(
      `/accounts/?workspace=${workspaceId}`
    );

    const data = Array.isArray(response.data)
      ? response.data
      : response.data.results || [];

    await db.accounts.clear();
    await db.accounts.bulkAdd(data);

    return data;
  },

  createAccount: async (
    accountData,
    workspaceId = authService.getWorkspaceId()
  ) => {
    const payload = {
      workspace: workspaceId,
      currency: 'NPR',
      is_archived: false,
      ...accountData,
      balance: Number(accountData.balance ?? 0),
    };

    const response = await api.post(
      '/accounts/',
      payload
    );

    // Update local account cache
    await db.accounts.put(response.data);

    return response.data;
  },


  // ------------------------------------------
  // CATEGORIES
  // ------------------------------------------

  getCategories: async () => {
    const response = await api.get('/categories/');

    const data = Array.isArray(response.data)
      ? response.data
      : response.data.results || [];

    await db.categories.clear();
    await db.categories.bulkAdd(data);

    return data;
  },


  // ------------------------------------------
  // CREATE TRANSACTION
  // ------------------------------------------

  createTransaction: async (txData) => {
    const idempotencyKey =
      txData.idempotency_key ||
      (
        crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`
      );

    const payload = {
      ...txData,
      idempotency_key: idempotencyKey,
    };

    try {
      const response = await api.post(
        '/transactions/',
        payload
      );

      return {
        data: response.data,
        queuedOffline: false,
      };

    } catch (err) {
      // Queue transaction if network/server is unreachable
      if (!err.response) {
        await db.syncQueue.add({
          idempotency_key: idempotencyKey,
          payload,
          created_at: new Date().toISOString(),
        });

        await db.transactions.add({
          ...payload,
          id: `local-${idempotencyKey}`,
          synced: false,
        });

        return {
          data: payload,
          queuedOffline: true,
        };
      }

      throw err;
    }
  },


  // ------------------------------------------
  // TRANSFER
  // ------------------------------------------

  createTransfer: async (transferData) => {
    return financeService.createTransaction({
      ...transferData,
      transaction_type: 'TRANSFER',
    });
  },


  // ------------------------------------------
  // OFFLINE SYNC
  // ------------------------------------------

  flushOfflineQueue: async () => {
    const queued = await db.syncQueue.toArray();

    let syncedCount = 0;

    for (const item of queued) {
      try {
        await api.post(
          '/transactions/',
          item.payload
        );

        await db.syncQueue.delete(item.id);

        syncedCount += 1;

      } catch (err) {
        if (!err.response) {
          break; // Still offline
        }
      }
    }

    return syncedCount;
  },
};


// ==========================================
// CONTACT SERVICE
// ==========================================

export const contactService = {
  getAll: async (
    workspaceId = authService.getWorkspaceId()
  ) => {
    const response = await api.get(
      `/contacts/?workspace=${workspaceId}`
    );

    return Array.isArray(response.data)
      ? response.data
      : response.data.results || [];
  },

  getOrCreate: async (
    name,
    workspaceId = authService.getWorkspaceId()
  ) => {
    const cleanName = name.trim();

    const existing = await contactService.getAll(
      workspaceId
    );

    const match = existing.find(
      (c) =>
        c.name.trim().toLowerCase() ===
        cleanName.toLowerCase()
    );

    if (match) {
      return match;
    }

    const response = await api.post('/contacts/', {
      workspace: workspaceId,
      name: cleanName,
    });

    return response.data;
  },
};


// ==========================================
// SAPATI SERVICE
// ==========================================

export const sapatiService = {
  getAll: async (
    workspaceId = authService.getWorkspaceId()
  ) => {
    const response = await api.get(
      `/sapati/?workspace=${workspaceId}`
    );

    const data = Array.isArray(response.data)
      ? response.data
      : response.data.results || [];

    await db.sapati.clear();
    await db.sapati.bulkAdd(data);

    return data;
  },

  settle: async (
    splitId,
    accountId,
    workspaceId = authService.getWorkspaceId()
  ) => {
    const response = await api.post(
      `/sapati/${splitId}/settle/`,
      {
        account_id: Number(accountId),
        workspace_id: Number(workspaceId),
      }
    );

    return response.data;
  },
};


export default api;
