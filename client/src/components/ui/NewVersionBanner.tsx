import { UnstyledButton } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import classes from "../../assets/styles/NewVersionBanner.module.css";

// "Nouvelle version disponible": a newer build was put in place on the server
// while this page still runs the previous one. The build writes its
// identifier in version.json (vite.config.ts); the page rereads it now and
// then, when the tab or the window comes back to the foreground, and when the
// event stream reconnects — a deployment restarts the API once the new files
// are in place (App.tsx). A click reloads.

// True: shown at all times, to see it while working on it.
const ALWAYS_SHOW = false;

const CHECK_EVERY_MS = 5 * 60 * 1000;

/** Sent on window when the event stream reconnects after a cut (App.tsx). */
export const STREAM_RESUMED_EVENT = "milo:stream-resumed";

const useNewVersion = (): boolean => {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    // In development, no version.json: Vite reloads by itself.
    if (import.meta.env.DEV || available) return;
    let stopped = false;
    const check = async () => {
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const { build } = (await response.json()) as { build?: string };
        if (!stopped && build && build !== __BUILD_ID__) setAvailable(true);
      } catch {
        /* offline or mid-deployment: next time */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onSignal = () => void check();
    const timer = window.setInterval(onSignal, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onSignal);
    window.addEventListener(STREAM_RESUMED_EVENT, onSignal);
    void check();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onSignal);
      window.removeEventListener(STREAM_RESUMED_EVENT, onSignal);
    };
  }, [available]);
  return available;
};

export default function NewVersionBanner() {
  const available = useNewVersion();
  if (!available && !ALWAYS_SHOW) return null;
  return (
    <UnstyledButton
      className={classes.banner}
      onClick={() => window.location.reload()}
      title="Recharger la page"
    >
      <IconRefresh size={14} stroke={2} />
      Nouvelle version disponible
    </UnstyledButton>
  );
}
