import React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import { AnalyticsProvider } from "./context/AnalyticsContext";
import { useAuth } from "./context/AuthContext";
import RequireAuth from "./components/auth/RequireAuth";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Overview from "./pages/Overview";
import Realtime from "./pages/Realtime";
import Events from "./pages/Events";
import FunnelPage from "./pages/FunnelPage";
import Users from "./pages/Users";
import AlertsPage from "./pages/AlertsPage";
import Settings from "./pages/Settings";
import AIPage from "./pages/AI";

function AuthedProviders() {
  return (
    <AnalyticsProvider>
      <Outlet />
    </AnalyticsProvider>
  );
}

function HomeRoute() {
  const { isAuthenticated, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-bg-base grid-bg flex items-center justify-center p-6">
        <div className="rounded-2xl border border-bg-border bg-bg-card px-6 py-5 text-center card-glow">
          <p className="text-[10px] font-mono uppercase tracking-[0.24em] text-text-muted">Quantum Stars</p>
          <p className="mt-2 text-sm text-text-primary">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <AnalyticsProvider>
        <Overview />
      </AnalyticsProvider>
    );
  }

  return <Landing />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<RequireAuth />}>
        <Route element={<AuthedProviders />}>
          <Route path="/realtime" element={<Realtime />} />
          <Route path="/events" element={<Events />} />
          <Route path="/funnel" element={<FunnelPage />} />
          <Route path="/users" element={<Users />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/ai" element={<AIPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
