import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid2";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { CreateObservationRequest, VesselListItem } from "@naval-tracker/shared";
import { ApiError, createObservation, fetchVessels } from "../api";

type SourceTypeOption = CreateObservationRequest["sourceType"];

const SOURCE_TYPES: Array<{ value: SourceTypeOption; label: string }> = [
  { value: "manual_osint", label: "Manual OSINT" },
  { value: "official_release", label: "Official release" },
  { value: "news", label: "News article" },
  { value: "port_sighting", label: "Port sighting" },
  { value: "satellite", label: "Satellite" },
];

function nowLocalIso(): string {
  // datetime-local needs YYYY-MM-DDTHH:mm
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ObservationFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetVesselId = searchParams.get("vesselId") ?? "";

  const [vessels, setVessels] = useState<VesselListItem[]>([]);
  const [vesselsLoading, setVesselsLoading] = useState(true);
  const [vesselsError, setVesselsError] = useState<string | null>(null);

  const [vesselId, setVesselId] = useState<string>(presetVesselId);
  const [observedAtLocal, setObservedAtLocal] = useState<string>(nowLocalIso());
  const [lat, setLat] = useState<string>("");
  const [lon, setLon] = useState<string>("");
  const [sourceType, setSourceType] = useState<SourceTypeOption>("manual_osint");
  const [sourceName, setSourceName] = useState<string>("");
  const [sourceUrl, setSourceUrl] = useState<string>("");
  const [confidence, setConfidence] = useState<string>("0.6");
  const [notes, setNotes] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchVessels({ limit: 200 })
      .then((res) => {
        setVessels(res.items);
        setVesselsLoading(false);
      })
      .catch((err: unknown) => {
        setVesselsLoading(false);
        setVesselsError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  const sortedVessels = useMemo(
    () => [...vessels].sort((a, b) => a.name.localeCompare(b.name)),
    [vessels],
  );

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    setFieldErrors({});

    const latNum = Number(lat);
    const lonNum = Number(lon);
    const confNum = Number(confidence);

    const localErrors: Record<string, string> = {};
    if (!vesselId) localErrors.vesselId = "select a vessel";
    if (!observedAtLocal) localErrors.observedAt = "required";
    if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) localErrors.lat = "must be -90..90";
    if (!Number.isFinite(lonNum) || lonNum < -180 || lonNum > 180) localErrors.lon = "must be -180..180";
    if (!Number.isFinite(confNum) || confNum < 0 || confNum > 1) localErrors.confidence = "must be 0..1";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    const body: CreateObservationRequest = {
      vesselId,
      observedAt: new Date(observedAtLocal).toISOString(),
      lat: latNum,
      lon: lonNum,
      sourceType,
      confidence: confNum,
      ...(sourceName ? { sourceName } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(notes ? { notes } : {}),
    };

    setSubmitting(true);
    try {
      await createObservation(body);
      navigate(`/vessels/${vesselId}`);
    } catch (err: unknown) {
      setSubmitting(false);
      if (err instanceof ApiError && err.body && typeof err.body === "object") {
        const apiBody = err.body as { error?: string; details?: Array<{ field: string; message: string }> };
        if (apiBody.details) {
          const next: Record<string, string> = {};
          for (const d of apiBody.details) next[d.field] = d.message;
          setFieldErrors(next);
          return;
        }
        setError(apiBody.error ?? `api error ${err.status}`);
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Box sx={{ flex: 1, overflowY: "auto" }}>
      <Container maxWidth="sm" sx={{ py: 3 }}>
        <Typography variant="h5" sx={{ mb: 0.5 }}>
          New observation
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Record where a vessel was last seen. Submitting will refresh that vessel's current position.
        </Typography>

        <Paper variant="outlined" sx={{ p: 3 }}>
          {vesselsError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Failed to load vessel list: {vesselsError}
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={onSubmit}>
            <Stack spacing={2}>
              <TextField
                select
                label="Vessel"
                value={vesselId}
                onChange={(e) => setVesselId(e.target.value)}
                required
                disabled={vesselsLoading}
                error={Boolean(fieldErrors.vesselId)}
                helperText={fieldErrors.vesselId ?? (vesselsLoading ? "loading vessels…" : undefined)}
                slotProps={{ select: { MenuProps: { PaperProps: { sx: { maxHeight: 360 } } } } }}
              >
                {sortedVessels.map((v) => (
                  <MenuItem key={v.id} value={v.id}>
                    {v.name} {v.pennantNumber ? `(${v.pennantNumber})` : ""} — {v.country}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Observed at"
                type="datetime-local"
                value={observedAtLocal}
                onChange={(e) => setObservedAtLocal(e.target.value)}
                required
                slotProps={{ inputLabel: { shrink: true } }}
                error={Boolean(fieldErrors.observedAt)}
                helperText={fieldErrors.observedAt}
              />

              <Grid container spacing={2}>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    fullWidth
                    label="Latitude"
                    type="number"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    required
                    inputMode="decimal"
                    slotProps={{ htmlInput: { step: "0.0001", min: -90, max: 90 } }}
                    error={Boolean(fieldErrors.lat)}
                    helperText={fieldErrors.lat ?? "-90 to 90"}
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    fullWidth
                    label="Longitude"
                    type="number"
                    value={lon}
                    onChange={(e) => setLon(e.target.value)}
                    required
                    inputMode="decimal"
                    slotProps={{ htmlInput: { step: "0.0001", min: -180, max: 180 } }}
                    error={Boolean(fieldErrors.lon)}
                    helperText={fieldErrors.lon ?? "-180 to 180"}
                  />
                </Grid>
              </Grid>

              <TextField
                select
                label="Source type"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as SourceTypeOption)}
                required
                error={Boolean(fieldErrors.sourceType)}
                helperText={fieldErrors.sourceType}
              >
                {SOURCE_TYPES.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Source name (optional)"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="e.g. Norfolk pier photo"
              />

              <TextField
                label="Source URL (optional)"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
              />

              <TextField
                label="Confidence"
                type="number"
                value={confidence}
                onChange={(e) => setConfidence(e.target.value)}
                required
                inputMode="decimal"
                slotProps={{ htmlInput: { step: "0.05", min: 0, max: 1 } }}
                error={Boolean(fieldErrors.confidence)}
                helperText={fieldErrors.confidence ?? "0 to 1 — how reliable is this sighting"}
              />

              <TextField
                label="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                multiline
                minRows={2}
              />

              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button variant="text" onClick={() => navigate(-1)} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" variant="contained" disabled={submitting || vesselsLoading}>
                  {submitting ? <CircularProgress size={18} /> : "Save observation"}
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
