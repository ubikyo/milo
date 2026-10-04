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
import fields from "../../assets/styles/GapField.module.css";
import classes from "../../assets/styles/CardDueDate.module.css";
import { ROUNDING, NAME_INSET, rowStyle } from "../ui/DrawerRows";
import {
  DUE_COLOR,
  DUE_WORD,
  dueState,
  withoutTime,
} from "../../lib/due";
import { fieldWidth, textWidth } from "../../lib/fieldWidth";
import { GREEN, RED, STRONG_TEXT } from "../../themes/colors";

/** A card's due date, as the form captures it. */
export interface Due {
  /** A single date, or a period: it is saved with the card. */
  shape: DueShape;
  /** The period's start, "YYYY-MM-DD"; empty for a single date. */
  start: string;
  /** The end, in ISO; midnight local time means "no time" (lib/due.ts). */
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

/** The status width: all badges take it, "Bientôt" as well as "En retard". */
const STATUS_WIDTH = 98;

// The date and time fields only take their own width: the longest text
// they show, at the size of the "xs" fields (12 px), plus FIELD_INSET
// on each side. No border (CardDueDate.module.css) and no icon: Mantine
// hides the clock of the time field.
const FIELD_SIZE = 12;

/** The room on either side of the value, inside the field. */
const FIELD_INSET = 5;

const widthOf = (...texts: string[]): number =>
  Math.max(...texts.map((t) => textWidth(t, FIELD_SIZE))) +
  2 * FIELD_INSET;

/**
 * A small discreet picker, like the milestone type to the right of a
 * project's progress: frameless until hovered, as wide as what
 * it shows.
 */
interface SmallChoiceProps<T extends string> {
  data: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** The name written to the left of the picker; by default, its label. */
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
  // Mantine refuses an empty value: "Jamais" and "Aucun" go through a key.
  const EMPTY = "-";
  const selected = data.find((d) => d.value === value)?.label ?? "";
  return (
    // The name on the left, in full contrast — white on dark —: it is read
    // first, the gray value after.
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
        className={`${fields.field} ${fields.unit}`}
      />
    </Group>
  );
}

/**
 * A word between two fields — "du 05/10 au 12/10 à 17:00": the row reads
 * like a sentence. Stuck to its neighbors, the row's gap does not apply
 * to it; the spacing comes from the fields' own inset.
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

/** The date ("YYYY-MM-DD") and time ("HH:mm", empty at midnight) of an ISO end. */
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
 * A card's due date, above its title. To the right of the label, on one
 * row: the form — "À partir du, jusqu'à" or "Jusqu'à" alone —, the
 * recurrence and the reminder. Below, the dates: the start if there is
 * one, then the day and time of the end. The time is optional.
 */
interface CardDueDateProps {
  value: Due;
  onChange: (value: Due) => void;
  onRemove: () => void;
  readOnly?: boolean;
  /**
   * A date and its time only, with no form, recurrence or reminder: that
   * of a ticket. The trash only appears on a set date.
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
          // In a block, as Mantine places a field's label: its row
          // then takes the height of the text row, and the due date row
          // lands level with the neighboring field — a request's status.
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
              // A single date has no start. Switched to a period, its date
              // becomes the start; the end keeps it too, while another is being
              // chosen — without an end, the due date would not be saved.
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

      {/* A row, like that of a category in a widget drawer:
          the start, the end and its time, the state, and a way to remove it. */}
      {/* The fields have no inset: the row places the
          first one at NAME_INSET from its edge. */}
      <Group
        gap="xs"
        wrap="nowrap"
        align="center"
        style={{
          ...rowStyle(0, 1, false),
          paddingLeft: NAME_INSET,
          // Alone, next to an ordinary field — a request's status —,
          // the row takes its height to land level with it.
          ...(simple && {
            // The height of an "sm" field: its variable, which Mantine only sets
            // on its fields.
            height: "calc(2.25rem * var(--mantine-scale))",
            paddingBlock: 0,
          }),
        }}
      >
        {mode === "period" && (
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
            className={classes.field}
            styles={{
              input: { paddingInline: FIELD_INSET, textAlign: "center" },
            }}
            w={widthOf("00/00/0000", "Du")}
            style={{ flexShrink: 0 }}
            readOnly={readOnly}
          />
        )}
        {mode === "period" && <LinkRecord word="au" />}
        <DatePickerInput
          size="xs"
          radius={ROUNDING}
          placeholder={mode === "period" ? "Au" : "Jusqu'au"}
          aria-label={mode === "period" ? "Au" : "Jusqu'au"}
          value={day || null}
          onChange={(d) => change({ end: assemble(d ?? "", hour) })}
          minDate={value.start || undefined}
          valueFormat="DD/MM/YYYY"
          popoverProps={{ withinPortal: true }}
          className={classes.field}
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
          className={classes.field}
          styles={{
            input: { paddingInline: FIELD_INSET, textAlign: "center" },
          }}
          w={widthOf("00:00")}
        />
        {/* The state and the button sit at the end of the row. */}
        <div style={{ flex: 1 }} />
        {/* The state: late, soon, or upcoming. */}
        <Box
          w={STATUS_WIDTH}
          style={{ flexShrink: 0, display: "flex", justifyContent: "center" }}
        >
          {state === "none" ? (
            // Still far off: the green of what is going well, like a completed
            // card.
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
