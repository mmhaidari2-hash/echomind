import { authorizationHeaders } from "@/app/lib/authHeaders";
import { AuthSessionError } from "@/app/lib/authToken";

export type ApiLocale = "en" | "fa";

export type PillarId =
  | "delay_repay"
  | "consumer_rights"
  | "overdraft_shield";

export type ChatMetadata = {
  intent?: string;
  source?: string;
  attachment_names?: string[];
  memory_hints?: string[];
};

export type ChatRequest = {
  message: string;
  conversation_id?: string;
  locale?: ApiLocale;
  metadata?: ChatMetadata;
};

export type ChatResponse = {
  conversation_id: string;
  pillar: PillarId;
  title: string;
  message: string;
  steps: string[];
  engine: string;
  status: string;
  metadata?: Record<string, unknown>;
};

export class ApiError extends Error {
  status: number;
  code: string;
  requestId: string;

  constructor(
    message: string,
    options?: { status?: number; code?: string; requestId?: string },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options?.status ?? 0;
    this.code = options?.code ?? "network_error";
    this.requestId = options?.requestId ?? "";
  }
}

const DEFAULT_BASE = "/api/v1";
const CHAT_TIMEOUT_MS = 20_000;
const HEALTH_TIMEOUT_MS = 2_500;

function unique(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function normalizeBase(url: string): string {
  return url.replace(/\/$/, "");
}

function isAndroidWebView(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.protocol === "capacitor:" || window.location.protocol === "ionic:";
}

function sameOriginBase(): string | undefined {
  if (isNativeShell()) return undefined;
  return DEFAULT_BASE;
}

function lanHostBases(): string[] {
  const raw = (process.env.NEXT_PUBLIC_DEV_HOST || "").trim();
  if (!raw) return [];
  const host = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  if (!host || host === "localhost" || host === "127.0.0.1") return [];
  return [
    `http://${host}:8000/api/v1`,
    `http://${host}:8001/api/v1`,
    `http://${host}:8004/api/v1`,
  ];
}

function candidateBases(): string[] {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (process.env.NODE_ENV === "production") {
    return unique([sameOriginBase(), configured, ...lanHostBases()]).map(normalizeBase);
  }
  const emulatorHosts = isAndroidWebView()
    ? [
        "http://10.0.2.2:8004/api/v1",
        "http://10.0.2.2:8001/api/v1",
        "http://10.0.2.2:8000/api/v1",
        "http://10.0.2.2:8003/api/v1",
      ]
    : [];
  return unique([
    sameOriginBase(),
    configured,
    ...lanHostBases(),
    ...emulatorHosts,
    "http://127.0.0.1:8001/api/v1",
    "http://localhost:8001/api/v1",
    "http://127.0.0.1:8004/api/v1",
    "http://localhost:8004/api/v1",
    "http://127.0.0.1:8000/api/v1",
    "http://localhost:8000/api/v1",
    DEFAULT_BASE,
    "http://127.0.0.1:8003/api/v1",
    "http://localhost:8003/api/v1",
    "http://127.0.0.1:8002/api/v1",
    "http://localhost:8002/api/v1",
  ]).map(normalizeBase);
}

let resolvedBase: string | null = null;
const failedBases = new Set<string>();

export function resetApiBase() {
  resolvedBase = null;
  failedBases.clear();
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return (
    error.status === 404 ||
    error.status === 502 ||
    error.status === 503 ||
    error.code === "network_error" ||
    error.code === "timeout"
  );
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isFormData(body: unknown): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
  auth?: "public" | "protected";
};

async function request<T>(
  base: string,
  path: string,
  init: ApiRequestInit = {},
): Promise<T> {
  const { timeoutMs = CHAT_TIMEOUT_MS, auth = "public", headers, ...rest } = init;
  let secureHeaders: Record<string, string> = {};
  try {
    if (auth === "protected") {
      secureHeaders = await authorizationHeaders();
    }
  } catch (error) {
    if (error instanceof AuthSessionError) {
      throw new ApiError(error.message, { status: 401, code: "auth_session" });
    }
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(rest.body && !isFormData(rest.body) ? { "Content-Type": "application/json" } : {}),
        ...secureHeaders,
        ...headers,
      },
    });
    const body = await parseJson(response);
    if (!response.ok) {
      const payload = body as { detail?: unknown; code?: string; request_id?: string } | null;
      const detail =
        typeof payload?.detail === "string"
          ? payload.detail
          : `Request failed (${response.status})`;
      throw new ApiError(detail, {
        status: response.status,
        code: payload?.code ?? "http_error",
        requestId: payload?.request_id ?? "",
      });
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("The request timed out", { code: "timeout" });
    }
    throw new ApiError("Could not reach EchoMind", { code: "network_error" });
  } finally {
    clearTimeout(timer);
  }
}

async function resolveApiBase(): Promise<string> {
  if (resolvedBase && !failedBases.has(resolvedBase)) return resolvedBase;
  for (const base of candidateBases()) {
    if (failedBases.has(base)) continue;
    try {
      const health = await request<{ status?: string }>(base, "/health", {
        method: "GET",
        timeoutMs: HEALTH_TIMEOUT_MS,
      });
      if (health.status === "healthy") {
        resolvedBase = base;
        return base;
      }
      failedBases.add(base);
    } catch {
      failedBases.add(base);
    }
  }
  failedBases.clear();
  resolvedBase = candidateBases()[0] ?? DEFAULT_BASE;
  return resolvedBase;
}

async function withBase<T>(run: (base: string) => Promise<T>): Promise<T> {
  const base = await resolveApiBase();
  try {
    const result = await run(base);
    return result;
  } catch (error) {
    if (!isRetryable(error)) throw error;
    failedBases.add(base);
    resolvedBase = null;
    const next = await resolveApiBase();
    if (next === base) throw error;
    return run(next);
  }
}

async function api<T>(
  path: string,
  init: ApiRequestInit = {},
): Promise<T> {
  return withBase((base) => request<T>(base, path, init));
}

export async function getHealth(): Promise<{ status: string }> {
  return api<{ status: string }>("/health", {
    method: "GET",
    timeoutMs: HEALTH_TIMEOUT_MS,
  });
}

export async function sendChat(payload: ChatRequest): Promise<ChatResponse> {
  return api<ChatResponse>("/chat", {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify(payload),
  });
}

export async function processChat(payload: ChatRequest): Promise<ChatResponse> {
  return api<ChatResponse>("/process", {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify(payload),
  });
}


export type ChatStreamResult = {
  conversation_id: string;
  pillar: PillarId;
  message: string;
};

export async function streamChat(
  payload: ChatRequest,
  onDelta: (text: string) => void,
): Promise<ChatStreamResult> {
  const base = await resolveApiBase();
  let secureHeaders: Record<string, string>;
  try {
    secureHeaders = await authorizationHeaders();
  } catch (error) {
    if (error instanceof AuthSessionError) {
      throw new ApiError(error.message, { status: 401, code: "auth_session" });
    }
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(`${base}/chat/stream`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        ...secureHeaders,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await parseJson(response);
      const detail =
        typeof (body as { detail?: unknown } | null)?.detail === "string"
          ? (body as { detail: string }).detail
          : `Request failed (${response.status})`;
      throw new ApiError(detail, { status: response.status, code: "http_error" });
    }
    if (!response.body) {
      throw new ApiError("Streaming response was empty", { code: "stream_error" });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let conversationId = "";
    let pillar: PillarId = "consumer_rights";
    let message = "";

    const consumeBlock = (block: string) => {
      const lines = block.split("\n");
      const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "message";
      const dataText = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!dataText) return;
      const data = JSON.parse(dataText) as Record<string, unknown>;

      if (event === "meta") {
        if (typeof data.conversation_id === "string") conversationId = data.conversation_id;
        if (
          data.pillar === "delay_repay" ||
          data.pillar === "consumer_rights" ||
          data.pillar === "overdraft_shield"
        ) {
          pillar = data.pillar;
        }
        return;
      }
      if (event === "delta" && typeof data.text === "string") {
        message += data.text;
        onDelta(data.text);
        return;
      }
      if (event === "error") {
        throw new ApiError(
          typeof data.message === "string" ? data.message : "Streaming failed",
          { code: typeof data.code === "string" ? data.code : "stream_error" },
        );
      }
      if (event === "done" && typeof data.conversation_id === "string") {
        conversationId = data.conversation_id;
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        if (block.trim()) consumeBlock(block);
      }
      if (done) break;
    }
    if (buffer.trim()) consumeBlock(buffer);

    if (!conversationId || !message.trim()) {
      throw new ApiError("Streaming response was incomplete", { code: "stream_error" });
    }
    return { conversation_id: conversationId, pillar, message };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("The response timed out", { code: "timeout" });
    }
    throw new ApiError("Could not stream EchoMind", { code: "network_error" });
  } finally {
    clearTimeout(timer);
  }
}

export type TicketType =
  | "single"
  | "return"
  | "season_weekly"
  | "season_monthly"
  | "season_annual";

export type DelayTier =
  | "not_eligible"
  | "15_29"
  | "30_59"
  | "60_plus"
  | "120_plus";

export type DelayRepayOperator = {
  id: string;
  name: string;
  claim_url: string | null;
};

export type DelayRepayTierInfo = {
  id: DelayTier;
  label: string;
  minutes_min: number;
  minutes_max: number | null;
  percent: number;
  notes: string;
};

export type DelayRepayClaimRequest = {
  operator: string;
  origin?: string;
  destination?: string;
  journey_date?: string;
  delay_minutes: number;
  scheduled_arrival?: string;
  actual_arrival?: string;
  ticket_type: TicketType;
  ticket_cost: number;
  ticket_reference?: string;
  proof_filename?: string;
  passenger_name?: string;
  locale?: ApiLocale;
};

export type DelayRepayClaimResponse = {
  eligible: boolean;
  tier: DelayTier;
  tier_label: string;
  delay_minutes: number;
  percent: number;
  basis_amount: string | number;
  estimate_gbp: string | number;
  currency: string;
  guideline: string;
  claim_deadline_days: number;
  operator_id: string;
  operator_name: string;
  claim_url: string | null;
  claim_draft: string;
  next_steps: string[];
  ticket_type: TicketType;
  ticket_reference: string | null;
  proof_filename: string | null;
};

export async function listDelayRepayOperators(): Promise<DelayRepayOperator[]> {
  return api<DelayRepayOperator[]>("/delay-repay/operators", {
    method: "GET",
    timeoutMs: HEALTH_TIMEOUT_MS,
  });
}

export async function listDelayRepayTiers(): Promise<DelayRepayTierInfo[]> {
  return api<DelayRepayTierInfo[]>("/delay-repay/tiers", {
    method: "GET",
    timeoutMs: HEALTH_TIMEOUT_MS,
  });
}

export async function submitDelayRepayClaim(
  payload: DelayRepayClaimRequest,
): Promise<DelayRepayClaimResponse> {
  return api<DelayRepayClaimResponse>("/delay-repay/claims", {
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify(payload),
  });
}

export type PurchaseKind = "goods" | "digital" | "services";
export type PriorRemedy =
  | "none"
  | "repair_attempted"
  | "replacement_attempted"
  | "trader_refused";
export type DesiredRemedy =
  | "auto"
  | "refund"
  | "repair"
  | "replacement"
  | "price_reduction";
export type RightsPathway =
  | "short_term_reject"
  | "repair_or_replace"
  | "final_right_to_reject"
  | "price_reduction"
  | "burden_shift_guidance";

export type ConsumerRightsPathwayInfo = {
  id: RightsPathway;
  label: string;
  window: string;
  notes: string;
};

export type ConsumerRightsRequest = {
  retailer_name: string;
  retailer_address?: string;
  consumer_name?: string;
  item_description: string;
  purchase_kind?: PurchaseKind;
  purchase_date: string;
  delivery_date?: string;
  purchase_price: number;
  order_reference?: string;
  fault_description: string;
  prior_remedy?: PriorRemedy;
  desired_remedy?: DesiredRemedy;
  proof_filename?: string;
  locale?: ApiLocale;
};

export type ConsumerRightsResponse = {
  pathway: RightsPathway;
  pathway_label: string;
  recommended_remedy: DesiredRemedy;
  days_since_delivery: number;
  within_30_days: boolean;
  within_6_months: boolean;
  burden_on_trader: boolean;
  statute_refs: string[];
  summary: string;
  guideline: string;
  notice_draft: string;
  next_steps: string[];
  retailer_name: string;
  item_description: string;
  purchase_price: string | number;
  order_reference: string | null;
  proof_filename: string | null;
};

export async function listConsumerRightsPathways(): Promise<ConsumerRightsPathwayInfo[]> {
  return api<ConsumerRightsPathwayInfo[]>("/consumer-rights/pathways", {
    method: "GET",
    timeoutMs: HEALTH_TIMEOUT_MS,
  });
}

export async function submitConsumerRightsNotice(
  payload: ConsumerRightsRequest,
): Promise<ConsumerRightsResponse> {
  return api<ConsumerRightsResponse>("/consumer-rights/notices", {
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify(payload),
  });
}

export type OverdraftKind = "arranged" | "unarranged";
export type AccountType = "current" | "student" | "basic";
export type PriorComplaint =
  | "none"
  | "informal"
  | "formal_pending"
  | "bank_refused"
  | "eight_weeks";
export type ShieldPathway =
  | "bank_complaint"
  | "chase_final_response"
  | "fos_referral"
  | "vulnerability_support";

export type OverdraftShieldPathwayInfo = {
  id: ShieldPathway;
  label: string;
  window: string;
  notes: string;
};

export type OverdraftShieldRequest = {
  bank_name: string;
  bank_address?: string;
  customer_name?: string;
  account_type?: AccountType;
  overdraft_kind?: OverdraftKind;
  fee_amount: number;
  fee_date: string;
  account_last4?: string;
  fee_description: string;
  prior_complaint?: PriorComplaint;
  struggling?: boolean;
  proof_filename?: string;
  locale?: ApiLocale;
};

export type OverdraftShieldResponse = {
  pathway: ShieldPathway;
  pathway_label: string;
  days_since_fee: number;
  overdraft_kind: OverdraftKind;
  can_refer_fos: boolean;
  fos_url: string;
  statute_refs: string[];
  summary: string;
  guideline: string;
  notice_draft: string;
  next_steps: string[];
  bank_name: string;
  fee_amount: string | number;
  proof_filename: string | null;
};

export async function listOverdraftShieldPathways(): Promise<OverdraftShieldPathwayInfo[]> {
  return api<OverdraftShieldPathwayInfo[]>("/overdraft-shield/pathways", {
    method: "GET",
    timeoutMs: HEALTH_TIMEOUT_MS,
  });
}

export async function submitOverdraftShieldNotice(
  payload: OverdraftShieldRequest,
): Promise<OverdraftShieldResponse> {
  return api<OverdraftShieldResponse>("/overdraft-shield/notices", {
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify(payload),
  });
}

export type DocumentKind =
  | "train_ticket"
  | "receipt"
  | "invoice"
  | "bank_statement"
  | "unknown";

export type ExtractedEntities = {
  amounts: Array<string | number>;
  dates: string[];
  vendors: string[];
  operator_id: string | null;
  operator_name: string | null;
  origin: string | null;
  destination: string | null;
  ticket_type: string | null;
  ticket_reference: string | null;
  delay_minutes: number | null;
  item_description: string | null;
  passenger_name: string | null;
};

export type DelayRepayPrefill = {
  operator?: string | null;
  origin?: string | null;
  destination?: string | null;
  journey_date?: string | null;
  delay_minutes?: number | null;
  ticket_type?: string | null;
  ticket_cost?: string | number | null;
  ticket_reference?: string | null;
  proof_filename?: string | null;
  passenger_name?: string | null;
};

export type ConsumerRightsPrefill = {
  retailer_name?: string | null;
  item_description?: string | null;
  purchase_date?: string | null;
  purchase_price?: string | number | null;
  order_reference?: string | null;
  proof_filename?: string | null;
};

export type OverdraftPrefill = {
  bank_name?: string | null;
  fee_amount?: string | number | null;
  fee_date?: string | null;
  proof_filename?: string | null;
};

export type DocumentParseResponse = {
  kind: DocumentKind;
  filename: string | null;
  extracted_text: string;
  entities: ExtractedEntities;
  suggested_pillar: PillarId | null;
  delay_repay: DelayRepayPrefill | null;
  consumer_rights: ConsumerRightsPrefill | null;
  overdraft_shield: OverdraftPrefill | null;
  summary: string;
  confidence: number;
};

export async function parseDocumentText(payload: {
  text: string;
  filename?: string;
  locale?: ApiLocale;
}): Promise<DocumentParseResponse> {
  return api<DocumentParseResponse>("/documents/parse-text", {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify(payload),
  });
}

export async function parseDocumentFile(
  file: File,
  options?: { hint?: string; locale?: ApiLocale },
): Promise<DocumentParseResponse> {
  const body = new FormData();
  body.append("file", file);
  if (options?.hint) body.append("hint", options.hint);
  body.append("locale", options?.locale ?? "en");
  return api<DocumentParseResponse>("/documents/parse", {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body,
  });
}

export type WatchKind = "purchase" | "delay_repay" | "overdraft" | "balance";
export type AlertSeverity = "urgent" | "soon" | "watch" | "info";

export type WatchPayload = {
  kind: WatchKind;
  title: string;
  anchor_date?: string;
  amount?: number;
  threshold?: number;
  locale?: ApiLocale;
  metadata?: Record<string, string>;
};

export type WatchRecord = WatchPayload & { id: string };

export type AlertItem = {
  id: string;
  watch_id: string;
  kind: WatchKind;
  severity: AlertSeverity;
  title: string;
  message: string;
  days_remaining: number | null;
  action_pillar: PillarId | null;
  action_label: string | null;
};

export type Recommendation = {
  id: string;
  title: string;
  reason: string;
  action_pillar: PillarId;
  action_label: string;
  priority: number;
};

export type AlertBundle = {
  alerts: AlertItem[];
  recommendations: Recommendation[];
  tracked: number;
};

export async function evaluateAlerts(payload: {
  watches: WatchPayload[];
  locale?: ApiLocale;
  balance?: number;
  balance_threshold?: number;
}): Promise<AlertBundle> {
  return api<AlertBundle>("/notifications/evaluate", {
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify(payload),
  });
}

export async function saveWatch(payload: WatchPayload): Promise<WatchRecord> {
  return api<WatchRecord>("/notifications/watches", {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify(payload),
  });
}

export type MemorySource = "chat" | "document" | "watch" | "preference" | "location";

export type MemoryFact = {
  id: string;
  key: string;
  value: string;
  source: MemorySource;
  created_at: string;
};

export type MemoryFactCreate = {
  key: string;
  value: string;
  source?: MemorySource;
};

export async function saveMemoryFact(payload: MemoryFactCreate): Promise<MemoryFact> {
  return api<MemoryFact>("/memory/facts", {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify(payload),
  });
}

export async function recallMemory(query: string, limit = 6): Promise<{
  facts: MemoryFact[];
  hints: string[];
}> {
  return api<{ facts: MemoryFact[]; hints: string[] }>("/memory/recall", {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify({ query, limit }),
  });
}

export type UserPreferences = {
  display_name?: string | null;
  locale?: ApiLocale;
  ui_language?: ApiLocale;
  command_language?: "auto" | "en" | "fa";
  external_language?: string;
  home_market?: string;
  jurisdiction?: string;
  currency?: string;
  travel_destination?: string | null;
  home_station?: string | null;
  work_station?: string | null;
  preferred_operator?: string | null;
  preferred_retailer?: string | null;
  preferred_bank?: string | null;
  tone?: "concise" | "detailed";
};

export type ContextTag = {
  id: string;
  label: string;
  active: boolean;
};

export type MemoryProfile = {
  preferences: UserPreferences;
  tags: ContextTag[];
  locations: string[];
  facts: MemoryFact[];
  recent_turns: Array<{
    conversation_id: string;
    role: "user" | "assistant";
    text: string;
    pillar: string | null;
    created_at: string;
  }>;
};

export type ActiveContext = {
  preferences: UserPreferences;
  tags: string[];
  locations: string[];
  hints: string[];
  last_pillar: PillarId | null;
  prompt_chars: number;
};

export type ConversationTurn = {
  conversation_id: string;
  role: "user" | "assistant";
  text: string;
  pillar: PillarId | null;
  created_at: string;
};

export type ConversationSummary = {
  conversation_id: string;
  title: string;
  message_count: number;
  updated_at: string;
};

export type ConversationDetail = {
  conversation_id: string;
  turns: ConversationTurn[];
};

export async function listConversations(): Promise<ConversationSummary[]> {
  return api<ConversationSummary[]>("/conversations", {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export async function getConversation(conversationId: string): Promise<ConversationDetail> {
  return api<ConversationDetail>(`/conversations/${encodeURIComponent(conversationId)}`, {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export async function getMemoryProfile(): Promise<MemoryProfile> {
  return api<MemoryProfile>("/memory/profile", {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export async function savePreferences(payload: UserPreferences): Promise<UserPreferences> {
  return api<UserPreferences>("/memory/preferences", {
    auth: "protected",
    method: "PUT",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify(payload),
  });
}

export async function saveContextTags(tags: Array<{ label: string; active?: boolean }>): Promise<ContextTag[]> {
  return api<ContextTag[]>("/memory/tags", {
    auth: "protected",
    method: "PUT",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify({ tags }),
  });
}

export async function getActiveContext(query = "", conversationId?: string): Promise<ActiveContext> {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (conversationId) params.set("conversation_id", conversationId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return api<ActiveContext>(`/memory/context${suffix}`, {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export type TravelServiceType =
  | "flight"
  | "train"
  | "hotel"
  | "taxi"
  | "bus"
  | "unknown";

export type TravelQuote = {
  intent_id: string;
  destination: string;
  origin?: string | null;
  date?: string | null;
  service_type: TravelServiceType;
  hotel?: { name: string; nights: number; check_in: string } | null;
  estimated_arrival: string;
  pricing: { currency: string; total: number; transport: number; stay: number };
  summary: string;
  confirm_token: string;
  status: "quoted" | "confirmed";
  locale: ApiLocale;
};

export async function quoteTravelIntent(payload: {
  query: string;
  locale?: ApiLocale;
}): Promise<TravelQuote> {
  return api<TravelQuote>("/travel/intent", {
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify({ action: "quote", ...payload }),
  });
}

export async function confirmTravelIntent(payload: {
  intent_id: string;
  confirm_token: string;
  locale?: ApiLocale;
}): Promise<TravelQuote> {
  return api<TravelQuote>("/travel/intent", {
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify({ action: "confirm", ...payload }),
  });
}


export type ActionStatus = "proposed" | "executed" | "failed" | "cancelled";

export type ActionProposal = {
  id: string;
  tool: string;
  summary: string;
  parameters: Record<string, unknown>;
  evidence_ids: string[];
  idempotency_key: string;
  status: ActionStatus;
  created_at: string;
  expires_at: string;
  confirmed_at?: string | null;
  executed_at?: string | null;
  result?: Record<string, unknown> | null;
};

export async function proposeAction(payload: {
  tool: string;
  summary: string;
  parameters: Record<string, unknown>;
  evidence_ids?: string[];
  idempotency_key?: string;
}): Promise<ActionProposal> {
  return api<ActionProposal>("/authority/actions", {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify(payload),
  });
}

export async function confirmAction(actionId: string): Promise<ActionProposal> {
  return api<ActionProposal>(`/authority/actions/${encodeURIComponent(actionId)}/confirm`, {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify({ confirm: true }),
  });
}

export async function cancelAction(actionId: string): Promise<ActionProposal> {
  return api<ActionProposal>(`/authority/actions/${encodeURIComponent(actionId)}/cancel`, {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}


export type LifeObligation = {
  id: string;
  title: string;
  due_date?: string | null;
  status: "open" | "due_soon" | "overdue" | "completed" | "cancelled";
  source: string;
  notes?: string | null;
};

export type LifePromise = {
  id: string;
  counterparty: string;
  promise: string;
  due_date?: string | null;
  status: "open" | "kept" | "broken" | "cancelled";
};

export type LifeSnapshot = {
  nodes: Array<{ id: string; kind: string; label: string }>;
  edges: Array<{ id: string; source_id: string; target_id: string; relation: string }>;
  obligations: LifeObligation[];
  promises: LifePromise[];
};

export async function getLifeSnapshot(): Promise<LifeSnapshot> {
  return api<LifeSnapshot>("/life/snapshot", {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}


export async function createLifeObligation(payload: {
  title: string;
  due_date?: string | null;
  source?: string;
  notes?: string | null;
}): Promise<LifeObligation> {
  return api<LifeObligation>("/life/obligations", {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify(payload),
  });
}

export async function updateLifeObligationStatus(
  obligationId: string,
  status: LifeObligation["status"],
): Promise<LifeObligation> {
  return api<LifeObligation>(
    `/life/obligations/${encodeURIComponent(obligationId)}/status?status=${encodeURIComponent(status)}`,
    {
      auth: "protected",
      method: "POST",
      timeoutMs: CHAT_TIMEOUT_MS,
    },
  );
}

export async function createLifePromise(payload: {
  counterparty: string;
  promise: string;
  due_date?: string | null;
}): Promise<LifePromise> {
  return api<LifePromise>("/life/promises", {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify(payload),
  });
}

export async function updateLifePromiseStatus(
  promiseId: string,
  status: LifePromise["status"],
): Promise<LifePromise> {
  return api<LifePromise>(
    `/life/promises/${encodeURIComponent(promiseId)}/status?status=${encodeURIComponent(status)}`,
    {
      auth: "protected",
      method: "POST",
      timeoutMs: CHAT_TIMEOUT_MS,
    },
  );
}


export type GoogleConnectorStatus = {
  configured: boolean;
  connected: boolean;
  scopes: string[];
  expires_at?: string | null;
};

export type GmailMessageSummary = {
  id: string;
  thread_id?: string | null;
  subject: string;
  sender: string;
  date: string;
  snippet: string;
};

export type CalendarEventSummary = {
  id: string;
  summary: string;
  start: string;
  end: string;
  html_link?: string | null;
};

export async function getGoogleConnectorStatus(): Promise<GoogleConnectorStatus> {
  return api<GoogleConnectorStatus>("/connectors/google/status", {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const GOOGLE_DOCS_SCOPE = "https://www.googleapis.com/auth/documents.readonly";
export const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
export const GOOGLE_GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export async function startGoogleConnection(
  access: "read" | "write" = "read",
  extraScopes: string[] = [],
): Promise<{ authorization_url: string }> {
  const params = new URLSearchParams({ access });
  if (extraScopes.length > 0) params.set("scopes", extraScopes.join(","));
  return api<{ authorization_url: string }>(`/connectors/google/start?${params.toString()}`, {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export async function getRecentGmail(limit = 5): Promise<GmailMessageSummary[]> {
  return api<GmailMessageSummary[]>(`/connectors/google/gmail/recent?limit=${limit}`, {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}


export type GmailCleanupPreview = {
  query: string;
  candidates: GmailMessageSummary[];
};

export async function getGmailCleanupPreview(days = 30, limit = 20): Promise<GmailCleanupPreview> {
  return api<GmailCleanupPreview>(
    `/connectors/google/gmail/cleanup-preview?days=${days}&limit=${limit}`,
    {
      auth: "protected",
      method: "GET",
      timeoutMs: CHAT_TIMEOUT_MS,
    },
  );
}

export async function getUpcomingCalendar(limit = 5): Promise<CalendarEventSummary[]> {
  return api<CalendarEventSummary[]>(`/connectors/google/calendar/upcoming?limit=${limit}`, {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

// --- Instagram (Instagram API with Instagram Login, read-only) ---

export type InstagramStatus = {
  configured: boolean;
  connected: boolean;
  username: string | null;
};

export type InstagramProfile = {
  id: string;
  username: string;
  account_type: string;
  media_count: number;
};

export type InstagramMediaItem = {
  id: string;
  caption: string | null;
  media_type: string;
  media_url: string | null;
  permalink: string | null;
  timestamp: string;
};

export async function getInstagramStatus(): Promise<InstagramStatus> {
  return api<InstagramStatus>("/connectors/instagram/status", {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export async function startInstagramConnection(): Promise<{ authorization_url: string }> {
  return api<{ authorization_url: string }>("/connectors/instagram/start", {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export async function getInstagramProfile(): Promise<InstagramProfile> {
  return api<InstagramProfile>("/connectors/instagram/profile", {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export async function getInstagramMedia(limit = 10): Promise<InstagramMediaItem[]> {
  return api<InstagramMediaItem[]>(`/connectors/instagram/media?limit=${limit}`, {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

// --- YouTube (Google OAuth, youtube.readonly, read-only) ---

export type YouTubeStatus = {
  configured: boolean;
  connected: boolean;
  scopes: string[];
};

export type YouTubeChannel = {
  id: string;
  title: string;
  description: string;
  subscribers: number;
  video_count: number;
  thumbnail_url: string | null;
  uploads_playlist_id: string | null;
};

export type YouTubeVideo = {
  id: string;
  title: string;
  published_at: string;
  thumbnail_url: string | null;
  url: string | null;
};

export async function getYouTubeStatus(): Promise<YouTubeStatus> {
  return api<YouTubeStatus>("/connectors/youtube/status", {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export async function startYouTubeConnection(): Promise<{ authorization_url: string }> {
  return api<{ authorization_url: string }>("/connectors/youtube/start", {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export async function getYouTubeChannel(): Promise<YouTubeChannel> {
  return api<YouTubeChannel>("/connectors/youtube/channel", {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export async function getYouTubeVideos(limit = 10): Promise<YouTubeVideo[]> {
  return api<YouTubeVideo[]>(`/connectors/youtube/videos?limit=${limit}`, {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

// --- Bank (UK Open Banking via TrueLayer, read-only) ---

export type BankStatus = {
  configured: boolean;
  connected: boolean;
  provider: string;
  environment: string;
};

export type BankAccount = {
  id: string;
  name: string;
  type: string;
  currency: string;
  provider: string;
  balance: number | null;
};

export type BankTransaction = {
  id: string;
  account_id: string;
  amount: number;
  currency: string;
  description: string;
  date: string;
  category: string | null;
};

export async function getBankStatus(): Promise<BankStatus> {
  return api<BankStatus>("/connectors/bank/status", {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export async function startBankConnection(): Promise<{ authorization_url: string }> {
  return api<{ authorization_url: string }>("/connectors/bank/start", {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export async function getBankAccounts(): Promise<BankAccount[]> {
  return api<BankAccount[]>("/connectors/bank/accounts", {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export async function getBankTransactions(accountId: string, limit = 20): Promise<BankTransaction[]> {
  return api<BankTransaction[]>(
    `/connectors/bank/accounts/${encodeURIComponent(accountId)}/transactions?limit=${limit}`,
    {
      auth: "protected",
      method: "GET",
      timeoutMs: CHAT_TIMEOUT_MS,
    },
  );
}


export type OutcomeItem = {
  id: string;
  kind: "obligation" | "promise_verification";
  priority: "urgent" | "soon" | "watch";
  title: string;
  reason: string;
  due_date?: string | null;
  source_id: string;
  requires_verification: boolean;
};

export async function getPendingOutcomes(): Promise<OutcomeItem[]> {
  return api<OutcomeItem[]>("/outcomes", {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export type DetectionProposal = {
  id: string;
  kind: "delay_repay" | "payment_due" | "refund_promised" | "renewal";
  target: "obligation" | "promise";
  title: string;
  due_date?: string | null;
  due_date_estimated: boolean;
  counterparty?: string | null;
  promise_text?: string | null;
  reason: string;
  confidence: "high" | "medium";
  evidence_message_id: string;
  evidence_subject: string;
  evidence_sender: string;
  status: "new" | "already_recorded" | "dismissed";
  claim_url?: string | null;
  notes?: string | null;
};

export type DetectionScanResult = {
  scanned: number;
  proposals: DetectionProposal[];
  scanned_at: string;
};

export async function scanInboxForDeadlines(limit = 20): Promise<DetectionScanResult> {
  return api<DetectionScanResult>(`/life/detect?limit=${limit}`, {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export async function dismissDetectionProposal(
  proposalId: string,
): Promise<{ dismissed: boolean }> {
  return api<{ dismissed: boolean }>(
    `/life/detect/${encodeURIComponent(proposalId)}/dismiss`,
    {
      auth: "protected",
      method: "POST",
      timeoutMs: CHAT_TIMEOUT_MS,
    },
  );
}

/* ---- World-best ten: new clients (Promise Chaser, Verifier, Claim Pack,
   Case File, Renewal Guard, Travel/Calendar Guard, Morning Brief, Evidence) ---- */

export type FollowupStep = {
  id: string;
  step: "check" | "verify" | "chase" | "escalate";
  due_date?: string | null;
  label: string;
  detail: string;
  state: "upcoming" | "due" | "overdue";
};

export type FollowupDraftResponse = {
  promise_id: string;
  step: FollowupStep["step"];
  draft: { to: string; subject: string; body: string; to_missing: boolean };
  authority_proposal: {
    tool: string;
    summary: string;
    parameters: Record<string, unknown>;
    evidence_ids?: string[];
    idempotency_key?: string;
  };
};

export async function getPromiseFollowups(promiseId: string): Promise<FollowupStep[]> {
  return api<FollowupStep[]>(`/life/promises/${encodeURIComponent(promiseId)}/followups`, {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export async function draftPromiseFollowup(
  promiseId: string,
  step: FollowupStep["step"],
  payload: { to?: string | null; locale: "en" | "fa" },
): Promise<FollowupDraftResponse> {
  return api<FollowupDraftResponse>(
    `/life/promises/${encodeURIComponent(promiseId)}/followups/${encodeURIComponent(step)}/draft`,
    {
      auth: "protected",
      method: "POST",
      timeoutMs: CHAT_TIMEOUT_MS,
      body: JSON.stringify(payload),
    },
  );
}

export type VerificationResult = {
  source_id: string;
  kind: string;
  status: "verified" | "awaiting" | "failed";
  evidence_message_id?: string | null;
  matched_text?: string | null;
  checked_at: string;
  detail: string;
};

export async function verifyOutcome(
  kind: "obligation" | "promise",
  sourceId: string,
): Promise<VerificationResult> {
  return api<VerificationResult>("/outcomes/verify", {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify({ kind, source_id: sourceId }),
  });
}

export async function getStoredVerification(sourceId: string): Promise<VerificationResult> {
  return api<VerificationResult>(`/outcomes/${encodeURIComponent(sourceId)}/verification`, {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export type ClaimPack = {
  eligible: boolean;
  tier: string;
  tier_label: string;
  delay_minutes: number;
  percent: number;
  estimate_gbp: string;
  currency: string;
  guideline: string;
  claim_deadline_days: number;
  operator_id: string;
  operator_name: string;
  claim_url?: string | null;
  claim_draft: string;
  next_steps: string[];
  filing_deadline?: string | null;
  filing_deadline_estimated: boolean;
  evidence_checklist: string[];
  filing_obligation: Record<string, unknown>;
};

export async function getClaimPack(payload: Record<string, unknown>): Promise<ClaimPack> {
  return api<ClaimPack>("/delay-repay/pack", {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify(payload),
  });
}

export type CaseFile = {
  case_node: { id: string; kind: string; label: string };
  pathway: string;
  pathway_label: string;
  recommended_remedy: string;
  notice_draft: string;
  deadlines: Array<{ label: string; date: string; kind: string }>;
  obligations: LifeObligation[];
  statute_refs: string[];
  next_steps: string[];
};

export async function createCaseFile(payload: Record<string, unknown>): Promise<CaseFile> {
  return api<CaseFile>("/consumer-rights/cases", {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify(payload),
  });
}

export type RenewalItem = {
  obligation_id: string;
  title: string;
  renewal_date?: string | null;
  decision_deadline?: string | null;
  annual_cost_gbp?: number | null;
  currency: string;
  status: string;
  actions: Record<string, string>;
  calendar_blocker: Record<string, unknown>;
};

export async function getRenewals(): Promise<{
  renewals: RenewalItem[];
  total_annual_cost_gbp: number;
}> {
  return api<{ renewals: RenewalItem[]; total_annual_cost_gbp: number }>("/life/renewals", {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export type TripCheck = {
  event_id: string;
  summary: string;
  start: string;
  status: "confirmed" | "missing_booking" | "disruption";
  evidence_message_id?: string | null;
  detail: string;
};

export async function getTravelGuard(): Promise<{ trips: TripCheck[]; checked_events: number }> {
  return api<{ trips: TripCheck[]; checked_events: number }>("/travel/guard", {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export type CalendarConflict = {
  type: "overlap" | "travel_risk";
  event_ids: string[];
  titles: string[];
  detail: string;
};

export async function getCalendarGuard(): Promise<{
  conflicts: CalendarConflict[];
  checked_events: number;
}> {
  return api<{ conflicts: CalendarConflict[]; checked_events: number }>("/calendar/guard", {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export type BriefItem = {
  priority: number;
  kind: string;
  title: string;
  reason: string;
  due_date?: string | null;
};

export type MorningBrief = {
  date: string;
  locale: string;
  items: BriefItem[];
  counts: Record<string, number>;
};

export async function getMorningBrief(locale: "en" | "fa"): Promise<MorningBrief> {
  return api<MorningBrief>(`/brief/today?locale=${locale}`, {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export type EvidencePack = {
  generated_at: string;
  items: Array<{
    kind: string;
    id: string;
    title: string;
    counterparty: string;
    due_date?: string | null;
    status: string;
    completeness: number;
    evidence: Array<{ message_id: string; subject: string; sender: string; date: string; available: boolean }>;
  }>;
  total: number;
  complete: number;
};

export async function getEvidencePack(): Promise<EvidencePack> {
  return api<EvidencePack>("/life/evidence-pack", {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

/* ---- Persian understanding + voice + project delegation ---- */

export type IntentResult = {
  intent: string;
  confidence: "high" | "medium" | "low";
  language: "fa" | "en";
  entities: Record<string, unknown>;
  action: Record<string, unknown>;
  due_date?: string | null;
};

export async function understandMessage(
  text: string,
  locale: "en" | "fa",
): Promise<IntentResult> {
  return api<IntentResult>("/chat/understand", {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify({ text, locale }),
  });
}

export type VoiceProvider = {
  id: string;
  configured: boolean;
  implemented: boolean;
  note: string;
};

export type VoiceReadiness = {
  providers: VoiceProvider[];
  selected: string;
};

export async function getVoiceReadiness(): Promise<VoiceReadiness> {
  return api<VoiceReadiness>("/voice/readiness", {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

async function requestBlob(base: string, path: string, body: string): Promise<Blob> {
  const secureHeaders = await authorizationHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...secureHeaders },
      body,
    });
    if (!response.ok) {
      throw new ApiError(`Voice unavailable (${response.status})`, { status: response.status, code: "voice_unavailable" });
    }
    return await response.blob();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Could not reach EchoMind", { code: "network_error" });
  } finally {
    clearTimeout(timer);
  }
}

export async function speakText(text: string, locale: "en" | "fa"): Promise<Blob> {
  return withBase((base) => requestBlob(base, "/voice/speak", JSON.stringify({ text, locale })));
}

export type Project = {
  id: string;
  name: string;
  kind: string;
  identity?: string | null;
  repo?: string | null;
  branch?: string | null;
  allowed_tools: string[];
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type DelegatedTask = {
  id: string;
  project_id: string;
  instruction: string;
  language: string;
  status: string;
  plan: Array<{ tool: string; summary: string; status: string; evidence?: string | null }>;
  result?: string | null;
  created_at: string;
  updated_at: string;
};

export async function listProjects(): Promise<Project[]> {
  return api<Project[]>("/projects", {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export async function createProject(payload: {
  name: string;
  kind?: string;
  identity?: string | null;
  repo?: string | null;
  branch?: string | null;
  allowed_tools?: string[];
  notes?: string | null;
}): Promise<Project> {
  return api<Project>("/projects", {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify(payload),
  });
}

export async function createProjectTask(
  projectId: string,
  payload: { instruction: string; language: "en" | "fa"; idempotency_key?: string },
): Promise<DelegatedTask> {
  return api<DelegatedTask>(`/projects/${encodeURIComponent(projectId)}/tasks`, {
    auth: "protected",
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,
    body: JSON.stringify(payload),
  });
}

export async function listProjectTasks(projectId: string): Promise<DelegatedTask[]> {
  return api<DelegatedTask[]>(`/projects/${encodeURIComponent(projectId)}/tasks`, {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export async function getProjectTask(taskId: string): Promise<DelegatedTask> {
  return api<DelegatedTask>(`/projects/tasks/${encodeURIComponent(taskId)}`, {
    auth: "protected",
    method: "GET",
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}

export async function confirmProjectTask(taskId: string): Promise<{ task: DelegatedTask; executed: boolean }> {
  return api<{ task: DelegatedTask; executed: boolean }>(
    `/projects/tasks/${encodeURIComponent(taskId)}/confirm`,
    {
      auth: "protected",
      method: "POST",
      timeoutMs: CHAT_TIMEOUT_MS,
    },
  );
}
