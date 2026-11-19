"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Cookieless page-view beacon for the app's public pages (Backoffice §7.6). Never used inside the app or portal. */
export function WebBeacon() {
  const path = usePathname();
  useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return;
    const q = new URLSearchParams(location.search);
    const body = JSON.stringify({ path, ref: document.referrer, us: q.get("utm_source") ?? "", um: q.get("utm_medium") ?? "", uc: q.get("utm_campaign") ?? "", lang: navigator.language?.slice(0, 10) ?? "" });
    fetch("/api/t", { method: "POST", body, keepalive: true }).catch(() => {});
  }, [path]);
  return null;
}
