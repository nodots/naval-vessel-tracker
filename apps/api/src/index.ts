import "dotenv/config";
import cors from "cors";
import express from "express";
import { HEALTH_SERVICE_NAME } from "@naval-tracker/shared";
import { vesselsRouter } from "./routes/vessels.js";

const PORT = Number(process.env.PORT ?? 6732);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:6731";

const app = express();

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: HEALTH_SERVICE_NAME });
});

app.use("/api/vessels", vesselsRouter);

app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});
