// Thin fetch wrapper around the InDeKos API.
// Requests go to /api which Vite proxies to the Express backend in dev.
const BASE = import.meta.env.VITE_API_BASE || '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request gagal (${res.status})`);
  }
  return res.json();
}

export const api = {
  dashboard: () => request('/dashboard'),
  settings: () => request('/settings'),
  saveSettings: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),

  residents: (q = '', filter = 'all') =>
    request(`/residents?q=${encodeURIComponent(q)}&filter=${filter}`),
  addResident: (data) => request('/residents', { method: 'POST', body: JSON.stringify(data) }),
  checkoutResident: (id, data) =>
    request(`/residents/${id}/checkout`, { method: 'POST', body: JSON.stringify(data) }),

  rooms: () => request('/rooms'),

  applications: (status = 'pending') => request(`/applications?status=${status}`),
  submitApplication: (data) => request('/applications', { method: 'POST', body: JSON.stringify(data) }),
  approveApplication: (id, room) => request(`/applications/${id}/approve`, { method: 'POST', body: JSON.stringify({ room }) }),
  rejectApplication: (id, reason) => request(`/applications/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),

  payments: () => request('/payments'),
  markPaid: (data) => request('/payments/mark-paid', { method: 'POST', body: JSON.stringify(data) }),

  // Public payment flow (Jalur A)
  bill: (name, room) => request(`/payments/bill?name=${encodeURIComponent(name)}&room=${encodeURIComponent(room)}`),
  confirmPayment: (data) => request('/payments/confirm', { method: 'POST', body: JSON.stringify(data) }),
  pendingPayments: () => request('/payments/pending'),
  verifyPayment: (data) => request('/payments/verify', { method: 'POST', body: JSON.stringify(data) }),
  rejectConfirm: (data) => request('/payments/reject-confirm', { method: 'POST', body: JSON.stringify(data) }),

  expenses: () => request('/expenses'),
  addExpense: (data) => request('/expenses', { method: 'POST', body: JSON.stringify(data) }),

  violations: () => request('/violations'),
  addViolation: (data) => request('/violations', { method: 'POST', body: JSON.stringify(data) }),
  sendViolation: (data) => request('/violations/send', { method: 'POST', body: JSON.stringify(data) }),

  mantan: () => request('/mantan'),
  finance: () => request('/finance'),

  aiInsights: () => request('/ai/insights'),
  aiChat: (message) => request('/ai/chat', { method: 'POST', body: JSON.stringify({ message }) }),
};
