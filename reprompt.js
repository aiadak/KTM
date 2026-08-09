// /api/reprompt.js — REAL · Reviewer Copilot re-prompt
// On an SME "Edit", re-draft the one item under review. Requires the real
// item from the live Playbook — there is no default step to fall back on.

import { readBody, runAgent, ok, needsData, failed, MODEL_DEEP } from "../lib/claude.js";

const SYSTEM_PROMPT = `You are the Reviewer Copilot for an insurance-claims knowledge retention system.
An SME reviewer has edited one item in a draft playbook (an SOP step or an exception). Re-draft that item to incorporate the correction while preserving its number/id, structural shape and source citations. Do not touch any other item.

Return strict JSON:
{
  "target": "<the target key you were given>",
  "revised_title": "...",
  "revised_rationale": "...",
  "sme_edit_reason": "<short paraphrase of the reviewer's intent>",
  "revised_item": {"n_or_id": "...", "title": "...", "steps": ["..."], "rationale": "...", "sources": ["...", "SME edit <YYYY-MM-DD>"]}
}

Rules: keep the original number/id; append an "SME edit <today's date>" citation to sources; return JSON only.`;

export default async function handler(req, res) {
  const body = readBody(req);
  const item = body.item;
  const target = body.target;
  const editReason = body.editReason;

  if (!item || !editReason) {
    return needsData(res, "Nothing to re-prompt: the Reviewer needs a live Playbook item and an edit reason.");
  }

  const userPrompt = `TARGET: ${target}
TODAY: ${new Date().toISOString().slice(0, 10)}

ORIGINAL ITEM:
${JSON.stringify(item, null, 2)}

REVIEWER'S EDIT INTENT:
${editReason}

Re-draft the item.`;

  try {
    const data = await runAgent({
      model: MODEL_DEEP,
      maxTokens: 1500,
      system: SYSTEM_PROMPT,
      user: userPrompt,
    });
    return ok(res, data);
  } catch (err) {
    return failed(res, err);
  }
}
