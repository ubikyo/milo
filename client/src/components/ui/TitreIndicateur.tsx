import { Text } from "@mantine/core";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { count, text } from "../../widgets/types";

// Le titre d'un indicateur : son nom, ou à défaut celui que le widget lui
// donne. Un double clic le change sur place ; un simple clic ouvre le tiroir,
// comme ailleurs sur la carte — attendu le temps de voir s'il en vient un
// second. En gras et en blanc, comme les titres des colonnes.

/** La clé du nom dans la configuration : la même pour tous les widgets. */
export const NAME = "nom";

// L'allure de la carte, la même pour tous les indicateurs : la couleur et la
// taille de son titre et de sa valeur, et la couleur de
// son fond (ChampsApparence). Absentes, la carte garde l'allure de l'encart
// (IndicatorsPanel).
export const BACKGROUND = "fond";

/** Un texte de la carte — son titre, sa valeur — et ses réglages. */
export interface CardText {
  sizeKey: string;
  colorKey: string;
  defaultSize: number;
  /** Les bornes de la taille : lisible, sans déborder de la carte. */
  minSize: number;
  maxSize: number;
  /** Sa couleur sans réglage ; à défaut, celle du texte du thème. */
  defaultColor?: string;
}

/** Le titre : en blanc, comme les titres des colonnes, à la taille « sm ». */
export const TITLE: CardText = {
  sizeKey: "taille_titre",
  colorKey: "couleur_titre",
  defaultSize: 14,
  minSize: 8,
  maxSize: 48,
  defaultColor: "#ffffff",
};

/** La valeur d'un indicateur qui compte — tickets, cartes, projets, postes. */
export const VALUE: CardText = {
  sizeKey: "taille_valeur",
  colorKey: "couleur_valeur",
  defaultSize: 28,
  minSize: 12,
  maxSize: 96,
};

/** L'allure qu'un texte de la carte prend de la configuration. */
export const appearanceOf = (config: unknown, t: CardText) => ({
  fontSize: count(config, t.sizeKey, t.defaultSize),
  color: text(config, t.colorKey) || t.defaultColor,
});

/** Le temps laissé à un second clic avant d'ouvrir le tiroir. */
const DOUBLE_CLICK_THRESHOLD = 250;

interface IndicatorCard {
  /** Ouvre le tiroir de l'indicateur. */
  openItem: () => void;
  /** Range le nouveau nom ; vide, l'indicateur reprend celui de son type. */
  rename: (name: string) => Promise<void>;
}

/** Ce que la carte d'un panneau donne à son titre. Hors panneau, il n'est que lu. */
export const IndicatorCardContext = createContext<IndicatorCard | null>(null);

export default function IndicatorTitle({ config, defaultValue }: { config: unknown; defaultValue: string }) {
  const card = useContext(IndicatorCardContext);
  const name = text(config, NAME).trim() || defaultValue;
  const appearance = appearanceOf(config, TITLE);
  const [input, setInput] = useState<string | null>(null);
  const waitTimer = useRef<number | undefined>(undefined);
  // Échap referme la saisie sans rien ranger : le « blur » qui peut suivre ne
  // doit pas l'enregistrer quand même.
  const cancelled = useRef(false);
  useEffect(() => () => window.clearTimeout(waitTimer.current), []);

  if (input !== null && card) {
    // Le nom du type n'est pas rangé : il reste celui par défaut.
    const validate = async () => {
      if (cancelled.current) return;
      const value = input.trim();
      setInput(null);
      if (value === name) return;
      await card.rename(value === defaultValue ? "" : value);
    };
    // La saisie vit dans la carte : ni ses appuis ni ses touches ne doivent
    // la glisser ou l'ouvrir.
    return (
      // Comme le renommage d'un onglet (BoardTabs) : un champ nu, qui prend
      // la police du titre et ne déplace rien.
      <Text fw={700} style={appearance}>
        <input
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onBlur={validate}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              cancelled.current = true;
              setInput(null);
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.currentTarget.select()}
          autoFocus
          aria-label="Renommer l'indicateur"
          style={{
            font: "inherit",
            color: "inherit",
            background: "transparent",
            border: "none",
            outline: "none",
            padding: 0,
            margin: 0,
            width: "100%",
          }}
        />
      </Text>
    );
  }

  return (
    <Text
      fw={700}
      truncate
      style={appearance}
      onClick={
        card
          ? (e) => {
              e.stopPropagation();
              window.clearTimeout(waitTimer.current);
              if (e.detail === 1) waitTimer.current = window.setTimeout(card.openItem, DOUBLE_CLICK_THRESHOLD);
            }
          : undefined
      }
      onDoubleClick={
        card
          ? (e) => {
              e.stopPropagation();
              window.clearTimeout(waitTimer.current);
              cancelled.current = false;
              setInput(name);
            }
          : undefined
      }
    >
      {name}
    </Text>
  );
}

/** La valeur d'un indicateur qui compte, à l'allure choisie dans son tiroir. */
export function IndicatorValue({ config, children }: { config: unknown; children: ReactNode }) {
  return (
    <Text fw={600} lh={1} style={appearanceOf(config, VALUE)}>
      {children}
    </Text>
  );
}
