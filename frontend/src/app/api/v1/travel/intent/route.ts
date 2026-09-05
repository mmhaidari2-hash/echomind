import { NextRequest, NextResponse } from "next/server";

import { parseTravelIntent } from "@/app/lib/travelIntent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_QUERY = 800;
const ALLOWED_ACTIONS = new Set(["quote", "confirm"]);

function backendOrigin(): string {
  const values = [
    process.env.API_PROXY_TARGET,
    process.env.INTERNAL_API_URL,
    process.env.RAILWAY_API_URL,
    process.env.NEXT_PUBLIC_API_URL,
  ];
  for (const value of values) {
    const raw = (value || "").trim();
    if (!raw || raw.startsWith("/")) continue;
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return withProtocol.replace(/\/$/, "").replace(/\/api\/v1$/i, "");
  }
  return "http://127.0.0.1:8000";
}

function jsonError(status: number, detail: string, code: string) {
  return NextResponse.json({ detail, code }, { status });
}

type Incoming = {
  action?: string;
  query?: string;
  locale?: string;
  intent_id?: string;
  confirm_token?: string;
};

function sanitize(body: Incoming): Incoming | Response {
  const action = (body.action || "quote").toLowerCase();
  if (!ALLOWED_ACTIONS.has(action)) {
    return jsonError(400, "Unsupported travel action", "validation_error");
  }
  if (action === "confirm") {
    const intentId = (body.intent_id || "").trim();
    const token = (body.confirm_token || "").trim();
    if (!/^[a-f0-9]{8,32}$/i.test(intentId) || token.length < 16 || token.length > 512) {
      return jsonError(400, "Invalid confirmation payload", "validation_error");
    }
    return { action, intent_id: intentId, confirm_token: token };
  }

  const query = (body.query || "").trim().slice(0, MAX_QUERY);
  const locale = body.locale === "fa" ? "fa" : "en";
  if (query.length < 2) {
    return jsonError(400, "Travel query is required", "validation_error");
  }
  const parsed = parseTravelIntent(query, locale);
  return {
    action: "quote",
    query,
    locale: parsed.locale,
  };
}

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, "Expected JSON body", "validation_error");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return jsonError(400, "Invalid travel payload", "validation_error");
  }

  const sanitized = sanitize(raw as Incoming);
  if (sanitized instanceof Response) return sanitized;

  const dest = `${backendOrigin()}/api/v1/travel/intent`;
  try {
    const upstream = await fetch(dest, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sanitized),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const text = await upstream.text();
    const json = text ? JSON.parse(text) : {};
    return NextResponse.json(json, { status: upstream.status });
  } catch {
    return jsonError(502, "Could not reach the travel service", "proxy_error");
  }
}
