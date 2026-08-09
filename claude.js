// lib/claude.js — shared helpers for every agent endpoint.
// No fixtures, no cached answers: an agent either runs on the data it was
// given, or it reports that it has nothing to run on.

import Anthropic from "@anthropic-ai/sdk";

export const MODEL_FAST = "claude-haiku-4-5-20251001";
export const MODEL_DEEP = "claude-sonnet-4-6";

export function readBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === "string") {
    try { return JSON.parse(b); } catch { return {}; }
  }
  return b;
}

/** Strip markdown fences and parse. Tolerates leading/trailing prose. */
export function parseJson(text) {
  let t = (text || "").trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const first = Math.min(...[t.indexOf("{"), t.indexOf("[")].filter(i => i >= 0));
  const last = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (Number.isFinite(first) && last > first) {
    return JSON.parse(t.slice(first, last + 1));
  }
  throw new Error("model did not return parseable JSON");
}

export async function runAgent({ model = MODEL_DEEP, system, user, maxTokens = 4000 }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const e = new Error("ANTHROPIC_API_KEY is not set on this deployment");
    e.code = "no_api_key";
    throw e;
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = (msg.content || []).map(c => c.text || "").join("\n");
  return parseJson(text);
}

export function ok(res, data, meta = {}) {
  return res.status(200).json({ source: "live", data, ...meta });
}

/** No-data response: the UI renders an "awaiting upload" state, never fake output. */
export function needsData(res, message) {
  return res.status(200).json({ source: "empty", error: "no_input", message });
}

export function failed(res, err) {
  console.error("[agent] failure:", err?.message);
  return res.status(200).json({
    source: "error",
    error: err?.code || "agent_failed",
    message: err?.message || "Agent call failed.",
  });
}

/** Keep serverless payloads and prompts bounded. */
export function trim(value, max = 1200) {
  if (value == null) return value;
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > max ? s.slice(0, max) + " …[truncated]" : s;
}

export function sample(arr, n) {
  return Array.isArray(arr) ? arr.slice(0, n) : [];
}
