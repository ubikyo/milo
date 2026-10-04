import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { DETACH, DETACH_SPREAD, detachInterface } from "../../lib/chuteInterface";
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
const VOLLEYS = [0.2, 0.5, 0.8];
const BURSTS_GAP = 250;

// Et il pleut des Jérôme.
const DROP = "Jérôme ❤️";
const JEROMES = 45;
const JEROME_DURATION = 5600;
const JEROME_COLORS = ["red", "orange", "yellow", "green", "teal", "blue", "violet", "pink"].map(
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

const random = (min: number, max: number): number => min + Math.random() * (max - min);

// Les propriétés personnalisées (« --dx ») ne figurent pas dans CSSProperties.
type StyleWithVariables = CSSProperties & Record<`--${string}`, string | number>;

function JeromeRain({ onDone }: { onDone: () => void }) {
  const drops = useMemo(
    () =>
      Array.from({ length: JEROMES }, (_, i) => ({
        id: i,
        x: random(0, 90),
        size: random(14, 34),
        color: JEROME_COLORS[Math.floor(random(0, JEROME_COLORS.length))],
        de: random(-30, 30),
        to: random(-200, 200),
        dx: random(-80, 80),
        fall: window.innerHeight + 60,
        duration: random(2500, 4000),
        late: random(0, 1500),
      })),
    [],
  );

  const finished = useRef(onDone);
  useEffect(() => {
    finished.current = onDone;
  }, [onDone]);
  useEffect(() => {
    const t = setTimeout(() => finished.current(), JEROME_DURATION);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 500, overflow: "hidden" }}
    >
      <style>{JEROME_ANIMATIONS}</style>
      {drops.map((g) => (
        <span
          key={g.id}
          style={{
            position: "absolute",
            left: `${g.x}%`,
            top: 0,
            fontSize: g.size,
            fontWeight: 800,
            color: g.color,
            whiteSpace: "nowrap",
            opacity: 0,
            "--de": `${g.de}deg`,
            "--vers": `${g.to}deg`,
            "--dx": `${g.dx}px`,
            "--bas": `${g.fall}px`,
            animation: `milo-jerome-chute ${g.duration}ms ease-in ${g.late}ms forwards`,
          } as StyleWithVariables}
        >
          {DROP}
        </span>
      ))}
    </div>
  );
}

/** Une saisie en cours : le code ne s'y lit pas, on y écrit des flèches et des lettres. */
const inInput = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

// Le temps que l'interface sorte du mode modification avant de tomber : elle
// doit tomber telle qu'on la voit d'ordinaire.
const EXIT_DURATION = 350;

interface KonamiCodeProps {
  /** L'interface est en cours de modification. */
  enModification: boolean;
  onQuitterModification: () => void;
}

export default function KonamiCode({ enModification, onQuitterModification }: KonamiCodeProps) {
  // Lus depuis l'écoute du clavier, posée une fois pour toutes : par référence.
  const modification = useRef({ enModification, onQuitterModification });
  useEffect(() => {
    modification.current = { enModification, onQuitterModification };
  }, [enModification, onQuitterModification]);
  // Les dernières touches, autant que le code en compte : le code est trouvé
  // quand elles le forment — même précédé d'une flèche de trop.
  const keys = useRef<string[]>([]);
  const counter = useRef(0);
  const [volleys, setVolleys] = useState<{ key: number; x: number }[]>([]);
  const [rains, setRainDrops] = useState<number[]>([]);

  useEffect(() => {
    const timeouts: number[] = [];
    // Une fête à la fois : le code retapé pendant la chute n'y change rien.
    let ongoing = false;
    const onKeyDown = (e: KeyboardEvent) => {
      if (inInput(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      keys.current = [...keys.current, e.key].slice(-CODE.length);
      if (keys.current.join() !== CODE.join()) return;
      keys.current = [];
      if (ongoing) return;
      ongoing = true;

      // En modification, on en sort d'abord, et l'on attend que l'écran
      // ordinaire soit revenu.
      const { enModification: toLeave, onQuitterModification: leave } = modification.current;
      if (toLeave) leave();
      timeouts.push(
        window.setTimeout(() => detach(), toLeave ? EXIT_DURATION : 0),
      );
    };

    // L'interface tombe d'abord ; la fête commence quand l'écran est vide, et
    // elle revient quand la pluie s'achève.
    const detach = () => {
      const remind = detachInterface();
      const celebration = DETACH + DETACH_SPREAD;
      timeouts.push(
        window.setTimeout(() => celebrate(), celebration),
        window.setTimeout(() => {
          remind();
          ongoing = false;
        }, celebration + JEROME_DURATION - 600),
      );
    };

    const celebrate = () => {
      notifications.show({
        title: "Milo",
        message: "Fabriqué avec amour par Jérôme",
        color: "teal",
      });
      const rain = counter.current++;
      setRainDrops((p) => [...p, rain]);
      VOLLEYS.forEach((part, i) => {
        timeouts.push(
          window.setTimeout(() => {
            // « x » est le bord gauche de la salve : on la centre sur son point.
            const largeur = window.innerWidth / VOLLEYS.length;
            const x = window.innerWidth * part - largeur / 2;
            setVolleys((s) => [...s, { key: counter.current++, x }]);
          }, i * BURSTS_GAP),
        );
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      timeouts.forEach((m) => window.clearTimeout(m));
    };
  }, []);

  return (
    <>
      {volleys.map((s) => (
        <Confetti
          key={s.key}
          x={s.x}
          y={0}
          width={window.innerWidth / VOLLEYS.length}
          onDone={() => setVolleys((list) => list.filter((l) => l.key !== s.key))}
        />
      ))}
      {rains.map((key) => (
        <JeromeRain key={key} onDone={() => setRainDrops((p) => p.filter((c) => c !== key))} />
      ))}
    </>
  );
}
