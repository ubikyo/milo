import { SegmentedControl } from "@mantine/core";
import { useEffect, useRef } from "react";
import type { Mode } from "@milo/shared";
import { MODES } from "@milo/shared";
import { MODE_SWITCH_TOP, PAGE_GUTTER } from "../../themes/layout";
import { useTabReorder } from "./useTabReorder";

// Pendant du « ? » des raccourcis : même retrait, dans le coin opposé.
interface ModeSwitchProps {
  mode: Mode;
  /** Les modes que le compte voit, dans l'ordre qu'il a rangé : les autres ne s'y montrent pas. */
  modes: Mode[];
  onModeChange: (mode: Mode) => void;
  /** Le nouvel ordre, une fois un mode glissé et déposé. Sans lui, rien ne se glisse. */
  onReorder?: (modes: Mode[]) => void | Promise<void>;
}

/** Le trait d'insertion, posé dans la case visée : rien ne s'insère entre les cases. */
function Trait({ cote }: { cote: "left" | "right" }) {
  return (
    <span
      style={{
        position: "absolute",
        top: -4,
        bottom: -4,
        // La case porte sa propre marge intérieure : le trait en sort pour
        // tomber entre deux modes.
        [cote]: "calc(-1 * var(--sc-padding, 10px) - 1px)",
        borderLeft: "2px solid var(--mantine-color-teal-5)",
      }}
    />
  );
}

// Le sélecteur entier : c'est lui que le glisser parcourt pour trouver le
// rang visé.
const sonSelecteur = (element: HTMLElement) =>
  element.closest<HTMLElement>(".mantine-SegmentedControl-root");

/** Le rayon du cadre, que la pastille et les cases reprennent tel quel. */
const RAYON = "var(--sc-radius, var(--mantine-radius-default))";

export default function ModeSwitch({ mode, modes, onModeChange, onReorder }: ModeSwitchProps) {
  // Les modes se glissent comme les onglets d'une rangée (useTabReorder).
  const { ordered, tabProps, guardChange, insertAt } = useTabReorder(
    modes,
    (m) => m,
    onReorder,
    sonSelecteur,
  );
  // Mantine place la pastille du mode actif d'après la position de sa case,
  // et ne la recalcule pas quand les cases changent d'ordre : le sélecteur
  // est reconstruit à chaque nouvel ordre, la pastille repart de la bonne case.
  const ordre = ordered.join(",");

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
    // Reconstruit à chaque nouvel ordre : c'est le nouvel élément qu'on suit.
  }, [ordre]);

  return (
    <SegmentedControl
      key={ordre}
      ref={commande}
      value={mode}
      onChange={guardChange((value: string) => onModeChange(value as Mode))}
      data={ordered.map((m, index) => ({
        value: m,
        label: (
          <span {...tabProps(m, index, { position: "relative", display: "inline-block" })}>
            {insertAt(index) && <Trait cote="left" />}
            {index === ordered.length - 1 && insertAt(ordered.length) && <Trait cote="right" />}
            {MODES.find((d) => d.value === m)?.label ?? m}
          </span>
        ),
      }))}
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
