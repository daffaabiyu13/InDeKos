// Thin fetch wrapper around the InDeKos API.
// Requests go to /api which Vite proxies to the Express backend in dev.
const BASE = import.meta.env.VITE_API_BASE || '/api';
const TOKEN_KEY = 'indekos-token';

export const tokenStore = {
  get() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
  set(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } },
  clear() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

async function request(path, options = {}) {
  const token = tokenStore.get();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Sesi habis → minta aplikasi kembali ke halaman login.
    if (res.status === 401 && token && !path.startsWith('/auth/login')) {
      window.dispatchEvent(new Event('indekos:unauthorized'));
    }
    throw Object.assign(new Error(body.error || `Request gagal (${res.status})`), { status: res.status });
  }
  return body;
}

const get = (p) => request(p);
const post = (p, data) => request(p, { method: 'POST', body: JSON.stringify(data ?? {}) });
const put = (p, data) => request(p, { method: 'PUT', body: JSON.stringify(data ?? {}) });
const del = (p) => request(p, { method: 'DELETE' });
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null)).toString();

// URL for a protected upload (<img src> cannot send headers).
// PDF invoice/kwitansi (publik; publicId tidak bisa ditebak).
export const invoicePdfUrl = (publicId, download = false) => `${BASE}/public/invoice/${encodeURIComponent(publicId)}/pdf${download ? '?download=1' : ''}`;
export const fileUrl = (name) => (name ? `${BASE}/files/${encodeURIComponent(name)}?token=${encodeURIComponent(tokenStore.get())}` : '');

export const api = {
  // Auth & users
  login: (username, password) => post('/auth/login', { username, password }),
  me: () => get('/auth/me'),
  googleStatus: () => get('/auth/google/status'),
  googleUrl: (nonce) => get(`/auth/google/url?${qs({ nonce })}`),
  googleExchange: (code, nonce) => post('/auth/google/exchange', { code, nonce }),
  googleLink: () => post('/auth/google/link'),
  googleUnlink: () => post('/auth/google/unlink'),
  changePassword: (current, next) => post('/auth/password', { current, next }),
  users: () => get('/users'),
  addUser: (d) => post('/users', d),
  updateUser: (id, d) => put(`/users/${id}`, d),
  deleteUser: (id) => del(`/users/${id}`),

  // Public (tanpa login)
  publicInfo: () => get('/public/info'),
  submitApplication: (d) => post('/public/applications', d),
  publicBills: (name, room) => get(`/public/bills?${qs({ name, room })}`),
  publicInvoice: (id) => get(`/public/invoice/${encodeURIComponent(id)}`),
  confirmInvoice: (id, d) => post(`/public/invoice/${encodeURIComponent(id)}/confirm`, d),
  submitExit: (d) => post('/public/exit-requests', d),
  transferLookup: (name, room) => get(`/public/transfer?${qs({ name, room })}`),
  submitTransfer: (d) => post('/public/transfer', d),

  // Settings
  settings: () => get('/settings'),
  saveSettings: (d) => put('/settings', d),

  // Dashboard & finance
  dashboard: () => get('/dashboard'),
  finance: () => get('/finance'),

  // Rooms & types
  rooms: () => get('/rooms'),
  addRoom: (d) => post('/rooms', d),
  updateRoom: (number, d) => put(`/rooms/${encodeURIComponent(number)}`, d),
  deleteRoom: (number) => del(`/rooms/${encodeURIComponent(number)}`),
  roomTypes: () => get('/room-types'),
  addRoomType: (d) => post('/room-types', d),
  updateRoomType: (id, d) => put(`/room-types/${id}`, d),
  deleteRoomType: (id) => del(`/room-types/${id}`),
  roomLayout: () => get('/rooms/layout'),
  roomLayoutPreview: (d) => post('/rooms/layout/preview', d),
  roomLayoutApply: (d) => post('/rooms/layout/apply', d),
  changeTypePreview: (d) => post('/rooms/change-type/preview', d),
  changeType: (d) => post('/rooms/change-type', d),
  roomHistory: (number) => get(`/rooms/${encodeURIComponent(number)}/history`),

  // Residents
  residents: (q = '', filter = 'all') => get(`/residents?${qs({ q, filter })}`),
  resident: (id) => get(`/residents/${id}`),
  addResident: (d) => post('/residents', d),
  updateResident: (id, d) => put(`/residents/${id}`, d),
  checkoutResident: (id, d) => post(`/residents/${id}/checkout`, d),
  applyPromo: (id, promoId) => post(`/residents/${id}/apply-promo`, { promoId }),

  // Applications & exit requests
  applications: (status = 'pending') => get(`/applications?${qs({ status })}`),
  approveApplication: (id, d) => post(`/applications/${id}/approve`, d),
  rejectApplication: (id, reason) => post(`/applications/${id}/reject`, { reason }),
  transfers: (status) => get(`/transfers?${qs({ status })}`),
  transferRooms: (residentId) => get(`/transfers/rooms?${qs({ residentId })}`),
  transferPreview: (id, d) => post(`/transfers/${id}/preview`, d),
  approveTransfer: (id, d) => post(`/transfers/${id}/approve`, d),
  rejectTransfer: (id, reason) => post(`/transfers/${id}/reject`, { reason }),
  residentTransferPreview: (id, d) => post(`/residents/${id}/transfer/preview`, d),
  residentTransfer: (id, d) => post(`/residents/${id}/transfer`, d),
  exitRequests: (status) => get(`/exit-requests?${qs({ status })}`),
  approveExit: (id, d) => post(`/exit-requests/${id}/approve`, d),
  rejectExit: (id, adminNote) => post(`/exit-requests/${id}/reject`, { adminNote }),

  // Invoices
  invoices: (f = {}) => get(`/invoices?${qs(f)}`),
  generateInvoices: () => post('/invoices/generate'),
  payInvoice: (id, d) => post(`/invoices/${id}/pay`, d),
  rejectInvoice: (id) => post(`/invoices/${id}/reject`),
  voidInvoice: (id) => post(`/invoices/${id}/void`),
  sendInvoice: (id, kind = 'invoice') => post(`/invoices/${id}/send`, { kind }),
  calendar: (month) => get(`/calendar?${qs({ month })}`),

  // Promos & charges
  promos: () => get('/promos'),
  addPromo: (d) => post('/promos', d),
  updatePromo: (id, d) => put(`/promos/${id}`, d),
  deletePromo: (id) => del(`/promos/${id}`),
  charges: (residentId) => get(`/charges?${qs({ residentId })}`),
  addCharge: (d) => post('/charges', d),
  updateCharge: (id, d) => put(`/charges/${id}`, d),

  // Expenses
  expenses: (month) => get(`/expenses?${qs({ month })}`),
  addExpense: (d) => post('/expenses', d),
  deleteExpense: (id) => del(`/expenses/${id}`),

  // Violations
  violationCategories: () => get('/violation-categories'),
  addViolationCategory: (d) => post('/violation-categories', d),
  deleteViolationCategory: (id) => del(`/violation-categories/${id}`),
  violations: () => get('/violations'),
  addViolation: (d) => post('/violations', d),
  sendViolation: (id) => post(`/violations/${id}/send`),
  deleteViolation: (id) => del(`/violations/${id}`),

  mantan: () => get('/mantan'),

  // Notifications & Google Calendar
  notifications: () => get('/notifications'),
  testNotification: (target) => post('/notifications/test', { target }),
  runNotifications: () => post('/notifications/run'),
  gcalStatus: () => get('/gcal/status'),
  gcalAuthUrl: () => get('/gcal/auth-url'),
  gcalSync: () => post('/gcal/sync'),
  gcalDisconnect: () => post('/gcal/disconnect'),

  // AI (mock)
  aiStatus: () => get('/ai/status'),
  aiInsights: (scope, id) => get(`/ai/insights?${qs({ scope, id })}`),
  aiChat: (d) => post('/ai/chat', d),
  aiTest: () => post('/ai/test'),
};
