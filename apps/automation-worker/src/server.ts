import express from "express";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 8787);
const WORKER_TOKEN = process.env.AUTOMATION_WORKER_TOKEN;

function requireWorkerToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!WORKER_TOKEN) {
    return res.status(500).json({ ok: false, error: "Missing AUTOMATION_WORKER_TOKEN." });
  }

  const auth = req.header("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");

  if (token !== WORKER_TOKEN) {
    return res.status(401).json({ ok: false, error: "Unauthorized." });
  }

  next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "automation-worker" });
});

app.post("/run-dsw", requireWorkerToken, async (_req, res) => {
  res.status(501).json({ ok: false, status: "NOT_IMPLEMENTED", job: "DSW" });
});

app.post("/run-fcc", requireWorkerToken, async (_req, res) => {
  res.status(501).json({ ok: false, status: "NOT_IMPLEMENTED", job: "FCC" });
});

app.post("/run-ops", requireWorkerToken, async (_req, res) => {
  res.status(501).json({ ok: false, status: "NOT_IMPLEMENTED", job: "OPS" });
});

app.listen(PORT, () => {
  console.log(`automation-worker listening on :${PORT}`);
});
