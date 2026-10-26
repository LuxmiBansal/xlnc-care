// XLNC Care — "ai" Edge Function (Supabase, Deno).
//
// The web app sends its AI requests here (filling the SIR, writing the QRT, reading a referral,
// matching admission-form fields). This function:
//   1. accepts only signed-in XLNC Care users whose role is owner or staff,
//   2. allows each person at most AI_HOURLY_LIMIT calls per hour (default 60), logged in public.ai_usage,
//   3. forwards the request to the Claude API with the secret ANTHROPIC_API_KEY,
//      which never leaves the server.
//
// Secrets (Supabase dashboard → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY   required
//   AI_MODEL_DEFAULT    optional, default "claude-haiku-5-5"   (quick jobs: SIR, form matching)
//   AI_MODEL_COMPLEX    optional, default "claude-sonnet-5-5"  (QRT, referral reading)
//   AI_HOURLY_LIMIT     optional, default 60
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
//
// Request (POST, JSON, header "Authorization: Bearer <user access token>"):
//   { "probe": true }                                   → { ok: true }  (checks setup; no Claude call)
//   { "messages": [{ "role": "user"|"assistant", "content": "..." }],
//     "tier": "default"|"quick"|"complex",
//     "images": [{ "media_type": "image/jpeg"|"image/png"|"image/webp"|"image/gif", "data": "<base64>" }],
//     "max_tokens": 4000 }
// Response: { text, truncated, model, tier }  or  { error, message } with an HTTP error status.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_BODY = 12 * 1024 * 1024;           // whole request (images are base64)
const MAX_IMAGES = 8;
const MAX_TOKENS_CAP = 8000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const env = (k: string, d = "") => (Deno.env.get(k) ?? d).trim();

function cors(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function reply(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}
const fail = (req: Request, status: number, error: string, message: string) => reply(req, status, { error, message });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return fail(req, 405, "invalid_request", "Use POST");

  // ---- who is calling? -------------------------------------------------------------------
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(req, 401, "not_granted", "Sign in first");
  const SUPABASE_URL = env("SUPABASE_URL"), ANON = env("SUPABASE_ANON_KEY"), SERVICE = env("SUPABASE_SERVICE_ROLE_KEY");
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: u, error: uErr } = await asUser.auth.getUser(token);
  if (uErr || !u?.user) return fail(req, 401, "not_granted", "Your sign-in has expired — reload the page");
  const { data: prof } = await asUser.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  const role = prof?.role || "pending";
  if (role !== "owner" && role !== "staff") return fail(req, 403, "not_granted", "Your role can't use AI writing");

  // ---- read the request --------------------------------------------------------------------
  const len = Number(req.headers.get("Content-Length") || 0);
  if (len > MAX_BODY) return fail(req, 413, "prompt_too_large", "Request too large");
  let raw = "";
  try { raw = await req.text(); } catch { return fail(req, 400, "invalid_request", "Could not read the request"); }
  if (raw.length > MAX_BODY) return fail(req, 413, "prompt_too_large", "Request too large");
  let body: any;
  try { body = JSON.parse(raw); } catch { return fail(req, 400, "invalid_request", "Body must be JSON"); }

  const KEY = env("ANTHROPIC_API_KEY");
  if (body?.probe) return KEY ? reply(req, 200, { ok: true, role }) : fail(req, 503, "not_configured", "ANTHROPIC_API_KEY is not set");
  if (!KEY) return fail(req, 503, "not_configured", "ANTHROPIC_API_KEY is not set");

  const msgs = Array.isArray(body?.messages) ? body.messages : typeof body?.prompt === "string" ? [{ role: "user", content: body.prompt }] : null;
  if (!msgs || !msgs.length || msgs.some((m: any) => !["user", "assistant"].includes(m?.role) || typeof m?.content !== "string"))
    return fail(req, 400, "invalid_request", "messages must be [{role, content}]");
  if (msgs[msgs.length - 1].role !== "user") return fail(req, 400, "invalid_request", "The last message must be from the user");
  const images = Array.isArray(body?.images) ? body.images : [];
  if (images.length > MAX_IMAGES) return fail(req, 400, "invalid_request", `At most ${MAX_IMAGES} images`);
  for (const im of images) if (!IMAGE_TYPES.has(im?.media_type) || typeof im?.data !== "string") return fail(req, 400, "image_rejected", "Images must be base64 JPEG, PNG, WEBP or GIF");
  const tier = body?.tier === "complex" ? "complex" : body?.tier === "quick" ? "quick" : "default";
  const model = tier === "complex" ? env("AI_MODEL_COMPLEX", "claude-sonnet-5-5") : env("AI_MODEL_DEFAULT", "claude-haiku-5-5");
  const maxTokens = Math.max(256, Math.min(MAX_TOKENS_CAP, Number(body?.max_tokens) || (tier === "complex" ? 8000 : 4000)));

  // ---- per-person hourly limit (service role: people cannot edit their own usage log) ------------
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  const limit = Number(env("AI_HOURLY_LIMIT", "60")) || 60;
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", u.user.id).gte("created_at", since);
  if ((count ?? 0) >= limit) return fail(req, 429, "rate_limited", `Limit of ${limit} AI requests per hour reached — try again later`);

  // ---- call Claude --------------------------------------------------------------------------
  const messages = msgs.map((m: any, i: number) => {
    if (i !== msgs.length - 1 || !images.length) return { role: m.role, content: m.content };
    return { role: "user", content: [...images.map((im: any) => ({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } })), { type: "text", text: m.content }] };
  });
  let r: Response;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
    });
  } catch (e) {
    return fail(req, 502, "upstream_error", "Could not reach Claude: " + String(e));
  }
  const out: any = await r.json().catch(() => null);
  await admin.from("ai_usage").insert({
    user_id: u.user.id, model, tier, ok: r.ok,
    input_tokens: out?.usage?.input_tokens ?? null, output_tokens: out?.usage?.output_tokens ?? null,
  });
  if (!r.ok) {
    const status = r.status === 429 || r.status === 529 ? 429 : r.status === 413 ? 413 : 502;
    const code = status === 429 ? "rate_limited" : status === 413 ? "prompt_too_large" : "upstream_error";
    return fail(req, status, code, out?.error?.message || `Claude API error ${r.status}`);
  }
  const text = (out?.content || []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join("");
  if (!text) return fail(req, 502, out?.stop_reason === "refusal" ? "refused" : "empty_completion", "Claude returned no text");
  return reply(req, 200, { text, truncated: out?.stop_reason === "max_tokens", model: out?.model || model, tier });
});
