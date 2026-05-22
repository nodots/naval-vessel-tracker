import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid2";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Link as RouterLink, useParams } from "react-router-dom";
import type { Observation, VesselDetail } from "@naval-tracker/shared";
import { ApiError, fetchVessel } from "../api";
import { STATUS_COLORS, ageLabel, statusLabel, vesselTypeLabel } from "../format";

const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/dark";

export function VesselDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [vessel, setVessel] = useState<VesselDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!id) return;
    setVessel(null);
    setError(null);
    const controller = new AbortController();
    fetchVessel(id, controller.signal)
      .then(setVessel)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof ApiError) setError({ status: err.status, message: err.message });
        else setError({ status: 0, message: err instanceof Error ? err.message : String(err) });
      });
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    if (!mapContainer.current || !vessel?.currentPositionDetail) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: BASEMAP_STYLE,
      center: [vessel.currentPositionDetail.lon, vessel.currentPositionDetail.lat],
      zoom: 5,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    const el = document.createElement("div");
    el.style.width = "14px";
    el.style.height = "14px";
    el.style.borderRadius = "50%";
    el.style.background = STATUS_COLORS[vessel.currentPositionDetail.status];
    el.style.border = "2px solid rgba(0,0,0,0.6)";
    el.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.4)";
    markerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([vessel.currentPositionDetail.lon, vessel.currentPositionDetail.lat])
      .addTo(map);

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [vessel?.currentPositionDetail]);

  if (error) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h6">Vessel not found</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {error.status === 404 ? "No vessel matches this id." : error.message}
        </Typography>
        <Button component={RouterLink} to="/map" sx={{ mt: 2 }} variant="outlined">
          Back to map
        </Button>
      </Container>
    );
  }

  if (!vessel) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  const cp = vessel.currentPositionDetail;

  return (
    <Box sx={{ flex: 1, overflowY: "auto" }}>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Stack direction="row" alignItems="baseline" spacing={2} sx={{ mb: 2 }}>
          <Typography variant="h5">{vessel.name}</Typography>
          {vessel.pennantNumber && (
            <Typography variant="body1" color="text.secondary">
              {vessel.pennantNumber}
            </Typography>
          )}
          <Box sx={{ flex: 1 }} />
          <Button component={RouterLink} to="/map" size="small" variant="outlined">
            Back to map
          </Button>
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {vesselTypeLabel(vessel.vesselType)} · {vessel.country}
          {vessel.navy ? ` · ${vessel.navy}` : ""}
          {vessel.className ? ` · ${vessel.className}` : ""}
        </Typography>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 5 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="overline" color="text.secondary">
                Facts
              </Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {vessel.mmsi && <FactRow label="MMSI" value={vessel.mmsi} />}
                {vessel.imo && <FactRow label="IMO" value={vessel.imo} />}
                {vessel.callSign && <FactRow label="Call sign" value={vessel.callSign} />}
                {vessel.homePort && <FactRow label="Home port" value={vessel.homePort} />}
                <FactRow label="Active" value={vessel.active ? "yes" : "no"} />
                {vessel.notes && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Notes
                    </Typography>
                    <Typography variant="body2">{vessel.notes}</Typography>
                  </Box>
                )}
              </Stack>
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, md: 7 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="overline" color="text.secondary">
                Current position
              </Typography>
              {cp ? (
                <>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1, mb: 1.5 }}>
                    <Chip
                      size="small"
                      label={statusLabel(cp.status)}
                      sx={{ bgcolor: STATUS_COLORS[cp.status], color: "#0a0a0a", fontWeight: 600 }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      {ageLabel(cp.ageMinutes)}
                    </Typography>
                  </Stack>
                  <Stack spacing={0.5}>
                    {cp.summary && (
                      <Typography variant="body2">{cp.summary}</Typography>
                    )}
                    <FactRow label="Source" value={`${cp.sourceType}${cp.sourceName ? ` · ${cp.sourceName}` : ""}`} />
                    <FactRow label="Confidence" value={cp.confidence.toFixed(2)} />
                    <FactRow label="Lat / Lon" value={`${cp.lat.toFixed(3)}, ${cp.lon.toFixed(3)}`} />
                    <FactRow label="Last observed" value={new Date(cp.observedAt).toLocaleString()} />
                  </Stack>
                  <Box
                    ref={mapContainer}
                    sx={{ mt: 2, height: 220, borderRadius: 1, overflow: "hidden" }}
                  />
                </>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  No current position. This vessel has no recent observations.
                </Typography>
              )}
            </Paper>
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Typography variant="overline" color="text.secondary">
                  Observations
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Button
                  component={RouterLink}
                  to={`/admin/observations/new?vesselId=${vessel.id}`}
                  size="small"
                  variant="contained"
                >
                  Add observation
                </Button>
              </Stack>
              {vessel.observations.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  No observations recorded yet.
                </Typography>
              ) : (
                <Stack divider={<Divider flexItem />}>
                  {vessel.observations.map((obs) => (
                    <ObservationRow key={obs.id} obs={obs} />
                  ))}
                </Stack>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
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

function ObservationRow({ obs }: { obs: Observation }) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ py: 1.25 }}>
      <Box sx={{ minWidth: 200 }}>
        <Typography variant="body2">{new Date(obs.observedAt).toLocaleString()}</Typography>
        <Typography variant="caption" color="text.secondary">
          {obs.sourceType}
          {obs.sourceName ? ` · ${obs.sourceName}` : ""}
        </Typography>
      </Box>
      <Box sx={{ flex: 1 }}>
        {obs.lat !== null && obs.lon !== null && (
          <Typography variant="body2">
            {obs.lat.toFixed(3)}, {obs.lon.toFixed(3)}
          </Typography>
        )}
        {obs.notes && (
          <Typography variant="body2" color="text.secondary">
            {obs.notes}
          </Typography>
        )}
        {obs.sourceUrl && (
          <Link
            href={obs.sourceUrl}
            target="_blank"
            rel="noreferrer"
            variant="caption"
            sx={{ display: "inline-block", mt: 0.25 }}
          >
            source link
          </Link>
        )}
      </Box>
      <Box sx={{ minWidth: 80, textAlign: { xs: "left", sm: "right" } }}>
        <Typography variant="caption" color="text.secondary">
          conf {obs.confidence.toFixed(2)}
        </Typography>
      </Box>
    </Stack>
  );
}
