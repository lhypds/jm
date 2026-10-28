// Temporary: injects an input-event logger for iOS Simulator debugging. Not part of the project.
import fs from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
const LOG = process.env.DBG_LOG!;
const logger = `
<script>
(() => {
  const ed = () => document.querySelector(".paper");
  const sel = () => { const s = getSelection(); if (!s || !s.anchorNode) return "none";
    const d = (n) => n.nodeType === 3 ? JSON.stringify(n.data) + (n.parentElement.closest("rt") ? "(rt)" : n.parentElement.closest("ruby") ? "(ruby)" : "") : n.nodeName;
    return d(s.anchorNode) + "@" + s.anchorOffset + (s.isCollapsed ? "" : " .. " + d(s.focusNode) + "@" + s.focusOffset); };
  const send = (msg) => fetch("/__log", { method: "POST", body: msg });
  const log = (e) => { const el = ed(); if (!el) return;
    const tr = e.getTargetRanges ? e.getTargetRanges().map(r => (r.startContainer.nodeType===3?JSON.stringify(r.startContainer.data):r.startContainer.nodeName)+"@"+r.startOffset+"-"+(r.endContainer.nodeType===3?JSON.stringify(r.endContainer.data):r.endContainer.nodeName)+"@"+r.endOffset).join(",") : "";
    send([performance.now().toFixed(0), e.type, e.inputType ?? "", "data=" + JSON.stringify(e.data ?? null), "composing=" + !!e.isComposing, "cancelable=" + e.cancelable, "ranges=" + tr, "sel=" + sel(), "html=" + el.innerHTML].join(" | ")); };
  for (const t of ["beforeinput", "input", "compositionstart", "compositionupdate", "compositionend", "keydown"]) document.addEventListener(t, log, true);
  for (const t of ["beforeinput", "input"]) document.addEventListener(t, (e) => setTimeout(() => { const el = ed(); el && send("   after " + e.type + " | sel=" + sel() + " | html=" + el.innerHTML); }), true);
  let last = ''; setInterval(() => { const r = document.getElementById('root'); const h = r ? r.innerHTML : ''; if (h !== last) { last = h; send('   ROOT ' + h); } }, 1000);
  let rtRect = null;
  setInterval(() => {
    const rt = document.querySelector('.paper rt');
    if (rt) { const r = rt.getBoundingClientRect(); rtRect = { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom }; return; }
    if (!rtRect) return;
    const p = document.querySelector('.paper').getBoundingClientRect();
    send('   PROBE rt was ' + JSON.stringify(rtRect) + ' paper ' + JSON.stringify({ top: p.top, bottom: p.bottom, left: p.left, right: p.right }) + ' at point: ' + document.elementsFromPoint(rtRect.x, rtRect.y).map(e => e.tagName + '.' + e.className).join(' > '));
    rtRect = null;
  }, 300);
})();
</script>`;
export default defineConfig({
  plugins: [
    react(),
    { name: "dbg", transformIndexHtml: (html) => html.replace("</head>", logger + "</head>"),
      configureServer(server) { server.middlewares.use("/__log", (req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { fs.appendFileSync(LOG, b + "\n"); res.end(); }); }); } },
  ],
  server: { host: true, proxy: { "/api": "http://localhost:4199" } },
});
