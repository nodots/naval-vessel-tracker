import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Link } from "react-router-dom";
import type { MapVesselMarker } from "@naval-tracker/shared";
import { fetchMapVessels } from "../api";
import { STATUS_COLORS, ageLabel, statusLabel, vesselTypeLabel } from "../format";

const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
const REFRESH_INTERVAL_MS = 15_000;

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

export function MapPage() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [markers, setMarkers] = useState<MapVesselMarker[]>([]);
  const [selected, setSelected] = useState<MapVesselMarker | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());

  const distinctCountries = useMemo(
    () => Array.from(new Set(markers.map((m) => m.country))).sort(),
    [markers],
  );
  const distinctTypes = useMemo(
    () => Array.from(new Set(markers.map((m) => m.vesselType))).sort(),
    [markers],
  );

  const visibleMarkers = useMemo(() => {
    if (selectedCountries.size === 0 && selectedTypes.size === 0) return markers;
    return markers.filter(
      (m) =>
        (selectedCountries.size === 0 || selectedCountries.has(m.country)) &&
        (selectedTypes.size === 0 || selectedTypes.has(m.vesselType)),
    );
  }, [markers, selectedCountries, selectedTypes]);

  const toggleInSet = (key: string, setState: typeof setSelectedCountries) => {
    setState((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filtersActive = selectedCountries.size > 0 || selectedTypes.size > 0;
  const clearFilters = () => {
    setSelectedCountries(new Set());
    setSelectedTypes(new Set());
  };

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
    let inflight: AbortController | null = null;

    const refresh = () => {
      inflight?.abort();
      inflight = new AbortController();
      fetchMapVessels(inflight.signal)
        .then((data) => {
          if (!cancelled) {
            setMarkers(data);
            setApiError(null);
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          setApiError(err instanceof Error ? err.message : String(err));
        });
    };

    refresh();
    const intervalId = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      inflight?.abort();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || visibleMarkers.length === 0) return;
    const placed: maplibregl.Marker[] = [];
    for (const m of visibleMarkers) {
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
  }, [visibleMarkers]);

  return (
    <Box sx={{ position: "relative", flex: 1, minHeight: 0 }}>
      <Box ref={mapContainer} sx={{ position: "absolute", inset: 0 }} />

      <Box
        sx={{
          position: "absolute",
          top: 12,
          left: 12,
          bgcolor: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(4px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 1,
          px: 1.25,
          py: 1,
          maxWidth: 540,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: distinctCountries.length > 0 ? 0.75 : 0 }}>
          <Typography variant="caption" color="text.secondary">
            {apiError
              ? `api error: ${apiError}`
              : markers.length === 0
                ? "loading…"
                : filtersActive
                  ? `${visibleMarkers.length} of ${markers.length} vessels`
                  : `${markers.length} vessels with positions`}
          </Typography>
          {filtersActive && (
            <Button size="small" variant="text" onClick={clearFilters} sx={{ py: 0, minWidth: 0, fontSize: 11 }}>
              clear
            </Button>
          )}
        </Stack>

        {distinctCountries.length > 0 && (
          <FilterRow
            label="Country"
            values={distinctCountries}
            selected={selectedCountries}
            onToggle={(v) => toggleInSet(v, setSelectedCountries)}
          />
        )}
        {distinctTypes.length > 0 && (
          <FilterRow
            label="Type"
            values={distinctTypes}
            selected={selectedTypes}
            onToggle={(v) => toggleInSet(v, setSelectedTypes)}
            renderLabel={vesselTypeLabel}
          />
        )}
      </Box>

      <Box
        sx={{
          position: "absolute",
          bottom: 12,
          left: 12,
          bgcolor: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 1,
          px: 1.25,
          py: 0.75,
        }}
      >
        <Stack direction="row" spacing={1.5}>
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

            <Divider sx={{ my: 2 }} />

            <Button
              component={Link}
              to={`/vessels/${selected.vesselId}`}
              fullWidth
              variant="outlined"
              size="small"
            >
              View vessel detail
            </Button>
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

function FilterRow({
  label,
  values,
  selected,
  onToggle,
  renderLabel,
}: {
  label: string;
  values: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  renderLabel?: (value: string) => string;
}) {
  return (
    <Stack direction="row" alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mr: 0.75, minWidth: 50 }}
      >
        {label}
      </Typography>
      {values.map((v) => {
        const isOn = selected.has(v);
        return (
          <Chip
            key={v}
            label={renderLabel ? renderLabel(v) : v}
            size="small"
            variant={isOn ? "filled" : "outlined"}
            color={isOn ? "primary" : "default"}
            onClick={() => onToggle(v)}
            sx={{ mr: 0.5, height: 22, fontSize: 11 }}
          />
        );
      })}
    </Stack>
  );
}
