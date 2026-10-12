export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?:
      | { suggestions?: { startAt: string; endAt: string }[] }
      | { field: string; message: string }[],
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json();
  if (!response.ok)
    throw new ApiError(
      payload.error?.message || "Something went wrong. Please try again.",
      payload.error?.code || "UNKNOWN",
      payload.error?.details,
    );
  return payload.data;
}
