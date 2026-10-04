import {
  Button,
  Checkbox,
  Group,
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
import type { CopyResult, Id } from "@milo/shared";
import CloseButton from "./CloseButton";
import { report } from "./CopyToBoardModal";
import { DrawerActionsContext } from "./IndicatorDrawer";

// Le menu « Actions » du tiroir d'un widget « Projets » ou « Tâches » :
// copier les étiquettes ou les catégories du tableau ouvert, puis les coller
// dans un autre tableau, depuis le tiroir de son propre widget.
//
// La copie ne fait que retenir le tableau d'origine : le presse-papiers est
// tenu par l'application (CopierCollerContext), il survit au changement
// d'onglet et de vue. Coller se confirme — on y choisit de remplacer ce que
// le tableau porte déjà, ou de s'y ajouter —, et la notification dit ensuite
// ce que le collage a donné.

/** Les étiquettes des cartes et celles des projets ne sont pas les mêmes. */
export type Scope = "tasks" | "projects";
export type CopiedItem = "labels" | "categories";

/** Un tableau copié, en attente d'être collé. */
export interface Copy {
  boardId: Id;
  boardName: string;
}

/** Ce qui est copié, chaque sorte de son côté : « projects.labels », … */
export type Clipboard = Partial<Record<`${Scope}.${CopiedItem}`, Copy>>;

export interface CopyPasteValue {
  /** Le tableau ouvert : celui qu'on copie, ou celui où l'on colle. */
  board: { id: Id; name: string } | null;
  clipboard: Clipboard;
  onCopy: (key: keyof Clipboard, copy: Copy) => void;
  /**
   * Le nombre de collages faits : les listes du tableau ouvert dans le tiroir
   * (ChampsListeDuTableau) se relisent quand il change.
   */
  pastes: number;
  onPasted: () => void;
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

/** Le collage lui-même, du tableau copié vers celui-ci. */
const paste = (
  scope: Scope,
  item: CopiedItem,
  source: Id,
  target: Id,
  replaceExisting: boolean,
): Promise<CopyResult> =>
  item === "categories"
    ? api.copyCategories(source, target, replaceExisting)
    : scope === "tasks"
      ? api.copyLabels(source, target, replaceExisting)
      : api.copyProjectLabels(source, target, replaceExisting);

interface CopyPasteActionsProps {
  scope: Scope;
  /** Ce que le widget propose de copier, dans l'ordre du menu. */
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
  // Copier comme coller demandent de pouvoir créer ; remplacer, de supprimer.
  if (!context || !board || !can(scope, "create")) return null;
  const canReplace = can(scope, "delete");

  // Coller ne vaut que depuis un autre tableau.
  const copyOf = (item: CopiedItem) => {
    const copy = context.clipboard[`${scope}.${item}`];
    return copy && copy.boardId !== board.id ? copy : null;
  };
  const pastable = items.filter((item) => copyOf(item));
  const source = toPaste ? copyOf(toPaste) : null;

  const copy = (item: CopiedItem) => {
    context.onCopy(`${scope}.${item}`, {
      boardId: board.id,
      boardName: board.name,
    });
    notifications.show({
      color: "teal",
      title: WORDS[item].copied,
      message: `Ouvrez le widget d'un autre tableau pour coller celles de « ${board.name} ».`,
    });
  };

  const validate = async () => {
    if (!toPaste || !source) return;
    setSaving(true);
    try {
      const done = await paste(
        scope,
        toPaste,
        source.boardId,
        board.id,
        replaceExisting && canReplace,
      );
      context.onPasted();
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
      {/* Le menu se pose au bout de la rangée d'onglets du tiroir. */}
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
              {/* Coller ne paraît qu'une copie faite, depuis un autre tableau. */}
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
                {WORDS[toPaste].definite} de « {source.boardName} » seront ajoutées à
                « {board.name} ». Celles qui y portent déjà le même nom ne sont
                pas redoublées.
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
            <Group justify="flex-end" mt={MODAL_PADDING}>
              <CloseButton onClick={() => setToPaste(null)} />
              <Button color="teal" onClick={validate} loading={saving}>
                Coller
              </Button>
            </Group>
          </>
        )}
      </Modal>
    </>
  );
}
