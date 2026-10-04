import { useComputedColorScheme } from "@mantine/core";
import { useEffect } from "react";

// The favicon follows the theme actually applied (including "System"): the
// inverted variant is light, hence readable on a dark tab.
export default function Favicon() {
  const scheme = useComputedColorScheme("light", { getInitialValueInEffect: false });

  useEffect(() => {
    const href = scheme === "dark" ? "/Milo-Inv-2.svg" : "/Milo-2.svg";
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/svg+xml";
    link.href = href;
  }, [scheme]);

  return null;
}
