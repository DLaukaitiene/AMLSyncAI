"use client";

import { useEffect } from "react";

/**
 * Closes an open (?) note when you click or tap anywhere outside it, or press Escape.
 * Opening one note closes any other. Mounted once in the root layout, so it works on every page.
 */
export function HelpAutoClose() {
  useEffect(() => {
    const open = () => Array.from(document.querySelectorAll<HTMLDetailsElement>('details[data-testid="help"][open]'));
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      for (const d of open()) if (!d.contains(t)) d.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") for (const d of open()) d.open = false;
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
}
