import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  completeCheckout,
  createCase,
  declineMockPayment,
  getCase,
  getCaseByPaymentSession,
  quoteCase,
  refreshPayment,
  startPayment,
  approveMockPayment,
} from "../agent/caseStore.js";
import { listAirlines } from "../policy/engine.js";
import { createSandboxCommerceClient } from "../commerce/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");

const PORT = Number(process.env.PORT ?? 4040);
const commerce = createSandboxCommerceClient();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(root, "public")));

const needsSchema = z.object({
  size: z.string().default("M"),
  urgentNeed: z.enum(["clothing", "toiletries", "both"]).default("clothing"),
  alreadyHas: z.array(z.string()).default([]),
  personalCapUsd: z.number().positive().max(500).default(150),
  nights: z.number().int().min(1).max(7).default(1),
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "relief-cart",
    transactionMode: "sandbox",
    time: new Date().toISOString(),
  });
});

app.get("/api/airlines", (_req, res) => {
  res.json({ airlines: listAirlines() });
});

app.get("/api/demo/incident", (_req, res) => {
  const text = readFileSync(path.join(root, "src/data/demo-incident.txt"), "utf8");
  res.json({ text });
});

app.get("/api/cases/:id", (req, res) => {
  const c = getCase(req.params.id);
  if (!c) return res.status(404).json({ error: "case not found" });
  return res.json(c);
});

app.post("/api/cases", (req, res) => {
  const body = z
    .object({
      rawIncidentText: z.string().min(20),
      airlineHint: z.string().optional(),
      needs: needsSchema,
    })
    .parse(req.body);

  const c = createCase(body);
  res.status(201).json(c);
});

app.post("/api/cases/:id/quote", async (req, res) => {
  const c = getCase(req.params.id);
  if (!c) return res.status(404).json({ error: "case not found" });
  try {
    const updated = await quoteCase(c, commerce);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/cases/:id/pay", async (req, res) => {
  const c = getCase(req.params.id);
  if (!c) return res.status(404).json({ error: "case not found" });
  try {
    const updated = await startPayment(c, commerce);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/cases/:id/mock-approve", async (req, res) => {
  const c = getCase(req.params.id);
  if (!c) return res.status(404).json({ error: "case not found" });
  try {
    const updated = await approveMockPayment(c, commerce);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/cases/:id/mock-decline", async (req, res) => {
  const c = getCase(req.params.id);
  if (!c) return res.status(404).json({ error: "case not found" });
  try {
    const updated = await declineMockPayment(c, commerce);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/cases/:id/payment-status", async (req, res) => {
  const c = getCase(req.params.id);
  if (!c) return res.status(404).json({ error: "case not found" });
  try {
    const updated = await refreshPayment(c, commerce);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/payments/:sessionId/mock-approve", async (req, res) => {
  const c = getCaseByPaymentSession(req.params.sessionId);
  if (!c) return res.status(404).json({ error: "payment session not found" });
  try {
    const updated = await approveMockPayment(c, commerce);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/payments/:sessionId/mock-decline", async (req, res) => {
  const c = getCaseByPaymentSession(req.params.sessionId);
  if (!c) return res.status(404).json({ error: "payment session not found" });
  try {
    const updated = await declineMockPayment(c, commerce);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/cases/:id/checkout", async (req, res) => {
  const c = getCase(req.params.id);
  if (!c) return res.status(404).json({ error: "case not found" });
  try {
    const updated = await completeCheckout(c, commerce);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Local sandbox approval page. */
app.get("/mock-pay/:sessionId", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Sandbox approval · ReliefCart</title>
<script>
(() => {
  let preference = 'system';
  try {
    const saved = localStorage.getItem('reliefcart-theme');
    if (['system', 'light', 'dark'].includes(saved)) preference = saved;
  } catch {}
  document.documentElement.dataset.theme = preference === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference;
})();
</script>
<style>
  :root{color-scheme:light;--bg:#eeece5;--paper:#fbfaf7;--ink:#18201b;--muted:#66716a;--line:#d6d7ce;--soft:#f0eee7;--brand:#24473b;font-family:"Avenir Next","Segoe UI",sans-serif;color:var(--ink);background:var(--bg)}
  html[data-theme="dark"]{color-scheme:dark;--bg:#101511;--paper:#171d18;--ink:#eef1ec;--muted:#9ca79f;--line:#3b463d;--soft:#202821;--brand:#315e4e}
  *{box-sizing:border-box}body{display:grid;place-items:center;min-height:100dvh;margin:0;padding:24px;background:var(--bg)}
  .card{width:min(100%,430px);background:var(--paper);border:1px solid var(--line);border-radius:24px;padding:30px;box-shadow:0 24px 80px rgba(3,12,6,.22)}
  .mark{width:52px;height:52px;overflow:hidden;padding:3px;border:1px solid rgba(13,49,94,.08);border-radius:11px;background:#f1f5f5;box-shadow:inset 0 0 0 1px rgba(255,255,255,.34);margin-bottom:24px}
  .mark img{display:block;width:100%;height:100%;object-fit:contain}
  html[data-theme="dark"] .mark{border-color:rgba(216,226,220,.2);background:#edf2ef;box-shadow:0 6px 18px rgba(0,8,3,.2)}
  h1{font-size:24px;letter-spacing:-.03em;margin:0 0 8px}.muted{color:var(--muted);font-size:14px;line-height:1.55;margin:0}
  code{display:block;margin:18px 0;padding:12px;background:var(--soft);border-radius:10px;overflow-wrap:anywhere;color:var(--muted)}
  .actions{display:grid;gap:10px;margin-top:22px}button{border:0;border-radius:10px;padding:13px 16px;font:inherit;font-weight:700;cursor:pointer}
  #approve{background:#e8673f;color:#fff}#decline{background:transparent;border:1px solid #c8cbc2;color:#5f6761}
  html[data-theme="dark"] #decline{border-color:var(--line);color:var(--muted)}
  button:disabled{opacity:.55;cursor:wait}#msg{margin-top:16px;min-height:22px;font-weight:600}
</style></head>
<body><main class="card">
  <div class="mark" aria-hidden="true"><img src="/assets/reliefcart-logo.png" alt="" width="52" height="52"/></div>
  <h1>Approve this purchase</h1>
  <p class="muted">ReliefCart sandbox approval. This local page records a demo transaction decision and returns the status to ReliefCart.</p>
  <code>${req.params.sessionId}</code>
  <div class="actions">
    <button id="approve">Approve sandbox transaction</button>
    <button id="decline">Decline</button>
  </div>
  <p id="msg" class="muted" role="status"></p>
</main>
<script>
const buttons = [...document.querySelectorAll('button')];
async function decide(action) {
  buttons.forEach((button) => button.disabled = true);
  const message = document.getElementById('msg');
  message.textContent = action === 'approve' ? 'Approving…' : 'Declining…';
  const response = await fetch('/api/payments/${req.params.sessionId}/mock-' + action, { method: 'POST' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    message.textContent = body.error || 'The approval could not be updated.';
    buttons.forEach((button) => button.disabled = false);
    return;
  }
  message.textContent = action === 'approve'
    ? 'Payment approved. Return to ReliefCart to place the order.'
    : 'Payment declined. No order was placed.';
}
document.getElementById('approve').onclick = () => decide('approve');
document.getElementById('decline').onclick = () => decide('decline');
</script>
</body></html>`);
});

// SPA fallback (Express 5: avoid bare "*")
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (req.path.startsWith("/api") || req.path.startsWith("/mock-pay")) return next();
  if (req.path === "/docs" || req.path.startsWith("/docs/")) return res.status(404).send("Not found");
  res.sendFile(path.join(root, "public/index.html"));
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      error: err.issues.map((issue) => issue.message).join(". "),
    });
  }
  return res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
});

const isLocalEntrypoint = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isLocalEntrypoint) {
  app.listen(PORT, () => {
    console.log(`ReliefCart http://127.0.0.1:${PORT}  (TRANSACTION_MODE=sandbox)`);
  });
}

export default app;
