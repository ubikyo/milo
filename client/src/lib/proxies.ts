import { useCallback, useEffect, useState } from "react";
import type { MiloProxy } from "@milo/shared";
import { api } from "../api";

// The proxies of "Paramétrage" > "Proxy" (shared/proxies.ts), read where they
// are shown — their tab, the printers' — and read again when the server says
// they changed: one connecting, or lost (App.tsx).

const PROXIES_EVENT = "milo:proxies";

/** The server signalled a change of the proxies: whoever shows them re-reads. */
export const announceProxies = (): void => {
  window.dispatchEvent(new Event(PROXIES_EVENT));
};

/**
 * The proxies, kept up to date: "reload" reads them again — after a write
 * from this page, without waiting for the server's signal.
 */
export function useProxies(onError?: (e: unknown) => void) {
  const [proxies, setProxies] = useState<MiloProxy[]>([]);
  const reload = useCallback(async () => {
    try {
      setProxies(await api.getProxies());
    } catch (e) {
      onError?.(e);
    }
  }, [onError]);
  useEffect(() => {
    void reload();
    const listener = () => void reload();
    window.addEventListener(PROXIES_EVENT, listener);
    return () => window.removeEventListener(PROXIES_EVENT, listener);
  }, [reload]);
  return { proxies, reload };
}
