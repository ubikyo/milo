import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import Confetti from "./Confetti";

// Les fêtes qu'une liste peut réserver à la carte qui la rejoint : chacune a
// sa marque, à poser n'importe où dans le titre de la liste. Une liste peut en
// porter plusieurs : toutes se jouent ensemble.
export type Effet = "confettis" | "coeurs" | "pouces" | "fusee" | "flammes" | "neige" | "foudre";

// Les marques sont cherchées sans leur sélecteur de variante (« ❤ » plutôt que
// « ❤️ ») : qu'elles soient saisies en texte ou en emoji, elles se reconnaissent.
// L'emoji, lui, est ce que le menu de la liste pose au bout du titre.
export const MARQUES: { marque: string; emoji: string; effet: Effet; label: string }[] = [
  { marque: "✨", emoji: "✨", effet: "confettis", label: "Confettis" },
  { marque: "❤", emoji: "❤️", effet: "coeurs", label: "Pluie de cœurs" },
  { marque: "👍", emoji: "👍", effet: "pouces", label: "Pouces" },
  { marque: "🚀", emoji: "🚀", effet: "fusee", label: "Fusée" },
  { marque: "🔥", emoji: "🔥", effet: "flammes", label: "Flammes" },
  { marque: "❄", emoji: "❄️", effet: "neige", label: "Neige" },
  { marque: "⚡", emoji: "⚡", effet: "foudre", label: "Foudre" },
];

/** Les fêtes que réclame un titre de liste, dans l'ordre des marques. */
export const effetsDuTitre = (titre: string): Effet[] =>
  MARQUES.filter((m) => titre.includes(m.marque)).map((m) => m.effet);

/**
 * Pose la marque d'une fête au bout du titre, ou l'en retire si elle y est
 * déjà — où qu'elle soit, avec son sélecteur de variante et l'espace qui la
 * précède.
 */
export const basculerMarque = (titre: string, effet: Effet): string => {
  const m = MARQUES.find((x) => x.effet === effet);
  if (!m) return titre;
  if (!titre.includes(m.marque)) return `${titre.trimEnd()} ${m.emoji}`;
  const sansMarque = titre.split(m.marque).map((morceau, i) =>
    // Le sélecteur de variante suit la marque : il part avec elle.
    i > 0 ? morceau.replace(/^\uFE0F/, "") : morceau,
  );
  return sansMarque.join("").replace(/\s{2,}/g, " ").trim();
};

/** Un rectangle à l'écran : celui de la liste, ou celui de la carte. */
export interface Zone {
  x: number;
  y: number;
  width: number;
  height: number;
}

const alea = (min: number, max: number): number => min + Math.random() * (max - min);
const parmi = <T,>(valeurs: readonly T[]): T =>
  valeurs[Math.floor(Math.random() * valeurs.length)] as T;
const couleur = (c: string) => `var(--mantine-color-${c}-filled)`;

// Les propriétés personnalisées (« --dx ») ne figurent pas dans CSSProperties :
// React les accepte, TypeScript ne les connaît pas.
type StyleAvecVariables = CSSProperties & Record<`--${string}`, string | number>;

/**
 * Retire l'effet au bout de sa durée. Le rappel est gardé dans une référence :
 * il change à chaque rendu du tableau, et remettrait le compte à zéro.
 */
function useFin(onDone: () => void, duree: number) {
  const fini = useRef(onDone);
  useEffect(() => {
    fini.current = onDone;
  }, [onDone]);
  useEffect(() => {
    const t = setTimeout(() => fini.current(), duree);
    return () => clearTimeout(t);
  }, [duree]);
}

/** Le calque d'un effet : posé sur l'écran, il ne retient aucun clic. */
function Calque({ style, animations, children }: {
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

interface EffetProps {
  zone: Zone;
  onDone: () => void;
}

// --- ❤️ Pluie de cœurs ----------------------------------------------------
const COEURS_DUREE = 3400;
const COEURS_ANIMATIONS = `
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

function Coeurs({ zone, onDone }: EffetProps) {
  useFin(onDone, COEURS_DUREE);
  const coeurs = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        depart: alea(0, 96),
        taille: alea(12, 26),
        couleur: couleur(parmi(["red", "pink", "grape"])),
        haut: alea(-180, -40),
        bas: Math.min(zone.height, 520) * alea(0.5, 1),
        duree: alea(1900, 2700),
        retard: alea(0, 600),
        balance: alea(6, 18),
        rythme: alea(500, 900),
      })),
    [zone.height],
  );
  return (
    <Calque
      style={{ left: zone.x, top: zone.y, width: zone.width, height: 0 }}
      animations={COEURS_ANIMATIONS}
    >
      {coeurs.map((c) => (
        <span
          key={c.id}
          style={{
            position: "absolute",
            left: `${c.depart}%`,
            top: 0,
            opacity: 0,
            "--haut": `${c.haut}px`,
            "--bas": `${c.bas}px`,
            animation: `milo-coeur-chute ${c.duree}ms ease-in ${c.retard}ms forwards`,
          } as StyleAvecVariables}
        >
          <svg
            viewBox="0 0 24 24"
            width={c.taille}
            height={c.taille}
            style={{
              display: "block",
              fill: c.couleur,
              "--balance": `${c.balance}px`,
              animation: `milo-coeur-balance ${c.rythme}ms ease-in-out infinite alternate`,
            } as StyleAvecVariables}
          >
            <path d="M12 21.6 10.6 20.3C5.4 15.6 2 12.5 2 8.7 2 5.6 4.4 3.2 7.5 3.2c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1 3.1 0 5.5 2.4 5.5 5.5 0 3.8-3.4 6.9-8.6 11.6z" />
          </svg>
        </span>
      ))}
    </Calque>
  );
}

// --- 👍 Pouces qui apparaissent et disparaissent ------------------------
const POUCES_DUREE = 2600;
const POUCES_ANIMATIONS = `
@keyframes milo-pouce {
  0%   { transform: scale(0) rotate(var(--angle)); opacity: 0; }
  25%  { transform: scale(1.3) rotate(var(--angle)); opacity: 1; }
  40%  { transform: scale(1) rotate(var(--angle)); opacity: 1; }
  75%  { transform: scale(1) rotate(var(--angle)); opacity: 1; }
  100% { transform: translateY(-24px) scale(0.6) rotate(var(--angle)); opacity: 0; }
}
`;

function Pouces({ zone, onDone }: EffetProps) {
  useFin(onDone, POUCES_DUREE);
  const pouces = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        x: alea(4, 88),
        y: alea(0, Math.max(60, Math.min(zone.height, 420) - 40)),
        taille: alea(22, 40),
        angle: alea(-25, 25),
        retard: alea(0, 1300),
      })),
    [zone.height],
  );
  return (
    <Calque
      style={{ left: zone.x, top: zone.y, width: zone.width, height: 0 }}
      animations={POUCES_ANIMATIONS}
    >
      {pouces.map((p) => (
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
            animation: `milo-pouce 1100ms ease-out ${p.retard}ms forwards`,
          } as StyleAvecVariables}
        >
          👍
        </span>
      ))}
    </Calque>
  );
}

// --- 🚀 Fusée qui traverse l'écran ---------------------------------------
const FUSEE_TRAVERSEE = 1600;
const FUSEE_FUMEE = 900;
const FUSEE_DUREE = FUSEE_TRAVERSEE + FUSEE_FUMEE;
const FUSEE_ANIMATIONS = `
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
const FUMEE = "light-dark(#cfcfcf, #8a8a8a)";

function Fusee({ onDone }: { onDone: () => void }) {
  useFin(onDone, FUSEE_DUREE);
  // La fusée part du bas à gauche et sort en haut à droite, en ligne droite
  // et à vitesse constante : les bouffées de fumée, semées à intervalles
  // réguliers sur le trajet, tombent ainsi juste derrière elle.
  const trajet = useMemo(() => {
    const largeur = window.innerWidth;
    const hauteur = window.innerHeight;
    const x0 = -80;
    const y0 = hauteur * alea(0.7, 0.95);
    const x1 = largeur + 80;
    const y1 = hauteur * alea(0.02, 0.25);
    const angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
    const n = 28;
    const fumee = Array.from({ length: n }, (_, i) => {
      const f = i / n;
      return {
        id: i,
        x: x0 + (x1 - x0) * f,
        y: y0 + (y1 - y0) * f,
        retard: FUSEE_TRAVERSEE * f,
        taille: alea(14, 24),
      };
    });
    // L'emoji pointe déjà vers le haut à droite, à 45° : on ne tourne que l'écart.
    return { x0, y0, x1, y1, rotation: angle + 45, fumee };
  }, []);

  return (
    <Calque style={{ inset: 0 }} animations={FUSEE_ANIMATIONS}>
      {trajet.fumee.map((b) => (
        <span
          key={b.id}
          style={{
            position: "absolute",
            left: b.x,
            top: b.y,
            width: b.taille,
            height: b.taille,
            borderRadius: "50%",
            backgroundColor: FUMEE,
            opacity: 0,
            animation: `milo-fumee ${FUSEE_FUMEE}ms ease-out ${b.retard}ms forwards`,
          }}
        />
      ))}
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          "--x0": `${trajet.x0}px`,
          "--y0": `${trajet.y0}px`,
          "--x1": `${trajet.x1}px`,
          "--y1": `${trajet.y1}px`,
          transform: `translate3d(${trajet.x0}px, ${trajet.y0}px, 0)`,
          animation: `milo-fusee ${FUSEE_TRAVERSEE}ms linear forwards`,
        } as StyleAvecVariables}
      >
        <span
          style={{
            display: "block",
            fontSize: 48,
            lineHeight: 1,
            transform: `translate(-50%, -50%) rotate(${trajet.rotation}deg)`,
          }}
        >
          🚀
        </span>
      </span>
    </Calque>
  );
}

// --- 🔥 Flammes en bas de la carte ---------------------------------------
const FLAMMES_DUREE = 2600;
const FLAMMES_ANIMATIONS = `
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
const FLAMME_EXTERIEURE =
  "radial-gradient(circle at 35% 65%, #ffd23f 0%, #ff8a1f 45%, #e8401c 80%, #b8200c 100%)";
const FLAMME_INTERIEURE =
  "radial-gradient(circle at 35% 65%, #fffbe0 0%, #ffe066 50%, #ffb12b 100%)";

function Flammes({ zone, onDone }: EffetProps) {
  useFin(onDone, FLAMMES_DUREE);
  const { langues, etincelles } = useMemo(() => {
    const n = Math.max(5, Math.round(zone.width / 16));
    const langues = Array.from({ length: n }, (_, i) => {
      const taille = alea(16, 26);
      return {
        id: i,
        x: ((i + 0.5) / n) * 100 + alea(-3, 3),
        taille,
        interieure: taille * alea(0.45, 0.6),
        retard: alea(0, 250),
        danse: alea(140, 280),
      };
    });
    const etincelles = Array.from({ length: 18 }, (_, i) => ({
      id: i,
      x: alea(5, 95),
      dx: alea(-14, 14),
      monte: alea(-70, -35),
      retard: alea(200, 1800),
      duree: alea(500, 900),
    }));
    return { langues, etincelles };
  }, [zone.width]);

  // Les flammes prennent racine juste sous la carte et lèchent son bas.
  return (
    <Calque
      style={{ left: zone.x, top: zone.y + zone.height + 4, width: zone.width, height: 0 }}
      animations={FLAMMES_ANIMATIONS}
    >
      {langues.map((l) => (
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
            animation: `milo-flamme-vie ${FLAMMES_DUREE - l.retard}ms ease-out ${l.retard}ms forwards`,
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: 0,
              transformOrigin: "50% 100%",
              animation: `milo-flamme-danse ${l.danse}ms ease-in-out infinite alternate`,
            }}
          >
            {[
              { taille: l.taille, fond: FLAMME_EXTERIEURE },
              { taille: l.interieure, fond: FLAMME_INTERIEURE },
            ].map((goutte, i) => (
              <span
                key={i}
                style={{
                  position: "absolute",
                  left: "50%",
                  bottom: goutte.taille * 0.2,
                  width: goutte.taille,
                  height: goutte.taille,
                  marginLeft: -goutte.taille / 2,
                  background: goutte.fond,
                  borderRadius: "50% 0 50% 50%",
                  transform: "rotate(-45deg) scale(1, 1.1)",
                  filter: i === 0 ? "blur(0.6px)" : undefined,
                }}
              />
            ))}
          </span>
        </span>
      ))}
      {etincelles.map((e) => (
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
            "--monte": `${e.monte}px`,
            animation: `milo-etincelle ${e.duree}ms ease-out ${e.retard}ms forwards`,
          } as StyleAvecVariables}
        />
      ))}
    </Calque>
  );
}

// --- ❄️ Neige qui tombe ---------------------------------------------------
const NEIGE_DUREE = 6200;
const NEIGE_ANIMATIONS = `
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
const FLOCON = "light-dark(#f4f9ff, #ffffff)";
const OMBRE_FLOCON = "0 0 3px rgba(60, 100, 160, 0.45)";

function Neige({ zone, onDone }: EffetProps) {
  useFin(onDone, NEIGE_DUREE);
  const flocons = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => {
        const etoile = alea(0, 1) < 0.35;
        return {
          id: i,
          depart: alea(0, 98),
          etoile,
          taille: etoile ? alea(12, 20) : alea(4, 9),
          haut: alea(-160, -20),
          bas: Math.min(zone.height, 560) * alea(0.6, 1.05),
          dx: alea(-30, 30),
          duree: alea(3000, 4500),
          retard: alea(0, 1600),
          balance: alea(900, 1600),
        };
      }),
    [zone.height],
  );
  return (
    <Calque
      style={{ left: zone.x, top: zone.y, width: zone.width, height: 0 }}
      animations={NEIGE_ANIMATIONS}
    >
      {flocons.map((f) => (
        <span
          key={f.id}
          style={{
            position: "absolute",
            left: `${f.depart}%`,
            top: 0,
            opacity: 0,
            "--haut": `${f.haut}px`,
            "--bas": `${f.bas}px`,
            "--dx": `${f.dx}px`,
            animation: `milo-neige-chute ${f.duree}ms linear ${f.retard}ms forwards`,
          } as StyleAvecVariables}
        >
          <span
            style={{
              display: "block",
              animation: `milo-neige-balance ${f.balance}ms ease-in-out infinite alternate`,
              ...(f.etoile
                ? {
                    fontSize: f.taille,
                    lineHeight: 1,
                    color: FLOCON,
                    textShadow: OMBRE_FLOCON,
                  }
                : {
                    width: f.taille,
                    height: f.taille,
                    borderRadius: "50%",
                    backgroundColor: FLOCON,
                    boxShadow: OMBRE_FLOCON,
                  }),
            }}
          >
            {/* U+FE0E : le flocon en texte, que la couleur peut peindre. */}
            {f.etoile ? "❄︎" : null}
          </span>
        </span>
      ))}
    </Calque>
  );
}

// --- ⚡ Foudre qui tombe ---------------------------------------------------
const ECLAIRS = 3;
const ECART_ECLAIRS = 450;
const ECLAIR_DUREE = 650;
const FOUDRE_DUREE = (ECLAIRS - 1) * ECART_ECLAIRS + ECLAIR_DUREE + 100;
const FOUDRE_ANIMATIONS = `
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
  let x = xImpact + alea(-60, 60);
  const points: [number, number][] = [[x, 0]];
  for (let i = 1; i < pas; i++) {
    const f = i / pas;
    // Le zigzag se resserre à l'approche du point d'impact.
    x += alea(-38, 38) * (1 - f * 0.5) + (xImpact - x) * f * 0.5;
    points.push([x, yImpact * f]);
  }
  points.push([xImpact, yImpact]);
  const depart = points[Math.floor(alea(3, 7))] ?? points[0]!;
  const sens = Math.random() < 0.5 ? -1 : 1;
  const fourche: [number, number][] = [depart];
  let [fx, fy] = depart;
  for (let i = 0; i < 4; i++) {
    fx += sens * alea(15, 40);
    fy += alea(25, 50);
    fourche.push([fx, fy]);
  }
  const trace = (pts: [number, number][]) => pts.map(([a, b]) => `${a},${b}`).join(" ");
  return { tronc: trace(points), fourche: trace(fourche) };
}

function Foudre({ zone, onDone }: EffetProps) {
  useFin(onDone, FOUDRE_DUREE);
  const eclairs = useMemo(
    () =>
      Array.from({ length: ECLAIRS }, (_, i) => ({
        id: i,
        retard: i * ECART_ECLAIRS,
        ...zigzag(zone.x + zone.width * alea(0.15, 0.85), zone.y + alea(10, 40)),
      })),
    [zone.x, zone.y, zone.width],
  );
  return (
    <Calque style={{ inset: 0 }} animations={FOUDRE_ANIMATIONS}>
      {eclairs.map((e) => (
        <div key={e.id}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "#fff",
              opacity: 0,
              animation: `milo-flash ${ECLAIR_DUREE}ms linear ${e.retard}ms forwards`,
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
              animation: `milo-eclair ${ECLAIR_DUREE}ms linear ${e.retard}ms forwards`,
            }}
          >
            {[e.tronc, e.fourche].map((pts, i) => (
              <g key={i} fill="none" strokeLinejoin="round" strokeLinecap="round">
                <polyline points={pts} stroke="#ffd43b" strokeWidth={i === 0 ? 6 : 3} />
                <polyline points={pts} stroke="#fffdf0" strokeWidth={i === 0 ? 2.5 : 1.2} />
              </g>
            ))}
          </svg>
        </div>
      ))}
    </Calque>
  );
}

// --- Aiguillage -------------------------------------------------------------
interface EffetFeteProps {
  effet: Effet;
  /** La liste qui accueille la carte. */
  liste: Zone;
  /** La carte arrivée, quand elle est à l'écran : les flammes s'y attachent. */
  carte: Zone | null;
  onDone: () => void;
}

export default function EffetFete({ effet, liste, carte, onDone }: EffetFeteProps) {
  switch (effet) {
    case "confettis":
      return <Confetti x={liste.x} y={liste.y} width={liste.width} onDone={onDone} />;
    case "coeurs":
      return <Coeurs zone={liste} onDone={onDone} />;
    case "pouces":
      return <Pouces zone={liste} onDone={onDone} />;
    case "fusee":
      return <Fusee onDone={onDone} />;
    case "flammes":
      // Sans carte mesurée, les flammes prennent le haut de la liste.
      return (
        <Flammes zone={carte ?? { ...liste, height: Math.min(liste.height, 80) }} onDone={onDone} />
      );
    case "neige":
      return <Neige zone={liste} onDone={onDone} />;
    case "foudre":
      return <Foudre zone={liste} onDone={onDone} />;
  }
}
