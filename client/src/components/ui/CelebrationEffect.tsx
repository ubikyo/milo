import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import Confetti from "./Confetti";

// The celebrations a list can reserve for the card that joins it: each has
// its mark, to be placed anywhere in the list title. A list can
// carry several: they all play together.
export type Effect = "confetti" | "hearts" | "thumbs" | "rocket" | "flames" | "snow" | "lightning";

// The marks are looked up without their variation selector ("❤" rather than
// "❤️"): whether typed as text or as emoji, they are recognized.
// The emoji, for its part, is what the list menu places at the end of the title.
export const MARKS: { mark: string; emoji: string; effect: Effect; label: string }[] = [
  { mark: "✨", emoji: "✨", effect: "confetti", label: "Confettis" },
  { mark: "❤", emoji: "❤️", effect: "hearts", label: "Pluie de cœurs" },
  { mark: "👍", emoji: "👍", effect: "thumbs", label: "Pouces" },
  { mark: "🚀", emoji: "🚀", effect: "rocket", label: "Fusée" },
  { mark: "🔥", emoji: "🔥", effect: "flames", label: "Flammes" },
  { mark: "❄", emoji: "❄️", effect: "snow", label: "Neige" },
  { mark: "⚡", emoji: "⚡", effect: "lightning", label: "Foudre" },
];

/** The celebrations a list title calls for, in the order of the marks. */
export const titleEffects = (title: string): Effect[] =>
  MARKS.filter((m) => title.includes(m.mark)).map((m) => m.effect);

/**
 * Places a celebration's mark at the end of the title, or removes it if it is
 * already there — wherever it is, with its variation selector and the space
 * preceding it.
 */
export const toggleMark = (title: string, effect: Effect): string => {
  const m = MARKS.find((x) => x.effect === effect);
  if (!m) return title;
  if (!title.includes(m.mark)) return `${title.trimEnd()} ${m.emoji}`;
  const withoutMark = title.split(m.mark).map((chunk, i) =>
    // The variation selector follows the mark: it goes with it.
    i > 0 ? chunk.replace(/^\uFE0F/, "") : chunk,
  );
  return withoutMark.join("").replace(/\s{2,}/g, " ").trim();
};

/** A rectangle on screen: the list's, or the card's. */
export interface Zone {
  x: number;
  y: number;
  width: number;
  height: number;
}

const random = (min: number, max: number): number => min + Math.random() * (max - min);
const pickFrom = <T,>(values: readonly T[]): T =>
  values[Math.floor(Math.random() * values.length)] as T;
const color = (c: string) => `var(--mantine-color-${c}-filled)`;

// Custom properties ("--dx") are not in CSSProperties:
// React accepts them, TypeScript does not know them.
type StyleWithVariables = CSSProperties & Record<`--${string}`, string | number>;

/**
 * Removes the effect at the end of its duration. The callback is kept in a ref:
 * it changes on every render of the board, and would reset the count.
 */
function useFinish(onDone: () => void, duration: number) {
  const finished = useRef(onDone);
  useEffect(() => {
    finished.current = onDone;
  }, [onDone]);
  useEffect(() => {
    const t = setTimeout(() => finished.current(), duration);
    return () => clearTimeout(t);
  }, [duration]);
}

/** An effect's layer: laid over the screen, it captures no click. */
function Layer({ style, animations, children }: {
  style: CSSProperties;
  animations: string;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      style={{ position: "fixed", pointerEvents: "none", zIndex: 500, ...style }}
    >
      <style>{animations}</style>
      {children}
    </div>
  );
}

interface EffectProps {
  zone: Zone;
  onDone: () => void;
}

// --- ❤️ Rain of hearts ----------------------------------------------------
const HEARTS_DURATION = 3400;
const HEARTS_ANIMATIONS = `
@keyframes milo-heart-fall {
  0%   { transform: translate3d(0, var(--top), 0); opacity: 0; }
  10%  { opacity: 1; }
  80%  { opacity: 1; }
  100% { transform: translate3d(0, var(--fall), 0); opacity: 0; }
}
@keyframes milo-heart-sway {
  from { transform: translateX(calc(var(--balance) * -1)) rotate(-12deg); }
  to   { transform: translateX(var(--balance)) rotate(12deg); }
}
`;

function Hearts({ zone, onDone }: EffectProps) {
  useFinish(onDone, HEARTS_DURATION);
  const cores = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        start: random(0, 96),
        size: random(12, 26),
        color: color(pickFrom(["red", "pink", "grape"])),
        top: random(-180, -40),
        fall: Math.min(zone.height, 520) * random(0.5, 1),
        duration: random(1900, 2700),
        late: random(0, 600),
        balance: random(6, 18),
        tempo: random(500, 900),
      })),
    [zone.height],
  );
  return (
    <Layer
      style={{ left: zone.x, top: zone.y, width: zone.width, height: 0 }}
      animations={HEARTS_ANIMATIONS}
    >
      {cores.map((c) => (
        <span
          key={c.id}
          style={{
            position: "absolute",
            left: `${c.start}%`,
            top: 0,
            opacity: 0,
            "--top": `${c.top}px`,
            "--fall": `${c.fall}px`,
            animation: `milo-heart-fall ${c.duration}ms ease-in ${c.late}ms forwards`,
          } as StyleWithVariables}
        >
          <svg
            viewBox="0 0 24 24"
            width={c.size}
            height={c.size}
            style={{
              display: "block",
              fill: c.color,
              "--balance": `${c.balance}px`,
              animation: `milo-heart-sway ${c.tempo}ms ease-in-out infinite alternate`,
            } as StyleWithVariables}
          >
            <path d="M12 21.6 10.6 20.3C5.4 15.6 2 12.5 2 8.7 2 5.6 4.4 3.2 7.5 3.2c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1 3.1 0 5.5 2.4 5.5 5.5 0 3.8-3.4 6.9-8.6 11.6z" />
          </svg>
        </span>
      ))}
    </Layer>
  );
}

// --- 👍 Thumbs that appear and disappear ------------------------
const THUMBS_UP_DURATION = 2600;
const THUMBS_UP_ANIMATIONS = `
@keyframes milo-thumb {
  0%   { transform: scale(0) rotate(var(--angle)); opacity: 0; }
  25%  { transform: scale(1.3) rotate(var(--angle)); opacity: 1; }
  40%  { transform: scale(1) rotate(var(--angle)); opacity: 1; }
  75%  { transform: scale(1) rotate(var(--angle)); opacity: 1; }
  100% { transform: translateY(-24px) scale(0.6) rotate(var(--angle)); opacity: 0; }
}
`;

function ThumbsUp({ zone, onDone }: EffectProps) {
  useFinish(onDone, THUMBS_UP_DURATION);
  const thumbsUp = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        x: random(4, 88),
        y: random(0, Math.max(60, Math.min(zone.height, 420) - 40)),
        size: random(22, 40),
        angle: random(-25, 25),
        late: random(0, 1300),
      })),
    [zone.height],
  );
  return (
    <Layer
      style={{ left: zone.x, top: zone.y, width: zone.width, height: 0 }}
      animations={THUMBS_UP_ANIMATIONS}
    >
      {thumbsUp.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: p.y,
            fontSize: p.size,
            lineHeight: 1,
            opacity: 0,
            "--angle": `${p.angle}deg`,
            animation: `milo-thumb 1100ms ease-out ${p.late}ms forwards`,
          } as StyleWithVariables}
        >
          👍
        </span>
      ))}
    </Layer>
  );
}

// --- 🚀 Rocket crossing the screen ---------------------------------------
const ROCKET_CROSSING = 1600;
const ROCKET_SMOKE = 900;
const ROCKET_DURATION = ROCKET_CROSSING + ROCKET_SMOKE;
const ROCKET_ANIMATIONS = `
@keyframes milo-rocket {
  from { transform: translate3d(var(--x0), var(--y0), 0); }
  to   { transform: translate3d(var(--x1), var(--y1), 0); }
}
@keyframes milo-smoke {
  0%   { transform: translate(-50%, -50%) scale(0.3); opacity: 0.8; }
  100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
}
`;

// Neutral gray: the palette's grays lean blue.
const SMOKE = "light-dark(#cfcfcf, #8a8a8a)";

function Rocket({ onDone }: { onDone: () => void }) {
  useFinish(onDone, ROCKET_DURATION);
  // The rocket starts at the bottom left and exits at the top right, in a straight line
  // and at constant speed: the puffs of smoke, sown at regular intervals
  // along the path, thus land right behind it.
  const path = useMemo(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const x0 = -80;
    const y0 = height * random(0.7, 0.95);
    const x1 = width + 80;
    const y1 = height * random(0.02, 0.25);
    const angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
    const n = 28;
    const smoke = Array.from({ length: n }, (_, i) => {
      const f = i / n;
      return {
        id: i,
        x: x0 + (x1 - x0) * f,
        y: y0 + (y1 - y0) * f,
        late: ROCKET_CROSSING * f,
        size: random(14, 24),
      };
    });
    // The emoji already points to the top right, at 45°: only the difference is rotated.
    return { x0, y0, x1, y1, rotation: angle + 45, smoke };
  }, []);

  return (
    <Layer style={{ inset: 0 }} animations={ROCKET_ANIMATIONS}>
      {path.smoke.map((b) => (
        <span
          key={b.id}
          style={{
            position: "absolute",
            left: b.x,
            top: b.y,
            width: b.size,
            height: b.size,
            borderRadius: "50%",
            backgroundColor: SMOKE,
            opacity: 0,
            animation: `milo-smoke ${ROCKET_SMOKE}ms ease-out ${b.late}ms forwards`,
          }}
        />
      ))}
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          "--x0": `${path.x0}px`,
          "--y0": `${path.y0}px`,
          "--x1": `${path.x1}px`,
          "--y1": `${path.y1}px`,
          transform: `translate3d(${path.x0}px, ${path.y0}px, 0)`,
          animation: `milo-rocket ${ROCKET_CROSSING}ms linear forwards`,
        } as StyleWithVariables}
      >
        <span
          style={{
            display: "block",
            fontSize: 48,
            lineHeight: 1,
            transform: `translate(-50%, -50%) rotate(${path.rotation}deg)`,
          }}
        >
          🚀
        </span>
      </span>
    </Layer>
  );
}

// --- 🔥 Flames at the bottom of the card ---------------------------------------
const FLAMES_DURATION = 2600;
const FLAMES_ANIMATIONS = `
@keyframes milo-flame-life {
  0%   { transform: scale(0); opacity: 0; }
  15%  { transform: scale(1); opacity: 1; }
  80%  { transform: scale(1); opacity: 1; }
  100% { transform: scale(0.2); opacity: 0; }
}
@keyframes milo-flame-dance {
  from { transform: scale(0.95, 0.85); }
  to   { transform: scale(0.85, 1.15); }
}
@keyframes milo-spark {
  0%   { transform: translate(0, 0); opacity: 1; }
  100% { transform: translate(var(--dx), var(--rise)); opacity: 0; }
}
`;

// A tongue of fire: a drop pointing up, hot at the core.
const OUTER_FLAME =
  "radial-gradient(circle at 35% 65%, #ffd23f 0%, #ff8a1f 45%, #e8401c 80%, #b8200c 100%)";
const INNER_FLAME =
  "radial-gradient(circle at 35% 65%, #fffbe0 0%, #ffe066 50%, #ffb12b 100%)";

function Flames({ zone, onDone }: EffectProps) {
  useFinish(onDone, FLAMES_DURATION);
  const { tongues, sparks } = useMemo(() => {
    const n = Math.max(5, Math.round(zone.width / 16));
    const tongues = Array.from({ length: n }, (_, i) => {
      const size = random(16, 26);
      return {
        id: i,
        x: ((i + 0.5) / n) * 100 + random(-3, 3),
        size,
        inner: size * random(0.45, 0.6),
        late: random(0, 250),
        dance: random(140, 280),
      };
    });
    const sparks = Array.from({ length: 18 }, (_, i) => ({
      id: i,
      x: random(5, 95),
      dx: random(-14, 14),
      rise: random(-70, -35),
      late: random(200, 1800),
      duration: random(500, 900),
    }));
    return { tongues, sparks };
  }, [zone.width]);

  // The flames take root just under the card and lick its bottom.
  return (
    <Layer
      style={{ left: zone.x, top: zone.y + zone.height + 4, width: zone.width, height: 0 }}
      animations={FLAMES_ANIMATIONS}
    >
      {tongues.map((l) => (
        <span
          key={l.id}
          style={{
            position: "absolute",
            left: `${l.x}%`,
            bottom: 0,
            width: l.size,
            height: l.size * 1.6,
            marginLeft: -l.size / 2,
            transformOrigin: "50% 100%",
            opacity: 0,
            animation: `milo-flame-life ${FLAMES_DURATION - l.late}ms ease-out ${l.late}ms forwards`,
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: 0,
              transformOrigin: "50% 100%",
              animation: `milo-flame-dance ${l.dance}ms ease-in-out infinite alternate`,
            }}
          >
            {[
              { size: l.size, background: OUTER_FLAME },
              { size: l.inner, background: INNER_FLAME },
            ].map((drop, i) => (
              <span
                key={i}
                style={{
                  position: "absolute",
                  left: "50%",
                  bottom: drop.size * 0.2,
                  width: drop.size,
                  height: drop.size,
                  marginLeft: -drop.size / 2,
                  background: drop.background,
                  borderRadius: "50% 0 50% 50%",
                  transform: "rotate(-45deg) scale(1, 1.1)",
                  filter: i === 0 ? "blur(0.6px)" : undefined,
                }}
              />
            ))}
          </span>
        </span>
      ))}
      {sparks.map((e) => (
        <span
          key={e.id}
          style={{
            position: "absolute",
            left: `${e.x}%`,
            bottom: 18,
            width: 3,
            height: 3,
            borderRadius: "50%",
            backgroundColor: "#ffd23f",
            boxShadow: "0 0 4px #ff8a1f",
            opacity: 0,
            "--dx": `${e.dx}px`,
            "--rise": `${e.rise}px`,
            animation: `milo-spark ${e.duration}ms ease-out ${e.late}ms forwards`,
          } as StyleWithVariables}
        />
      ))}
    </Layer>
  );
}

// --- ❄️ Falling snow ---------------------------------------------------
const SNOW_DURATION = 6200;
const SNOW_ANIMATIONS = `
@keyframes milo-snow-fall {
  0%   { transform: translate3d(0, var(--top), 0); opacity: 0; }
  10%  { opacity: 1; }
  85%  { opacity: 1; }
  100% { transform: translate3d(var(--dx), var(--fall), 0); opacity: 0; }
}
@keyframes milo-snow-sway {
  from { transform: translateX(-8px) rotate(0deg); }
  to   { transform: translateX(8px) rotate(90deg); }
}
`;

// Bluish white, ringed with a shadow: the snow stays visible on a light background.
const SNOWFLAKE = "light-dark(#f4f9ff, #ffffff)";
const SNOWFLAKE_SHADOW = "0 0 3px rgba(60, 100, 160, 0.45)";

function Snow({ zone, onDone }: EffectProps) {
  useFinish(onDone, SNOW_DURATION);
  const snowflakes = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => {
        const star = random(0, 1) < 0.35;
        return {
          id: i,
          start: random(0, 98),
          star,
          size: star ? random(12, 20) : random(4, 9),
          top: random(-160, -20),
          fall: Math.min(zone.height, 560) * random(0.6, 1.05),
          dx: random(-30, 30),
          duration: random(3000, 4500),
          late: random(0, 1600),
          balance: random(900, 1600),
        };
      }),
    [zone.height],
  );
  return (
    <Layer
      style={{ left: zone.x, top: zone.y, width: zone.width, height: 0 }}
      animations={SNOW_ANIMATIONS}
    >
      {snowflakes.map((f) => (
        <span
          key={f.id}
          style={{
            position: "absolute",
            left: `${f.start}%`,
            top: 0,
            opacity: 0,
            "--top": `${f.top}px`,
            "--fall": `${f.fall}px`,
            "--dx": `${f.dx}px`,
            animation: `milo-snow-fall ${f.duration}ms linear ${f.late}ms forwards`,
          } as StyleWithVariables}
        >
          <span
            style={{
              display: "block",
              animation: `milo-snow-sway ${f.balance}ms ease-in-out infinite alternate`,
              ...(f.star
                ? {
                    fontSize: f.size,
                    lineHeight: 1,
                    color: SNOWFLAKE,
                    textShadow: SNOWFLAKE_SHADOW,
                  }
                : {
                    width: f.size,
                    height: f.size,
                    borderRadius: "50%",
                    backgroundColor: SNOWFLAKE,
                    boxShadow: SNOWFLAKE_SHADOW,
                  }),
            }}
          >
            {/* U+FE0E: the snowflake as text, which color can paint. */}
            {f.star ? "❄︎" : null}
          </span>
        </span>
      ))}
    </Layer>
  );
}

// --- ⚡ Lightning strike ---------------------------------------------------
const FLASHES = 3;
const FLASHES_GAP = 450;
const FLASH_DURATION = 650;
const LIGHTNING_DURATION = (FLASHES - 1) * FLASHES_GAP + FLASH_DURATION + 100;
const LIGHTNING_ANIMATIONS = `
@keyframes milo-lightning {
  0%   { opacity: 0; }
  6%   { opacity: 1; }
  18%  { opacity: 0.25; }
  28%  { opacity: 1; }
  60%  { opacity: 0.9; }
  100% { opacity: 0; }
}
@keyframes milo-flash {
  0%   { opacity: 0; }
  6%   { opacity: 0.45; }
  18%  { opacity: 0; }
  28%  { opacity: 0.25; }
  100% { opacity: 0; }
}
`;

/** A zigzag lightning bolt, from the top of the screen to the point of impact, with a fork. */
function zigzag(xImpact: number, yImpact: number) {
  const pas = 12;
  let x = xImpact + random(-60, 60);
  const points: [number, number][] = [[x, 0]];
  for (let i = 1; i < pas; i++) {
    const f = i / pas;
    // The zigzag tightens as it nears the point of impact.
    x += random(-38, 38) * (1 - f * 0.5) + (xImpact - x) * f * 0.5;
    points.push([x, yImpact * f]);
  }
  points.push([xImpact, yImpact]);
  const start = points[Math.floor(random(3, 7))] ?? points[0]!;
  const direction = Math.random() < 0.5 ? -1 : 1;
  const fork: [number, number][] = [start];
  let [fx, fy] = start;
  for (let i = 0; i < 4; i++) {
    fx += direction * random(15, 40);
    fy += random(25, 50);
    fork.push([fx, fy]);
  }
  const toPoints = (pts: [number, number][]) => pts.map(([a, b]) => `${a},${b}`).join(" ");
  return { trunk: toPoints(points), fork: toPoints(fork) };
}

function Lightning({ zone, onDone }: EffectProps) {
  useFinish(onDone, LIGHTNING_DURATION);
  const flashes = useMemo(
    () =>
      Array.from({ length: FLASHES }, (_, i) => ({
        id: i,
        late: i * FLASHES_GAP,
        ...zigzag(zone.x + zone.width * random(0.15, 0.85), zone.y + random(10, 40)),
      })),
    [zone.x, zone.y, zone.width],
  );
  return (
    <Layer style={{ inset: 0 }} animations={LIGHTNING_ANIMATIONS}>
      {flashes.map((e) => (
        <div key={e.id}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "#fff",
              opacity: 0,
              animation: `milo-flash ${FLASH_DURATION}ms linear ${e.late}ms forwards`,
            }}
          />
          <svg
            width="100%"
            height="100%"
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0,
              overflow: "visible",
              filter: "drop-shadow(0 0 6px #ffe066) drop-shadow(0 0 14px #fab005)",
              animation: `milo-lightning ${FLASH_DURATION}ms linear ${e.late}ms forwards`,
            }}
          >
            {[e.trunk, e.fork].map((pts, i) => (
              <g key={i} fill="none" strokeLinejoin="round" strokeLinecap="round">
                <polyline points={pts} stroke="#ffd43b" strokeWidth={i === 0 ? 6 : 3} />
                <polyline points={pts} stroke="#fffdf0" strokeWidth={i === 0 ? 2.5 : 1.2} />
              </g>
            ))}
          </svg>
        </div>
      ))}
    </Layer>
  );
}

// --- Dispatch -------------------------------------------------------------
interface CelebrationEffectProps {
  effect: Effect;
  /** The list that hosts the card. */
  column: Zone;
  /** The card that has arrived, when it is on screen: the flames attach to it. */
  card: Zone | null;
  onDone: () => void;
}

export default function CelebrationEffect({ effect, column, card, onDone }: CelebrationEffectProps) {
  switch (effect) {
    case "confetti":
      return <Confetti x={column.x} y={column.y} width={column.width} onDone={onDone} />;
    case "hearts":
      return <Hearts zone={column} onDone={onDone} />;
    case "thumbs":
      return <ThumbsUp zone={column} onDone={onDone} />;
    case "rocket":
      return <Rocket onDone={onDone} />;
    case "flames":
      // Without a measured card, the flames take the top of the list.
      return (
        <Flames zone={card ?? { ...column, height: Math.min(column.height, 80) }} onDone={onDone} />
      );
    case "snow":
      return <Snow zone={column} onDone={onDone} />;
    case "lightning":
      return <Lightning zone={column} onDone={onDone} />;
  }
}
