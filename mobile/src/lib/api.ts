import { apiBaseUrl, getAccessToken, refreshAccessToken } from "./tokenStore";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiOptions = Omit<RequestInit, "body"> & { body?: unknown; accessToken?: string | null };

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const execute = async (token: string | null): Promise<Response> => {
    const headers = new Headers(options.headers);
    if (options.body !== undefined && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${apiBaseUrl()}${path}`, {
      ...options,
      headers,
      body: options.body === undefined ? undefined : options.body instanceof FormData ? options.body : JSON.stringify(options.body),
    });
  };

  let response = await execute(options.accessToken === undefined ? getAccessToken() : options.accessToken);
  if (response.status === 401 && path !== "/api/auth/refresh" && path !== "/api/auth/login" && path !== "/api/auth/register") {
    const renewed = await refreshAccessToken();
    if (renewed) response = await execute(renewed);
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const message = body && typeof body === "object" && "error" in body ? String(body.error) : `Request failed (${response.status})`;
    throw new ApiError(response.status, message, body);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type User = { id: string; email: string; createdAt: string };
export type AuthResponse = { accessToken: string; user: User; refreshToken?: string };
export type Category = { id: number; name: string; color: string; userId: string | null };
export type Transaction = {
  id: string; date: string; description: string; amount: number;
  categoryId: number | null; categoryName: string | null; categoryColor: string | null;
  predictedCategoryId: number | null; confidence: number | null; isManual: boolean;
};
export type Page<T> = { data: T[]; page: number; limit: number; total: number };
export type Summary = { month: string; income: number; expense: number; net: number; transactionCount: number };
export type CategoryTotal = { category: string; color: string; expense: number; income: number; total: number; count: number };
export type TrendPoint = { month: string; income: number; expense: number; net: number; transactionCount: number };
export type Forecast = { category: string; historical: Array<{ month: string; amount: number }>; forecast: Array<{ month: string; amount: number }> };
export type UploadResult = { id: string; status: string; accepted_rows: number; skipped_rows: number; errors: Array<{ row: number; message: string }>; warning: string | null };

export const api = {
  request: apiRequest,
  login: (email: string, password: string) => apiRequest<AuthResponse>("/api/auth/login", { method: "POST", body: { email, password } }),
  register: (email: string, password: string) => apiRequest<AuthResponse>("/api/auth/register", { method: "POST", body: { email, password } }),
  me: () => apiRequest<{ user: User }>("/api/auth/me"),
  logout: (refreshToken: string | null) => apiRequest<void>("/api/auth/logout", { method: "POST", body: { refreshToken } }),
  categories: () => apiRequest<Category[]>("/api/categories"),
  transactions: (query: URLSearchParams) => apiRequest<Page<Transaction>>(`/api/transactions?${query.toString()}`),
  summary: (month: string) => apiRequest<Summary>(`/api/analytics/summary?month=${encodeURIComponent(month)}`),
  byCategory: (from: string, to: string) => apiRequest<CategoryTotal[]>(`/api/analytics/by-category?from=${from}&to=${to}`),
  trend: (months = 6) => apiRequest<TrendPoint[]>(`/api/analytics/trend?months=${months}`),
  forecast: (category: string) => apiRequest<Forecast>(`/api/analytics/forecast?category=${encodeURIComponent(category)}`),
};
