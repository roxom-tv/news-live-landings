"use client";

import { useState, useTransition } from "react";
import styles from "./page.module.css";

export function AutoRefreshToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const toggle = () => {
    const nextEnabled = !enabled;
    setError("");
    setEnabled(nextEnabled);
    startTransition(async () => {
      const response = await fetch("/landings/api/settings/auto-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled })
      });
      if (!response.ok) {
        setEnabled(!nextEnabled);
        setError(response.status === 401 ? "Admin token required." : "Could not save.");
      }
    });
  };

  return (
    <>
      <button
        className={enabled ? styles.toggleOn : styles.toggleOff}
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={enabled}
      >
        <span>{enabled ? "Auto refresh on" : "Auto refresh off"}</span>
        <strong>{isPending ? "Saving..." : enabled ? "Disable" : "Enable"}</strong>
      </button>
      {error ? <small className={styles.monitorHint}>{error}</small> : null}
    </>
  );
}
