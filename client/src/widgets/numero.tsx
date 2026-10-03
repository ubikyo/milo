import { Input, Text, TextInput } from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconHash, IconTrash } from "@tabler/icons-react";
import { Fragment, useRef, useState } from "react";
import classes from "../assets/styles/AccessNumero.module.css";
import ListItems from "../components/ui/ListItems";
import { DragHandle, InsertLine, usePileGlissante } from "../components/ui/PileGlissante";
import { STRONG_TEXT } from "../themes/colors";
import { COULEUR_SOUS_CATEGORIE, ECART_SOUS_CATEGORIE } from "./sous-categorie";
import { texte } from "./types";
import type { AccessWidget, WidgetConfigProps } from "./types";
import type { AccessBlockType } from "@milo/shared";
import type { KeyboardEvent } from "react";

// Des numéros : des références que l'on vient lire — une ligne téléphonique,
// un contrat, un poste. Chaque ligne porte un libellé, qui dit lequel, et le
// numéro, qui se détache à droite. Toutes tiennent dans un même encart, sur
// deux colonnes.

const LIGNES = "lignes";

// Les champs d'une version antérieure, qui ne rangeait qu'un seul numéro.
const ANCIEN_LIBELLE = "libelle";
const ANCIENNE_VALEUR = "valeur";

interface Ligne {
  libelle: string;
  numero: string;
}

const LIGNE_VIDE: Ligne = { libelle: "", numero: "" };

// Au-delà de dix lignes, la liste défile.
const LIGNES_VISIBLES = 10;

// Hauteur d'un champ dans sa ligne : celle du texte, comme le renommage d'une
// catégorie (LookupManager). Un champ « sm » fait 36 px, plus que la ligne.
const FIELD_HEIGHT = 22;
const CHAMP_EN_LIGNE = {
  input: { height: FIELD_HEIGHT, minHeight: FIELD_HEIGHT, lineHeight: `${FIELD_HEIGHT}px` },
};

/**
 * Les lignes de l'élément. Un élément rangé avant les lignes multiples se
 * relit comme une ligne unique ; une ligne abîmée comble ce qui lui manque.
 */
const lignes = (config: unknown): Ligne[] => {
  const brut = (config as Record<string, unknown> | null)?.[LIGNES];
  if (Array.isArray(brut)) {
    return brut.map((l) => ({ libelle: texte(l, "libelle"), numero: texte(l, "numero") }));
  }
  const libelle = texte(config, ANCIEN_LIBELLE);
  const numero = texte(config, ANCIENNE_VALEUR);
  return libelle || numero ? [{ libelle, numero }] : [];
};

/** Les lignes seules : les anciens champs, une fois repris, n'ont plus à suivre. */
const ranger = (liste: Ligne[]): Record<string, unknown> => ({ [LIGNES]: liste });

/** Les éléments qui portent déjà leur propre air, au-dessus et au-dessous d'eux. */
const TITRES: AccessBlockType[] = ["category", "subcategory"];

/**
 * L'air autour de l'encart : celui d'une sous-catégorie, en haut comme en bas.
 * Rien en tête ni en bout de colonne. Rien non plus contre un titre, qui
 * laisse déjà le sien — les deux s'additionneraient, la colonne étant en
 * flex, où les marges ne se fondent pas. Et entre deux encarts, seul le
 * premier le pose, pour la même raison.
 */
const margeHaute = (precedent: AccessBlockType | null): number =>
  precedent === null || precedent === "number" || TITRES.includes(precedent)
    ? 0
    : ECART_SOUS_CATEGORIE;
const margeBasse = (suivant: AccessBlockType | null): number =>
  suivant === null || TITRES.includes(suivant) ? 0 : ECART_SOUS_CATEGORIE;

/**
 * Les lignes, dans la liste des catégories et des étiquettes (ListItems) :
 * chaque ligne se modifie sur place, se glisse par sa poignée ou se déplace
 * d'un cran par le clic droit, qui la supprime aussi ; la dernière en ajoute
 * une. Au-delà de dix, la liste défile. Tout reste dans le brouillon du
 * tiroir jusqu'à l'enregistrement.
 */
function Lignes({ config, onChange }: WidgetConfigProps) {
  const liste = lignes(config);
  const [nouvelle, setNouvelle] = useState<Ligne>(LIGNE_VIDE);
  const premierChamp = useRef<HTMLInputElement | null>(null);

  const changer = (index: number, champ: keyof Ligne, valeur: string) =>
    onChange(ranger(liste.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l))));

  // Les lignes n'ont pas d'identifiant : leur rang en tient lieu, le temps
  // du geste. L'ordre reçu est celui des anciens rangs.
  const reordonner = (ordre: number[]) => onChange(ranger(ordre.flatMap((i) => liste[i] ?? [])));
  const { zoneRef, drag, onPointerDown } = usePileGlissante({
    ids: liste.map((_, i) => i),
    selector: "[data-ligne-attribut]",
    onReorder: reordonner,
  });

  // Un cran vers le haut ou vers le bas, depuis le menu de la ligne.
  const deplacer = (index: number, vers: number) => {
    const ordre = liste.map((_, i) => i).filter((i) => i !== index);
    ordre.splice(vers, 0, index);
    reordonner(ordre);
  };

  // Le focus revient au libellé : la saisie suivante enchaîne.
  const ajouter = () => {
    const ligne = { libelle: nouvelle.libelle.trim(), numero: nouvelle.numero.trim() };
    if (!ligne.libelle && !ligne.numero) return;
    onChange(ranger([...liste, ligne]));
    setNouvelle(LIGNE_VIDE);
    premierChamp.current?.focus();
  };

  // Entrée ajoute depuis l'un ou l'autre champ de la ligne d'ajout.
  const toucheAjout = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      ajouter();
    }
    if (e.key === "Escape") setNouvelle(LIGNE_VIDE);
  };

  return (
    <Input.Wrapper label="Attributs">
      <ListItems
        isEmpty={liste.length === 0}
        emptyIcon={IconHash}
        emptyText="Aucun attribut"
        maxRows={LIGNES_VISIBLES}
        add={{
          // Le libellé se glisse avant le champ du numéro, qui porte au bout
          // le symbole Entrée de la liste.
          section: (
            <TextInput
              ref={premierChamp}
              placeholder="Libellé"
              aria-label="Libellé"
              value={nouvelle.libelle}
              onChange={(e) => setNouvelle({ ...nouvelle, libelle: e.currentTarget.value })}
              onKeyDown={toucheAjout}
              variant="unstyled"
              size="sm"
              style={{ flex: 1, minWidth: 0 }}
              autoFocus
            />
          ),
          // Du texte et non un nombre : un numéro se copie tel qu'il s'écrit,
          // avec ses espaces, ses points et son éventuel indicatif.
          placeholder: "Numéro",
          value: nouvelle.numero,
          onChange: (numero) => setNouvelle({ ...nouvelle, numero }),
          onSubmit: ajouter,
          onCancel: () => setNouvelle(LIGNE_VIDE),
        }}
      >
        <div ref={zoneRef}>
          {liste.map((l, i) => (
            <div key={i} data-ligne-attribut style={{ opacity: drag?.id === i ? 0.4 : 1 }}>
              {drag?.target === i && <InsertLine />}
              <ListItems.Row
                actions={[
                  ...(i > 0
                    ? [{ label: "Monter", icon: IconArrowUp, onClick: () => deplacer(i, i - 1) }]
                    : []),
                  ...(i < liste.length - 1
                    ? [{ label: "Descendre", icon: IconArrowDown, onClick: () => deplacer(i, i + 1) }]
                    : []),
                  {
                    label: "Supprimer",
                    icon: IconTrash,
                    onClick: () => onChange(ranger(liste.filter((_, j) => j !== i))),
                    danger: true,
                  },
                ]}
              >
                {(active) => (
                  <>
                    {/* Seule la poignée déplace la ligne : les champs gardent leurs clics. */}
                    <DragHandle
                      onPointerDown={onPointerDown(i, i)}
                      visible={active}
                      label="Glisser pour réordonner"
                    />
                    <TextInput
                      placeholder="Libellé"
                      aria-label="Libellé"
                      value={l.libelle}
                      onChange={(e) => changer(i, "libelle", e.currentTarget.value)}
                      variant="unstyled"
                      size="sm"
                      style={{ flex: 1, minWidth: 0 }}
                      styles={CHAMP_EN_LIGNE}
                    />
                    <TextInput
                      placeholder="Numéro"
                      aria-label="Numéro"
                      value={l.numero}
                      onChange={(e) => changer(i, "numero", e.currentTarget.value)}
                      variant="unstyled"
                      size="sm"
                      style={{ flex: 1, minWidth: 0 }}
                      styles={CHAMP_EN_LIGNE}
                    />
                  </>
                )}
              </ListItems.Row>
            </div>
          ))}
          {drag && drag.target >= liste.length && <InsertLine />}
        </div>
      </ListItems>
    </Input.Wrapper>
  );
}

export const numeroWidget: AccessWidget = {
  type: "number",
  kind: "common",
  label: "Attributs",
  icon: IconHash,
  defaultConfig: { [LIGNES]: [] },

  Display: ({ config }) => {
    const liste = lignes(config);
    return (
      <div className={classes.encart} style={{ border: "none" }}>
        {liste.length === 0 ? (
          <Text size="sm" c={COULEUR_SOUS_CATEGORIE}>
            Attributs
          </Text>
        ) : (
          <div className={classes.grille}>
            {liste.map((l, i) => (
              <Fragment key={i}>
                <Text size="sm" c={COULEUR_SOUS_CATEGORIE} truncate>
                  {l.libelle || "Numéro"}
                </Text>
                {/* Blanc sur le thème sombre ; sur le clair, dont l'encart est
                    gris pâle, le blanc ne se lirait pas : quasi-noir. */}
                <Text size="sm" fw={600} c={STRONG_TEXT} className={classes.numero}>
                  {l.numero || "—"}
                </Text>
              </Fragment>
            ))}
          </div>
        )}
      </div>
    );
  },

  Config: Lignes,

  marges: (previousType, nextType) => ({
    haute: margeHaute(previousType),
    basse: margeBasse(nextType),
  }),
};
