import { UnstyledButton } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import classes from "../../assets/styles/NewVersionBanner.module.css";

// "Nouvelle version disponible": a newer build was put in place on the server
// while this page still runs the previous one. The build writes its
// identifier in version.json (vite.config.ts); the page rereads it now and
// then, and when the tab comes back to the foreground. A click reloads.

// True: shown at all times, to see it while working on it.
const ALWAYS_SHOW = false;

const CHECK_EVERY_MS = 5 * 60 * 1000;

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
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    void check();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
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
