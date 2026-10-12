import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/domain/errors";

export function json(data: unknown, status = 200) {
  return Response.json({ data }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function endpoint(action: () => Promise<Response> | Response): Promise<Response> {
  try { return await action(); }
  catch (error) {
    const requestId = randomUUID();
    if (error instanceof z.ZodError) return Response.json({ error: {
      code: "VALIDATION_ERROR", message: "Please check the submitted fields", requestId,
      details: error.issues.map(({ path, message }) => ({ field: path.join("."), message })),
    } }, { status: 400, headers: { "Cache-Control": "no-store" } });
    if (error instanceof AppError) return Response.json({ error: {
      code: error.code, message: error.message, details: error.details, requestId,
    } }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    // Do not log request bodies or arbitrary exception text that may contain credentials.
    console.error("ClinicFlow unexpected server error", { requestId, type: error instanceof Error ? error.name : "unknown" });
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred", requestId } },
      { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  // Next.js can normalize request.url to localhost even when the browser uses
  // 127.0.0.1. Compare against the actual Host header, not proxy-forwarded input.
  const expectedOrigin = `${url.protocol}//${request.headers.get("host") || url.host}`;
  if (origin && origin !== expectedOrigin) {
    throw new AppError("ORIGIN_NOT_ALLOWED", "Cross-origin writes are not allowed", 403);
  }
}

export async function body(request: Request): Promise<unknown> {
  checkOrigin(request);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Use application/json", 415);
  }
  // Stream with a cap rather than trusting Content-Length or allocating an unbounded body.
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("INVALID_JSON", "A JSON body is required");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16_384) { await reader.cancel(); throw new AppError("PAYLOAD_TOO_LARGE", "Body exceeds 16 KB", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new AppError("INVALID_JSON", "Request body is not valid JSON"); }
}

export function query(request: Request) {
  const params = new URL(request.url).searchParams;
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    if (Object.hasOwn(result, key)) throw new AppError("DUPLICATE_PARAMETER", `Query parameter ${key} must appear once`);
    Object.defineProperty(result, key, { value, enumerable: true, configurable: true });
  }
  return result;
}

export type AppointmentContext = { params: Promise<{ id: string }> };
