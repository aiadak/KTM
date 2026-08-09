// /api/xlsx-lib.js — serves the browser build of the spreadsheet parser from
// this deployment's own origin, so uploads keep working on networks that block
// public CDNs. Falls through to the CDN loader in index.html if unavailable.

import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

export default function handler(req, res) {
  try {
    const p = require.resolve("xlsx/dist/xlsx.full.min.js");
    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.status(200).send(fs.readFileSync(p, "utf-8"));
  } catch (err) {
    console.error("[xlsx-lib] unavailable:", err.message);
    return res.status(404).send("// parser not bundled");
  }
}
