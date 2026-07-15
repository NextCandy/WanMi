import { lazy, Suspense } from "react";

import { PublicPage } from "./pages/public/PublicPage";

const AdminApp = lazy(() => import("./pages/admin/AdminApp").then((module) => ({ default: module.AdminApp })));

function RouteLoading() {
  return <div className="app-loading"><span className="brand-mark">玩</span><p>正在打开玩米…</p></div>;
}

export function App() {
  const path = window.location.pathname;
  if (path.startsWith("/admin")) return <Suspense fallback={<RouteLoading />}><AdminApp /></Suspense>;
  if (path.startsWith("/d/")) {
    const name = decodeURIComponent(path.slice(3)).trim().toLowerCase();
    if (name) {
      window.location.replace(`/?q=${encodeURIComponent(name)}`);
      return <RouteLoading />;
    }
  }
  return <PublicPage />;
}
