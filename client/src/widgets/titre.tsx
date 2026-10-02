import { Group, Stack, TextInput, Title } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { ChampCouleur, ChampTaille } from "./champs-style";
import { avec, nombre, texte } from "./types";
import type { AccessWidget, WidgetDisplayProps } from "./types";
import type { ComponentType } from "react";
import type { AccessBlockType } from "@milo/shared";

// Les titres d'une colonne : la catégorie, et la sous-catégorie sous elle. Le
// même objet à deux niveaux — un titre qui se modifie là où il est, au
// double-clic — et rien ne les distingue que leur taille, leur couleur et
// l'air qu'ils laissent en dessous. Ils sont donc décrits une fois ici, et
// chacun n'a plus qu'à dire ces trois-là.

const TITRE = "titre";
const COULEUR = "couleur";
const TAILLE = "taille";

/**
 * Les bornes de la taille : en deçà le titre ne se lit plus, au-delà il
 * déborde de la colonne.
 */
const TAILLE_MIN = 8;
const TAILLE_MAX = 64;

interface TitreOptions {
  type: AccessBlockType;
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** Le niveau du titre : la sous-catégorie vient sous la catégorie. */
  order: 1 | 2;
  /** Ce qu'un titre encore vide laisse voir : la place qu'il tient, et rien de plus. */
  placeholder: string;
  /** La taille par défaut, que la configuration peut remplacer. */
  taille: number;
  /** La graisse du titre ; à défaut, celle de son niveau. */
  graisse?: number;
  /** La couleur par défaut, en hexadécimal : le sélecteur la montre telle quelle. */
  couleur: string;
  /** L'air laissé avant ce qui suit dans la colonne. */
  margeBasse: number;
  /**
   * L'air laissé au-dessus quand un élément le précède. En tête de colonne,
   * le titre n'en prend pas : rien n'est à écarter. Elle peut dépendre du
   * type de cet élément.
   */
  margeHaute?: number | ((previousType: AccessBlockType) => number);
}

const affichage = (options: TitreOptions): ComponentType<WidgetDisplayProps> =>
  function TitreEditable({ config, onChange }: WidgetDisplayProps) {
    const [edition, setEdition] = useState(false);
    const [brouillon, setBrouillon] = useState("");
    // Le titre qui vient d'être saisi, le temps que le serveur le renvoie :
    // sans lui, l'ancien reparaîtrait un instant entre la saisie et la réponse.
    const [enAttente, setEnAttente] = useState<string | null>(null);
    const champ = useRef<HTMLInputElement | null>(null);

    const enregistre = texte(config, TITRE);
    const taille = nombre(config, TAILLE, options.taille);
    const couleur = texte(config, COULEUR, options.couleur) || options.couleur;
    const titre = enAttente ?? enregistre;

    // Le champ prend le focus dès qu'il paraît, et la saisie s'y trouve déjà
    // sélectionnée : le double-clic vaut « je remplace ce titre ».
    useEffect(() => {
      if (!edition) return;
      champ.current?.focus();
      champ.current?.select();
    }, [edition]);

    const ouvrir = () => {
      setBrouillon(titre);
      setEdition(true);
    };

    // Le titre part au serveur en refermant la saisie — c'est le seul geste
    // qu'elle porte. Inchangé, rien n'est envoyé.
    const fermer = async () => {
      setEdition(false);
      const nouveau = brouillon.trim();
      if (nouveau === titre) return;
      setEnAttente(nouveau);
      try {
        await onChange(avec(config, TITRE, nouveau));
      } finally {
        // La configuration relue prend le relais — ou, si le serveur a
        // refusé, le titre enregistré reparaît.
        setEnAttente(null);
      }
    };

    if (edition) {
      return (
        <TextInput
          ref={champ}
          aria-label={options.label}
          placeholder={options.placeholder}
          value={brouillon}
          onChange={(e) => setBrouillon(e.currentTarget.value)}
          onBlur={fermer}
          onKeyDown={(e) => {
            if (e.key === "Enter") fermer();
            // Échap renonce : le titre d'avant reste.
            if (e.key === "Escape") setEdition(false);
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
              fontSize: taille,
              fontWeight:
                options.graisse ?? `var(--mantine-h${options.order}-font-weight)`,
              lineHeight: `var(--mantine-h${options.order}-line-height)`,
              color: couleur,
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
        size={taille}
        fw={options.graisse}
        onDoubleClick={ouvrir}
        c={couleur}
        // La main : le titre se double-clique, il ne se saisit pas là où il
        // est posé — le caret laisserait croire qu'on écrit déjà dedans.
        // Un titre encore vide garde sa couleur : c'est le même titre, il
        // attend seulement son nom.
        style={{ cursor: "pointer" }}
      >
        {titre || options.placeholder}
      </Title>
    );
  };

/** Le widget d'un titre, à partir de ce qui le distingue de l'autre. */
export const creerTitreWidget = (options: TitreOptions): AccessWidget => ({
  type: options.type,
  // Les titres sont des widgets communs à tous les modes.
  kind: "common",
  label: options.label,
  icon: options.icon,
  // Un titre neuf est vide : on le nomme en double-cliquant dessus, là où il
  // est, plutôt que dans un tiroir qui s'ouvrirait aussitôt.
  defaultConfig: { [TITRE]: "" },
  inlineEdit: true,
  ownClicks: true,

  Display: affichage(options),

  marges: (previousType) => ({
    haute:
      previousType === null
        ? 0
        : typeof options.margeHaute === "function"
          ? options.margeHaute(previousType)
          : (options.margeHaute ?? 0),
    basse: options.margeBasse,
  }),

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <TextInput
        label="Titre"
        placeholder={options.placeholder}
        value={texte(config, TITRE)}
        onChange={(e) => onChange(avec(config, TITRE, e.currentTarget.value))}
        autoFocus
      />
      <Group align="flex-start">
        <ChampCouleur config={config} onChange={onChange} cle={COULEUR} defaut={options.couleur} />
        <ChampTaille
          config={config}
          onChange={onChange}
          cle={TAILLE}
          defaut={options.taille}
          min={TAILLE_MIN}
          max={TAILLE_MAX}
        />
      </Group>
    </Stack>
  ),
});
