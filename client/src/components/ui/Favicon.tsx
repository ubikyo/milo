import { useComputedColorScheme } from "@mantine/core";
import { useEffect } from "react";

// La favicon suit le thème réellement appliqué (y compris « System ») :
// la déclinaison inversée est claire, donc lisible sur un onglet sombre.
export default function Favicon() {
  const scheme = useComputedColorScheme("light", { getInitialValueInEffect: false });

  useEffect(() => {
    const href = scheme === "dark" ? "/Milo-Inv-2.svg" : "/Milo-2.svg";
    let link = document.querySelector("link[rel='icon']");
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
