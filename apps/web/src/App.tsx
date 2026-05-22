import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { Link, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { MapPage } from "./pages/MapPage";
import { ObservationFormPage } from "./pages/ObservationFormPage";
import { VesselDetailPage } from "./pages/VesselDetailPage";

function NavLink({ to, label }: { to: string; label: string }) {
  const location = useLocation();
  const active = location.pathname === to || location.pathname.startsWith(`${to}/`);
  return (
    <Button
      component={Link}
      to={to}
      size="small"
      color="inherit"
      sx={{
        textTransform: "none",
        opacity: active ? 1 : 0.7,
        borderBottom: active ? "2px solid" : "2px solid transparent",
        borderRadius: 0,
        px: 1.5,
      }}
    >
      {label}
    </Button>
  );
}

function Shell() {
  return (
    <Box sx={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      <AppBar position="static" elevation={0} sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
        <Toolbar variant="dense" sx={{ gap: 2 }}>
          <Typography variant="h6" component={Link} to="/map" sx={{ color: "inherit", textDecoration: "none" }}>
            Naval Vessel Tracker
          </Typography>
          <Box sx={{ flex: 1 }} />
          <NavLink to="/map" label="Map" />
          <NavLink to="/admin/observations/new" label="New observation" />
        </Toolbar>
      </AppBar>
      <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Outlet />
      </Box>
    </Box>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/map" replace />} />
        <Route path="map" element={<MapPage />} />
        <Route path="vessels/:id" element={<VesselDetailPage />} />
        <Route path="admin/observations/new" element={<ObservationFormPage />} />
        <Route path="*" element={<Navigate to="/map" replace />} />
      </Route>
    </Routes>
  );
}
