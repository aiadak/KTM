// /api/extract.js — REAL · Extractor
// Reads the Archivist's output only. If the Archivist has nothing, this
// returns an awaiting-data state rather than inventing an extraction.

import { readBody, runAgent, ok, needsData, failed, MODEL_FAST, sample } from "../lib/claude.js";

const SYSTEM_PROMPT = `You are the Extractor agent for a knowledge-retention system. Infer the domain from the data itself — it may be IT production support (incidents, changes, batch jobs, integrations, RCA, SLAs) or insurance claims (reserve, endorsement, subrogation) or another operational domain. Match your vocabulary to whatever the records actually show.

You receive a ticket/incident corpus that a subject-matter expert worked, plus any Jira issues, wiki pages and interview transcripts attached to it. Extract the operational judgment that lives inside those records: the decision rules the SME applies, the exception patterns they watch for, and the heuristics in their own words.

Return strict JSON with this exact shape:
{
  "entities": [{"name": "...", "type": "Application|Component|Incident|Change|Job|Interface|Party|System|Claim|Policy|Other", "source": "..."}],
  "decision_rules": [{"if": "...", "then": "...", "confidence": 0..1, "source": "..."}],
  "exception_patterns": [{"pattern": "...", "resolution": "...", "source": "..."}],
  "heuristics": [{"text": "...", "invoked_when": "...", "source": "..."}],
  "corpus_signals": {"dominant_pattern": "...", "record_count_considered": <int>, "coverage_note": "..."}
}

Hard rules:
- Ground every single item in the supplied records. Never invent an entity, rule, ticket ID or quote.
- Every item MUST carry a source pointer using the real identifier from the data (the ticket/claim ID, the Jira key, the page title).
- Prefer the SME's own language for heuristics wherever a quote or note exists.
- Use the domain's own vocabulary only where the data supports it — production-support terms (incident, change, CI, batch, RCA, rollback, SLA) for IT operations data, insurance terms (coverage, reserve, endorsement, subrogation) for claims data. Do not impose one domain's language on another's data.
- If the corpus is too thin to support a category, return an empty array for it and say so in coverage_note.
- Return JSON only — no prose, no markdown fences.`;

/** Drop empty cells and clip long free-text so prompts stay bounded. */
function condense(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (v === null || v === "" || k.startsWith("__")) continue;
    out[k] = typeof v === "string" && v.length > 400 ? v.slice(0, 400) + "…" : v;
  }
  return out;
}

export default async function handler(req, res) {
  const body = readBody(req);
  const archivist = body.archivist;
  const sr = archivist?.source_records;

  const tickets = sr?.tickets || [];
  const jiraUploaded = sr?.jira_uploaded || [];
  const jiraLive = sr?.jira_live || [];
  const pages = sr?.confluence_live || [];
  const transcripts = sr?.transcripts || [];
  const documents = sr?.documents || [];

  const total = tickets.length + jiraUploaded.length + jiraLive.length + pages.length + transcripts.length + documents.length;
  if (!archivist || total === 0) {
    return needsData(res, "The Extractor has no Archivist output to read. Run the Archivist on uploaded data first.");
  }

  const blocks = [];
  if (tickets.length) blocks.push(`TICKET / CLAIM CORPUS (${tickets.length} shown):\n${JSON.stringify(sample(tickets, 45).map(r => condense(r)), null, 2)}`);
  if (jiraUploaded.length) blocks.push(`JIRA TICKETS FROM UPLOAD (${jiraUploaded.length}):\n${JSON.stringify(sample(jiraUploaded, 30).map(r => condense(r)), null, 2)}`);
  if (jiraLive.length) blocks.push(`JIRA ISSUES — LIVE PULL (${jiraLive.length}):\n${JSON.stringify(sample(jiraLive, 20), null, 2)}`);
  if (pages.length) blocks.push(`CONFLUENCE PAGES — LIVE PULL (${pages.length}):\n${JSON.stringify(sample(pages, 10), null, 2)}`);
  if (transcripts.length) blocks.push(`TRANSCRIPTS (${transcripts.length}):\n${JSON.stringify(sample(transcripts, 15).map(r => condense(r)), null, 2)}`);
  if (documents.length) blocks.push(`DOCUMENTS (${documents.length}):\n${JSON.stringify(sample(documents, 15).map(r => condense(r)), null, 2)}`);
  if (archivist.corpus_read) blocks.push(`ARCHIVIST'S READ OF THE CORPUS:\n${JSON.stringify(archivist.corpus_read, null, 2)}`);

  try {
    const data = await runAgent({
      model: MODEL_FAST,
      maxTokens: 4000,
      system: SYSTEM_PROMPT,
      user: `SME: ${archivist.sme_name || "unattributed"}\nDATE RANGE: ${archivist.date_range || "—"}\n\n${blocks.join("\n\n")}`,
    });
    return ok(res, data);
  } catch (err) {
    return failed(res, err);
  }
}
