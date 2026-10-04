import { Input, Text, TextInput } from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconHash, IconTrash } from "@tabler/icons-react";
import { Fragment, useRef, useState } from "react";
import classes from "../assets/styles/AccessNumber.module.css";
import ListItems from "../components/ui/ListItems";
import { DragHandle, InsertLine, useDraggableStack } from "../components/ui/DraggableStack";
import { STRONG_TEXT } from "../themes/colors";
import { SUBCATEGORY_COLOR, SUBCATEGORY_GAP } from "./subcategory";
import { isFramed, text } from "./types";
import type { AccessWidget, WidgetConfigProps } from "./types";
import type { AccessBlockType } from "@milo/shared";
import type { KeyboardEvent } from "react";

// Des numéros : des références que l'on vient lire — une ligne téléphonique,
// un contrat, un poste. Chaque ligne porte un libellé, qui dit lequel, et le
// numéro, qui se détache à droite. Toutes tiennent dans un même encart, sur
// deux colonnes.

const ROWS = "lines";

interface Row {
  label: string;
  number: string;
}

const EMPTY_ROW: Row = { label: "", number: "" };

// Au-delà de dix lignes, la liste défile.
const VISIBLE_ROWS = 10;

// Hauteur d'un champ dans sa ligne : celle du texte, comme le renommage d'une
// catégorie (LookupManager). Un champ « sm » fait 36 px, plus que la ligne.
const FIELD_HEIGHT = 22;
const INLINE_FIELD = {
  input: { height: FIELD_HEIGHT, minHeight: FIELD_HEIGHT, lineHeight: `${FIELD_HEIGHT}px` },
};

/**
 * Les lignes de l'élément ; une ligne abîmée comble ce qui lui manque. Un
 * élément rangé avant les lignes multiples a reçu la sienne à la migration
 * (migrateWidgetConfig).
 */
const rows = (config: unknown): Row[] => {
  const raw = (config as Record<string, unknown> | null)?.[ROWS];
  return Array.isArray(raw)
    ? raw.map((l) => ({ label: text(l, "label"), number: text(l, "number") }))
    : [];
};

/** Les lignes seules. */
const store = (list: Row[]): Record<string, unknown> => ({ [ROWS]: list });

/** Les éléments qui portent déjà leur propre air, au-dessus et au-dessous d'eux. */
const TITLES: AccessBlockType[] = ["category", "subcategory"];

/**
 * L'air autour de l'encart : celui d'une sous-catégorie, en haut comme en bas.
 * Rien en tête ni en bout de colonne. Rien non plus contre un titre, qui
 * laisse déjà le sien — les deux s'additionneraient, la colonne étant en
 * flex, où les marges ne se fondent pas. Et entre deux encarts, seul le
 * premier le pose, pour la même raison.
 */
const highMargin = (previous: AccessBlockType | null): number =>
  previous === null || previous === "number" || TITLES.includes(previous)
    ? 0
    : SUBCATEGORY_GAP;
const lowMargin = (next: AccessBlockType | null): number =>
  next === null || TITLES.includes(next) ? 0 : SUBCATEGORY_GAP;

/**
 * Les lignes, dans la liste des catégories et des étiquettes (ListItems) :
 * chaque ligne se modifie sur place, se glisse par sa poignée ou se déplace
 * d'un cran par le clic droit, qui la supprime aussi ; la dernière en ajoute
 * une. Au-delà de dix, la liste défile. Tout reste dans le brouillon du
 * tiroir jusqu'à l'enregistrement.
 */
function Rows({ config, onChange }: WidgetConfigProps) {
  const list = rows(config);
  const [newRow, setNewRow] = useState<Row>(EMPTY_ROW);
  const firstField = useRef<HTMLInputElement | null>(null);

  const change = (index: number, field: keyof Row, value: string) =>
    onChange(store(list.map((l, i) => (i === index ? { ...l, [field]: value } : l))));

  // Les lignes n'ont pas d'identifiant : leur rang en tient lieu, le temps
  // du geste. L'ordre reçu est celui des anciens rangs.
  const handleReorder = (order: number[]) => onChange(store(order.flatMap((i) => list[i] ?? [])));
  const { zoneRef, drag, onPointerDown } = useDraggableStack({
    ids: list.map((_, i) => i),
    selector: "[data-attribute-row]",
    onReorder: handleReorder,
  });

  // Un cran vers le haut ou vers le bas, depuis le menu de la ligne.
  const move = (index: number, to: number) => {
    const order = list.map((_, i) => i).filter((i) => i !== index);
    order.splice(to, 0, index);
    handleReorder(order);
  };

  // Le focus revient au libellé : la saisie suivante enchaîne.
  const add = () => {
    const row = { label: newRow.label.trim(), number: newRow.number.trim() };
    if (!row.label && !row.number) return;
    onChange(store([...list, row]));
    setNewRow(EMPTY_ROW);
    firstField.current?.focus();
  };

  // Entrée ajoute depuis l'un ou l'autre champ de la ligne d'ajout.
  const addKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
    if (e.key === "Escape") setNewRow(EMPTY_ROW);
  };

  return (
    <Input.Wrapper label="Attributs">
      <ListItems
        isEmpty={list.length === 0}
        emptyIcon={IconHash}
        emptyText="Aucun attribut"
        maxRows={VISIBLE_ROWS}
        add={{
          // Le libellé se glisse avant le champ du numéro, qui porte au bout
          // le symbole Entrée de la liste.
          section: (
            <TextInput
              ref={firstField}
              placeholder="Libellé"
              aria-label="Libellé"
              value={newRow.label}
              onChange={(e) => setNewRow({ ...newRow, label: e.currentTarget.value })}
              onKeyDown={addKeyDown}
              variant="unstyled"
              size="sm"
              style={{ flex: 1, minWidth: 0 }}
              autoFocus
            />
          ),
          // Du texte et non un nombre : un numéro se copie tel qu'il s'écrit,
          // avec ses espaces, ses points et son éventuel indicatif.
          placeholder: "Numéro",
          value: newRow.number,
          onChange: (number) => setNewRow({ ...newRow, number }),
          onSubmit: add,
          onCancel: () => setNewRow(EMPTY_ROW),
        }}
      >
        <div ref={zoneRef}>
          {list.map((l, i) => (
            <div key={i} data-attribute-row style={{ opacity: drag?.id === i ? 0.4 : 1 }}>
              {drag?.target === i && <InsertLine />}
              <ListItems.Row
                actions={[
                  ...(i > 0
                    ? [{ label: "Monter", icon: IconArrowUp, onClick: () => move(i, i - 1) }]
                    : []),
                  ...(i < list.length - 1
                    ? [{ label: "Descendre", icon: IconArrowDown, onClick: () => move(i, i + 1) }]
                    : []),
                  {
                    label: "Supprimer",
                    icon: IconTrash,
                    onClick: () => onChange(store(list.filter((_, j) => j !== i))),
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
                      value={l.label}
                      onChange={(e) => change(i, "label", e.currentTarget.value)}
                      variant="unstyled"
                      size="sm"
                      style={{ flex: 1, minWidth: 0 }}
                      styles={INLINE_FIELD}
                    />
                    <TextInput
                      placeholder="Numéro"
                      aria-label="Numéro"
                      value={l.number}
                      onChange={(e) => change(i, "number", e.currentTarget.value)}
                      variant="unstyled"
                      size="sm"
                      style={{ flex: 1, minWidth: 0 }}
                      styles={INLINE_FIELD}
                    />
                  </>
                )}
              </ListItems.Row>
            </div>
          ))}
          {drag && drag.target >= list.length && <InsertLine />}
        </div>
      </ListItems>
    </Input.Wrapper>
  );
}

export const numberWidget: AccessWidget = {
  type: "number",
  kind: "common",
  label: "Attributs",
  icon: IconHash,
  defaultConfig: { [ROWS]: [] },

  // Toujours encadrés jusqu'ici : ils le restent tant qu'on ne retire pas
  // leur cadre, dans le bloc « Apparence » du tiroir.
  ownFrame: true,
  defaultFrame: true,

  Display: ({ config }) => {
    const list = rows(config);
    return (
      <div
        className={isFramed(config, true) ? classes.inset : undefined}
        style={{ border: "none" }}
      >
        {list.length === 0 ? (
          <Text size="sm" c={SUBCATEGORY_COLOR}>
            Attributs
          </Text>
        ) : (
          <div className={classes.grid}>
            {list.map((l, i) => (
              <Fragment key={i}>
                <Text size="sm" c={SUBCATEGORY_COLOR} truncate>
                  {l.label || "Numéro"}
                </Text>
                {/* Blanc sur le thème sombre ; sur le clair, dont l'encart est
                    gris pâle, le blanc ne se lirait pas : quasi-noir. */}
                <Text size="sm" fw={600} c={STRONG_TEXT} className={classes.number}>
                  {l.number || "—"}
                </Text>
              </Fragment>
            ))}
          </div>
        )}
      </div>
    );
  },

  Config: Rows,

  margins: (previousType, nextType) => ({
    top: highMargin(previousType),
    bottom: lowMargin(nextType),
  }),
};
