// /api/playbook.js — REAL · Playbook Composer
// Composes the SME playbook from the Extractor's output and the uploaded
// ticket corpus. Never composes from a fixture set.

import { readBody, runAgent, ok, needsData, failed, MODEL_DEEP, sample } from "../lib/claude.js";

const SYSTEM_PROMPT = `You are the Playbook Composer for a knowledge-retention system. Infer the domain from the data — IT production support (incidents, changes, batch, integrations, RCA) or insurance claims or another operational domain — and write in that domain's language.
The Playbook is the single source of truth for the downstream agents (Reviewer, Coach, Copilot). It turns the SME's captured judgment into an operational reference a trainee can work from.

Given the extraction JSON, the real ticket corpus, and any prior reviewer approval trail, return strict JSON:
{
  "id": "pb_<slug>_v<n>_DRAFT",
  "title": "...",
  "version": "<n>.0",
  "status": "DRAFT",
  "author_sme": "...",
  "domain_summary": "<one line describing the operational work this playbook covers>",
  "applicability": ["<criterion>", ...],
  "sops": [
    { "n": 1, "title": "...", "trigger": "when to invoke", "steps": ["step text", ...], "rationale": "why", "sources": ["<real ticket id / Jira key / page title>"] }
  ],
  "reserve_guidance": {"first_cut": {"low": <n>, "median": <n>, "high": <n>}, "review_points": ["..."], "notes": "...", "derived_from": ["<ticket ids>"]},
  "resolved_tickets": [
    { "id": "<real id from the corpus>", "pattern": "<short pattern name>", "reserve_final": <n|null>, "outcome": "...", "lesson": "one-line takeaway" }
  ],
  "ticket_scenario_mapping": [
    { "scenario_id": "sc1", "scenario_label": "...", "difficulty": "easy|medium|hard", "grounded_in": ["<real ticket ids>"], "expected_reasoning": "..." }
  ],
  "exception_library": [
    { "id": "ex1", "trigger": "when this signal appears", "response": "what to do", "sources": ["..."] }
  ],
  "approval_trail": []
}

Hard rules:
- status is ALWAYS "DRAFT" on generation.
- Every ticket id, Jira key and quote must come from the supplied corpus. Never invent one.
- reserve_guidance is a claims-only field computed from monetary reserve figures actually present in the corpus. For IT production support or any corpus with no monetary reserve data, set reserve_guidance to null rather than guessing.
- Aim for 3–6 SOPs covering the primary decision paths visible in the data.
- Every resolved_ticket carries a one-line lesson; scenario mapping shows which real tickets seeded each scenario.
- approval_trail starts empty; the reviewer's prior trail is context for what to tighten, not something to echo back.
- Return JSON only.`;

export default async function handler(req, res) {
  const body = readBody(req);
  const extraction = body.extraction;
  const corpus = body.corpus || {};
  const tickets = corpus.tickets || [];
  const jira = corpus.jira || [];
  const priorTrail = body.approvalTrail || [];
  const sme = body.smeName || "the SME";

  const hasContent = extraction && ((extraction.decision_rules || []).length || (extraction.heuristics || []).length);
  if (!hasContent || (tickets.length + jira.length) === 0) {
    return needsData(res, "The Playbook Composer needs an extraction and an uploaded ticket corpus. Run the Archivist and Extractor first.");
  }

  const userPrompt = `SME: ${sme}
CORPUS SIZE: ${tickets.length} ticket rows, ${jira.length} Jira rows

EXTRACTION JSON (source of truth for judgment):
${JSON.stringify(extraction, null, 2)}

TICKET CORPUS (${Math.min(tickets.length, 40)} of ${tickets.length} rows shown):
${JSON.stringify(sample(tickets, 40), null, 2)}

JIRA ROWS (${Math.min(jira.length, 25)} of ${jira.length} shown):
${JSON.stringify(sample(jira, 25), null, 2)}

COLUMN PROFILE:
${JSON.stringify(corpus.stats || {}, null, 2)}

PRIOR REVIEWER APPROVAL TRAIL (may be empty):
${JSON.stringify(priorTrail, null, 2)}

Compose the Playbook from this corpus. Let the data decide which SOPs matter — do not impose a template of decision paths that the records do not support.`;

  try {
    const data = await runAgent({
      model: MODEL_DEEP,
      maxTokens: 6000,
      system: SYSTEM_PROMPT,
      user: userPrompt,
    });
    data.status = "DRAFT";
    return ok(res, data);
  } catch (err) {
    return failed(res, err);
  }
}
