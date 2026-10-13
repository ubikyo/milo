import { Box, Button, Checkbox, Group, Modal, ScrollArea, Stack } from "@mantine/core";
import { IconStack2, IconUsers } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import {
  SETTINGS_HEIGHT_MAX,
  SETTINGS_OWN_HEIGHT,
  SETTINGS_SCROLLBAR_STYLES,
  SETTINGS_WINDOW_WIDTH,
  SETTINGS_PADDING,
  modalHeaderStyles,
} from "../../themes/modals";
import settingsClasses from "../../assets/styles/SettingsModal.module.css";
import CloseButton from "../ui/CloseButton";
import Footer from "../ui/Footer";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import {
  ListFooter,
  ADDED_ROW_PADDING_RIGHT,
  FIRST_FIELD_MARGIN,
  NAME_INSET,
  NAME_MIN_WIDTH,
  RowButton,
  RowCheckbox,
  RowField,
  EmptyList,
  pluralize,
  rowStyle,
  useRowSelection,
} from "../ui/DrawerRows";
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
 * row, its access on its button. Checked rows are deleted together — the last
 * one too; "Ajouter" adds an empty row at the end, created as soon as it has
 * a name.
 */
export default function WorkspacesTab({
  rights,
  workspaces,
  onChanged,
  onAccessChanged,
}: WorkspacesTabProps) {
  // The workspace whose access modal is open.
  const [accessOf, setAccessOf] = useState<Workspace | null>(null);
  const [toDelete, setToDelete] = useState<Workspace[]>([]);
  const selection = useRowSelection(workspaces.map((w) => w.id));
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
  // "Envoyer une confirmation par e-Mail": checked on each opening.
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
  // The boxes only serve deleting.
  const checkable = rights.delete;
  const workspaceRowStyle = (rank: number) =>
    rowStyle(rank, total, false, checkable ? "checkbox" : "simple");

  /** The name field: behind a checkbox, it moves back to align with it. */
  const nameSlot = (field: ReactNode, added = false) =>
    checkable ? (
      <Box
        style={{
          flex: 1,
          minWidth: NAME_MIN_WIDTH,
          display: "flex",
          // Added, without a checkbox before it: it opens the row.
          marginLeft: added ? FIRST_FIELD_MARGIN : -NAME_INSET,
        }}
      >
        {field}
      </Box>
    ) : (
      field
    );

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
                style={workspaceRowStyle(rank)}
              >
                {checkable && (
                  <RowCheckbox
                    label={`Sélectionner ${w.name}`}
                    checked={selection.isChecked(w.id)}
                    onChange={(on) => selection.toggle(w.id, on)}
                  />
                )}
                {nameSlot(
                  <RowField
                    name={w.name}
                    placeholder="Nom du workspace"
                    label={`Nom de ${w.name}`}
                    readOnly={!rights.create}
                    onValidate={(name) => {
                      if (name && name !== w.name) void write(() => api.updateWorkspace(w.id, name));
                    }}
                  />,
                )}
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
                // Its name alone: as far from both edges.
                style={{ ...workspaceRowStyle(total - 1), paddingRight: ADDED_ROW_PADDING_RIGHT }}
              >
                {nameSlot(
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
                  />,
                  true,
                )}
              </Group>
            )}
          </Stack>
        )}
        {/* As close as possible to the list it extends. */}
        <ListFooter
          {...(rights.create
            ? { addLabel: "Ajouter un workspace", onAdd: () => setAdding(true) }
            : null)}
          checkedCount={selection.checked.length}
          onDeleteChecked={() => setToDelete(workspaces.filter((w) => selection.isChecked(w.id)))}
        />
      </div>

      <DeleteConfirmModal
        opened={toDelete.length > 0}
        onClose={() => setToDelete([])}
        onConfirm={async () => {
          const list = toDelete;
          setToDelete([]);
          selection.reset();
          await write(() => Promise.all(list.map((w) => api.deleteWorkspace(w.id))));
        }}
        title={
          toDelete.length > 1
            ? `Supprimer ${pluralize(toDelete.length, "workspace")}`
            : "Supprimer le workspace"
        }
        message={
          toDelete.length > 1 ? (
            <>
              Voulez-vous vraiment supprimer ces {pluralize(toDelete.length, "workspace")} ? Toutes
              leurs vues et tout ce qu'elles contiennent seront supprimés. Cette action est
              irréversible.
            </>
          ) : (
            <>
              Voulez-vous vraiment supprimer « {toDelete[0]?.name} » ? Toutes ses vues et tout ce
              qu'elles contiennent seront supprimés. Cette action est irréversible.
            </>
          )
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
                label="Envoyer une confirmation par e-Mail"
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
