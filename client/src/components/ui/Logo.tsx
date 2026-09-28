import { useComputedColorScheme } from "@mantine/core";
import milo1 from "../../assets/media/Milo-1.svg";
import milo1Inv from "../../assets/media/Milo-Inv-1.svg";
import milo2 from "../../assets/media/Milo-2.svg";
import milo2Inv from "../../assets/media/Milo-Inv-2.svg";

// Variante 1 (435×490) pour l'écran de connexion, variante 2 (435×330) pour le
// header ; la déclinaison « Inv » est destinée au thème sombre.
const SOURCES = {
  1: { light: milo1, dark: milo1Inv },
  2: { light: milo2, dark: milo2Inv },
};

export default function Logo({ variant = 2, h = 40 }) {
  // `colorScheme` peut valoir "auto" : on lit le thème réellement appliqué.
  // getInitialValueInEffect: false pour éviter d'afficher brièvement le
  // mauvais logo au premier rendu.
  const scheme = useComputedColorScheme("light", { getInitialValueInEffect: false });

  // Les SVG sont en width/height 100% : on impose la hauteur et on laisse la
  // largeur suivre le ratio, sinon l'image occupe toute la largeur disponible.
  return (
    <img src={SOURCES[variant][scheme]} alt="Milo" style={{ height: h, width: "auto", display: "block" }} />
  );
}
