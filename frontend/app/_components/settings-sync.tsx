"use client";

import { useLayoutEffect } from "react";
import { DARK_QUERY, applySettings, getSettings, subscribeSettings } from "@/lib/settings";

// Keeps <html> in step with the settings after the inline script's first pass: on every change
// (this tab or another), when the OS theme changes (it only matters for SYSTEM), and again after
// the dev-only Strict Mode remount, which resets <html> to what React renders. Shows nothing.
export default function SettingsSync() {
  useLayoutEffect(() => {
    const apply = () => applySettings(getSettings());
    const media = window.matchMedia(DARK_QUERY);
    apply();
    media.addEventListener("change", apply);
    const unsubscribe = subscribeSettings(apply);
    return () => {
      media.removeEventListener("change", apply);
      unsubscribe();
    };
  }, []);
  return null;
}
