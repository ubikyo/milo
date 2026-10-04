import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";

// A burst of confetti, released above a point on the screen. The pieces fall
// while spinning, drift to either side, then fade away.
const COUNT = 90;
// Duration of the longest fall, start delay included: beyond that, the burst
// has nothing left to show and removes itself.
const DURATION_MAX = 2600;

// The confetti borrow the palette's solid colors: a bit of everything, and
// nothing that clashes with the rest of the application.
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

// Custom properties ("--dx") are not part of CSSProperties: React accepts them,
// TypeScript does not know them.
type StyleWithVariables = CSSProperties & Record<`--${string}`, string | number>;

interface ConfettiProps {
  x: number;
  y: number;
  width: number;
  onDone: () => void;
}

export default function Confetti({ x, y, width, onDone }: ConfettiProps) {
  // Each piece has its own start, target, size and spin: drawn once and for
  // all, otherwise they would change on every render. Randomness is the whole
  // point here — an identical burst every time would not be a burst — and it is
  // enclosed in a "useMemo" that only replays on width change.
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
          // The piece starts above the list and falls, drifting to the left or
          // to the right.
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

  // The burst removes itself. The callback is kept in a ref: it changes on
  // every render of the board, and would reset the count. The ref is updated in
  // an effect and not during render, which must stay free of side effects.
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
