import { notifications } from "@mantine/notifications";
import { useEffect, useRef, useState } from "react";
import Confetti from "./Confetti";

// Une surprise pour qui connaît le code : ↑ ↑ ↓ ↓ ← ← → →, tapé n'importe
// où dans l'application. Trois salves de confettis tombent du haut de l'écran,
// et Milo dit un mot. Rien ne s'enregistre, rien ne change : c'est un clin
// d'œil, pas une fonction.
const CODE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowLeft",
  "ArrowRight",
  "ArrowRight",
];

// Ce que Milo répond, tiré au hasard à chaque fois.
const MOTS = [
  "Trente vies de plus. Les tickets, eux, sont toujours là.",
  "Mode développeur des années 80 activé.",
  "Bravo ! Vous avez trouvé le seul ticket qui se résout tout seul.",
  "↑ ↑ ↓ ↓ ← ← → → — l'équipe du support vous salue.",
];

// Les salves partent de trois points du haut de l'écran, l'une après l'autre.
const SALVES = [0.2, 0.5, 0.8];
const ECART_SALVES = 250;

/** Une saisie en cours : le code ne s'y lit pas, on y écrit des flèches et des lettres. */
const enSaisie = (cible: EventTarget | null): boolean =>
  cible instanceof HTMLElement &&
  (cible.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName));

export default function CodeKonami() {
  // Les dernières touches, autant que le code en compte : le code est trouvé
  // quand elles le forment — même précédé d'une flèche de trop.
  const touches = useRef<string[]>([]);
  const compteur = useRef(0);
  const [salves, setSalves] = useState<{ cle: number; x: number }[]>([]);

  useEffect(() => {
    const minuteries: number[] = [];
    const onKeyDown = (e: KeyboardEvent) => {
      if (enSaisie(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      touches.current = [...touches.current, e.key].slice(-CODE.length);
      if (touches.current.join() !== CODE.join()) return;
      touches.current = [];

      notifications.show({
        title: "Milo",
        message: MOTS[Math.floor(Math.random() * MOTS.length)],
        color: "teal",
      });
      SALVES.forEach((part, i) => {
        minuteries.push(
          window.setTimeout(() => {
            // « x » est le bord gauche de la salve : on la centre sur son point.
            const largeur = window.innerWidth / SALVES.length;
            const x = window.innerWidth * part - largeur / 2;
            setSalves((s) => [...s, { cle: compteur.current++, x }]);
          }, i * ECART_SALVES),
        );
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      minuteries.forEach((m) => window.clearTimeout(m));
    };
  }, []);

  return (
    <>
      {salves.map((s) => (
        <Confetti
          key={s.cle}
          x={s.x}
          y={0}
          width={window.innerWidth / SALVES.length}
          onDone={() => setSalves((liste) => liste.filter((l) => l.cle !== s.cle))}
        />
      ))}
    </>
  );
}
