import { Button, Checkbox, Group, Modal, ScrollArea, Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import { SHARE_LEVELS } from "@milo/shared";
import type {
  EntraPrincipal,
  PrincipalPermissions,
  View,
  ViewSharePermissions,
} from "@milo/shared";
import { api } from "../../api";
import {
  SETTINGS_HEIGHT,
  SETTINGS_HEIGHT_MAX,
  SETTINGS_PADDING,
  SETTINGS_WIDTH,
  modalHeaderStyles,
} from "../../themes/modals";
import { errorMessage, notifyError } from "../../lib/errors";
import scroll from "../../assets/styles/ListScroll.module.css";
import PrincipalsPermissions from "../settings/PrincipalsPermissions";
import SectionRights from "../settings/SectionRights";
import type { RightsSection, SectionPermissions } from "../settings/SectionRights";
import CloseButton from "./CloseButton";

// "Partager", on a view's right-click: its boards, shared board by board,
// laid out like a workspace's access (WorkspaceAccess). Users and groups are
// picked from a list — those with access to the workspace, and each user of
// its groups, individually —, added one after
// another; each one unfolds the boards it receives, added one by one, each
// with its level — "Lecture seule" or "Contrôle total". Nothing goes to the
// server before "Enregistrer", which sends the whole sharing of the view.

type Entry = PrincipalPermissions<ViewSharePermissions>;

const key = (p: EntraPrincipal) => `${p.type}:${p.id}`;

/** A board's level as rights: one, never both. */
const toSections = (p: ViewSharePermissions): SectionPermissions =>
  Object.fromEntries(Object.entries(p).map(([board, level]) => [board, [level]]));

const fromSections = (s: SectionPermissions): ViewSharePermissions =>
  Object.fromEntries(
    Object.entries(s)
      .filter(([, rights]) => rights.length > 0)
      .map(([board, rights]) => [board, rights[0] as ViewSharePermissions[string]]),
  );

/** The level just chosen replaces the other: a board has only one. */
const normalize = (_board: string, before: string[], after: string[]): string[] => {
  const added = after.find((r) => !before.includes(r));
  return added ? [added] : after;
};

/** "2 tableaux". */
const boardCount = (n: number) => `${n} tableau${n > 1 ? "x" : ""}`;

/** How many boards it receives. */
const summary = (p: ViewSharePermissions) => {
  const n = Object.keys(p).length;
  return n === 0 ? "Aucun tableau" : boardCount(n);
};

interface ShareViewModalProps {
  /** The view to share; null, closed. */
  view: View | null;
  onClose: () => void;
}

export default function ShareViewModal({ view, onClose }: ShareViewModalProps) {
  // The view's boards, as the rows' choices; and the sharing being edited.
  const [boards, setBoards] = useState<RightsSection[]>([]);
  // Whom they can go to: the users and groups with access to the workspace,
  // and the users of these groups.
  const [principals, setPrincipals] = useState<EntraPrincipal[]>([]);
  const draft = useRef<Entry[]>([]);
  const [saving, setSaving] = useState(false);
  // "Envoyer une invitation": checked on each opening.
  const [invite, setInvite] = useState(true);
  const viewId = view?.id;
  useEffect(() => {
    if (viewId !== undefined) setInvite(true);
  }, [viewId]);

  // The view whose sharing is open: an answer for another one, arriving late,
  // is dropped.
  const current = useRef(viewId);
  current.current = viewId;

  const load = useCallback(async () => {
    if (viewId === undefined) return [];
    const read = await api.getViewShares(viewId);
    if (current.current !== viewId) return draft.current;
    setBoards(
      read.boards.map((b) => ({ value: String(b.id), label: b.name, rights: SHARE_LEVELS })),
    );
    setPrincipals(read.principals);
    draft.current = read.shares;
    return read.shares;
  }, [viewId]);

  /** This user or group receives these boards — or enters the list with them. */
  const save = async (principal: EntraPrincipal, permissions: ViewSharePermissions) => {
    const before = draft.current.find((e) => key(e.principal) === key(principal));
    draft.current = before
      ? draft.current.map((e) => (e === before ? { ...e, permissions } : e))
      : [...draft.current, { principal, permissions }];
    return draft.current;
  };

  const remove = async (principal: EntraPrincipal) => {
    draft.current = draft.current.filter((e) => key(e.principal) !== key(principal));
    return draft.current;
  };

  const send = async () => {
    if (!view) return;
    setSaving(true);
    try {
      // Someone left without a board receives nothing: they are not sent.
      // Those just added receive the "Nouveau partage" e-mail, if asked.
      await api.setViewShares(view.id, {
        shares: draft.current.filter((e) => Object.keys(e.permissions).length > 0),
        invite,
      });
      notifications.show({ color: "teal", message: `Partage de « ${view.name} » enregistré.` });
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={view !== null}
      onClose={onClose}
      title={`Partager — ${view?.name ?? ""}`}
      centered
      size={SETTINGS_WIDTH}
      padding={SETTINGS_PADDING}
      withCloseButton={false}
      styles={{
        ...modalHeaderStyles(SETTINGS_PADDING),
        // The size of Paramétrage (SettingsModal).
        content: {
          height: SETTINGS_HEIGHT,
          maxHeight: SETTINGS_HEIGHT_MAX,
          display: "flex",
          flexDirection: "column",
          position: "relative",
        },
        body: {
          ...modalHeaderStyles(SETTINGS_PADDING).body,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      <Stack gap="xl" style={{ flex: 1, minHeight: 0 }}>
        <ScrollArea
          type="auto"
          scrollbars="y"
          style={{ flex: 1, minHeight: 0 }}
          // Empty, the prompt takes the whole height.
          classNames={{ scrollbar: scroll.scrollbar, thumb: scroll.thumb, viewport: scroll.viewport }}
        >
          {view && (
            <PrincipalsPermissions<ViewSharePermissions>
              // Another view: another list, read again.
              key={view.id}
              load={load}
              save={save}
              remove={remove}
              empty={() => ({})}
              summary={summary}
              details={(permissions, change) => (
                <SectionRights
                  sections={boards}
                  permissions={toSections(permissions)}
                  onChange={(p) => change(fromSections(p))}
                  normalize={normalize}
                  attached
                  addLabel="Ajouter un tableau"
                  emptyMessage="Aucun tableau partagé"
                  multiAdd={{ allLabel: "Tous les tableaux", countLabel: boardCount }}
                />
              )}
              emptyText="Cette vue n'est partagée avec personne"
              protectOwn={false}
              fillEmpty
              candidates={principals}
              removeDialog={{
                label: "Retirer le partage",
                message: (name) => (
                  <>Voulez-vous vraiment retirer à « {name} » les tableaux de cette vue ?</>
                ),
              }}
            />
          )}
        </ScrollArea>
        <Group justify="flex-end">
          <Checkbox
            label="Envoyer une invitation"
            checked={invite}
            onChange={(e) => setInvite(e.currentTarget.checked)}
            color="teal"
            mr="auto"
          />
          <CloseButton onClick={onClose} />
          <Button color="teal" onClick={send} loading={saving}>
            Enregistrer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
