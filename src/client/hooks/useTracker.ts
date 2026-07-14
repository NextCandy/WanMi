import { useCallback, useEffect } from "react";

type TrackKind = "page_view" | "domain_click" | "lead_submit";

function visitorId(): string {
  const key = "wanmi-visitor-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

export function useTracker(path = window.location.pathname) {
  const track = useCallback((kind: TrackKind, domain?: string) => {
    const body = JSON.stringify({ kind, path, domain, visitor_id: visitorId() });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    else void fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  }, [path]);
  useEffect(() => { track("page_view"); }, [track]);
  return { trackDomainClick: (domain: string) => track("domain_click", domain), trackLeadSubmit: (domain: string) => track("lead_submit", domain) };
}
