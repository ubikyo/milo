import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { DECROCHAGE, DECROCHAGE_ETALEMENT, decrocherLInterface } from "../../lib/chuteInterface";
import Confetti from "./Confetti";

// Une surprise pour qui connaît le code : ↑ ↑ ↓ ↓ ← ← → →, tapé n'importe
// où dans l'application. Toute l'interface se décroche et tombe ; trois salves
// de confettis tombent du haut de l'écran, il pleut des Jérôme et Milo signe son
// auteur ; puis l'interface revient. Rien ne s'enregistre, rien ne
// change : c'est un clin d'œil, pas une fonction.
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

// Les salves partent de trois points du haut de l'écran, l'une après l'autre.
const SALVES = [0.2, 0.5, 0.8];
const ECART_SALVES = 250;

// Et il pleut des Jérôme.
const GOUTTE = "Jérôme ❤️";
const JEROMES = 45;
const JEROME_DUREE = 5600;
const JEROME_COULEURS = ["red", "orange", "yellow", "green", "teal", "blue", "violet", "pink"].map(
  (c) => `var(--mantine-color-${c}-filled)`,
);
const JEROME_ANIMATIONS = `
@keyframes milo-jerome-chute {
  0%   { transform: translate3d(0, -60px, 0) rotate(var(--de)); opacity: 0; }
  8%   { opacity: 1; }
  90%  { opacity: 1; }
  100% { transform: translate3d(var(--dx), var(--bas), 0) rotate(var(--vers)); opacity: 0; }
}
`;

const alea = (min: number, max: number): number => min + Math.random() * (max - min);

// Les propriétés personnalisées (« --dx ») ne figurent pas dans CSSProperties.
type StyleAvecVariables = CSSProperties & Record<`--${string}`, string | number>;

function PluieDeJerome({ onDone }: { onDone: () => void }) {
  const gouttes = useMemo(
    () =>
      Array.from({ length: JEROMES }, (_, i) => ({
        id: i,
        x: alea(0, 90),
        taille: alea(14, 34),
        couleur: JEROME_COULEURS[Math.floor(alea(0, JEROME_COULEURS.length))],
        de: alea(-30, 30),
        vers: alea(-200, 200),
        dx: alea(-80, 80),
        bas: window.innerHeight + 60,
        duree: alea(2500, 4000),
        retard: alea(0, 1500),
      })),
    [],
  );

  const fini = useRef(onDone);
  useEffect(() => {
    fini.current = onDone;
  }, [onDone]);
  useEffect(() => {
    const t = setTimeout(() => fini.current(), JEROME_DUREE);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 500, overflow: "hidden" }}
    >
      <style>{JEROME_ANIMATIONS}</style>
      {gouttes.map((g) => (
        <span
          key={g.id}
          style={{
            position: "absolute",
            left: `${g.x}%`,
            top: 0,
            fontSize: g.taille,
            fontWeight: 800,
            color: g.couleur,
            whiteSpace: "nowrap",
            opacity: 0,
            "--de": `${g.de}deg`,
            "--vers": `${g.vers}deg`,
            "--dx": `${g.dx}px`,
            "--bas": `${g.bas}px`,
            animation: `milo-jerome-chute ${g.duree}ms ease-in ${g.retard}ms forwards`,
          } as StyleAvecVariables}
        >
          {GOUTTE}
        </span>
      ))}
    </div>
  );
}

/** Une saisie en cours : le code ne s'y lit pas, on y écrit des flèches et des lettres. */
const enSaisie = (cible: EventTarget | null): boolean =>
  cible instanceof HTMLElement &&
  (cible.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName));

// Le temps que l'interface sorte du mode modification avant de tomber : elle
// doit tomber telle qu'on la voit d'ordinaire.
const SORTIE_DE_MODIFICATION = 350;

interface CodeKonamiProps {
  /** L'interface est en cours de modification. */
  enModification: boolean;
  onQuitterModification: () => void;
}

export default function CodeKonami({ enModification, onQuitterModification }: CodeKonamiProps) {
  // Lus depuis l'écoute du clavier, posée une fois pour toutes : par référence.
  const modification = useRef({ enModification, onQuitterModification });
  useEffect(() => {
    modification.current = { enModification, onQuitterModification };
  }, [enModification, onQuitterModification]);
  // Les dernières touches, autant que le code en compte : le code est trouvé
  // quand elles le forment — même précédé d'une flèche de trop.
  const touches = useRef<string[]>([]);
  const compteur = useRef(0);
  const [salves, setSalves] = useState<{ cle: number; x: number }[]>([]);
  const [pluies, setPluies] = useState<number[]>([]);

  useEffect(() => {
    const minuteries: number[] = [];
    // Une fête à la fois : le code retapé pendant la chute n'y change rien.
    let enCours = false;
    const onKeyDown = (e: KeyboardEvent) => {
      if (enSaisie(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      touches.current = [...touches.current, e.key].slice(-CODE.length);
      if (touches.current.join() !== CODE.join()) return;
      touches.current = [];
      if (enCours) return;
      enCours = true;

      // En modification, on en sort d'abord, et l'on attend que l'écran
      // ordinaire soit revenu.
      const { enModification: aQuitter, onQuitterModification: quitter } = modification.current;
      if (aQuitter) quitter();
      minuteries.push(
        window.setTimeout(() => decrocher(), aQuitter ? SORTIE_DE_MODIFICATION : 0),
      );
    };

    // L'interface tombe d'abord ; la fête commence quand l'écran est vide, et
    // elle revient quand la pluie s'achève.
    const decrocher = () => {
      const rappeler = decrocherLInterface();
      const fete = DECROCHAGE + DECROCHAGE_ETALEMENT;
      minuteries.push(
        window.setTimeout(() => feter(), fete),
        window.setTimeout(() => {
          rappeler();
          enCours = false;
        }, fete + JEROME_DUREE - 600),
      );
    };

    const feter = () => {
      notifications.show({
        title: "Milo",
        message: "Fabriqué avec amour par Jérôme",
        color: "teal",
      });
      const pluie = compteur.current++;
      setPluies((p) => [...p, pluie]);
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
      {pluies.map((cle) => (
        <PluieDeJerome key={cle} onDone={() => setPluies((p) => p.filter((c) => c !== cle))} />
      ))}
    </>
  );
}
