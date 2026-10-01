import { SegmentedControl } from "@mantine/core";
import { useEffect, useRef } from "react";
import type { Mode } from "@milo/shared";
import { MODES } from "@milo/shared";
import { MODE_SWITCH_TOP, PAGE_GUTTER } from "../../themes/layout";

// Pendant du « ? » des raccourcis : même retrait, dans le coin opposé.
interface ModeSwitchProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
}

/** Le rayon du cadre, que la pastille et les cases reprennent tel quel. */
const RAYON = "var(--sc-radius, var(--mantine-radius-default))";

export default function ModeSwitch({ mode, onModeChange }: ModeSwitchProps) {
  // Le contenu de la page s'arrête juste au-dessus : il a besoin de savoir où
  // commence cette commande, et seul le sélecteur le sait. Suivi, car sa
  // hauteur change avec la taille du texte comme avec le nombre de modes.
  const commande = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = commande.current;
    if (!element) return;
    const publier = () =>
      document.documentElement.style.setProperty(
        MODE_SWITCH_TOP,
        `${Math.round(window.innerHeight - element.getBoundingClientRect().top)}px`,
      );
    publier();
    const observateur = new ResizeObserver(publier);
    observateur.observe(element);
    window.addEventListener("resize", publier);
    return () => {
      observateur.disconnect();
      window.removeEventListener("resize", publier);
    };
  }, []);

  return (
    <SegmentedControl
      ref={commande}
      value={mode}
      onChange={(value) => onModeChange(value as Mode)}
      data={MODES.map((m) => ({ value: m.value, label: m.label }))}
      size="sm"
      // Sans traits de séparation entre les modes, sans fond et sans marge
      // intérieure : seule la pastille du mode courant se voit, posée à même
      // la page. Le retrait du cadre, lui, décalait la pastille du bord.
      withItemsBorders={false}
      styles={{
        root: { backgroundColor: "transparent", padding: 0 },
        // Mantine rogne de 4px le rayon de la pastille et des cases, pour
        // qu'elles se logent dans la marge intérieure du cadre. Cette marge
        // ayant été retirée, le rayon rogné ne tomberait plus juste : tous
        // reprennent donc celui du cadre.
        indicator: { borderRadius: RAYON },
        label: { borderRadius: RAYON },
        control: { borderRadius: RAYON },
      }}
      // Aligné sur le retrait du contenu, comme le « ? » du coin opposé.
      style={{ position: "fixed", left: PAGE_GUTTER, bottom: PAGE_GUTTER, zIndex: 200 }}
    />
  );
}
