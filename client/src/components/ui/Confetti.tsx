import { useEffect, useMemo, useRef } from "react";

// Une salve de confettis, lâchée au-dessus d'un point de l'écran. Les pièces
// descendent en tournoyant, dérivent de part et d'autre, puis s'effacent.
const NOMBRE = 90;
// Durée de la plus longue chute, retard de départ compris : au-delà, la salve
// n'a plus rien à montrer et se retire.
const DUREE_MAX = 2600;

// Les confettis empruntent les couleurs pleines de la palette : de tout, et
// rien qui jure avec le reste de l'application.
const COULEURS = [
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
@keyframes milo-confetti-chute {
  0%   { transform: translate3d(0, var(--haut), 0); opacity: 0; }
  10%  { opacity: 1; }
  85%  { opacity: 1; }
  100% { transform: translate3d(var(--dx), var(--bas), 0); opacity: 0; }
}
@keyframes milo-confetti-pirouette {
  to { transform: rotate3d(var(--ax), var(--ay), 0.4, 360deg); }
}
`;

const alea = (min, max) => min + Math.random() * (max - min);
const parmi = (valeurs) => valeurs[Math.floor(Math.random() * valeurs.length)];

export default function Confetti({ x, y, width, onDone }) {
  // Chaque pièce a son départ, sa cible, sa taille et son tournoiement : tirés
  // une fois pour toutes, sinon ils changeraient à chaque rendu.
  const pieces = useMemo(
    () =>
      Array.from({ length: NOMBRE }, (_, i) => {
        const largeur = alea(5, 11);
        return {
          id: i,
          depart: alea(10, 90),
          couleur: parmi(COULEURS),
          largeur,
          hauteur: largeur * alea(0.4, 1),
          rond: Math.random() < 0.25,
          // La pièce part au-dessus de la liste et descend, en dérivant vers
          // la gauche ou vers la droite.
          dx: alea(-width * 0.6, width * 0.6),
          haut: alea(-210, -80),
          bas: alea(140, 400),
          duree: alea(1500, 2200),
          retard: alea(0, 400),
          pirouette: alea(400, 1100),
          ax: Math.round(alea(0, 1)),
          ay: Math.round(alea(0, 1)),
        };
      }),
    [width],
  );

  // La salve se retire d'elle-même. Le rappel est gardé dans une référence :
  // il change à chaque rendu du tableau, et remettrait le compte à zéro.
  const fini = useRef(onDone);
  fini.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => fini.current(), DUREE_MAX);
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
            left: `${p.depart}%`,
            top: 0,
            opacity: 0,
            "--dx": `${p.dx}px`,
            "--haut": `${p.haut}px`,
            "--bas": `${p.bas}px`,
            animation: `milo-confetti-chute ${p.duree}ms linear ${p.retard}ms forwards`,
          }}
        >
          <span
            style={{
              display: "block",
              width: p.largeur,
              height: p.hauteur,
              backgroundColor: p.couleur,
              borderRadius: p.rond ? "50%" : 1,
              "--ax": p.ax,
              "--ay": p.ay,
              animation: `milo-confetti-pirouette ${p.pirouette}ms linear infinite`,
            }}
          />
        </span>
      ))}
    </div>
  );
}
