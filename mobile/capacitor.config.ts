import type { CapacitorConfig } from "@capacitor/cli";

// The app is a native shell around the deployed Milo: it loads the server's
// address, so the client keeps its relative /api calls, its session and its
// Entra sign-in exactly as in a browser. Nothing to rebuild in the app when
// Milo is deployed — only the shell itself (icon, name, permissions).
//
// The address is read when running `cap sync`: production by default,
// MILO_URL to point at another server (development, staging).
const url = process.env.MILO_URL ?? "https://milo.lesmanufactures.art";

const config: CapacitorConfig = {
  appId: "art.lesmanufactures.milo",
  appName: "Milo",
  // Only shown when the server cannot be reached at launch.
  webDir: "www",
  server: {
    url,
    cleartext: url.startsWith("http://"),
    // Hosts the web view may navigate to without leaving the app: the
    // Microsoft sign-in, which redirects back to Milo. Any other host
    // opens in the system browser.
    allowNavigation: ["login.microsoftonline.com", "login.live.com"],
    errorPath: "offline.html",
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
