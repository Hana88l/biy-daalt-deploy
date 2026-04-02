const envBase = import.meta?.env?.VITE_API_BASE_URL;

function getDefaultApiBaseUrl() {
  if (envBase) return envBase;
  if (typeof window === 'undefined') return 'http://localhost:4000/api';

  return window.location.hostname === 'localhost'
    ? 'http://localhost:4000/api'
    : `${window.location.origin}/api`;
}

export const API_BASE_URL = getDefaultApiBaseUrl();
export const STREAM_URL = `${API_BASE_URL}/realtime/stream`;

async function parseResponsePayload(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    return await response.text();
  } catch {
    return null;
  }
}

function buildHttpError(response, payload, endpoint) {
  const status = response.status;
  const statusText = response.statusText || 'Request failed';
  const isHtml = typeof payload === 'string' && /<[^>]+>/.test(payload);

  let errorMsg = 'An error occurred';

  if (payload && typeof payload === 'object' && payload.error) {
    errorMsg = payload.error;
  } else if (typeof payload === 'string' && payload.trim() && !isHtml) {
    errorMsg = payload.trim();
  } else if (status === 404) {
    errorMsg = endpoint.includes('/analytics/site/connect')
      ? 'URL analyze endpoint old backend дээр алга байна. Backend server-ээ restart хийгээд дахин оролдоно уу.'
      : `API endpoint not found (${endpoint})`;
  } else if (status >= 500) {
    errorMsg = 'Backend server дотор алдаа гарлаа. Server log-оо шалгаад дахин оролдоно уу.';
  } else if (statusText) {
    errorMsg = statusText;
  }

  const error = new Error(errorMsg);
  error.status = status;
  error.payload = payload;
  throw error;
}

function getAuthToken() {
  const userStr = localStorage.getItem('auth_user');
  if (!userStr) return null;

  try {
    const parsed = JSON.parse(userStr);
    return parsed.token || null;
  } catch {
    return null;
  }
}

export async function fetchWithAuth(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (err) {
    const error = new Error(`Backend API-д холбогдож чадсангүй (${API_BASE_URL}).`);
    error.cause = err;
    throw error;
  }

  const payload = await parseResponsePayload(response);

  if (!response.ok) {
    buildHttpError(response, payload, endpoint);
  }

  if (payload === null || payload === '') {
    return {};
  }

  return payload;
}

export async function downloadWithAuth(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (err) {
    const error = new Error(`Backend API-д холбогдож чадсангүй (${API_BASE_URL}).`);
    error.cause = err;
    throw error;
  }

  if (!response.ok) {
    const payload = await parseResponsePayload(response);
    buildHttpError(response, payload, endpoint);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const contentType = response.headers.get('content-type') || '';
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
  const filename = filenameMatch ? filenameMatch[1] : null;

  return { blob, filename, contentType };
}
