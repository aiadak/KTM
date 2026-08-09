// /api/archivist.js — REAL · Archivist
// Runs ONLY on what the user supplied: uploaded workbook/files, plus a live
// Atlassian pull if (and only if) the user clicked Connect. No fixtures.

import { readBody, runAgent, ok, needsData, failed, MODEL_FAST, sample, trim } from "../lib/claude.js";

const NORMALIZE_SYSTEM = `You are the normalization pass of the Archivist agent in a knowledge-retention system. Infer the domain from the data — it may be IT production support (incidents, changes, batch jobs, integrations) or insurance claims, or another operational domain.

You receive raw records pulled from several source systems (a spreadsheet ticket/incident/claim corpus, Jira issues, Confluence pages, chat transcripts, exports). Column names and shapes vary — infer the meaning of each field from its name and values.

Map each record onto this unified record schema, using null where the source genuinely does not carry the field:
{ "id", "opened", "closed", "type", "application", "category", "priority", "cause", "resolution", "root_cause_code", "assignee", "outcome", "notes", "source_system" }
(For insurance-claims data, read "application/category" as loss type / policy form, "cause" as cause of loss, and put reserve figures in notes — do not drop them.)

Also return a short read of the corpus as a whole.

Return strict JSON only:
{
  "normalized": [ <up to 8 records in the schema above> ],
  "field_map": [ {"source_field": "...", "mapped_to": "...", "confidence": 0..1} ],
  "corpus_read": {
    "domain": "<one line: what kind of operational work this corpus represents>",
    "primary_pattern": "<the recurring signature pattern you can see in the data>",
    "sme_candidates": ["<handler/assignee/engineer names that dominate the corpus>"],
    "date_range": "<earliest to latest date you can see>",
    "gaps": ["<fields or context missing that would limit downstream extraction>"]
  }
}
No prose, no markdown fences.`;

const NAME_KEYS = /^(handler|assignee|owner|adjuster|sme|examiner|analyst|engineer|author|reporter)/i;
const DATE_KEYS = /(opened|closed|created|updated|date|resolved|reported)/i;

function pickSme(rows) {
  const tally = {};
  for (const r of rows || []) {
    for (const [k, v] of Object.entries(r || {})) {
      if (!NAME_KEYS.test(k) || !v || typeof v !== "string") continue;
      tally[v] = (tally[v] || 0) + 1;
    }
  }
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  return ranked.length ? ranked[0][0] : null;
}

function dateRange(rows) {
  const dates = [];
  for (const r of rows || []) {
    for (const [k, v] of Object.entries(r || {})) {
      if (!DATE_KEYS.test(k) || !v) continue;
      const d = new Date(v);
      if (!isNaN(d)) dates.push(d);
    }
  }
  if (!dates.length) return null;
  dates.sort((a, b) => a - b);
  const iso = d => d.toISOString().slice(0, 10);
  return `${iso(dates[0])} → ${iso(dates[dates.length - 1])}`;
}

export default async function handler(req, res) {
  const body = readBody(req);
  const corpus = body.corpus || {};
  const live = body.jiraLive || null;

  const tickets = corpus.tickets || [];
  const jiraRows = corpus.jira || [];
  const transcripts = corpus.transcripts || [];
  const documents = corpus.documents || [];
  const liveIssues = live?.jira?.issues || [];
  const livePages = live?.confluence?.results || [];

  // The client sends a bounded sample of a possibly huge workbook, plus the
  // true row counts. Report the true counts; sample only what the model reads.
  const t = corpus.totals || {};
  const nTickets = t.tickets ?? tickets.length;
  const nJira = t.jira ?? jiraRows.length;
  const nTranscripts = t.transcripts ?? transcripts.length;
  const nDocuments = t.documents ?? documents.length;

  const totalUploaded = nTickets + nJira + nTranscripts + nDocuments;
  if (totalUploaded === 0 && liveIssues.length === 0 && livePages.length === 0) {
    return needsData(res, "No data loaded. Upload a workbook (.xlsx/.csv) or connect Jira to run the Archivist.");
  }

  const sources_swept = [];
  if (nTickets) sources_swept.push({ name: "Ticket corpus", origin: "upload", status: "loaded", records: nTickets, analysed: tickets.length });
  if (nJira) sources_swept.push({ name: "Jira (from file)", origin: "upload", status: "loaded", records: nJira, analysed: jiraRows.length });
  if (nTranscripts) sources_swept.push({ name: "Transcripts", origin: "upload", status: "loaded", records: nTranscripts, analysed: transcripts.length });
  if (nDocuments) sources_swept.push({ name: "Documents", origin: "upload", status: "loaded", records: nDocuments, analysed: documents.length });
  if (live?.jira) {
    sources_swept.push({
      name: "Jira Cloud", origin: "live", status: live.jira.status,
      records: liveIssues.length, detail: live.jira.meta?.instance || live.jira.reason || "",
    });
  }
  if (live?.confluence) {
    sources_swept.push({
      name: "Confluence Cloud", origin: "live", status: live.confluence.status,
      records: livePages.length, detail: live.confluence.meta?.space || live.confluence.reason || "",
    });
  }

  const allRecordRows = [...tickets, ...jiraRows];
  const smeFromData = body.smeName || pickSme(allRecordRows) || pickSme(liveIssues.map(i => ({ assignee: i.assignee }))) || null;

  // Raw slice handed to the model for normalization — bounded on purpose.
  const rawSample = [
    ...sample(tickets, 4).map(r => ({ ...r, __source: "uploaded_tickets" })),
    ...sample(jiraRows, 3).map(r => ({ ...r, __source: "uploaded_jira" })),
    ...sample(liveIssues, 3).map(i => ({
      key: i.key, summary: i.summary, status: i.status, resolution: i.resolution,
      assignee: i.assignee, created: i.created, resolved: i.resolved, labels: i.labels,
      description: trim(i.description, 800), comments: trim(i.comments, 800), __source: "live_jira",
    })),
    ...sample(livePages, 2).map(p => ({ id: p.id, title: p.title, text: trim(p.text, 800), __source: "live_confluence" })),
  ];

  try {
    const modelOut = await runAgent({
      model: MODEL_FAST,
      maxTokens: 3000,
      system: NORMALIZE_SYSTEM,
      user: `RECORDS (${rawSample.length} of ${totalUploaded + liveIssues.length + livePages.length} total):\n${JSON.stringify(rawSample, null, 2)}\n\nCOLUMN PROFILE:\n${JSON.stringify(corpus.stats || {}, null, 2)}`,
    });

    return ok(res, {
      sme_name: smeFromData || modelOut.corpus_read?.sme_candidates?.[0] || "Unattributed SME",
      date_range: dateRange(allRecordRows) || modelOut.corpus_read?.date_range || "—",
      sources_swept,
      corpus_summary: {
        total_records: totalUploaded + liveIssues.length + livePages.length,
        uploaded_records: totalUploaded,
        live_records: liveIssues.length + livePages.length,
        // Honest accounting: how many rows the agents actually read.
        analysed_records: tickets.length + jiraRows.length + transcripts.length + documents.length
          + liveIssues.length + livePages.length,
        files: corpus.files || [],
        columns: Object.keys((corpus.stats && corpus.stats.tickets) || {}),
      },
      corpus_read: modelOut.corpus_read || null,
      field_map: modelOut.field_map || [],
      normalized_sample: modelOut.normalized || [],
      // Bounded slice forwarded to the Extractor.
      source_records: {
        tickets: sample(tickets, 60),
        jira_uploaded: sample(jiraRows, 40),
        jira_live: sample(liveIssues, 25),
        confluence_live: sample(livePages, 15),
        transcripts: sample(transcripts, 20),
        documents: sample(documents, 20),
      },
      stats: corpus.stats || {},
    }, { live_connected: !!live?.connected });
  } catch (err) {
    return failed(res, err);
  }
}
