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

async function readBody<T>(res: Response): Promise<T> {
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : undefined;
  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return body as T;
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
  return readBody<T>(res);
}

export const get = <T>(opts: RequestOptions) => request<T>('GET', opts);
export const post = <T>(opts: RequestOptions) => request<T>('POST', opts);
export const patch = <T>(opts: RequestOptions) => request<T>('PATCH', opts);
export const remove = <T>(opts: RequestOptions) => request<T>('DELETE', opts);

// Multipart upload (Cloudinary artwork images etc.) — no Content-Type header
// set manually, the browser fills in the multipart boundary itself; setting
// it by hand (like the JSON path above does) breaks the boundary parsing.
export async function postFormData<T>(path: string, formData: FormData): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });
  return readBody<T>(res);
}
