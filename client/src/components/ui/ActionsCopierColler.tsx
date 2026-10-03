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
import { useDroits } from "../../lib/droits";
import { messageErreur, notifierErreur } from "../../lib/errors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import {
  ACTIONS_BUTTON_STYLE,
  ROW_MENU_OFFSET,
  TAB_MENU_STYLES,
} from "../../themes/menus";
import type { CopyResult, Id } from "@milo/shared";
import BoutonFermer from "./BoutonFermer";
import { compteRendu } from "./CopyToBoardModal";
import { ActionsDuTiroirContext } from "./IndicatorDrawer";

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
export type Univers = "tasks" | "projects";
export type ChoseCopiee = "labels" | "categories";

/** Un tableau copié, en attente d'être collé. */
export interface Copie {
  boardId: Id;
  boardName: string;
}

/** Ce qui est copié, chaque sorte de son côté : « projects.labels », … */
export type PressePapiers = Partial<Record<`${Univers}.${ChoseCopiee}`, Copie>>;

export interface CopierCollerValeur {
  /** Le tableau ouvert : celui qu'on copie, ou celui où l'on colle. */
  board: { id: Id; name: string } | null;
  pressePapiers: PressePapiers;
  onCopier: (cle: keyof PressePapiers, copie: Copie) => void;
  /**
   * Le nombre de collages faits : les listes du tableau ouvert dans le tiroir
   * (ChampsListeDuTableau) se relisent quand il change.
   */
  collages: number;
  onColle: () => void;
}

export const CopierCollerContext = createContext<CopierCollerValeur | null>(
  null,
);

const MOTS: Record<
  ChoseCopiee,
  {
    copier: string;
    coller: string;
    copiees: string;
    les: string;
    remplacer: string;
    garde?: string;
  }
> = {
  labels: {
    copier: "Copier les étiquettes",
    coller: "Coller les étiquettes",
    copiees: "Étiquettes copiées",
    les: "Les étiquettes",
    remplacer: "Remplacer les étiquettes existantes",
  },
  categories: {
    copier: "Copier les catégories",
    coller: "Coller les catégories",
    copiees: "Catégories copiées",
    les: "Les catégories",
    remplacer: "Remplacer les catégories existantes",
    garde: "Celles qui rangent encore des projets sont gardées.",
  },
};

/** Le collage lui-même, du tableau copié vers celui-ci. */
const coller = (
  univers: Univers,
  chose: ChoseCopiee,
  source: Id,
  cible: Id,
  remplacer: boolean,
): Promise<CopyResult> =>
  chose === "categories"
    ? api.copyCategories(source, cible, remplacer)
    : univers === "tasks"
      ? api.copyLabels(source, cible, remplacer)
      : api.copyProjectLabels(source, cible, remplacer);

interface ActionsCopierCollerProps {
  univers: Univers;
  /** Ce que le widget propose de copier, dans l'ordre du menu. */
  choses: ChoseCopiee[];
}

export default function ActionsCopierColler({
  univers,
  choses,
}: ActionsCopierCollerProps) {
  const contexte = useContext(CopierCollerContext);
  const cible = useContext(ActionsDuTiroirContext);
  const peut = useDroits();
  const [aColler, setAColler] = useState<ChoseCopiee | null>(null);
  const [remplacer, setRemplacer] = useState(false);
  const [saving, setSaving] = useState(false);

  const board = contexte?.board ?? null;
  // Copier comme coller demandent de pouvoir créer ; remplacer, de supprimer.
  if (!contexte || !board || !peut(univers, "create")) return null;
  const peutRemplacer = peut(univers, "delete");

  // Coller ne vaut que depuis un autre tableau.
  const copieDe = (chose: ChoseCopiee) => {
    const copie = contexte.pressePapiers[`${univers}.${chose}`];
    return copie && copie.boardId !== board.id ? copie : null;
  };
  const collables = choses.filter((chose) => copieDe(chose));
  const source = aColler ? copieDe(aColler) : null;

  const copier = (chose: ChoseCopiee) => {
    contexte.onCopier(`${univers}.${chose}`, {
      boardId: board.id,
      boardName: board.name,
    });
    notifications.show({
      color: "teal",
      title: MOTS[chose].copiees,
      message: `Ouvrez le widget d'un autre tableau pour coller celles de « ${board.name} ».`,
    });
  };

  const valider = async () => {
    if (!aColler || !source) return;
    setSaving(true);
    try {
      const fait = await coller(
        univers,
        aColler,
        source.boardId,
        board.id,
        remplacer && peutRemplacer,
      );
      contexte.onColle();
      notifications.show({
        color: "teal",
        title: MOTS[aColler].coller,
        message: compteRendu(aColler, fait, "ici"),
      });
      setAColler(null);
    } catch (e) {
      notifierErreur(messageErreur(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Le menu se pose au bout de la rangée d'onglets du tiroir. */}
      {cible &&
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
              {choses.map((chose) => (
                <Menu.Item
                  key={`copier-${chose}`}
                  leftSection={<IconCopy size={16} />}
                  onClick={() => copier(chose)}
                >
                  {MOTS[chose].copier}
                </Menu.Item>
              ))}
              {/* Coller ne paraît qu'une copie faite, depuis un autre tableau. */}
              {collables.length > 0 && <Menu.Divider />}
              {collables.map((chose) => (
                <Menu.Item
                  key={`coller-${chose}`}
                  leftSection={<IconClipboard size={16} />}
                  onClick={() => {
                    setRemplacer(false);
                    setAColler(chose);
                  }}
                >
                  {MOTS[chose].coller}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>,
          cible,
        )}

      <Modal
        opened={Boolean(aColler && source)}
        onClose={() => setAColler(null)}
        title={aColler ? MOTS[aColler].coller : ""}
        centered
        padding={MODAL_PADDING}
        withCloseButton={false}
        styles={modalHeaderStyles(MODAL_PADDING)}
      >
        {aColler && source && (
          <>
            <Stack gap="md">
              <Text size="sm">
                {MOTS[aColler].les} de « {source.boardName} » seront ajoutées à
                « {board.name} ». Celles qui y portent déjà le même nom ne sont
                pas redoublées.
              </Text>
              <Checkbox
                label={MOTS[aColler].remplacer}
                description={
                  peutRemplacer
                    ? MOTS[aColler].garde
                    : "Il faut le droit de supprimer pour remplacer."
                }
                checked={remplacer && peutRemplacer}
                disabled={!peutRemplacer}
                onChange={(e) => setRemplacer(e.currentTarget.checked)}
                color="teal"
              />
            </Stack>
            <Group justify="flex-end" mt={MODAL_PADDING}>
              <BoutonFermer onClick={() => setAColler(null)} />
              <Button color="teal" onClick={valider} loading={saving}>
                Coller
              </Button>
            </Group>
          </>
        )}
      </Modal>
    </>
  );
}
