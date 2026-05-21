import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:6732/api";

type HealthState =
  | { kind: "loading" }
  | { kind: "ok"; service: string }
  | { kind: "error"; message: string };

export function App() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });

  useEffect(() => {
    if (!mapContainer.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#0a1929" },
          },
        ],
      },
      center: [0, 20],
      zoom: 1.5,
    });
    return () => map.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/health`)
      .then(async (res) => {
        const data = (await res.json()) as { ok: boolean; service: string };
        if (cancelled) return;
        setHealth({ kind: "ok", service: data.service });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setHealth({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box sx={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          p: 2,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "baseline",
          gap: 2,
        }}
      >
        <Typography variant="h6" component="h1">
          Naval Vessel Tracker
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {health.kind === "loading" && "checking api…"}
          {health.kind === "ok" && `api: ${health.service}`}
          {health.kind === "error" && `api error: ${health.message}`}
        </Typography>
      </Box>
      <Box ref={mapContainer} sx={{ flex: 1 }} />
    </Box>
  );
}
