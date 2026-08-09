# USRM Knowledge Transition Workbench

An upload-driven knowledge-transition demo for the **USRM value stream**. Twelve agents across
**five KT steps** (Planning → Knowledge Transition → Shadow → Reverse Shadow → Compounding
Intelligence), eight of them making live Claude calls.

Single-file front end (`index.html`) + Vercel serverless functions (`api/`) + the Anthropic API.
This is a rebuild of the neutral SME Knowledge Workbench chassis, re-pointed at USRM production
support and extended with two new agents and a result-caching layer.

## What changed from the chassis

- **Rebranded** to the USRM Knowledge Transition Workbench and reorganised into the five KT steps
  from the *"Aakash's Agents"* blueprint.
- **Two new REAL agents:**
  - **Interview Planner** (Step 1 · Planning) — turns the Archivist's gap read into a per-application
    KT session plan with gap-targeted questions. `POST /api/interview-planner` (Haiku).
  - **Automation Prioritizer** (Step 5 · Compounding Intelligence) — the demo closer. Scores every
    captured procedure on **ticket frequency × automation potential × ease of implementation × ease of
    maintenance**, flags **reactive→proactive** and **RCA/remediation** opportunities, and marks what is
    **agent-ready**. `POST /api/automation` (Sonnet).
- **Removed** the Analysis and 30/60/90 Planner agents; **renamed** Scenario → **Completeness
  Validator** (coverage check against the Playbook + your uploaded runbooks).
- **Domain-adaptive prompts.** Archivist / Extractor / Playbook / Coach now infer the domain from the
  data — IT production support *or* insurance claims — instead of assuming claims. `reserve_guidance`
  is emitted only when the corpus actually carries monetary reserve figures (null for prod-support).
- **Result caching (new).** Each REAL agent keeps its last result. Click any agent to show that
  result again instantly — no second Claude call — under a **CACHED · last run at …** banner with a
  **Re-run live** button. If an agent is mid-run, it is left to finish. Downstream agents read the
  previous run's cached upstream output, so clicking any agent always shows something. Re-running an
  agent invalidates everything downstream of it; a new upload / re-route / Jira connect clears the
  whole cache.

## The two rules this build keeps

1. **Nothing is pre-generated.** No fixtures, no seeded KPIs. Every number, rule, edge, SOP, session
   plan, coverage check and automation score is produced at run time from the uploaded file (or from
   a cached *previous* run). With nothing uploaded, every agent shows an "awaiting data" state.
2. **Jira is off until you click it.** The Archivist runs on uploads only. Live Atlassian data is
   pulled exclusively via the **Connect to Jira** button in the Archivist scene.

## The demo corpus

`templates/USRM_KT_corpus.xlsx` — a fresh, internally-consistent USRM production-support corpus, also
linked from the upload panel. Five sheets, correlated so the agents surface real patterns:

| Sheet | Routes to | What it carries |
| --- | --- | --- |
| `Incidents` | tickets | ~132 incidents across POLARIS / BILLPORT / CLAIMFLOW / AGENTONE / DATABRIDGE / DOCGEN, with `Change-Related`, `Related Change`, `Monday Morning` and root-cause columns |
| `Change Records` | tickets | ~42 CAB-approved weekend changes; some flagged as causing post-change incidents |
| `JIRA Knowledge Items` | jira | ~16 KB/SOP items authored by the outgoing SME |
| `KT Interview Transcript` | transcripts | the SME's tacit heuristics (2-minute alert pairing, repository recycle, checkpoint-3 re-run, print-path escalation) |
| `Runbooks` | documents | existing runbooks, several deliberately `STALE`/`INCOMPLETE` so the Completeness Validator has real gaps to flag |

The correlation is deliberate: DB-maintenance changes → recurring DATABRIDGE integration outages →
resolution SOPs/KB; weekend app-server changes → Monday `BILL_DUNNING` failures; alert-pairing noise;
etc. All fictional-but-plausible — no client-proprietary data.

## Agents

**Live Claude calls (8):** Archivist, Interview Planner, Extractor, Playbook Composer, Knowledge Graph,
Reviewer Copilot (on Edit), Coach, Automation Prioritizer.

**Rendered from upstream output, no extra API call (4, labelled MOCK):** Observer, Interviewer,
Completeness Validator, Knowledge Copilot — these render from your real data, not canned text.

## The pipeline

```
Planning        Archivist ──> Interview Planner
                    │
Knowledge       Extractor ──┬──> Knowledge Graph
Transition          │       └──> Playbook Composer ──┬──> Reviewer Copilot (HITL, live re-prompt)
                    │                                 ├──> Completeness Validator (rendered)
Shadow /            │                                 ├──> Coach (live)
Reverse Shadow      │                                 ├──> Knowledge Copilot (rendered)
                    │                                 └──> Automation Prioritizer (live) ← closes the loop
```

Re-uploading a file, connecting Jira, or re-routing a sheet invalidates everything downstream so the
next run is clean.

## Endpoints

| Route | Model | Input | With no input |
| --- | --- | --- | --- |
| `POST /api/archivist` | Haiku | uploaded corpus + optional live pull | `source: "empty"` |
| `POST /api/interview-planner` | Haiku | Archivist output (+ Extractor gaps) | `source: "empty"` |
| `POST /api/extract` | Haiku | Archivist output | `source: "empty"` |
| `POST /api/graph` | Sonnet | extraction | `source: "empty"` |
| `POST /api/playbook` | Sonnet | extraction + corpus + approval trail | `source: "empty"` |
| `POST /api/coach` | Sonnet | playbook + extra docs | `source: "empty"` |
| `POST /api/automation` | Sonnet | playbook + extraction + corpus profile | `source: "empty"` |
| `POST /api/reprompt` | Sonnet | the real playbook item + edit reason | `source: "empty"` |
| `POST /api/jira` | — | (click only) | `not_configured` |

## Deploy

1. Deploy this folder to Vercel (framework: **Other**).
2. Set environment variables:
   - `ANTHROPIC_API_KEY` — **required**; without it every live agent returns an error state.
   - `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_TOKEN`, `JIRA_PROJECT_KEY`, `CONFLUENCE_SPACE_KEY` — optional,
     read only when Connect is pressed.
3. Redeploy after setting env vars, then open the app and drop in `USRM_KT_corpus.xlsx`.

## Model IDs

`lib/claude.js` pins `claude-sonnet-4-6` and `claude-haiku-4-5-20251001`. Upgrading is a two-line
change plus a re-test.

## Branding

Slate + teal, abstract three-node mark. USRM value-stream vocabulary; fictional application and person
names. No third-party logos or client-proprietary data.
