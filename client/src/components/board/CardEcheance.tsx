import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Input,
  Select,
  Text,
} from "@mantine/core";
import { DatePickerInput, TimeInput } from "@mantine/dates";
import { IconChevronDown, IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";
import { DUE_SHAPES, REMINDERS, RECURRENCES } from "@milo/shared";
import type { DueShape, Reminder, Recurrence } from "@milo/shared";
import fields from "../../assets/styles/EcartField.module.css";
import classes from "../../assets/styles/CardEcheance.module.css";
import { ROUNDING, NAME_INSET, rowStyle } from "../ui/LignesDuTiroir";
import {
  DUE_COLOR,
  DUE_WORD,
  dueState,
  withoutTime,
} from "../../lib/echeance";
import { fieldWidth, textWidth } from "../../lib/largeurChamp";
import { GREEN, RED, STRONG_TEXT } from "../../themes/colors";

/** L'échéance d'une carte, telle que la fiche la saisit. */
export interface Due {
  /** Une date seule, ou une période : elle s'enregistre avec la carte. */
  shape: DueShape;
  /** Le début de la période, « AAAA-MM-JJ » ; vide pour une date seule. */
  start: string;
  /** La fin, en ISO ; minuit à l'heure locale vaut « sans heure » (lib/echeance.ts). */
  end: string;
  recurrence: Recurrence;
  reminder: Reminder;
}

export const EMPTY_DUE: Due = {
  shape: "date",
  start: "",
  end: "",
  recurrence: "",
  reminder: "",
};

/** La largeur du statut : tous les badges la prennent, « Bientôt » comme « En retard ». */
const STATUS_WIDTH = 98;

// Les champs de date et d'heure ne prennent que leur largeur : le texte le plus
// long qu'ils montrent, à la taille des champs « xs » (12 px), et RETRAIT_CHAMP
// de part et d'autre. Ni bordure (CardEcheance.module.css) ni icône : Mantine
// masque l'horloge du champ d'heure.
const FIELD_SIZE = 12;

/** L'air de part et d'autre de la valeur, dans le champ. */
const FIELD_INSET = 5;

const widthOf = (...texts: string[]): number =>
  Math.max(...texts.map((t) => textWidth(t, FIELD_SIZE))) +
  2 * FIELD_INSET;

/**
 * Un petit choix discret, comme le type de jalons à droite de la progression
 * d'un projet : sans cadre tant qu'on ne le survole pas, à la largeur de ce
 * qu'il montre.
 */
interface SmallChoiceProps<T extends string> {
  data: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** Le nom écrit à gauche du choix ; à défaut, son libellé. */
  name?: string;
  disabled?: boolean;
}

export function SmallChoice<T extends string>({
  data,
  value,
  onChange,
  label,
  name = label,
  disabled,
}: SmallChoiceProps<T>) {
  // Mantine refuse une valeur vide : « Jamais » et « Aucun » passent par une clé.
  const EMPTY = "-";
  const selected = data.find((d) => d.value === value)?.label ?? "";
  return (
    // Le nom à gauche, au contraste plein — blanc sur le sombre — : il se lit
    // d'abord, la valeur grise ensuite.
    <Group gap={4} wrap="nowrap" align="center">
      <Text span c={STRONG_TEXT} style={{ whiteSpace: "nowrap", fontSize: 11 }}>
        {name}
      </Text>
      <Select
        data={data.map((d) => ({ value: d.value || EMPTY, label: d.label }))}
        value={value || EMPTY}
        onChange={(v) => onChange((v === EMPTY || v === null ? "" : v) as T)}
        allowDeselect={false}
        size="xs"
        w={fieldWidth(selected) + 14}
        withCheckIcon={false}
        rightSection={<IconChevronDown size={10} />}
        rightSectionWidth={14}
        comboboxProps={{
          width: 200,
          position: "bottom-end",
          withinPortal: true,
        }}
        aria-label={label}
        title={label}
        disabled={disabled}
        className={`${fields.champ} ${fields.unite}`}
      />
    </Group>
  );
}

/**
 * Un mot entre deux champs — « du 05/10 au 12/10 à 17:00 » : la ligne se lit
 * comme une phrase. Collé à ses voisins, l'écart de la ligne ne s'y applique
 * pas ; l'air vient du retrait des champs eux-mêmes.
 */
function LinkRecord({ word }: { word: string }) {
  return (
    <Text
      size="xs"
      c="dimmed"
      style={{
        flexShrink: 0,
        marginInline: "calc(5px - var(--mantine-spacing-xs))",
      }}
    >
      {word}
    </Text>
  );
}

/** La date (« AAAA-MM-JJ ») et l'heure (« HH:mm », vide à minuit) d'une fin ISO. */
const split = (end: string): { day: string; hour: string } => {
  const d = dayjs(end);
  if (!end || !d.isValid()) return { day: "", hour: "" };
  return {
    day: d.format("YYYY-MM-DD"),
    hour: withoutTime(end) ? "" : d.format("HH:mm"),
  };
};

const assemble = (day: string, hour: string): string =>
  day ? dayjs(`${day} ${hour || "00:00"}`).toISOString() : "";

/**
 * L'échéance d'une carte, au-dessus de son titre. À droite de l'intitulé, sur
 * une ligne : la forme — « À partir du, jusqu'à » ou « Jusqu'à » seul —, la
 * récurrence et le rappel. Dessous, les dates : le début s'il y en a un, puis
 * le jour et l'heure de la fin. L'heure est facultative.
 */
interface CardDueDateProps {
  value: Due;
  onChange: (value: Due) => void;
  onRemove: () => void;
  readOnly?: boolean;
  /**
   * Une date et son heure seulement, sans forme, récurrence ni rappel : celle
   * d'un ticket. La corbeille n'y paraît qu'une date posée.
   */
  simple?: boolean;
}

export default function CardDueDate({
  value,
  onChange,
  onRemove,
  readOnly,
  simple,
}: CardDueDateProps) {
  const mode = value.shape;

  const { day, hour } = split(value.end);
  const state = dueState(value.end);
  const change = (change: Partial<Due>) =>
    onChange({ ...value, ...change });

  return (
    <div>
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        {simple ? (
          // Dans un bloc, comme Mantine pose le libellé d'un champ : sa ligne
          // prend alors la hauteur de celle du texte, et la ligne d'échéance
          // tombe au niveau du champ voisin — le statut d'une demande.
          <div>
            <Input.Label>Échéance</Input.Label>
          </div>
        ) : (
          <Input.Label>Échéance</Input.Label>
        )}
        {!simple && (
          <Group gap="sm" wrap="nowrap">
            <SmallChoice
              data={DUE_SHAPES}
              value={mode}
              // Une date seule n'a pas de début. Passée en période, sa date en
              // devient le début ; la fin la garde aussi, le temps d'en choisir
              // une autre — sans fin, l'échéance ne s'enregistrerait pas.
              onChange={(shape) =>
                change(
                  shape === "date"
                    ? { shape, start: "" }
                    : { shape, start: value.start || day },
                )
              }
              label="Forme de l'échéance"
              name="Forme"
              disabled={readOnly}
            />
            <SmallChoice
              data={RECURRENCES}
              value={value.recurrence}
              onChange={(recurrence) => change({ recurrence })}
              label="Récurrence"
              disabled={readOnly}
            />
            <SmallChoice
              data={REMINDERS}
              value={value.reminder}
              onChange={(reminder) => change({ reminder })}
              label="Rappel"
              disabled={readOnly}
            />
          </Group>
        )}
      </Group>

      {/* Une ligne, comme celle d'une catégorie dans le tiroir d'un widget :
          le début, la fin et son heure, l'état, et de quoi la retirer. */}
      {/* Les champs n'ont pas de retrait : c'est la ligne qui pose le
          premier à RETRAIT_NOM de son bord. */}
      <Group
        gap="xs"
        wrap="nowrap"
        align="center"
        style={{
          ...rowStyle(0, 1, false),
          paddingLeft: NAME_INSET,
          // Seule, à côté d'un champ ordinaire — le statut d'une demande —,
          // la ligne en prend la hauteur pour tomber à son niveau.
          ...(simple && {
            // La hauteur d'un champ « sm » : sa variable, Mantine ne la pose que
            // sur ses champs.
            height: "calc(2.25rem * var(--mantine-scale))",
            paddingBlock: 0,
          }),
        }}
      >
        {mode === "periode" && (
          <DatePickerInput
            size="xs"
            radius={ROUNDING}
            placeholder="Du"
            aria-label="Du"
            value={value.start || null}
            onChange={(d) => change({ start: d ?? "" })}
            maxDate={day || undefined}
            valueFormat="DD/MM/YYYY"
            popoverProps={{ withinPortal: true }}
            className={classes.champ}
            styles={{
              input: { paddingInline: FIELD_INSET, textAlign: "center" },
            }}
            w={widthOf("00/00/0000", "Du")}
            style={{ flexShrink: 0 }}
            readOnly={readOnly}
          />
        )}
        {mode === "periode" && <LinkRecord word="au" />}
        <DatePickerInput
          size="xs"
          radius={ROUNDING}
          placeholder={mode === "periode" ? "Au" : "Jusqu'au"}
          aria-label={mode === "periode" ? "Au" : "Jusqu'au"}
          value={day || null}
          onChange={(d) => change({ end: assemble(d ?? "", hour) })}
          minDate={value.start || undefined}
          valueFormat="DD/MM/YYYY"
          popoverProps={{ withinPortal: true }}
          className={classes.champ}
          styles={{
            input: { paddingInline: FIELD_INSET, textAlign: "center" },
          }}
          w={widthOf("00/00/0000", "Au", "Jusqu'au")}
          style={{ flexShrink: 0 }}
          readOnly={readOnly}
        />
        <LinkRecord word="à" />
        <TimeInput
          size="xs"
          radius={ROUNDING}
          aria-label="Heure"
          value={hour}
          onChange={(e) =>
            change({ end: assemble(day, e.currentTarget.value) })
          }
          disabled={!day || readOnly}
          className={classes.champ}
          styles={{
            input: { paddingInline: FIELD_INSET, textAlign: "center" },
          }}
          w={widthOf("00:00")}
        />
        {/* L'état et le bouton se calent au bout de la ligne. */}
        <div style={{ flex: 1 }} />
        {/* L'état : en retard, bientôt, ou à venir. */}
        <Box
          w={STATUS_WIDTH}
          style={{ flexShrink: 0, display: "flex", justifyContent: "center" }}
        >
          {state === "aucun" ? (
            // Loin encore : le vert de ce qui va bien, comme une carte
            // terminée.
            day && (
              <Badge color={GREEN} variant="filled" radius="sm" fullWidth>
                À venir
              </Badge>
            )
          ) : (
            <Badge
              color={DUE_COLOR[state]}
              variant="filled"
              radius="sm"
              fullWidth
            >
              {DUE_WORD[state]}
            </Badge>
          )}
        </Box>
        {!readOnly && (!simple || day) && (
          <ActionIcon
            variant="subtle"
            color={RED}
            onClick={onRemove}
            aria-label="Supprimer l'échéance"
            title="Supprimer l'échéance"
          >
            <IconTrash size={16} />
          </ActionIcon>
        )}
      </Group>
    </div>
  );
}
