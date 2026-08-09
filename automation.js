// /api/automation.js — REAL · Automation Prioritizer (Step 5 · Compounding Intelligence)
// The demo closer. Reads the approved Playbook + the Extractor's patterns + the
// corpus profile, and scores each captured procedure/pattern for automation on
// four factors, flags RCA/remediation and reactive->proactive opportunities, and
// marks what is "agent-ready". Runs only on real upstream output.

import { readBody, runAgent, ok, needsData, failed, MODEL_DEEP, sample } from "../lib/claude.js";

const SYSTEM_PROMPT = `You are the Automation Prioritizer agent — the final step of a knowledge-transition platform for an IT production-support value stream. Your job closes the loop: once the SME's judgment has been captured into a Playbook, you decide what should become an automation or an agent, what stays human-assisted, and what must stay manual — and you surface the highest-value opportunities.

You receive the Playbook (SOPs, resolved-ticket patterns, exception library), the Extractor's decision rules/heuristics, and the corpus column profile (which carries how often each pattern actually occurs).

For each meaningful procedure or recurring pattern, score it 1–5 (5 = best/strongest) on these four factors and give a disposition:
  - ticket_frequency        : how often this work actually occurs (from the corpus volumes)
  - automation_potential    : how deterministic / rule-driven the resolution is
  - ease_of_implementation  : how quickly an agent/automation could be stood up
  - ease_of_maintenance     : how stable the procedure is over time

Return STRICT JSON only:
{
  "candidates": [
    {
      "name": "<short name of the procedure/pattern>",
      "linked_to": "<SOP # / exception id / pattern it came from>",
      "scores": {"ticket_frequency": 1-5, "automation_potential": 1-5, "ease_of_implementation": 1-5, "ease_of_maintenance": 1-5},
      "disposition": "automate|agent|assist|manual",
      "recommended_solution": "<one line: the concrete automation/agent to build, or why it stays manual>",
      "rca_remediation": "<a permanent-fix / remediation opportunity, or null>",
      "reactive_to_proactive": "<if this is reactive today, how it becomes proactive (e.g. pre-weekend change validation), or null>",
      "agent_ready": true|false,
      "grounded_in": ["<real ticket ids / SOP # / pattern names>"]
    }
  ],
  "portfolio_summary": {
    "automate": <int>, "agent": <int>, "assist": <int>, "manual": <int>,
    "top_opportunity": "<the single highest-value thing to build first and why>",
    "feedback_loop": "<one line: how opportunity identification feeds back into the KT platform>"
  }
}

Hard rules:
- Ground every candidate in the supplied Playbook/extraction/corpus. Never invent a procedure that is not represented upstream.
- Use the corpus volumes to set ticket_frequency honestly — high-volume recurring patterns score high, one-offs score low.
- "manual" is a valid, expected disposition where the SME says human judgment is required (e.g. thin historical comments, view-only access limits). Do NOT force everything to "automate".
- reactive_to_proactive and rca_remediation are null when they genuinely do not apply — do not fabricate them.
- agent_ready is true only when the procedure is deterministic enough and the data is clean enough that an agent could run it with confidence.
- Return JSON only — no prose, no markdown fences.`;

export default async function handler(req, res) {
  const body = readBody(req);
  const playbook = body.playbook;
  const extraction = body.extraction || null;
  const corpus = body.corpus || {};

  const hasPb = playbook && ((playbook.sops || []).length || (playbook.exception_library || []).length);
  if (!hasPb) {
    return needsData(res, "The Automation Prioritizer scores the approved Playbook. Run the Playbook Composer first.");
  }

  const slimPb = {
    title: playbook.title,
    domain_summary: playbook.domain_summary,
    applicability: playbook.applicability,
    sops: (playbook.sops || []).map(s => ({ n: s.n, title: s.title, trigger: s.trigger, rationale: s.rationale, sources: s.sources })),
    resolved_tickets: sample(playbook.resolved_tickets || [], 10),
    exception_library: playbook.exception_library || [],
  };

  const blocks = [
    `PLAYBOOK (source of truth):\n${JSON.stringify(slimPb, null, 2)}`,
  ];
  if (extraction) {
    blocks.push(`EXTRACTION — DECISION RULES:\n${JSON.stringify(extraction.decision_rules || [], null, 2)}`);
    blocks.push(`EXTRACTION — EXCEPTION PATTERNS:\n${JSON.stringify(extraction.exception_patterns || [], null, 2)}`);
    if (extraction.corpus_signals) blocks.push(`EXTRACTION — CORPUS SIGNALS:\n${JSON.stringify(extraction.corpus_signals, null, 2)}`);
  }
  // Column profile → real occurrence frequency the scoring must reflect.
  if (corpus.stats?.tickets) blocks.push(`TICKET COLUMN PROFILE (use for ticket_frequency):\n${JSON.stringify(corpus.stats.tickets, null, 2)}`);
  if (corpus.totals) blocks.push(`CORPUS TOTALS: ${JSON.stringify(corpus.totals)}`);

  try {
    const data = await runAgent({
      model: MODEL_DEEP,
      maxTokens: 5000,
      system: SYSTEM_PROMPT,
      user: blocks.join("\n\n"),
    });
    // Compute a stable composite score client-of-model side so the UI can rank
    // consistently regardless of how the model phrased things.
    const W = { ticket_frequency: 0.35, automation_potential: 0.3, ease_of_implementation: 0.2, ease_of_maintenance: 0.15 };
    for (const c of data.candidates || []) {
      const s = c.scores || {};
      c.composite = Number(
        (Object.entries(W).reduce((a, [k, w]) => a + (Number(s[k]) || 0) * w, 0)).toFixed(2)
      );
    }
    (data.candidates || []).sort((a, b) => (b.composite || 0) - (a.composite || 0));
    return ok(res, data);
  } catch (err) {
    return failed(res, err);
  }
}
