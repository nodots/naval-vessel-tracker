import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapVesselMarker } from "@naval-tracker/shared";
import { STATUS_COLORS, ageLabel, statusLabel, vesselTypeLabel } from "./format";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:6732/api";
const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/dark";

function createMarkerEl(status: MapVesselMarker["status"]): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "14px";
  el.style.height = "14px";
  el.style.borderRadius = "50%";
  el.style.background = STATUS_COLORS[status];
  el.style.border = "2px solid rgba(0,0,0,0.6)";
  el.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.4)";
  el.style.cursor = "pointer";
  return el;
}

export function App() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [markers, setMarkers] = useState<MapVesselMarker[]>([]);
  const [selected, setSelected] = useState<MapVesselMarker | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: BASEMAP_STYLE,
      center: [10, 25],
      zoom: 1.6,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/map/vessels`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`http ${res.status}`);
        const data = (await res.json()) as MapVesselMarker[];
        if (!cancelled) setMarkers(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setApiError(message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || markers.length === 0) return;
    const placed: maplibregl.Marker[] = [];
    for (const m of markers) {
      const el = createMarkerEl(m.status);
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([m.lon, m.lat])
        .addTo(map);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        setSelected(m);
      });
      placed.push(marker);
    }
    return () => {
      for (const m of placed) m.remove();
    };
  }, [markers]);

  return (
    <Box sx={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          px: 2,
          py: 1.25,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "baseline",
          gap: 2,
          bgcolor: "background.paper",
          zIndex: 1,
        }}
      >
        <Typography variant="h6" component="h1">
          Naval Vessel Tracker
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {apiError
            ? `api error: ${apiError}`
            : markers.length > 0
              ? `${markers.length} vessels with positions`
              : "loading…"}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          {(Object.keys(STATUS_COLORS) as Array<keyof typeof STATUS_COLORS>).map((s) => (
            <Stack key={s} direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  bgcolor: STATUS_COLORS[s],
                  border: "1px solid rgba(0,0,0,0.6)",
                }}
              />
              <Typography variant="caption" color="text.secondary">
                {statusLabel(s)}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
      <Box ref={mapContainer} sx={{ flex: 1 }} />
      <Drawer
        anchor="right"
        open={selected !== null}
        onClose={() => setSelected(null)}
        slotProps={{ paper: { sx: { width: 360 } } }}
      >
        {selected && (
          <Box sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="flex-start" spacing={1}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6">{selected.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {vesselTypeLabel(selected.vesselType)} · {selected.country}
                </Typography>
              </Box>
              <IconButton
                size="small"
                onClick={() => setSelected(null)}
                aria-label="close"
                sx={{ mt: -0.5 }}
              >
                <Box component="span" sx={{ fontSize: 18, lineHeight: 1 }}>
                  &times;
                </Box>
              </IconButton>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Stack spacing={1.25}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Chip
                  size="small"
                  label={statusLabel(selected.status)}
                  sx={{
                    bgcolor: STATUS_COLORS[selected.status],
                    color: "#0a0a0a",
                    fontWeight: 600,
                  }}
                />
                <Typography variant="body2" color="text.secondary">
                  {ageLabel(selected.ageMinutes)}
                </Typography>
              </Stack>

              <Row label="Last observed" value={new Date(selected.observedAt).toLocaleString()} />
              <Row label="Source" value={selected.sourceType} />
              <Row label="Confidence" value={selected.confidence.toFixed(2)} />
              <Row label="Lat / Lon" value={`${selected.lat.toFixed(3)}, ${selected.lon.toFixed(3)}`} />
            </Stack>
          </Box>
        )}
      </Drawer>
    </Box>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ textAlign: "right" }}>
        {value}
      </Typography>
    </Stack>
  );
}
