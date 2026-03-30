import axios, { AxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import toast from 'react-hot-toast';

let API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// Force local backend if running on localhost to avoid production redirects during testing
if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
  API_BASE_URL = 'http://localhost:3000';
}

export { API_BASE_URL };

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000,  // 5 min — LLM evaluation runs multiple sequential calls and can be slow
  withCredentials: true,   // send httpOnly cookie on every request
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    try {
      (config.headers as any)['X-Request-ID'] = crypto.randomUUID();
    } catch (e) {
      // crypto may not be available in some environments
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor with 429 retry (exponential backoff + Retry-After support)
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config: any = (error.config as any) || {};
    const status = error.response?.status;

    // Handle rate limit (429) with retry
    if (status === 429 && config) {
      config.__retryCount = config.__retryCount || 0;
      const MAX_RETRIES = 3;

      if (config.__retryCount < MAX_RETRIES) {
        config.__retryCount += 1;

        // Use Retry-After header if present (seconds)
        const retryAfterHeader = error.response?.headers?.['retry-after'];
        let delayMs = 500 * Math.pow(2, config.__retryCount - 1); // 500ms, 1s, 2s

        if (retryAfterHeader) {
          const parsed = parseInt(String(retryAfterHeader), 10);
          if (!Number.isNaN(parsed)) delayMs = parsed * 1000;
        }

        toast.dismiss();
        toast.loading(`Rate limited — retrying (${config.__retryCount}/${MAX_RETRIES})...`);

        await new Promise((res) => setTimeout(res, delayMs));

        try {
          const resp = await apiClient.request(config);
          toast.dismiss();
          return resp;
        } catch (reqErr) {
          // fall through to error handling below
          error = reqErr as AxiosError;
        }
      } else {
        config.__isRetryExhausted = true;
        toast.dismiss();
        toast.error('Scoring service rate-limited. Please try again shortly.');
      }
    }

    // Let callers handle UI for other errors, but show helpful toasts for common cases
    if (error.response) {
      const statusCode = error.response.status;
      const message = (error.response.data as any)?.error || 'An error occurred';
      if (statusCode === 404) toast.error(`Not found: ${message}`);
      else if (statusCode === 401) { /* 401 handled in-page, no global toast */ }
      else if (statusCode === 500) toast.error('Server error. Please try again later.');
      else if (statusCode !== 429) toast.error(message);
    } else if (error.request) {
      toast.error('Network error. Check your connection.');
    }

    return Promise.reject(error);
  }
);

export default apiClient;
