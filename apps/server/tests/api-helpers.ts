// أدوات مشتركة لاختبارات التكامل عبر HTTP ضد خادم محلي يعمل.
export const BASE = process.env.API_BASE || "http://127.0.0.1:4000";
export const DEMO_PASSWORD = "Demo@2026!";

export interface Session {
  name: string;
  cookie?: string;
  id?: string;
}

export interface ApiResponse {
  status: number;
  body: any;
  headers: Headers;
}

export async function req(session: Session | null, method: string, url: string, body?: unknown): Promise<ApiResponse> {
  const headers: Record<string, string> = {};
  if (session?.cookie) headers.cookie = session.cookie;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + url, { method, headers, body: payload });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json, headers: res.headers };
}

export async function login(identifier: string, password = DEMO_PASSWORD): Promise<Session> {
  const res = await req(null, "POST", "/api/v1/auth/login", { identifier, password });
  if (res.status !== 200) throw new Error(`فشل دخول ${identifier}: ${res.status} ${JSON.stringify(res.body)}`);
  const raw = res.headers.get("set-cookie") ?? "";
  const match = /sid=([^;]+)/.exec(raw);
  const session: Session = { name: identifier, cookie: match ? `sid=${match[1]}` : undefined };
  const me = await req(session, "GET", "/api/v1/auth/me");
  session.id = me.body?.data?.user?.id;
  return session;
}

export async function uploadFile(
  session: Session,
  bytes: Buffer,
  type: string,
  filename: string,
  endpoint = "/api/v1/uploads",
  field = "file",
): Promise<ApiResponse> {
  const form = new FormData();
  form.append(field, new Blob([new Uint8Array(bytes)], { type }), filename);
  return req(session, "POST", endpoint, form);
}

export const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
export const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n", "ascii");

export function collect() {
  const results: Array<{ name: string; ok: boolean; detail: string }> = [];
  function check(name: string, ok: boolean, detail = "") {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
  }
  function status(name: string, res: ApiResponse, expected: number | number[]) {
    const allowed = Array.isArray(expected) ? expected : [expected];
    check(name, allowed.includes(res.status), `HTTP ${res.status}${res.status >= 400 ? ` ${JSON.stringify(res.body)?.slice(0, 160)}` : ""}`);
    return allowed.includes(res.status);
  }
  return { results, check, status };
}
