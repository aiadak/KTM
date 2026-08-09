// /api/graph.js — REAL · Graph Builder
// Typed nodes + labelled edges built strictly from the Extractor's JSON.

import { readBody, runAgent, ok, needsData, failed, MODEL_DEEP } from "../lib/claude.js";

const SYSTEM_PROMPT = `You are the Graph Builder for an insurance-claims knowledge retention system.

Given extraction JSON (entities, decision_rules, exception_patterns, heuristics), produce a typed knowledge graph over that material and nothing else.

NODE TYPES (choose from): Claim, Rule, Exception, Person, Action, Entity
EDGE TYPES (choose from): hasLossType, coveredBy, hasEndorsement, triggers, guardedBy, defines, requires, authoredBy, approvedBy, resolvesWith

Return strict JSON:
{
  "meta": {"nodes": <int>, "edges": <int>, "confidence_avg": 0..1, "asserted_share": 0..1},
  "nodes": [{"id": "n_<slug>", "type": "<NodeType>", "label": "..."}],
  "edges": [{"from": "n_<slug>", "to": "n_<slug>", "label": "<EdgeType>", "solid": <bool>, "confidence": 0..1, "sources": ["<source id>"]}]
}

Rules:
- solid=true only when the edge is directly asserted by a source in the extraction; solid=false for edges you infer.
- Every edge MUST carry at least one source pointer taken from the extraction.
- Every edge's from/to MUST reference an id you declared in nodes.
- Keep node ids short and slugged (n_claim_fire, n_rule_ror).
- meta.nodes and meta.edges must match the array lengths you actually return.
- Return JSON only, no prose.`;

export default async function handler(req, res) {
  const body = readBody(req);
  const extraction = body.extraction;
  const hasContent = extraction && (
    (extraction.decision_rules || []).length ||
    (extraction.entities || []).length ||
    (extraction.heuristics || []).length
  );
  if (!hasContent) {
    return needsData(res, "The Graph Builder has no extraction to build from. Run the Extractor first.");
  }

  try {
    const data = await runAgent({
      model: MODEL_DEEP,
      maxTokens: 4000,
      system: SYSTEM_PROMPT,
      user: JSON.stringify(extraction, null, 2),
    });
    if (data.meta) {
      data.meta.nodes = (data.nodes || []).length || data.meta.nodes;
      data.meta.edges = (data.edges || []).length || data.meta.edges;
    }
    return ok(res, data);
  } catch (err) {
    return failed(res, err);
  }
}
