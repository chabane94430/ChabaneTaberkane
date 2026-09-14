import { API_URL } from "./config";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let authToken: string | undefined;

export function setAuthToken(token: string | undefined) {
  authToken = token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = typeof body?.error === "string" ? body.error : JSON.stringify(body?.error ?? body);
    throw new ApiError(res.status, message || `Request failed with status ${res.status}`);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Uploads a single file picked via expo-image-picker (uri/name/type) as
 * multipart/form-data. Deliberately bypasses `request()`'s JSON Content-Type — fetch
 * sets the multipart boundary itself once the body is a FormData instance. */
export async function uploadFile<T>(
  path: string,
  field: string,
  file: { uri: string; name: string; type: string }
): Promise<T> {
  const formData = new FormData();
  // React Native's FormData accepts this {uri, name, type} shape directly; it isn't a
  // real Blob, hence the "as unknown as Blob" cast to satisfy the DOM lib's typing.
  formData.append(field, { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);

  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers, body: formData });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = typeof body?.error === "string" ? body.error : JSON.stringify(body?.error ?? body);
    throw new ApiError(res.status, message || `Request failed with status ${res.status}`);
  }
  return body as T;
}
