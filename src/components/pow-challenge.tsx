"use client";

import { useEffect, useRef } from "react";

async function sha256Bits(input: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
}

function zeroBits(b: Uint8Array): number {
  let n = 0;
  for (const byte of b) {
    if (byte === 0) { n += 8; continue; }
    return n + Math.clz32(byte) - 24;
  }
  return n;
}

async function solve(token: string, signal: { cancelled: boolean }): Promise<string | null> {
  const d = Number(token.split(".")[2]);
  for (let i = 0; !signal.cancelled; i++) {
    if (zeroBits(await sha256Bits(`${token}:${i}`)) >= d) return String(i);
  }
  return null;
}

/**
 * Invisible bot challenge (spec §8C.4). Fetches a proof-of-work challenge,
 * solves it in the background and adds it to the surrounding form. A submit
 * before it's solved waits for it; after each submit a new challenge is fetched.
 */
export function PowChallenge({ purpose }: { purpose: "signup" | "login" | "reset" | "recover" | "invite" }) {
  const tokenRef = useRef<HTMLInputElement>(null);
  const solRef = useRef<HTMLInputElement>(null);
  const ready = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const signal = { cancelled: false };
    const load = () => {
      ready.current = (async () => {
        const r = await fetch(`/api/challenge?purpose=${purpose}`, { cache: "no-store" });
        const { token } = (await r.json()) as { token?: string };
        if (!token) return;
        const solution = await solve(token, signal);
        if (solution !== null && tokenRef.current && solRef.current) {
          tokenRef.current.value = token;
          solRef.current.value = solution;
        }
      })().catch(() => {});
    };
    load();
    const form = tokenRef.current?.form;
    if (!form) return;
    let waiting = false;
    const onSubmit = (e: SubmitEvent) => {
      if (solRef.current?.value) {
        // Let this submission through (React reads the form data now), then prepare the next challenge.
        setTimeout(() => {
          if (tokenRef.current && solRef.current) tokenRef.current.value = solRef.current.value = "";
          load();
        }, 0);
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (waiting) return;
      waiting = true;
      const submitter = e.submitter;
      void ready.current?.then(() => {
        waiting = false;
        if (solRef.current?.value) form.requestSubmit(submitter instanceof HTMLButtonElement ? submitter : undefined);
      });
    };
    form.addEventListener("submit", onSubmit, true);
    return () => {
      signal.cancelled = true;
      form.removeEventListener("submit", onSubmit, true);
    };
  }, [purpose]);

  return (
    <>
      <input ref={tokenRef} type="hidden" name="pow_token" defaultValue="" />
      <input ref={solRef} type="hidden" name="pow_solution" defaultValue="" />
    </>
  );
}
