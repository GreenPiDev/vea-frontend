import { getAccessToken } from './authToken';

const API_URL = import.meta.env.VITE_API_URL as string;

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(typeof body === 'object' && body && 'message' in body ? String(body.message) : 'API request failed');
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  path: string;
  payload?: unknown;
}

async function request<T>(method: string, { path, payload }: RequestOptions): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : undefined;

  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return body as T;
}

export const get = <T>(opts: RequestOptions) => request<T>('GET', opts);
export const post = <T>(opts: RequestOptions) => request<T>('POST', opts);
export const patch = <T>(opts: RequestOptions) => request<T>('PATCH', opts);
export const remove = <T>(opts: RequestOptions) => request<T>('DELETE', opts);
