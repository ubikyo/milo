import { Button, Checkbox, Group, Menu, Modal, ScrollArea, Stack } from "@mantine/core";
import { IconStack2, IconTrash, IconUsers } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { RED } from "../../themes/colors";
import {
  SETTINGS_HEIGHT_MAX,
  SETTINGS_OWN_HEIGHT,
  SETTINGS_SCROLLBAR_STYLES,
  SETTINGS_WINDOW_WIDTH,
  SETTINGS_PADDING,
  modalHeaderStyles,
} from "../../themes/modals";
import settingsClasses from "../../assets/styles/SettingsModal.module.css";
import AddButton from "../ui/AddButton";
import CloseButton from "../ui/CloseButton";
import Footer from "../ui/Footer";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import {
  RowButton,
  RowField,
  EmptyList,
  rowStyle,
} from "../ui/DrawerRows";
import PointMenu, { menuPosition, type PointMenuPosition } from "../ui/PointMenu";
import WorkspaceAccess from "./WorkspaceAccess";
import { grantsAnything } from "@milo/shared";
import type { Workspace, WorkspaceRights } from "@milo/shared";
import SettingsIntro from "./SettingsIntro";
import { themeWindow } from "../../lib/themeWindow";

interface WorkspacesTabProps {
  /**
   * The account's rights on workspaces: "Voir" alone shows them read-only;
   * "Créer" adds, renames and sets their access; "Supprimer" deletes.
   */
  rights: WorkspaceRights;
  workspaces: Workspace[];
  /** Re-reads the list — and the account, whose selector offers it. */
  onChanged: () => Promise<void>;
  /** Re-reads the account, after an access change: the selector depends on it. */
  onAccessChanged: () => void;
}

/**
 * The workspaces: one team each, with its views, boards and
 * contexts, isolated from the others'. They look like the drawer
 * lists (ColumnFields): one row per workspace, its name inline in the
 * row. Right-click opens its access or deletes it — the last one too;
 * "Ajouter" adds an empty row at the end, created as soon as it has a name.
 */
export default function WorkspacesTab({
  rights,
  workspaces,
  onChanged,
  onAccessChanged,
}: WorkspacesTabProps) {
  // The workspace whose access modal is open.
  const [accessOf, setAccessOf] = useState<Workspace | null>(null);
  const [toDelete, setToDelete] = useState<Workspace | null>(null);
  const [menu, setMenu] = useState<{ workspace: Workspace; position: PointMenuPosition } | null>(
    null,
  );
  // The added row, waiting for its name.
  const [adding, setAdding] = useState(false);
  // The number of accesses of each workspace: the users and groups
  // that have a right there. Re-read when their modal closes.
  const [access, setAccess] = useState<Record<number, number>>({});

  const readAccess = useCallback(async () => {
    try {
      const accounts = await Promise.all(
        // Those listed without any right have no access yet.
        workspaces.map(
          async (w) =>
            [
              w.id,
              (await api.getAssignments(w.id)).filter((a) =>
                grantsAnything(a.permissions),
              ).length,
            ] as const,
        ),
      );
      setAccess(Object.fromEntries(accounts));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [workspaces]);

  useEffect(() => {
    void readAccess();
  }, [readAccess]);

  // The access modal's pending changes (WorkspaceAccess): sent by its
  // "Enregistrer".
  const saveAccess = useRef<(() => Promise<boolean>) | null>(null);
  const [saving, setSaving] = useState(false);
  // "Envoyer une invitation": checked on each opening.
  const [invite, setInvite] = useState(true);

  const closeAccess = () => {
    setAccessOf(null);
    setInvite(true);
    void readAccess();
  };

  const saveAndClose = async () => {
    setSaving(true);
    try {
      if ((await saveAccess.current?.()) === false) return;
    } finally {
      setSaving(false);
    }
    closeAccess();
  };

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
      <SettingsIntro parentGap="var(--mantine-spacing-sm)">
        Un workspace est un environnement de travail étanche, associé à un
        ensemble d’utilisateurs ou de groupes d’utilisateurs disposant de
        droits pour créer des vues et des tableaux, ainsi que pour utiliser
        des widgets. Les données d’un workspace ne sont pas accessibles aux
        utilisateurs des autres workspaces.
      </SettingsIntro>

      {/* An editable list of the Settings: their look ("Formulaire" > "Liste"). */}
      <div data-settings-list>
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
                style={rowStyle(rank, total, false, "simple")}
              >
                <RowField
                  name={w.name}
                  placeholder="Nom du workspace"
                  label={`Nom de ${w.name}`}
                  readOnly={!rights.create}
                  onValidate={(name) => {
                    if (name && name !== w.name) void write(() => api.updateWorkspace(w.id, name));
                  }}
                />
                {/* Its accesses: their number, and their modal on click. */}
                {access[w.id] !== undefined && (
                  <RowButton
                    icon={IconUsers}
                    onClick={() => setAccessOf(w)}
                    // Its distance to the end is the row's padding.
                    rightMargin={0}
                  >
                    {/* "accès" is invariable (same singular and plural in French). */}
                    {`${access[w.id]} accès`}
                  </RowButton>
                )}
              </Group>
            ))}
            {adding && (
              <Group
                gap="sm"
                wrap="nowrap"
                style={rowStyle(total - 1, total, false, "simple")}
              >
                <RowField
                  name=""
                  placeholder="Nom du workspace"
                  label="Nom du nouveau workspace"
                  autoFocus
                  // Left without a name, the row disappears; named, it is created.
                  onValidate={(name) => {
                    setAdding(false);
                    if (name) void write(() => api.createWorkspace(name));
                  }}
                />
              </Group>
            )}
          </Stack>
        )}
        {/* As close as possible to the list it extends. */}
        {rights.create && (
          <AddButton label="Ajouter un workspace" onClick={() => setAdding(true)} mt={4} />
        )}
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
          {rights.delete && (
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
        attributes={themeWindow("workspace-access")}
        opened={accessOf !== null}
        onClose={closeAccess}
        title={`Accès — ${accessOf?.name ?? ""}`}
        centered
        // A fade in place, without sliding: the size of Settings and
        // in the same spot, it appears on top of it. No overlay either:
        // Settings' is already behind.
        transitionProps={{ transition: "fade" }}
        withOverlay={false}
        // The size of Settings, from where it opens — its width and its
        // height: the list scrolls within it, "Fermer" stays at the bottom.
        size={SETTINGS_WINDOW_WIDTH}
        padding={SETTINGS_PADDING}
        withCloseButton={false}
        styles={{
          ...modalHeaderStyles(SETTINGS_PADDING),
          content: {
            height: SETTINGS_OWN_HEIGHT,
            maxHeight: SETTINGS_HEIGHT_MAX,
            // Anchor for the moved scrollbar, as in Settings.
            position: "relative",
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
          {/* The Settings panels' bar: on the window's right border, over its
              whole height, at the themes' width. */}
          <ScrollArea
            type="auto"
            scrollbars="y"
            scrollbarSize="var(--milo-settings-scrollbar-width)"
            styles={SETTINGS_SCROLLBAR_STYLES}
            classNames={{ scrollbar: settingsClasses.scrollbar }}
            style={{ flex: 1, minHeight: 0 }}
          >
            {accessOf && <WorkspaceAccess
                workspace={accessOf.id}
                readOnly={!rights.create}
                invite={invite}
                saveRef={saveAccess}
                onChange={onAccessChanged}
              />}
          </ScrollArea>
          {/* "Fermer" drops what was not saved; "Enregistrer" sends it, then
              closes — unless the server refused. */}
          <Footer parentGap="var(--mantine-spacing-xl)">
            {/* Whoever is just added receives the "Nouvel accès à un élément"
                e-mail — each user of a group. */}
            {rights.create && (
              <Checkbox
                label="Envoyer une invitation"
                checked={invite}
                onChange={(e) => setInvite(e.currentTarget.checked)}
                color="teal"
                mr="auto"
              />
            )}
            <CloseButton onClick={closeAccess} />
            {rights.create && (
              <Button color="teal" onClick={saveAndClose} loading={saving}>
                Enregistrer
              </Button>
            )}
          </Footer>
        </Stack>
      </Modal>
    </Stack>
  );
}
