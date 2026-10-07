// Milo's own address, as people reach it: the root of the links the e-mails
// carry, where Microsoft notifies Milo and sends sign-ins back. Set in
// "Paramétrage" > "Entra"; unset, the one the server is started with
// (MILO_PUBLIC_URL) applies.

import type { MiloSettings } from "@milo/shared";
import { env } from "../env.js";
import { badRequest } from "./http.js";
import { readSetting, writeSetting } from "../repositories/settings.js";

const SETTING = "milo_url";

/** Without its trailing slashes: paths are appended to it. */
const trimmed = (url: string): string => url.trim().replace(/\/+$/, "");

/** Milo's address, or empty when neither the Settings nor the server give one. */
export const miloUrl = (): string => readSetting<string>(SETTING, "") || env.publicUrl;

export const miloSettings = (): MiloSettings => ({
  url: readSetting<string>(SETTING, ""),
  fallback: env.publicUrl,
});

/** Saved only as an http(s) address; empty, the server's applies again. */
export const saveMiloUrl = (url: string): void => {
  const address = trimmed(url);
  if (address) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(address);
    } catch {
      // Refused below.
    }
    if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) {
      badRequest("L'adresse de Milo doit commencer par https:// ou http://");
    }
  }
  writeSetting(SETTING, address);
};
