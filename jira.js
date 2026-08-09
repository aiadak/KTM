// /api/jira.js — LIVE Atlassian connector.
// Called ONLY when the user clicks "Connect to Jira / Confluence" in the
// Archivist agent. Nothing here runs on page load or during a normal sweep.

import { readBody } from "../lib/claude.js";

function authHeader() {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;
  if (!email || !token) return null;
  const b64 = Buffer.from(`${email}:${token}`).toString("base64");
  return { Authorization: `Basic ${b64}`, Accept: "application/json" };
}

function adfToText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(adfToText).join(" ");
  if (node.text) return node.text;
  if (node.content) return adfToText(node.content);
  return "";
}

async function fetchJira(projectKey) {
  const host = process.env.JIRA_HOST;
  const project = projectKey || process.env.JIRA_PROJECT_KEY || "";
  const headers = authHeader();
  if (!host) return { status: "not_configured", reason: "JIRA_HOST missing" };
  if (!headers) return { status: "not_configured", reason: "JIRA_EMAIL / JIRA_TOKEN missing" };
  try {
    const jql = project ? `project = ${project} ORDER BY updated DESC` : "ORDER BY updated DESC";
    const url = `https://${host}/rest/api/3/search?jql=${encodeURIComponent(jql)}` +
      `&fields=summary,status,resolution,priority,assignee,reporter,created,updated,resolutiondate,labels,description,comment&maxResults=50`;
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`Jira HTTP ${r.status}`);
    const j = await r.json();
    const issues = (j.issues || []).map(iss => {
      const f = iss.fields || {};
      return {
        key: iss.key,
        summary: f.summary || "",
        status: f.status?.name || "",
        resolution: f.resolution?.name || "",
        priority: f.priority?.name || "",
        assignee: f.assignee?.displayName || "",
        reporter: f.reporter?.displayName || "",
        created: f.created || "",
        updated: f.updated || "",
        resolved: f.resolutiondate || "",
        labels: f.labels || [],
        description: adfToText(f.description).slice(0, 4000),
        comments: (f.comment?.comments || [])
          .map(c => `[${c.author?.displayName || "unknown"}] ${adfToText(c.body)}`)
          .join(" | ")
          .slice(0, 4000),
      };
    });
    return {
      status: "connected",
      meta: {
        source: "Jira Cloud (LIVE)",
        instance: host,
        project: project || "(all projects)",
        jql,
        pulled_at: new Date().toISOString(),
        total: j.total ?? issues.length,
      },
      issues,
    };
  } catch (err) {
    return { status: "error", reason: err.message };
  }
}

async function fetchConfluence(spaceKey) {
  const host = process.env.JIRA_HOST;
  const space = spaceKey || process.env.CONFLUENCE_SPACE_KEY || "";
  const headers = authHeader();
  if (!host || !headers) return { status: "not_configured", reason: "Atlassian credentials missing" };
  if (!space) return { status: "not_configured", reason: "CONFLUENCE_SPACE_KEY not set" };
  try {
    const url = `https://${host}/wiki/rest/api/content?spaceKey=${encodeURIComponent(space)}` +
      `&expand=version,body.storage,metadata.labels&limit=50`;
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`Confluence HTTP ${r.status}`);
    const j = await r.json();
    const results = (j.results || []).map(p => ({
      id: p.id,
      title: p.title,
      type: p.type,
      space,
      version: p.version?.number,
      author: p.version?.by?.displayName || "",
      updated: p.version?.when || "",
      labels: (p.metadata?.labels?.results || []).map(l => l.name),
      text: (p.body?.storage?.value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 4000),
    }));
    return {
      status: "connected",
      meta: {
        source: "Confluence Cloud (LIVE)",
        instance: `${host}/wiki`,
        space,
        cql: `space = ${space}`,
        pulled_at: new Date().toISOString(),
        total: results.length,
      },
      results,
    };
  } catch (err) {
    return { status: "error", reason: err.message };
  }
}

export default async function handler(req, res) {
  const body = readBody(req);
  const [jira, confluence] = await Promise.all([
    fetchJira(body.projectKey),
    fetchConfluence(body.spaceKey),
  ]);
  const connected = jira.status === "connected" || confluence.status === "connected";
  return res.status(200).json({
    connected,
    jira,
    confluence,
    pulled_at: new Date().toISOString(),
  });
}
