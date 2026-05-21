# Naval Vessel Tracker

Web application for tracking the last known and inferred movement of major naval vessels around the world.

The app represents vessel movement as evidence-backed observations with explicit confidence levels and track-status states. It does not claim real-time tracking — naval vessels often disable AIS, transmit intermittently, or are observed only through non-AIS sources.

## Status

Pre-MVP. See [docs/naval-vessel-tracker-mvp-spec.md](docs/naval-vessel-tracker-mvp-spec.md) for the full specification and implementation milestones.

## Stack

- React + Vite + TypeScript (web, port `6731`)
- Express + TypeScript (API, port `6732`)
- PostgreSQL 16 + PostGIS (via Docker Compose)
- MapLibre GL for the map view
- Plain Node worker for AIS ingestion
- pnpm workspaces

## Non-goals

OSINT-style situational awareness only. No predictive targeting, no classified data, no submarine tracking claims. See spec §18.
