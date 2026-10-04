import { Text } from "@mantine/core";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { count, text } from "../../widgets/types";

// An indicator's title: its name, or failing that the one the widget gives it.
// A double click changes it in place; a single click opens the drawer, as
// elsewhere on the card — delayed long enough to see whether a second one
// follows. Bold and white, like the column titles.

/** The name's key in the configuration: the same for all widgets. */
export const NAME = "name";

// The card's look, the same for all indicators: the color and size of its title
// and value, and the color of its background (AppearanceFields). When absent,
// the card keeps the panel's default look (IndicatorsPanel).
export const BACKGROUND = "background";

/** A card text — its title, its value — and its settings. */
export interface CardText {
  sizeKey: string;
  colorKey: string;
  defaultSize: number;
  /** The size bounds: readable, without overflowing the card. */
  minSize: number;
  maxSize: number;
  /** Its color with no setting; failing that, the theme's text color. */
  defaultColor?: string;
}

/** The title: in white, like the column titles, at size "sm". */
export const TITLE: CardText = {
  sizeKey: "title_size",
  colorKey: "title_color",
  defaultSize: 14,
  minSize: 8,
  maxSize: 48,
  defaultColor: "#ffffff",
};

/** The value of an indicator that counts — tickets, cards, projects, positions. */
export const VALUE: CardText = {
  sizeKey: "value_size",
  colorKey: "value_color",
  defaultSize: 28,
  minSize: 12,
  maxSize: 96,
};

/** The look a card text takes from the configuration. */
export const appearanceOf = (config: unknown, t: CardText) => ({
  fontSize: count(config, t.sizeKey, t.defaultSize),
  color: text(config, t.colorKey) || t.defaultColor,
});

/** The time left for a second click before opening the drawer. */
const DOUBLE_CLICK_THRESHOLD = 250;

interface IndicatorCard {
  /** Opens the indicator's drawer. */
  openItem: () => void;
  /** Stores the new name; when empty, the indicator goes back to its type's name. */
  rename: (name: string) => Promise<void>;
}

/** What a panel's card gives its title. Outside a panel, it is only read. */
export const IndicatorCardContext = createContext<IndicatorCard | null>(null);

export default function IndicatorTitle({ config, defaultValue }: { config: unknown; defaultValue: string }) {
  const card = useContext(IndicatorCardContext);
  const name = text(config, NAME).trim() || defaultValue;
  const appearance = appearanceOf(config, TITLE);
  const [input, setInput] = useState<string | null>(null);
  const waitTimer = useRef<number | undefined>(undefined);
  // Escape closes the edit without storing anything: the "blur" that may follow
  // must not save it anyway.
  const cancelled = useRef(false);
  useEffect(() => () => window.clearTimeout(waitTimer.current), []);

  if (input !== null && card) {
    // The type's name is not stored: it stays the default one.
    const validate = async () => {
      if (cancelled.current) return;
      const value = input.trim();
      setInput(null);
      if (value === name) return;
      await card.rename(value === defaultValue ? "" : value);
    };
    // The input lives inside the card: neither its presses nor its keys must
    // drag or open it.
    return (
      // Like renaming a tab (BoardTabs): a bare field, which takes the title's
      // font and moves nothing.
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

/** The value of an indicator that counts, in the look chosen in its drawer. */
export function IndicatorValue({ config, children }: { config: unknown; children: ReactNode }) {
  return (
    <Text fw={600} lh={1} style={appearanceOf(config, VALUE)}>
      {children}
    </Text>
  );
}
