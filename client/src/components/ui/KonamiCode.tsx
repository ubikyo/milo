import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { DETACH, DETACH_SPREAD, detachInterface } from "../../lib/interfaceFall";
import Confetti from "./Confetti";

// A surprise for those who know the code: ↑ ↑ ↓ ↓ ← ← → →, typed anywhere in
// the application. The whole interface comes loose and falls; three bursts of
// confetti fall from the top of the screen, it rains Jérômes and Milo signs its
// author; then the interface comes back. Nothing is saved, nothing changes: it
// is a wink, not a feature.
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

// The bursts start from three points at the top of the screen, one after the
// other.
const VOLLEYS = [0.2, 0.5, 0.8];
const BURSTS_GAP = 250;

// And it rains Jérômes.
const DROP = "Jérôme ❤️";
const JEROMES = 45;
const JEROME_DURATION = 5600;
const JEROME_COLORS = ["red", "orange", "yellow", "green", "teal", "blue", "violet", "pink"].map(
  (c) => `var(--mantine-color-${c}-filled)`,
);
const JEROME_ANIMATIONS = `
@keyframes milo-jerome-fall {
  0%   { transform: translate3d(0, -60px, 0) rotate(var(--from)); opacity: 0; }
  8%   { opacity: 1; }
  90%  { opacity: 1; }
  100% { transform: translate3d(var(--dx), var(--fall), 0) rotate(var(--to)); opacity: 0; }
}
`;

const random = (min: number, max: number): number => min + Math.random() * (max - min);

// Custom properties ("--dx") are not part of CSSProperties.
type StyleWithVariables = CSSProperties & Record<`--${string}`, string | number>;

function JeromeRain({ onDone }: { onDone: () => void }) {
  const drops = useMemo(
    () =>
      Array.from({ length: JEROMES }, (_, i) => ({
        id: i,
        x: random(0, 90),
        size: random(14, 34),
        color: JEROME_COLORS[Math.floor(random(0, JEROME_COLORS.length))],
        from: random(-30, 30),
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
            "--from": `${g.from}deg`,
            "--to": `${g.to}deg`,
            "--dx": `${g.dx}px`,
            "--fall": `${g.fall}px`,
            animation: `milo-jerome-fall ${g.duration}ms ease-in ${g.late}ms forwards`,
          } as StyleWithVariables}
        >
          {DROP}
        </span>
      ))}
    </div>
  );
}

/** An input in progress: the code is not read there, arrows and letters are being typed. */
const inInput = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

// The time for the interface to leave edit mode before falling: it must fall as
// it is normally seen.
const EXIT_DURATION = 350;

interface KonamiCodeProps {
  /** The interface is being edited. */
  isEditing: boolean;
  onLeaveEditing: () => void;
}

export default function KonamiCode({ isEditing, onLeaveEditing }: KonamiCodeProps) {
  // Read from the keyboard listener, set up once and for all: through a ref.
  const modification = useRef({ isEditing, onLeaveEditing });
  useEffect(() => {
    modification.current = { isEditing, onLeaveEditing };
  }, [isEditing, onLeaveEditing]);
  // The last keys, as many as the code has: the code is found when they form it
  // — even preceded by one arrow too many.
  const keys = useRef<string[]>([]);
  const counter = useRef(0);
  const [volleys, setVolleys] = useState<{ key: number; x: number }[]>([]);
  const [rains, setRainDrops] = useState<number[]>([]);

  useEffect(() => {
    const timeouts: number[] = [];
    // One celebration at a time: retyping the code during the fall changes
    // nothing.
    let ongoing = false;
    const onKeyDown = (e: KeyboardEvent) => {
      if (inInput(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      keys.current = [...keys.current, e.key].slice(-CODE.length);
      if (keys.current.join() !== CODE.join()) return;
      keys.current = [];
      if (ongoing) return;
      ongoing = true;

      // In edit mode, it is left first, and we wait for the ordinary screen to
      // be back.
      const { isEditing: toLeave, onLeaveEditing: leave } = modification.current;
      if (toLeave) leave();
      timeouts.push(
        window.setTimeout(() => detach(), toLeave ? EXIT_DURATION : 0),
      );
    };

    // The interface falls first; the celebration starts when the screen is
    // empty, and it comes back when the rain ends.
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
            // "x" is the burst's left edge: it is centered on its point.
            const width = window.innerWidth / VOLLEYS.length;
            const x = window.innerWidth * part - width / 2;
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
