// /api/template.js — generates the blank corpus template and the sample corpus
// on the fly, so the workbooks are always in step with what the app expects.
//   GET /api/template?kind=blank   → corpus-template.xlsx
//   GET /api/template?kind=sample  → sample-corpus.xlsx

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const HEADERS = {
  Tickets: ["ticket_id","opened","closed","loss_type","policy_form","endorsements","prior_loss_history","cause","reserve_initial","reserve_final","handler","outcome","notes"],
  Jira_Tickets: ["key","summary","status","resolution","priority","assignee","created","resolved","labels","description","comments"],
  Transcripts: ["speaker","date","text"],
  Documents: ["title","author","updated","labels","text"],
};

const README = [
  ["Sheet","What it is","How the app uses it"],
  ["Tickets","Your closed ticket / incident / claim corpus — one row per matter.","Primary corpus. Feeds Archivist → Extractor → Playbook Composer."],
  ["Jira_Tickets","Jira issues exported to a sheet (no API needed).","Merged with the ticket corpus as a second source."],
  ["Transcripts","Interview or chat lines: speaker, date, text.","Supplies the SME's own language for heuristics."],
  ["Documents","Wiki / SOP / policy pages as rows of text.","Extra grounding for rules and exceptions."],
  ["","",""],
  ["Naming your tabs","Any tab name containing one of these words is routed automatically:",""],
  ["→ Ticket corpus","ticket, incident, claim, case, record, issue, request, work order, matter, loss, servicenow","e.g. \"Incidents\", \"Closed Claims 2024\", \"INC Records\""],
  ["→ Jira","jira, epic, story, backlog, sprint","e.g. \"JIRA Tickets\", \"Jira Export\""],
  ["→ Transcripts","transcript, interview, chat, teams, slack, call, meeting","e.g. \"SME Interviews\""],
  ["→ Documents","wiki, confluence, page, sop, procedure, policy, runbook, guide, article, kb","e.g. \"SOP Pages\""],
  ["","",""],
  ["If a tab name says nothing","The app reads the columns instead: a Key column of ABC-123 values reads as Jira; Speaker+Text reads as a transcript; Title+Body reads as a document; anything else becomes the ticket corpus.",""],
  ["You can always override","Every sheet gets a dropdown in the app (upload panel and Data tab). Change the routing there and the pipeline rebuilds. Naming is a convenience, never a requirement.",""],
  ["","",""],
  ["Other rules","",""],
  ["Column names are free-form.","The Archivist infers what each column means from its name and values, and shows you the mapping it inferred.",""],
  ["Extra columns are fine.","Anything you add is passed through to the agents.",""],
  ["Header rows are found automatically.","Title rows, blank rows and export stamps above your real header row are skipped.",""],
  ["Free-text columns matter most.","Notes / description / comments columns are where the SME's reasoning lives — keep them in.",""],
  ["Nothing is pre-generated.","Every agent output is produced from this workbook at run time.",""],
];

const CAUSES = [
  ["electrical panel", true, 44000, 92000, "Panel signature: popping heard before smoke, burn concentrated at the service entrance."],
  ["electrical panel", true, 52000, 105000, "Same panel manufacturer as earlier files — subrogation opened against the recall class."],
  ["branch wiring", true, 48000, 84000, "Reads as panel until the marshal breaks it out. Reserve moved up after the origin report."],
  ["kitchen grease", false, 18000, 27000, "Straightforward. Contents scope drove the delta."],
  ["chimney flue", false, 16000, 24000, "Clean flue signature, no prior loss, fast close."],
  ["space heater", false, 20000, 30000, "Portable heater ignition. Contents scope only."],
  ["candle", false, 7000, 12000, "Textbook fast pay."],
  ["clothes dryer", false, 17000, 25000, "Lint accumulation. Manufacturer subrogation not viable."],
  ["lightning", false, 24000, 36000, "Weather-related; cause validated against strike data."],
];
const HANDLERS = ["R. Delgado","R. Delgado","R. Delgado","P. Nwosu","R. Delgado","R. Delgado","L. Marchetti"];

const JIRA_ROWS = [
  ["KB-11","FNOL intake checklist for suspected panel-cause fires","Done","Fixed","High","R. Delgado","sop;fire;intake","Checklist used at first notice. Three tells decide whether the panel-cause path is opened: an audible pop reported before smoke, flickering lights in the days before the loss, and burn concentration at the service entrance.","[R. Delgado] Two of three tells is enough to open the path. One alone is not."],
  ["KB-12","Reserve discipline: first cut and review points","Done","Fixed","High","R. Delgado","sop;reserve","First cut is set to the median outcome of the matching pattern, not to the worst case. Review points at Day 10 and Day 30.","[P. Nwosu] Why Day 10? [R. Delgado] Because origin reports come back between Day 7 and Day 12 in almost every file."],
  ["KB-13","When to issue a reservation of rights","Done","Fixed","Highest","R. Delgado","sop;ror;coverage","Endorsement 4A present, a prior loss on the same insured, and a panel signature. All three together, every time.","[R. Delgado] If the prior loss is a different cause family — a water event, say — I leave the ROR off."],
  ["KB-14","Evidence preservation before the panel is moved","Done","Fixed","High","R. Delgado","sop;subrogation","The panel is photographed in place, then bagged and tagged before any debris removal. Losing the panel loses the subrogation.","[L. Marchetti] We lost one this way in 2023. Never again."],
  ["KB-15","Communicating a reservation of rights to the insured","Done","Fixed","Medium","R. Delgado","sop;ror;communication","Call the insured before the letter goes out. The letter is legal language; the call is what keeps the relationship.","[R. Delgado] Nobody has ever complained about the letter when I made the call first."],
  ["KB-16","ALE handling on weekend first notices","In Progress","","Medium","P. Nwosu","gap;ale","Weekend FNOLs get an ALE decision before the origin report is back. Current practice is inconsistent.","[P. Nwosu] Needs a rule. Raised with R. Delgado."],
  ["KB-17","Panel manufacturer recall tracking","Done","Fixed","Medium","L. Marchetti","subrogation;recall","Three files traced to the same manufacturer inside the recall window. Subrogation filed on all three.","[L. Marchetti] Check the recall window before closing any panel file."],
  ["KB-18","Distinguishing branch wiring from panel cause","Done","Fixed","High","R. Delgado","sop;cause","Branch wiring failures read as panel cause at first notice. The marshal usually separates them by Day 8.","[R. Delgado] Expect a 30-40% reserve increase when it flips to wiring."],
];

const TRANSCRIPT = [
  ["Interviewer","How do you know it's panel-cause from the first notice?"],
  ["R. Delgado","The language people use. Popping sound before the smoke, lights flickered for a few days, and the fire is concentrated at the service entrance. Two of those three and I'm already on that path."],
  ["Interviewer","And when do you decide to reserve rights?"],
  ["R. Delgado","Endorsement 4A on the policy, a prior loss on the same insured, and a panel signature. All three together, I reserve rights every time. Two of three, I wait for the origin report."],
  ["Interviewer","What if the prior loss is unrelated?"],
  ["R. Delgado","Then it isn't really a prior loss for my purposes. A water claim from three years ago tells me nothing about a panel fire. Different cause family, no ROR."],
  ["Interviewer","How do you set the first reserve?"],
  ["R. Delgado","To the median outcome of the pattern, not to the worst thing that could happen. Reserving to fear inflates the whole book and then you spend the year explaining it. Median, then review at Day 10 and Day 30."],
  ["Interviewer","Why Day 10 specifically?"],
  ["R. Delgado","Origin reports come back between Day 7 and Day 12 in almost every file I've handled. Day 10 is where you actually learn something."],
  ["Interviewer","What's the mistake newer handlers make?"],
  ["R. Delgado","They let the panel get thrown out. Debris removal starts, the panel goes in a skip, and the subrogation goes with it. Photograph it in place, bag it, tag it, before anyone touches the scene."],
  ["Interviewer","Anything about the reservation-of-rights letter?"],
  ["R. Delgado","Call the insured before the letter arrives. The letter is legal language and it frightens people. Nobody has ever complained about the letter when I made the call first."],
  ["P. Nwosu","What about weekend notices where we have to make an ALE call before the origin report?"],
  ["R. Delgado","That's the gap. I hold ALE ten days and revisit, but I've never written it down properly."],
];

const DOCS = [
  ["Property Fire — Cause Determination Notes","R. Delgado","sop;cause","Cause determination on residential fire losses. The three tells for a panel-cause path are an audible pop before smoke, flickering in the days prior, and burn concentration at the service entrance. Branch wiring failures present almost identically at first notice and are usually separated by the fire marshal around Day 8; when that happens, expect the reserve to move up 30 to 40 percent."],
  ["Reserve Setting — Property Fire","R. Delgado","sop;reserve","First cut is set to the median outcome of the matching pattern. Review points are Day 10 (origin report expected) and Day 30 (scope settled). Reserving to the worst case inflates the book and is not supported by the closed-file history."],
  ["Reservation of Rights — When and How","R. Delgado","sop;ror","Issue a reservation of rights when Endorsement 4A applies, the insured has a prior loss in the same cause family, and the cause carries a panel signature. A prior loss in an unrelated cause family does not count. Always telephone the insured before the letter is sent."],
  ["Subrogation — Evidence Preservation","L. Marchetti","sop;subrogation","Photograph the panel in place before any debris removal, then bag and tag it. Check the manufacturer against open recall windows; three files in the last two years traced to a single manufacturer inside its recall window."],
  ["Open Gap — ALE on Weekend First Notices","P. Nwosu","gap;ale","Weekend first notices force an additional living expense decision before the origin report returns. Current practice is to hold ten days and revisit, but this is not documented and handlers are inconsistent."],
];

// Deterministic PRNG so the sample file is byte-stable between downloads.
function rng(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }
const iso = d => d.toISOString().slice(0, 10);

function sampleTickets() {
  const r = rng(20240108);
  const start = new Date(Date.UTC(2024, 0, 8));
  const rows = [];
  for (let i = 0; i < 46; i++) {
    const [cause, panelFamily, lo, hi, note] = CAUSES[i % CAUSES.length];
    const opened = new Date(start.getTime() + (i * 9 + Math.floor(r() * 5)) * 864e5);
    const closed = new Date(opened.getTime() + (9 + Math.floor(r() * 22)) * 864e5);
    const has4a = panelFamily && r() < 0.8;
    const prior = panelFamily && r() < 0.7;
    const ri = Math.round((lo + r() * (hi * 0.8 - lo)) / 500) * 500;
    const rf = Math.round(ri * (1.12 + r() * 0.3));
    const ror = has4a && prior && cause === "electrical panel";
    rows.push([
      `CLM-${104800 + i * 137}`, iso(opened), iso(closed), "fire", "HO-3",
      has4a ? "4A" : "", prior ? "yes" : "no", cause, ri, rf,
      HANDLERS[i % HANDLERS.length], ror ? "paid_with_reservation_of_rights" : "paid",
      note + (ror ? " Reservation of rights issued — 4A plus prior loss plus panel signature." : "")
           + (panelFamily ? " ALE held 10 days pending the origin report." : ""),
    ]);
  }
  return rows;
}

export default function handler(req, res) {
  let XLSX;
  try { XLSX = require("xlsx"); }
  catch { return res.status(500).send("Spreadsheet library unavailable on this deployment."); }

  const url = new URL(req.url, "http://localhost");
  const kind = url.searchParams.get("kind") === "sample" ? "sample" : "blank";
  const wb = XLSX.utils.book_new();
  const add = (name, aoa) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);

  if (kind === "blank") {
    add("README", README);
    add("Tickets", [HEADERS.Tickets, ["CLM-1001","2025-01-14","2025-02-03","fire","HO-3","4A","yes","electrical panel",48000,62500,"R. Delgado","paid_with_reservation_of_rights","Replace this row with your own. Free-text notes are where the SME's reasoning usually lives."]]);
    add("Jira_Tickets", [HEADERS.Jira_Tickets, ["KB-14","Panel-cause fire intake checklist","Done","Fixed","High","R. Delgado","2025-01-20","2025-02-01","sop;fire","Replace with your own Jira export.","[R. Delgado] Example comment."]]);
    add("Transcripts", [HEADERS.Transcripts, ["R. Delgado","2025-02-10","Replace with a real interview or chat line."]]);
    add("Documents", [HEADERS.Documents, ["Example SOP page","R. Delgado","2025-02-11","sop","Replace with your wiki page text."]]);
  } else {
    add("Tickets", [HEADERS.Tickets, ...sampleTickets()]);
    add("Jira_Tickets", [HEADERS.Jira_Tickets, ...JIRA_ROWS.map(j => [j[0], j[1], j[2], j[3], j[4], j[5], "2025-01-15", j[2] === "Done" ? "2025-02-20" : "", j[6], j[7], j[8]])]);
    add("Transcripts", [HEADERS.Transcripts, ...TRANSCRIPT.map(([s, t], i) => [s, iso(new Date(Date.UTC(2025, 1, 10 + Math.floor(i / 6)))), t])]);
    add("Documents", [HEADERS.Documents, ...DOCS.map(d => [d[0], d[1], "2025-02-18", d[2], d[3]])]);
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const name = kind === "sample" ? "sample-corpus.xlsx" : "corpus-template.xlsx";
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  return res.status(200).send(buf);
}
