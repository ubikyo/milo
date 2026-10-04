import { Button, Checkbox, Group, Loader, Menu, Text } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { useState } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { ACTIONS_BUTTON_STYLE } from "../../themes/menus";

// What a widget reads of a person who consented — their calendars (Calendar
// widget), their mail folders (Mail widget) —, to the right of their address
// in the drawer: the button only says how many; its menu lists what they
// offer, read when it opens, each with its box.

/** One of what a person offers: a calendar, a folder. */
export interface Choice {
  id: string;
  name: string;
  /** The one read when none is chosen: their main calendar, their inbox. */
  is_default: boolean;
}

/** The word counted on the button: "calendrier", "dossier". */
export interface ChoiceNoun {
  one: string;
  many: string;
  /** "Aucun calendrier". */
  none: string;
}

/** How many a choice reads: none chosen, the default one. */
const readCount = (ids: string[] | undefined) => (ids === undefined ? 0 : ids.length || 1);

/** At most, the menu's height: a mailbox can hold many folders. */
const MENU_HEIGHT = 320;

interface ChoicePickerProps {
  /** Reads what the person offers. */
  load: () => Promise<Choice[]>;
  /** The chosen ids; empty, the default one; nothing, none is read. */
  chosen: string[] | undefined;
  /** null: none is read any more. */
  onChange: (ids: string[] | null) => void;
  noun: ChoiceNoun;
  /** The title of the notification when reading fails. */
  errorTitle: string;
}

export default function ChoicePicker({ load, chosen, onChange, noun, errorTitle }: ChoicePickerProps) {
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [opened, setOpened] = useState(false);

  // A refusal — Graph's "Access denied" — goes out as a notification, and the
  // menu, with nothing to offer, closes.
  const open = () => {
    setOpened(true);
    if (choices) return;
    load()
      .then(setChoices)
      .catch((e) => {
        setOpened(false);
        notifyError(errorMessage(e), errorTitle);
      });
  };

  // None chosen stands for the default one: it is the one checked.
  const main = choices?.find((c) => c.is_default)?.id;
  const checked = chosen === undefined ? [] : chosen.length ? chosen : main ? [main] : [];

  const toggle = (id: string) => {
    const next = checked.includes(id) ? checked.filter((c) => c !== id) : [...checked, id];
    onChange(next.length ? next : null);
  };

  const n = readCount(chosen);

  return (
    <Menu
      position="bottom-end"
      withinPortal
      closeOnItemClick={false}
      width={280}
      opened={opened}
      onChange={(next) => (next ? open() : setOpened(false))}
    >
      <Menu.Target>
        <Button
          variant="subtle"
          size="xs"
          rightSection={<IconChevronDown size={14} />}
          style={{ ...ACTIONS_BUTTON_STYLE, flexShrink: 0, paddingRight: 6 }}
        >
          {n === 0 ? noun.none : `${n} ${n > 1 ? noun.many : noun.one}`}
        </Button>
      </Menu.Target>
      <Menu.Dropdown style={{ maxHeight: MENU_HEIGHT, overflowY: "auto" }}>
        {!choices ? (
          <Group justify="center" p="xs">
            <Loader size="xs" />
          </Group>
        ) : choices.length === 0 ? (
          <Text size="xs" c="dimmed" p="xs">
            {noun.none}
          </Text>
        ) : (
          choices.map((c) => (
            <Menu.Item
              key={c.id}
              onClick={() => toggle(c.id)}
              leftSection={
                <Checkbox
                  size="xs"
                  color="teal"
                  checked={checked.includes(c.id)}
                  readOnly
                  tabIndex={-1}
                  style={{ pointerEvents: "none" }}
                />
              }
            >
              {c.name}
            </Menu.Item>
          ))
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

/** What the Calendar widget counts. */
export const CALENDAR_NOUN: ChoiceNoun = {
  one: "calendrier",
  many: "calendriers",
  none: "Aucun calendrier",
};

/** What the Mail widget counts. */
export const FOLDER_NOUN: ChoiceNoun = { one: "dossier", many: "dossiers", none: "Aucun dossier" };

/** A Calendar widget's person: their calendars. */
export const calendarsOf = (key: string, email: string) => () => api.getPersonCalendars(key, email);

/** A Mail widget's person: their folders. */
export const foldersOf = (key: string, email: string) => () => api.getPersonFolders(key, email);
