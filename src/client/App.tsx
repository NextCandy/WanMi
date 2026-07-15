import { lazy, Suspense } from "react";

import { PublicPage } from "./pages/public/PublicPage";

const AdminApp = lazy(() => import("./pages/admin/AdminApp").then((module) => ({ default: module.AdminApp })));
const DomainDetailPage = lazy(() => import("./pages/public/DomainDetailPage").then((module) => ({ default: module.DomainDetailPage })));

function RouteLoading() {
  return <div className="app-loading"><span className="brand-mark">玩</span><p>正在打开玩米…</p></div>;
}

export function App() {
  const path = window.location.pathname;
  if (path.startsWith("/admin")) return <Suspense fallback={<RouteLoading />}><AdminApp /></Suspense>;
  if (path.startsWith("/d/")) {
    const name = decodeURIComponent(path.slice(3)).trim().toLowerCase();
    if (name) return <Suspense fallback={<RouteLoading />}><DomainDetailPage name={name} /></Suspense>;
  }
  return <PublicPage />;
}
