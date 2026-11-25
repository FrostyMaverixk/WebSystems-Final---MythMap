export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// The session and its permissions are issued and checked by the server.
export class ApiClient {
  constructor() { this.csrfToken = null; }

  async request(path, options = {}) {
    const { method = 'GET', body, signal } = options;
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && this.csrfToken) headers['X-CSRF-Token'] = this.csrfToken;
    let response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      response = await fetch(`/api${path}`, {
        method, headers, credentials: 'same-origin', cache: 'no-store',
        body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        if (signal?.aborted) throw error;
        throw new ApiError('The server took too long to respond. Please try again.');
      }
      throw new ApiError('Cannot reach the server. Check your connection and try again.');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
    let data;
    try { data = await response.json(); }
    catch { throw new ApiError('The app server is unavailable. Start the project with npm start, then open http://localhost:3000.', response.status); }
    if (!response.ok) throw new ApiError(data.error || 'The request could not be completed.', response.status);
    if (Object.hasOwn(data, 'csrfToken')) this.csrfToken = data.csrfToken;
    return data;
  }
}
