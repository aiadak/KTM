// /api/interview-planner.js — REAL · Interview Planner (Step 1 · Planning / Pre-KT)
// Turns the Archivist's read of the corpus (and, when available, the Extractor's
// gaps) into a concrete KT session plan — per application, per SME, with the
// gap-derived questions each session must close. Runs only on real upstream
// output; never invents a plan.

import { readBody, runAgent, ok, needsData, failed, MODEL_FAST } from "../lib/claude.js";

const SYSTEM_PROMPT = `You are the Interview Planner agent in a knowledge-transition (KT) platform for an IT production-support value stream.

A senior engineer is being transitioned out. You are given the Archivist's read of their ticket/incident corpus and — when it has run — the Extractor's decision rules, heuristics and coverage gaps. Turn that into a concrete pre-KT interview plan: which applications to run KT sessions on, in what order, and the specific gap-derived questions each session must close so nothing tacit leaves with the SME.

Return STRICT JSON only:
{
  "plan_title": "...",
  "sme": "<name from the data or 'the outgoing SME'>",
  "sessions": [
    {
      "seq": 1,
      "application": "<real application/system name seen in the corpus>",
      "priority": "high|medium|low",
      "duration_min": 45|60|90,
      "focus": "<one line: the risk this session is de-risking>",
      "why_now": "<why it is sequenced here — volume, fragility, single-point-of-failure>",
      "gap_targeted_questions": ["<pointed question aimed at tacit judgment the corpus does NOT already explain>"],
      "artifacts_to_capture": ["<runbook/SOP/decision the session should produce>"],
      "grounded_in": ["<real ticket ids / patterns / gaps this is derived from>"]
    }
  ],
  "coverage_summary": {"applications_covered": <int>, "sessions": <int>, "note": "<what this plan does and does not cover>"},
  "sequence_rationale": "<2-3 sentences on why this order>"
}

Hard rules:
- Ground every session and question in the supplied data — real application names, real patterns, real gaps. Never invent a system that is not in the corpus.
- Questions must target what the records do NOT already capture (the tacit calls, the exceptions, the "don't do X" knowledge) — not facts already sitting in the tickets.
- Sequence by risk: highest volume / most fragile / most single-person-dependent first.
- 3–6 sessions. If the corpus only supports fewer, return fewer rather than padding.
- Return JSON only — no prose, no markdown fences.`;

export default async function handler(req, res) {
  const body = readBody(req);
  const archivist = body.archivist;
  const extraction = body.extraction || null;

  if (!archivist || !archivist.corpus_summary) {
    return needsData(res, "The Interview Planner reads the Archivist's output. Run the Archivist first.");
  }

  const blocks = [];
  blocks.push(`SME: ${archivist.sme_name || "the outgoing SME"}`);
  blocks.push(`DATE RANGE: ${archivist.date_range || "—"}`);
  if (archivist.corpus_read) blocks.push(`ARCHIVIST CORPUS READ:\n${JSON.stringify(archivist.corpus_read, null, 2)}`);
  if (archivist.sources_swept) blocks.push(`SOURCES SWEPT:\n${JSON.stringify(archivist.sources_swept, null, 2)}`);
  if (archivist.corpus_summary?.columns) blocks.push(`COLUMNS PRESENT: ${(archivist.corpus_summary.columns || []).join(", ")}`);
  // Column profile carries the application spread and volumes the planner sequences on.
  if (archivist.stats?.tickets) blocks.push(`TICKET COLUMN PROFILE:\n${JSON.stringify(archivist.stats.tickets, null, 2)}`);
  if (extraction) {
    blocks.push(`EXTRACTION — DECISION RULES:\n${JSON.stringify(extraction.decision_rules || [], null, 2)}`);
    blocks.push(`EXTRACTION — HEURISTICS:\n${JSON.stringify(extraction.heuristics || [], null, 2)}`);
    blocks.push(`EXTRACTION — EXCEPTION PATTERNS:\n${JSON.stringify(extraction.exception_patterns || [], null, 2)}`);
    if (extraction.corpus_signals) blocks.push(`EXTRACTION — CORPUS SIGNALS:\n${JSON.stringify(extraction.corpus_signals, null, 2)}`);
  } else {
    blocks.push(`(The Extractor has not run yet — build the plan from the Archivist read alone, and note that the questions will sharpen once extraction is available.)`);
  }

  try {
    const data = await runAgent({
      model: MODEL_FAST,
      maxTokens: 3500,
      system: SYSTEM_PROMPT,
      user: blocks.join("\n\n"),
    });
    return ok(res, data);
  } catch (err) {
    return failed(res, err);
  }
}
