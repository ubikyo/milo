import { Stack, TextInput, Title } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { insertRow, type SettingRow } from "../components/ui/SettingRows";
import { withField, count, text } from "./types";
import type { AccessWidget, WidgetDisplayProps } from "./types";
import type { ComponentType } from "react";
import type { AccessBlockType } from "@milo/shared";

// Les titres d'une colonne : la catégorie, et la sous-catégorie sous elle. Le
// même objet à deux niveaux — un titre qui se modifie là où il est, au
// double-clic — et rien ne les distingue que leur taille, leur couleur et
// l'air qu'ils laissent en dessous. Ils sont donc décrits une fois ici, et
// chacun n'a plus qu'à dire ces trois-là.

const TITLE = "titre";
const COLOR = "couleur";
const SIZE = "taille";

/**
 * Les bornes de la taille : en deçà le titre ne se lit plus, au-delà il
 * déborde de la colonne.
 */
const SIZE_MIN = 8;
const SIZE_MAX = 64;

interface TitleOptions {
  type: AccessBlockType;
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** Le niveau du titre : la sous-catégorie vient sous la catégorie. */
  order: 1 | 2;
  /** Ce qu'un titre encore vide laisse voir : la place qu'il tient, et rien de plus. */
  placeholder: string;
  /** La taille par défaut, que la configuration peut remplacer. */
  size: number;
  /** La graisse du titre ; à défaut, celle de son niveau. */
  weight?: number;
  /** La couleur par défaut, en hexadécimal : le sélecteur la montre telle quelle. */
  color: string;
  /** L'air laissé avant ce qui suit dans la colonne. */
  lowMargin: number;
  /**
   * L'air laissé au-dessus quand un élément le précède. En tête de colonne,
   * le titre n'en prend pas : rien n'est à écarter. Elle peut dépendre du
   * type de cet élément.
   */
  highMargin?: number | ((previousType: AccessBlockType) => number);
}

/** La ligne « Texte » du tiroir : la couleur et la taille du titre. */
const textLine = (
  config: unknown,
  onChange: (config: Record<string, unknown>) => void,
  options: TitleOptions,
): SettingRow => {
  const color = text(config, COLOR);
  const size = count(config, SIZE, options.size);
  return {
    name: "Texte",
    what: "du titre",
    // La couleur du titre, ramenée à la sienne, n'est plus rangée.
    color: {
      value: color,
      onChange: (v) => onChange(insertRow(config, { [COLOR]: v === options.color ? "" : v })),
    },
    size: {
      value: size,
      defaultValue: options.size,
      min: SIZE_MIN,
      max: SIZE_MAX,
      onChange: (v) => onChange(insertRow(config, { [SIZE]: v === options.size ? "" : v })),
    },
    modified: (color !== "" && color !== options.color) || size !== options.size,
    reset: () => onChange(insertRow(config, { [COLOR]: "", [SIZE]: "" })),
  };
};

const display = (options: TitleOptions): ComponentType<WidgetDisplayProps> =>
  function EditableTitle({ config, onChange }: WidgetDisplayProps) {
    const [editMode, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    // Le titre qui vient d'être saisi, le temps que le serveur le renvoie :
    // sans lui, l'ancien reparaîtrait un instant entre la saisie et la réponse.
    const [pending, setPending] = useState<string | null>(null);
    const field = useRef<HTMLInputElement | null>(null);

    const saved = text(config, TITLE);
    const size = count(config, SIZE, options.size);
    const color = text(config, COLOR, options.color) || options.color;
    const title = pending ?? saved;

    // Le champ prend le focus dès qu'il paraît, et la saisie s'y trouve déjà
    // sélectionnée : le double-clic vaut « je remplace ce titre ».
    useEffect(() => {
      if (!editMode) return;
      field.current?.focus();
      field.current?.select();
    }, [editMode]);

    const openItem = () => {
      setDraft(title);
      setEditing(true);
    };

    // Le titre part au serveur en refermant la saisie — c'est le seul geste
    // qu'elle porte. Inchangé, rien n'est envoyé.
    const close = async () => {
      setEditing(false);
      const newValue = draft.trim();
      if (newValue === title) return;
      setPending(newValue);
      try {
        await onChange(withField(config, TITLE, newValue));
      } finally {
        // La configuration relue prend le relais — ou, si le serveur a
        // refusé, le titre enregistré reparaît.
        setPending(null);
      }
    };

    if (editMode) {
      return (
        <TextInput
          ref={field}
          aria-label={options.label}
          placeholder={options.placeholder}
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={close}
          onKeyDown={(e) => {
            if (e.key === "Enter") close();
            // Échap renonce : le titre d'avant reste.
            if (e.key === "Escape") setEditing(false);
          }}
          // Le champ prend exactement la place du titre qu'il remplace,
          // sinon la ligne — et tout ce qui la suit — sauterait au
          // double-clic. Mantine laisse deux choses au champ « unstyled » :
          // une bordure transparente d'un pixel, et une hauteur minimale de
          // 36 pixels, bien plus que la ligne d'un titre de 16 ou 18. Les
          // deux sont retirées, et la graisse comme l'interligne sont repris
          // du niveau de titre plutôt que devinés.
          variant="unstyled"
          styles={{
            input: {
              fontSize: size,
              fontWeight:
                options.weight ?? `var(--mantine-h${options.order}-font-weight)`,
              lineHeight: `var(--mantine-h${options.order}-line-height)`,
              color: color,
              height: "auto",
              minHeight: 0,
              border: "none",
            },
          }}
        />
      );
    }

    return (
      <Title
        order={options.order}
        size={size}
        fw={options.weight}
        onDoubleClick={openItem}
        c={color}
        // La main : le titre se double-clique, il ne se saisit pas là où il
        // est posé — le caret laisserait croire qu'on écrit déjà dedans.
        // Un titre encore vide garde sa couleur : c'est le même titre, il
        // attend seulement son nom.
        style={{ cursor: "pointer" }}
      >
        {title || options.placeholder}
      </Title>
    );
  };

/** Le widget d'un titre, à partir de ce qui le distingue de l'autre. */
export const createWidgetTitle = (options: TitleOptions): AccessWidget => ({
  type: options.type,
  // Les titres sont des widgets communs à tous les modes.
  kind: "common",
  label: options.label,
  icon: options.icon,
  // Un titre neuf est vide : on le nomme en double-cliquant dessus, là où il
  // est, plutôt que dans un tiroir qui s'ouvrirait aussitôt.
  defaultConfig: { [TITLE]: "" },
  inlineEdit: true,
  ownClicks: true,

  Display: display(options),

  margins: (previousType) => ({
    top:
      previousType === null
        ? 0
        : typeof options.highMargin === "function"
          ? options.highMargin(previousType)
          : (options.highMargin ?? 0),
    bottom: options.lowMargin,
  }),

  appearance: (config, onChange) => [textLine(config, onChange, options)],

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <TextInput
        label="Titre"
        placeholder={options.placeholder}
        value={text(config, TITLE)}
        onChange={(e) => onChange(withField(config, TITLE, e.currentTarget.value))}
        autoFocus
      />
    </Stack>
  ),
});
