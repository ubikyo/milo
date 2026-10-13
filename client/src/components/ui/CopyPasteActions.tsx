import {
  Button,
  Checkbox,
  Menu,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconChevronDown, IconClipboard, IconCopy } from "@tabler/icons-react";
import { createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { useRights } from "../../lib/rights";
import { errorMessage, notifyError } from "../../lib/errors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import {
  ACTIONS_BUTTON_STYLE,
  ROW_MENU_OFFSET,
  TAB_MENU_STYLES,
} from "../../themes/menus";
import { LIST_KEY, widgetReference } from "@milo/shared";
import type { CopyResult, Id, ListRef } from "@milo/shared";
import { useListRef } from "../../lib/list-ref";
import CloseButton from "./CloseButton";
import Footer from "./Footer";
import { report } from "./copyReport";
import { DrawerActionsContext } from "./IndicatorDrawer";
import { themeWindow } from "../../lib/themeWindow";

// The "Actions" menu of a "Projets" or "Tâches" widget drawer: copy its labels
// or categories, then paste them into another widget — of this board or
// another —, from its own drawer.
//
// Copying only remembers the source widget: the clipboard is held by the
// application (CopyPasteContext), and it survives tab and view changes. Pasting
// is confirmed — you choose to replace what the widget already has, or to add
// to it —, and the notification then says what the paste produced. Pasted, the
// copy leaves the clipboard: "Coller" leaves the menu, and the same labels are
// not pasted again.

/** Card labels and project labels are not the same. */
export type Scope = "tasks" | "projects";

/** The list widget type of each scope. */
const LIST_TYPES: Record<Scope, string> = { tasks: "task.list", projects: "project.list" };
export type CopiedItem = "labels" | "categories";

/** A copied widget, waiting to be pasted: its list, its reference and its board's name. */
export interface Copy {
  list: ListRef;
  name: string;
}

/** What is copied, each kind on its own: "projects.labels", … */
export type Clipboard = Partial<Record<`${Scope}.${CopiedItem}`, Copy>>;

export interface CopyPasteValue {
  /**
   * The open board: the one being copied, or the one being pasted into —
   * and the context looked at, which the Contact widgets filter by.
   */
  board: { id: Id; name: string; context?: string | null } | null;
  clipboard: Clipboard;
  onCopy: (key: keyof Clipboard, copy: Copy) => void;
  /**
   * The number of pastes made: the lists of the board open in the drawer
   * (BoardListFields) are re-read when it changes.
   */
  pastes: number;
  /** A copy pasted: it leaves the clipboard. */
  onPasted: (key: keyof Clipboard) => void;
}

export const CopyPasteContext = createContext<CopyPasteValue | null>(
  null,
);

const WORDS: Record<
  CopiedItem,
  {
    copy: string;
    paste: string;
    copied: string;
    definite: string;
    replaceExisting: string;
    keptRequest?: string;
  }
> = {
  labels: {
    copy: "Copier les étiquettes",
    paste: "Coller les étiquettes",
    copied: "Étiquettes copiées",
    definite: "Les étiquettes",
    replaceExisting: "Remplacer les étiquettes existantes",
  },
  categories: {
    copy: "Copier les catégories",
    paste: "Coller les catégories",
    copied: "Catégories copiées",
    definite: "Les catégories",
    replaceExisting: "Remplacer les catégories existantes",
    keptRequest: "Celles qui rangent encore des projets sont gardées.",
  },
};

/** The paste itself, from the copied widget to this one. */
const paste = (
  scope: Scope,
  item: CopiedItem,
  source: ListRef,
  target: ListRef,
  replaceExisting: boolean,
): Promise<CopyResult> =>
  item === "categories"
    ? api.copyCategories(source, target, replaceExisting)
    : scope === "tasks"
      ? api.copyLabels(source, target, replaceExisting)
      : api.copyProjectLabels(source, target, replaceExisting);

interface CopyPasteActionsProps {
  scope: Scope;
  /** What the widget offers to copy, in menu order. */
  items: CopiedItem[];
}

export default function CopyPasteActions({
  scope,
  items,
}: CopyPasteActionsProps) {
  const context = useContext(CopyPasteContext);
  const target = useContext(DrawerActionsContext);
  const can = useRights();
  const [toPaste, setToPaste] = useState<CopiedItem | null>(null);
  const [replaceExisting, setReplace] = useState(false);
  const [saving, setSaving] = useState(false);

  const board = context?.board ?? null;
  const list = useListRef();
  // Copying and pasting both require the right to create; replacing, the right
  // to delete.
  if (!context || !board || !list || !can(scope, "create")) return null;
  const canReplace = can(scope, "delete");
  // "#A1B2 (Projets 2026)": the widget, as its drawer names it.
  const name = `${widgetReference(LIST_TYPES[scope], { [LIST_KEY]: list.list })} (${board.name})`;

  // Pasting only makes sense from another widget.
  const copyOf = (item: CopiedItem) => {
    const copy = context.clipboard[`${scope}.${item}`];
    return copy && !(copy.list.board === list.board && copy.list.list === list.list) ? copy : null;
  };
  const pastable = items.filter((item) => copyOf(item));
  const source = toPaste ? copyOf(toPaste) : null;

  const copy = (item: CopiedItem) => {
    context.onCopy(`${scope}.${item}`, { list, name });
    notifications.show({
      color: "teal",
      title: WORDS[item].copied,
      message: `Ouvrez un autre widget pour coller celles de « ${name} ».`,
    });
  };

  const validate = async () => {
    if (!toPaste || !source) return;
    setSaving(true);
    try {
      const done = await paste(
        scope,
        toPaste,
        source.list,
        list,
        replaceExisting && canReplace,
      );
      context.onPasted(`${scope}.${toPaste}`);
      notifications.show({
        color: "teal",
        title: WORDS[toPaste].paste,
        message: report(toPaste, done, "ici"),
      });
      setToPaste(null);
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* The menu sits at the end of the drawer's tab row. */}
      {target &&
        createPortal(
          <Menu
            position="bottom-end"
            withinPortal
            offset={ROW_MENU_OFFSET}
            styles={TAB_MENU_STYLES}
          >
            <Menu.Target>
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                rightSection={<IconChevronDown size={14} />}
                style={ACTIONS_BUTTON_STYLE}
              >
                Actions
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {items.map((item) => (
                <Menu.Item
                  key={`copy-${item}`}
                  leftSection={<IconCopy size={16} />}
                  onClick={() => copy(item)}
                >
                  {WORDS[item].copy}
                </Menu.Item>
              ))}
              {/* Paste only appears once a copy has been made, from another widget. */}
              {pastable.length > 0 && <Menu.Divider />}
              {pastable.map((item) => (
                <Menu.Item
                  key={`paste-${item}`}
                  leftSection={<IconClipboard size={16} />}
                  onClick={() => {
                    setReplace(false);
                    setToPaste(item);
                  }}
                >
                  {WORDS[item].paste}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>,
          target,
        )}

      <Modal
        attributes={themeWindow("paste")}
        opened={Boolean(toPaste && source)}
        onClose={() => setToPaste(null)}
        title={toPaste ? WORDS[toPaste].paste : ""}
        centered
        padding={MODAL_PADDING}
        withCloseButton={false}
        styles={modalHeaderStyles(MODAL_PADDING)}
      >
        {toPaste && source && (
          <>
            <Stack gap="md">
              <Text size="sm">
                {WORDS[toPaste].definite} de « {source.name} » seront ajoutées à
                « {name} ». Celles qui y portent déjà le même nom ne sont pas
                redoublées.
              </Text>
              <Checkbox
                label={WORDS[toPaste].replaceExisting}
                description={
                  canReplace
                    ? WORDS[toPaste].keptRequest
                    : "Il faut le droit de supprimer pour remplacer."
                }
                checked={replaceExisting && canReplace}
                disabled={!canReplace}
                onChange={(e) => setReplace(e.currentTarget.checked)}
                color="teal"
              />
            </Stack>
            <Footer>
              <CloseButton onClick={() => setToPaste(null)} />
              <Button color="teal" onClick={validate} loading={saving}>
                Coller
              </Button>
            </Footer>
          </>
        )}
      </Modal>
    </>
  );
}
