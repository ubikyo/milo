import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";

// Une salve de confettis, lâchée au-dessus d'un point de l'écran. Les pièces
// descendent en tournoyant, dérivent de part et d'autre, puis s'effacent.
const COUNT = 90;
// Durée de la plus longue chute, retard de départ compris : au-delà, la salve
// n'a plus rien à montrer et se retire.
const DURATION_MAX = 2600;

// Les confettis empruntent les couleurs pleines de la palette : de tout, et
// rien qui jure avec le reste de l'application.
const COLORS = [
  "red",
  "orange",
  "yellow",
  "lime",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "grape",
  "pink",
].map((c) => `var(--mantine-color-${c}-filled)`);

const ANIMATIONS = `
@keyframes milo-confetti-fall {
  0%   { transform: translate3d(0, var(--top), 0); opacity: 0; }
  10%  { opacity: 1; }
  85%  { opacity: 1; }
  100% { transform: translate3d(var(--dx), var(--fall), 0); opacity: 0; }
}
@keyframes milo-confetti-spin {
  to { transform: rotate3d(var(--ax), var(--ay), 0.4, 360deg); }
}
`;

const random = (min: number, max: number): number => min + Math.random() * (max - min);
const pickFrom = <T,>(values: readonly T[]): T =>
  values[Math.floor(Math.random() * values.length)] as T;

// Les propriétés personnalisées (« --dx ») ne figurent pas dans CSSProperties :
// React les accepte, TypeScript ne les connaît pas.
type StyleWithVariables = CSSProperties & Record<`--${string}`, string | number>;

interface ConfettiProps {
  x: number;
  y: number;
  width: number;
  onDone: () => void;
}

export default function Confetti({ x, y, width, onDone }: ConfettiProps) {
  // Chaque pièce a son départ, sa cible, sa taille et son tournoiement : tirés
  // une fois pour toutes, sinon ils changeraient à chaque rendu. Le hasard est
  // ici le propos — une salve identique à chaque fois ne serait pas une salve —
  // et il est enfermé dans un « useMemo » qui ne se rejoue qu'à la largeur.
  const pieces = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => {
        const pieceWidth = random(5, 11);
        return {
          id: i,
          start: random(10, 90),
          color: pickFrom(COLORS),
          pieceWidth,
          height: pieceWidth * random(0.4, 1),
          circle: Math.random() < 0.25,
          // La pièce part au-dessus de la liste et descend, en dérivant vers
          // la gauche ou vers la droite.
          dx: random(-width * 0.6, width * 0.6),
          top: random(-210, -80),
          fall: random(140, 400),
          duration: random(1500, 2200),
          late: random(0, 400),
          spin: random(400, 1100),
          ax: Math.round(random(0, 1)),
          ay: Math.round(random(0, 1)),
        };
      }),
    [width],
  );

  // La salve se retire d'elle-même. Le rappel est gardé dans une référence :
  // il change à chaque rendu du tableau, et remettrait le compte à zéro. La
  // référence se met à jour par effet et non pendant le rendu, qui doit rester
  // sans effet de bord.
  const finished = useRef(onDone);
  useEffect(() => {
    finished.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const t = setTimeout(() => finished.current(), DURATION_MAX);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        left: x,
        top: y,
        width,
        height: 0,
        pointerEvents: "none",
        zIndex: 500,
      }}
    >
      <style>{ANIMATIONS}</style>
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.start}%`,
            top: 0,
            opacity: 0,
            "--dx": `${p.dx}px`,
            "--top": `${p.top}px`,
            "--fall": `${p.fall}px`,
            animation: `milo-confetti-fall ${p.duration}ms linear ${p.late}ms forwards`,
          } as StyleWithVariables}
        >
          <span
            style={{
              display: "block",
              width: p.pieceWidth,
              height: p.height,
              backgroundColor: p.color,
              borderRadius: p.circle ? "50%" : 1,
              "--ax": p.ax,
              "--ay": p.ay,
              animation: `milo-confetti-spin ${p.spin}ms linear infinite`,
            } as StyleWithVariables}
          />
        </span>
      ))}
    </div>
  );
}
