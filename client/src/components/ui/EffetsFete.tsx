import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import Confetti from "./Confetti";

// Les fêtes qu'une liste peut réserver à la carte qui la rejoint : chacune a
// sa marque, à poser n'importe où dans le titre de la liste. Une liste peut en
// porter plusieurs : toutes se jouent ensemble.
export type Effect = "confettis" | "coeurs" | "pouces" | "fusee" | "flammes" | "neige" | "foudre";

// Les marques sont cherchées sans leur sélecteur de variante (« ❤ » plutôt que
// « ❤️ ») : qu'elles soient saisies en texte ou en emoji, elles se reconnaissent.
// L'emoji, lui, est ce que le menu de la liste pose au bout du titre.
export const MARKS: { mark: string; emoji: string; effect: Effect; label: string }[] = [
  { mark: "✨", emoji: "✨", effect: "confettis", label: "Confettis" },
  { mark: "❤", emoji: "❤️", effect: "coeurs", label: "Pluie de cœurs" },
  { mark: "👍", emoji: "👍", effect: "pouces", label: "Pouces" },
  { mark: "🚀", emoji: "🚀", effect: "fusee", label: "Fusée" },
  { mark: "🔥", emoji: "🔥", effect: "flammes", label: "Flammes" },
  { mark: "❄", emoji: "❄️", effect: "neige", label: "Neige" },
  { mark: "⚡", emoji: "⚡", effect: "foudre", label: "Foudre" },
];

/** Les fêtes que réclame un titre de liste, dans l'ordre des marques. */
export const titleEffects = (title: string): Effect[] =>
  MARKS.filter((m) => title.includes(m.mark)).map((m) => m.effect);

/**
 * Pose la marque d'une fête au bout du titre, ou l'en retire si elle y est
 * déjà — où qu'elle soit, avec son sélecteur de variante et l'espace qui la
 * précède.
 */
export const toggleMark = (title: string, effect: Effect): string => {
  const m = MARKS.find((x) => x.effect === effect);
  if (!m) return title;
  if (!title.includes(m.mark)) return `${title.trimEnd()} ${m.emoji}`;
  const withoutMark = title.split(m.mark).map((chunk, i) =>
    // Le sélecteur de variante suit la marque : il part avec elle.
    i > 0 ? chunk.replace(/^\uFE0F/, "") : chunk,
  );
  return withoutMark.join("").replace(/\s{2,}/g, " ").trim();
};

/** Un rectangle à l'écran : celui de la liste, ou celui de la carte. */
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

// Les propriétés personnalisées (« --dx ») ne figurent pas dans CSSProperties :
// React les accepte, TypeScript ne les connaît pas.
type StyleWithVariables = CSSProperties & Record<`--${string}`, string | number>;

/**
 * Retire l'effet au bout de sa durée. Le rappel est gardé dans une référence :
 * il change à chaque rendu du tableau, et remettrait le compte à zéro.
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

/** Le calque d'un effet : posé sur l'écran, il ne retient aucun clic. */
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

// --- ❤️ Pluie de cœurs ----------------------------------------------------
const HEARTS_DURATION = 3400;
const HEARTS_ANIMATIONS = `
@keyframes milo-coeur-chute {
  0%   { transform: translate3d(0, var(--haut), 0); opacity: 0; }
  10%  { opacity: 1; }
  80%  { opacity: 1; }
  100% { transform: translate3d(0, var(--bas), 0); opacity: 0; }
}
@keyframes milo-coeur-balance {
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
        taille: random(12, 26),
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
            "--haut": `${c.top}px`,
            "--bas": `${c.fall}px`,
            animation: `milo-coeur-chute ${c.duration}ms ease-in ${c.late}ms forwards`,
          } as StyleWithVariables}
        >
          <svg
            viewBox="0 0 24 24"
            width={c.taille}
            height={c.taille}
            style={{
              display: "block",
              fill: c.color,
              "--balance": `${c.balance}px`,
              animation: `milo-coeur-balance ${c.tempo}ms ease-in-out infinite alternate`,
            } as StyleWithVariables}
          >
            <path d="M12 21.6 10.6 20.3C5.4 15.6 2 12.5 2 8.7 2 5.6 4.4 3.2 7.5 3.2c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1 3.1 0 5.5 2.4 5.5 5.5 0 3.8-3.4 6.9-8.6 11.6z" />
          </svg>
        </span>
      ))}
    </Layer>
  );
}

// --- 👍 Pouces qui apparaissent et disparaissent ------------------------
const THUMBS_UP_DURATION = 2600;
const THUMBS_UP_ANIMATIONS = `
@keyframes milo-pouce {
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
        taille: random(22, 40),
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
            fontSize: p.taille,
            lineHeight: 1,
            opacity: 0,
            "--angle": `${p.angle}deg`,
            animation: `milo-pouce 1100ms ease-out ${p.late}ms forwards`,
          } as StyleWithVariables}
        >
          👍
        </span>
      ))}
    </Layer>
  );
}

// --- 🚀 Fusée qui traverse l'écran ---------------------------------------
const ROCKET_CROSSING = 1600;
const ROCKET_SMOKE = 900;
const ROCKET_DURATION = ROCKET_CROSSING + ROCKET_SMOKE;
const ROCKET_ANIMATIONS = `
@keyframes milo-fusee {
  from { transform: translate3d(var(--x0), var(--y0), 0); }
  to   { transform: translate3d(var(--x1), var(--y1), 0); }
}
@keyframes milo-fumee {
  0%   { transform: translate(-50%, -50%) scale(0.3); opacity: 0.8; }
  100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
}
`;

// Gris neutre : les gris de la palette tirent sur le bleu.
const SMOKE = "light-dark(#cfcfcf, #8a8a8a)";

function Rocket({ onDone }: { onDone: () => void }) {
  useFinish(onDone, ROCKET_DURATION);
  // La fusée part du bas à gauche et sort en haut à droite, en ligne droite
  // et à vitesse constante : les bouffées de fumée, semées à intervalles
  // réguliers sur le trajet, tombent ainsi juste derrière elle.
  const path = useMemo(() => {
    const largeur = window.innerWidth;
    const height = window.innerHeight;
    const x0 = -80;
    const y0 = height * random(0.7, 0.95);
    const x1 = largeur + 80;
    const y1 = height * random(0.02, 0.25);
    const angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
    const n = 28;
    const fumee = Array.from({ length: n }, (_, i) => {
      const f = i / n;
      return {
        id: i,
        x: x0 + (x1 - x0) * f,
        y: y0 + (y1 - y0) * f,
        late: ROCKET_CROSSING * f,
        taille: random(14, 24),
      };
    });
    // L'emoji pointe déjà vers le haut à droite, à 45° : on ne tourne que l'écart.
    return { x0, y0, x1, y1, rotation: angle + 45, fumee };
  }, []);

  return (
    <Layer style={{ inset: 0 }} animations={ROCKET_ANIMATIONS}>
      {path.fumee.map((b) => (
        <span
          key={b.id}
          style={{
            position: "absolute",
            left: b.x,
            top: b.y,
            width: b.taille,
            height: b.taille,
            borderRadius: "50%",
            backgroundColor: SMOKE,
            opacity: 0,
            animation: `milo-fumee ${ROCKET_SMOKE}ms ease-out ${b.late}ms forwards`,
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
          animation: `milo-fusee ${ROCKET_CROSSING}ms linear forwards`,
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

// --- 🔥 Flammes en bas de la carte ---------------------------------------
const FLAMES_DURATION = 2600;
const FLAMES_ANIMATIONS = `
@keyframes milo-flamme-vie {
  0%   { transform: scale(0); opacity: 0; }
  15%  { transform: scale(1); opacity: 1; }
  80%  { transform: scale(1); opacity: 1; }
  100% { transform: scale(0.2); opacity: 0; }
}
@keyframes milo-flamme-danse {
  from { transform: scale(0.95, 0.85); }
  to   { transform: scale(0.85, 1.15); }
}
@keyframes milo-etincelle {
  0%   { transform: translate(0, 0); opacity: 1; }
  100% { transform: translate(var(--dx), var(--monte)); opacity: 0; }
}
`;

// Une langue de feu : une goutte pointe en haut, chaude au cœur.
const OUTER_FLAME =
  "radial-gradient(circle at 35% 65%, #ffd23f 0%, #ff8a1f 45%, #e8401c 80%, #b8200c 100%)";
const INNER_FLAME =
  "radial-gradient(circle at 35% 65%, #fffbe0 0%, #ffe066 50%, #ffb12b 100%)";

function Flames({ zone, onDone }: EffectProps) {
  useFinish(onDone, FLAMES_DURATION);
  const { tongues, sparks } = useMemo(() => {
    const n = Math.max(5, Math.round(zone.width / 16));
    const tongues = Array.from({ length: n }, (_, i) => {
      const taille = random(16, 26);
      return {
        id: i,
        x: ((i + 0.5) / n) * 100 + random(-3, 3),
        taille,
        inner: taille * random(0.45, 0.6),
        late: random(0, 250),
        dance: random(140, 280),
      };
    });
    const sparks = Array.from({ length: 18 }, (_, i) => ({
      id: i,
      x: random(5, 95),
      dx: random(-14, 14),
      mounted: random(-70, -35),
      late: random(200, 1800),
      duration: random(500, 900),
    }));
    return { tongues, sparks };
  }, [zone.width]);

  // Les flammes prennent racine juste sous la carte et lèchent son bas.
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
            width: l.taille,
            height: l.taille * 1.6,
            marginLeft: -l.taille / 2,
            transformOrigin: "50% 100%",
            opacity: 0,
            animation: `milo-flamme-vie ${FLAMES_DURATION - l.late}ms ease-out ${l.late}ms forwards`,
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: 0,
              transformOrigin: "50% 100%",
              animation: `milo-flamme-danse ${l.dance}ms ease-in-out infinite alternate`,
            }}
          >
            {[
              { taille: l.taille, background: OUTER_FLAME },
              { taille: l.inner, background: INNER_FLAME },
            ].map((drop, i) => (
              <span
                key={i}
                style={{
                  position: "absolute",
                  left: "50%",
                  bottom: drop.taille * 0.2,
                  width: drop.taille,
                  height: drop.taille,
                  marginLeft: -drop.taille / 2,
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
            "--monte": `${e.mounted}px`,
            animation: `milo-etincelle ${e.duration}ms ease-out ${e.late}ms forwards`,
          } as StyleWithVariables}
        />
      ))}
    </Layer>
  );
}

// --- ❄️ Neige qui tombe ---------------------------------------------------
const SNOW_DURATION = 6200;
const SNOW_ANIMATIONS = `
@keyframes milo-neige-chute {
  0%   { transform: translate3d(0, var(--haut), 0); opacity: 0; }
  10%  { opacity: 1; }
  85%  { opacity: 1; }
  100% { transform: translate3d(var(--dx), var(--bas), 0); opacity: 0; }
}
@keyframes milo-neige-balance {
  from { transform: translateX(-8px) rotate(0deg); }
  to   { transform: translateX(8px) rotate(90deg); }
}
`;

// Blanc bleuté, cerné d'une ombre : la neige reste visible sur un fond clair.
const SNOWFLAKE = "light-dark(#f4f9ff, #ffffff)";
const SNOWFLAKE_SHADOW = "0 0 3px rgba(60, 100, 160, 0.45)";

function Neige({ zone, onDone }: EffectProps) {
  useFinish(onDone, SNOW_DURATION);
  const snowflakes = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => {
        const etoile = random(0, 1) < 0.35;
        return {
          id: i,
          start: random(0, 98),
          etoile,
          taille: etoile ? random(12, 20) : random(4, 9),
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
            "--haut": `${f.top}px`,
            "--bas": `${f.fall}px`,
            "--dx": `${f.dx}px`,
            animation: `milo-neige-chute ${f.duration}ms linear ${f.late}ms forwards`,
          } as StyleWithVariables}
        >
          <span
            style={{
              display: "block",
              animation: `milo-neige-balance ${f.balance}ms ease-in-out infinite alternate`,
              ...(f.etoile
                ? {
                    fontSize: f.taille,
                    lineHeight: 1,
                    color: SNOWFLAKE,
                    textShadow: SNOWFLAKE_SHADOW,
                  }
                : {
                    width: f.taille,
                    height: f.taille,
                    borderRadius: "50%",
                    backgroundColor: SNOWFLAKE,
                    boxShadow: SNOWFLAKE_SHADOW,
                  }),
            }}
          >
            {/* U+FE0E : le flocon en texte, que la couleur peut peindre. */}
            {f.etoile ? "❄︎" : null}
          </span>
        </span>
      ))}
    </Layer>
  );
}

// --- ⚡ Foudre qui tombe ---------------------------------------------------
const FLASHES = 3;
const FLASHES_GAP = 450;
const FLASH_DURATION = 650;
const LIGHTNING_DURATION = (FLASHES - 1) * FLASHES_GAP + FLASH_DURATION + 100;
const LIGHTNING_ANIMATIONS = `
@keyframes milo-eclair {
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

/** Un éclair en zigzag, du haut de l'écran jusqu'au point d'impact, avec une fourche. */
function zigzag(xImpact: number, yImpact: number) {
  const pas = 12;
  let x = xImpact + random(-60, 60);
  const points: [number, number][] = [[x, 0]];
  for (let i = 1; i < pas; i++) {
    const f = i / pas;
    // Le zigzag se resserre à l'approche du point d'impact.
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
              animation: `milo-eclair ${FLASH_DURATION}ms linear ${e.late}ms forwards`,
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

// --- Aiguillage -------------------------------------------------------------
interface CelebrationEffectProps {
  effect: Effect;
  /** La liste qui accueille la carte. */
  column: Zone;
  /** La carte arrivée, quand elle est à l'écran : les flammes s'y attachent. */
  card: Zone | null;
  onDone: () => void;
}

export default function CelebrationEffect({ effect, column, card, onDone }: CelebrationEffectProps) {
  switch (effect) {
    case "confettis":
      return <Confetti x={column.x} y={column.y} width={column.width} onDone={onDone} />;
    case "coeurs":
      return <Hearts zone={column} onDone={onDone} />;
    case "pouces":
      return <ThumbsUp zone={column} onDone={onDone} />;
    case "fusee":
      return <Rocket onDone={onDone} />;
    case "flammes":
      // Sans carte mesurée, les flammes prennent le haut de la liste.
      return (
        <Flames zone={card ?? { ...column, height: Math.min(column.height, 80) }} onDone={onDone} />
      );
    case "neige":
      return <Neige zone={column} onDone={onDone} />;
    case "foudre":
      return <Lightning zone={column} onDone={onDone} />;
  }
}
