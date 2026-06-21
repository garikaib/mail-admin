const API_BASE = '/api';

export async function request(endpoint, options = {}) {
  const token = localStorage.getItem('mail_admin_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
  };

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config);

  if (response.status === 401) {
    localStorage.removeItem('mail_admin_token');
    localStorage.removeItem('mail_admin_user');
    window.location.reload();
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.detail || errorData.message || response.statusText || 'An error occurred';
    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  get: (url, options) => request(url, { ...options, method: 'GET' }),
  post: (url, body, options) => request(url, { ...options, method: 'POST', body }),
  put: (url, body, options) => request(url, { ...options, method: 'PUT', body }),
  delete: (url, options) => request(url, { ...options, method: 'DELETE' }),
};
