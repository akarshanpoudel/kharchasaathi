import axios from 'axios';
import { db } from '../db/offlineStore';

const API_BASE_URL = 'http://127.0.0.1:8000/api/v1/';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ==========================================
// REQUEST INTERCEPTOR
// ==========================================

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');

    if (token) {
      config.headers = config.headers || {};
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
      localStorage.setItem(
        'access_token',
        response.data.access
      );

      localStorage.setItem(
        'refresh_token',
        response.data.refresh
      );
    }

    return response.data;
  },

  register: async (username, password, email) => {
    const response = await api.post('/auth/register/', {
      username,
      password,
      email,
    });

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
// JWT REFRESH RESPONSE INTERCEPTOR
// ==========================================

let isRefreshing = false;
let pendingQueue = [];

const processQueue = (error, token = null) => {
  pendingQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token);
    }
  });

  pendingQueue = [];
};

api.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config;

    const refreshToken =
      localStorage.getItem('refresh_token');

    // ------------------------------------------
    // CHECK WHETHER REQUEST CAN BE RETRIED
    // ------------------------------------------

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      refreshToken &&
      !originalRequest.url?.includes('/auth/')
    ) {
      // ------------------------------------------
      // WAIT IF ANOTHER REQUEST IS REFRESHING
      // ------------------------------------------

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({
            resolve,
            reject,
          });
        }).then((newToken) => {
          originalRequest.headers =
            originalRequest.headers || {};

          originalRequest.headers.Authorization =
            `Bearer ${newToken}`;

          return api(originalRequest);
        });
      }

      // ------------------------------------------
      // START TOKEN REFRESH
      // ------------------------------------------

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post(
          `${API_BASE_URL}auth/token/refresh/`,
          {
            refresh: refreshToken,
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        const newAccess = res.data.access;

        // Save refreshed access token
        localStorage.setItem(
          'access_token',
          newAccess
        );

        // Support refresh token rotation
        if (res.data.refresh) {
          localStorage.setItem(
            'refresh_token',
            res.data.refresh
          );
        }

        // Resolve queued requests
        processQueue(null, newAccess);

        // Retry original request
        originalRequest.headers =
          originalRequest.headers || {};

        originalRequest.headers.Authorization =
          `Bearer ${newAccess}`;

        return api(originalRequest);

      } catch (refreshErr) {
        // Reject queued requests
        processQueue(refreshErr, null);

        // Refresh failed: log out
        authService.logout();

        // Return user to login state
        window.location.reload();

        return Promise.reject(refreshErr);

      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);


// ==========================================
// WORKSPACE SERVICE
// ==========================================

export const workspaceService = {
  // ------------------------------------------
  // GET ALL WORKSPACES
  // ------------------------------------------

  getAll: async () => {
    const response = await api.get('/workspaces/');

    return Array.isArray(response.data)
      ? response.data
      : response.data.results || [];
  },

  // ------------------------------------------
  // CREATE WORKSPACE
  // ------------------------------------------

  create: async ({
    name,
    workspace_type = 'SHARED',
  }) => {
    const response = await api.post('/workspaces/', {
      name,
      workspace_type,
    });

    const workspace = response.data;

    // Automatically activate newly created workspace
    if (workspace.id) {
      workspaceService.setActive(workspace.id);
    }

    return workspace;
  },

  // ------------------------------------------
  // JOIN WORKSPACE USING INVITE CODE
  // ------------------------------------------

  join: async (inviteCode) => {
    const response = await api.post(
      '/workspaces/join/',
      {
        invite_code: inviteCode.trim(),
      }
    );

    const workspace = response.data;

    // Automatically activate joined workspace
    if (workspace.id) {
      workspaceService.setActive(workspace.id);
    }

    return workspace;
  },

  // ------------------------------------------
  // SWITCH ACTIVE WORKSPACE
  // ------------------------------------------

  setActive: (workspaceId) => {
    if (!workspaceId) {
      throw new Error('Workspace ID is required');
    }

    localStorage.setItem(
      'workspace_id',
      String(workspaceId)
    );

    return Number(workspaceId);
  },

  // ------------------------------------------
  // GET ACTIVE WORKSPACE
  // ------------------------------------------

  getActive: () => {
    const workspaceId =
      localStorage.getItem('workspace_id');

    return workspaceId
      ? Number(workspaceId)
      : null;
  },
};

// ==========================================
// FINANCE SERVICE
// ==========================================

export const financeService = {
  // ------------------------------------------
  // DASHBOARD
  // ------------------------------------------

  getDashboard: async (
    workspaceId = authService.getWorkspaceId(),
    bsYear = null,
    bsMonth = null
  ) => {
    const params = new URLSearchParams({
      workspace: workspaceId,
    });

    if (bsYear) {
      params.append('bs_year', bsYear);
    }

    if (bsMonth) {
      params.append('bs_month', bsMonth);
    }

    const response = await api.get(
      `/dashboard/?${params.toString()}`
    );

    return response.data;
  },

  // ------------------------------------------
  // TRANSACTIONS
  // ------------------------------------------

  getTransactions: async (
    workspaceId = authService.getWorkspaceId(),
    bsYear = null,
    bsMonth = null
  ) => {
    const params = new URLSearchParams({
      workspace: workspaceId,
    });

    if (bsYear) {
      params.append('bs_year', bsYear);
    }

    if (bsMonth) {
      params.append('bs_month', bsMonth);
    }

    const response = await api.get(
      `/transactions/?${params.toString()}`
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
          break;
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
