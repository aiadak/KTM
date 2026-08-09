// /api/coach.js — REAL · Coach
// Generates the trainee plan from the live Playbook plus anything the user
// uploaded for the Coach specifically.

import { readBody, runAgent, ok, needsData, failed, MODEL_DEEP, trim } from "../lib/claude.js";

const SYSTEM_PROMPT = `You are the Coach agent for a knowledge-retention system. Infer the domain from the Playbook — IT production support or insurance claims or another operational domain — and teach in that domain's language.
The Playbook is the single source of truth for what a trainee needs to learn. Given the Playbook (SOPs, resolved tickets, scenarios, exception library) and any documents the user uploaded, generate:
- 5 practice questions with answer keys, each grounded in a specific Playbook SOP or exception.
- 5 micro-lessons (5–10 minutes each) covering the highest-leverage SOPs and exceptions.
- A schedule delivering these over roughly three weeks, alternating lesson and question.

Return strict JSON:
{
  "trainee": "<name if supplied, otherwise 'Incoming handler'>",
  "based_on": ["<Playbook id>", "<uploaded doc names>"],
  "questions": [{"id": "q1", "prompt": "...", "answer_key": "...", "difficulty": "easy|medium|hard", "sources": ["SOP #N", "<real ticket id>"]}],
  "micro_lessons": [{"id": "ml1", "title": "...", "duration_min": <int>, "summary": "...", "sources": ["..."]}],
  "schedule": [{"date": "YYYY-MM-DD", "time": "HH:MM", "item": "<id>", "kind": "micro_lesson|practice_question"}],
  "note": "Calendar writes are stubbed in this build."
}

Rules: ground every question and lesson in the supplied Playbook — never in general domain knowledge. Cite real SOP numbers and real ticket ids. Return JSON only.`;

export default async function handler(req, res) {
  const body = readBody(req);
  const playbook = body.playbook;
  const uploadedDocs = body.uploadedDocs || [];
  const trainee = body.trainee || "Incoming handler";

  if (!playbook || !(playbook.sops || []).length) {
    return needsData(res, "The Coach has no approved Playbook to teach from. Run the Playbook Composer first.");
  }

  const uploadedSection = uploadedDocs.length
    ? `\nUPLOADED DOCUMENTS (${uploadedDocs.length}):\n${uploadedDocs.map(d => `— ${d.name}: ${trim(d.content, 2000)}`).join("\n")}`
    : "";

  const userPrompt = `TRAINEE: ${trainee}

PLAYBOOK (source of truth):
${JSON.stringify(playbook, null, 2)}
${uploadedSection}

Generate the coaching plan. Reference Playbook SOP numbers and real ticket ids in answer_key and sources.`;

  try {
    const data = await runAgent({
      model: MODEL_DEEP,
      maxTokens: 5000,
      system: SYSTEM_PROMPT,
      user: userPrompt,
    });
    return ok(res, data);
  } catch (err) {
    return failed(res, err);
  }
}
