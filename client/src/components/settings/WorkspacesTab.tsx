import { Group, Menu, Modal, ScrollArea, Stack, Text } from "@mantine/core";
import { IconStack2, IconTrash, IconUsers } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { RED } from "../../themes/colors";
import {
  SETTINGS_HEIGHT_MAX,
  SETTINGS_HEIGHT,
  SETTINGS_WIDTH,
  SETTINGS_PADDING,
  modalHeaderStyles,
} from "../../themes/modals";
import scroll from "../../assets/styles/ListScroll.module.css";
import AddButton from "../ui/AddButton";
import CloseButton from "../ui/CloseButton";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import {
  RowButton,
  RowField,
  EmptyList,
  ROW_INSET,
  rowStyle,
} from "../ui/DrawerRows";
import PointMenu, { menuPosition, type PointMenuPosition } from "../ui/PointMenu";
import WorkspaceAccess from "./WorkspaceAccess";
import type { Workspace } from "@milo/shared";

interface WorkspacesTabProps {
  workspaces: Workspace[];
  /** Relit la liste — et le compte, dont le sélecteur la propose. */
  onChanged: () => Promise<void>;
  /** Relit le compte, après un changement des accès : le sélecteur en dépend. */
  onAccessChanged: () => void;
}

/**
 * Les workspaces : une équipe chacun, avec ses vues, ses tableaux et ses
 * contextes, isolés de ceux des autres. Ils se présentent comme les listes
 * des tiroirs (ChampsColonnes) : une ligne par workspace, son nom à même la
 * ligne. Le clic droit ouvre ses accès ou le supprime — le dernier ne se
 * supprime pas ; « Ajouter » pose une ligne vide au bout, créée dès qu'elle a
 * un nom.
 */
export default function WorkspacesTab({
  workspaces,
  onChanged,
  onAccessChanged,
}: WorkspacesTabProps) {
  // Le workspace dont la fenêtre des accès est ouverte.
  const [accessOf, setAccessOf] = useState<Workspace | null>(null);
  const [toDelete, setToDelete] = useState<Workspace | null>(null);
  const [menu, setMenu] = useState<{ workspace: Workspace; position: PointMenuPosition } | null>(
    null,
  );
  // La ligne ajoutée, en attente de son nom.
  const [adding, setAdding] = useState(false);
  // Le nombre d'accès de chaque workspace : les utilisateurs et les groupes
  // qui y ont un droit. Relus à la fermeture de leur fenêtre.
  const [access, setAccess] = useState<Record<number, number>>({});

  const readAccess = useCallback(async () => {
    try {
      const accounts = await Promise.all(
        workspaces.map(async (w) => [w.id, (await api.getAssignments(w.id)).length] as const),
      );
      setAccess(Object.fromEntries(accounts));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [workspaces]);

  useEffect(() => {
    void readAccess();
  }, [readAccess]);

  const write = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await onChanged();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const total = workspaces.length + (adding ? 1 : 0);

  return (
    <Stack gap="sm">
      {/* 15 px de plus que l'écart de la pile avant la liste. */}
      <Text size="sm" c="dimmed" mb={15}>
        Un workspace naît avec une vue et son tableau, sans aucun accès :
        chacun a les siens, à régler par un clic droit sur sa ligne.
        Le supprimer emporte toutes ses vues et tout ce qu'elles contiennent.
      </Text>

      <div>
        {total === 0 ? (
          <EmptyList icon={IconStack2} message="Aucun workspace" />
        ) : (
          <Stack gap={1}>
            {workspaces.map((w, rank) => (
              <Group
                key={w.id}
                gap="sm"
                wrap="nowrap"
                onContextMenu={(e) => setMenu({ workspace: w, position: menuPosition(e) })}
                style={{ ...rowStyle(rank, total, false), paddingLeft: ROW_INSET }}
              >
                <RowField
                  name={w.name}
                  placeholder="Nom du workspace"
                  label={`Nom de ${w.name}`}
                  onValidate={(name) => {
                    if (name && name !== w.name) void write(() => api.updateWorkspace(w.id, name));
                  }}
                />
                {/* Ses accès : leur nombre, et leur fenêtre au clic. */}
                {access[w.id] !== undefined && (
                  <RowButton
                    icon={IconUsers}
                    onClick={() => setAccessOf(w)}
                    // À 5 px du bout de la ligne, retrait compris.
                    rightMargin={5 - ROW_INSET}
                  >
                    {/* « accès » est invariable. */}
                    {`${access[w.id]} accès`}
                  </RowButton>
                )}
              </Group>
            ))}
            {adding && (
              <Group
                gap="sm"
                wrap="nowrap"
                style={{ ...rowStyle(total - 1, total, false), paddingLeft: ROW_INSET }}
              >
                <RowField
                  name=""
                  placeholder="Nom du workspace"
                  label="Nom du nouveau workspace"
                  autoFocus
                  // Quittée sans nom, la ligne s'efface ; nommée, elle est créée.
                  onValidate={(name) => {
                    setAdding(false);
                    if (name) void write(() => api.createWorkspace(name));
                  }}
                />
              </Group>
            )}
          </Stack>
        )}
        {/* Au plus près de la liste qu'il allonge. */}
        <AddButton label="Ajouter un workspace" onClick={() => setAdding(true)} mt={4} />
      </div>

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            leftSection={<IconUsers size={16} />}
            onClick={() => {
              setAccessOf(menu.workspace);
              setMenu(null);
            }}
          >
            Accès
          </Menu.Item>
          {workspaces.length > 1 && (
            <>
              <Menu.Divider />
              <Menu.Item
                color={RED}
                leftSection={<IconTrash size={16} />}
                onClick={() => {
                  setToDelete(menu.workspace);
                  setMenu(null);
                }}
              >
                Supprimer
              </Menu.Item>
            </>
          )}
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          const w = toDelete;
          setToDelete(null);
          if (w) await write(() => api.deleteWorkspace(w.id));
        }}
        title="Supprimer le workspace"
        message={
          <>
            Voulez-vous vraiment supprimer « {toDelete?.name} » ? Toutes ses vues et tout ce
            qu'elles contiennent seront supprimés. Cette action est irréversible.
          </>
        }
      />

      <Modal
        opened={accessOf !== null}
        onClose={() => {
          setAccessOf(null);
          void readAccess();
        }}
        title={`Accès — ${accessOf?.name ?? ""}`}
        centered
        // Un fondu sur place, sans glisser : de la taille du Paramétrage et
        // au même endroit, elle paraît par-dessus lui. Sans voile non plus :
        // celui du Paramétrage est déjà derrière.
        transitionProps={{ transition: "fade" }}
        withOverlay={false}
        // La taille du Paramétrage, d'où elle s'ouvre : la liste défile dans
        // sa hauteur, « Fermer » reste en bas.
        size={SETTINGS_WIDTH}
        padding={SETTINGS_PADDING}
        withCloseButton={false}
        styles={{
          ...modalHeaderStyles(SETTINGS_PADDING),
          content: {
            height: SETTINGS_HEIGHT,
            maxHeight: SETTINGS_HEIGHT_MAX,
            display: "flex",
            flexDirection: "column",
          },
          body: {
            ...modalHeaderStyles(SETTINGS_PADDING).body,
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <Stack gap="xl" style={{ flex: 1, minHeight: 0 }}>
          <ScrollArea
            type="auto"
            scrollbars="y"
            style={{ flex: 1, minHeight: 0 }}
            classNames={{ scrollbar: scroll.scrollbar, thumb: scroll.thumb }}
          >
            {accessOf && <WorkspaceAccess workspace={accessOf.id} onChange={onAccessChanged} />}
          </ScrollArea>
          <Group justify="flex-end">
            <CloseButton
              onClick={() => {
                setAccessOf(null);
                void readAccess();
              }}
            />
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
