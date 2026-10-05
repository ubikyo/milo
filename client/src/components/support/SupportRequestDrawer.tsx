import {
  Badge,
  Button,
  Drawer,
  Group,
  Input,
  Menu,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import CardDueDate, { EMPTY_DUE } from "../board/CardDueDate";
import {
  IconCheck,
  IconChevronDown,
  IconEye,
  IconMessage,
  IconSettings,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import {
  ACTIONS_BUTTON_STYLE,
  DRAWER_MENU_OFFSET,
  TAB_MENU_STYLES,
} from "../../themes/menus";
import { tabStyle } from "../../themes/tabs";
import { ACTOR_GAP, PersonAvatar, SenderAvatar } from "../ui/ActorAvatars";
import ActorPicker from "../ui/ActorPicker";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import DrawerFooter from "../ui/DrawerFooter";
import DrawerScrollArea, {
  DRAWER_PANEL_STYLE,
  DRAWER_STYLES,
  DRAWER_TABS_STYLES,
} from "../ui/DrawerScroll";
import EmptyPanel from "../ui/EmptyPanel";
import LabelPicker, { SUPPORT_LABELS_API } from "../ui/LabelPicker";
import CommentThread from "../project/CommentThread";
import { BARE_FIELDSET, useRights } from "../../lib/rights";
import SupportMessages, { SupportReply } from "./SupportMessages";
import type { ReplySending, SupportMessage } from "./SupportMessages";
import { errorMessage, notifyError } from "../../lib/errors";
import {
  DEFAULT_SUPPORT_STATUS,
  MILO_ACTOR_ID,
  SUPPORT_STATUSES,
  fillSupportTemplate,
  supportReplyValues,
  supportTicketRef,
} from "@milo/shared";
import type { CSSProperties } from "react";
import type {
  Id,
  PublicUser,
  SupportContent,
  SupportContentEvent,
  SupportPerson,
  SupportLabel,
  SupportRequest,
  SupportRequestInput,
  SupportStatus,
} from "@milo/shared";

// Two panes: the ticket and its exchanges with the sender, then the
// team's internal comments — as on a card or a project.
const TABS = [
  { value: "settings", label: "Ticket", icon: IconSettings },
  { value: "comments", label: "Commentaires", icon: IconMessage },
];

// The messages panel does not shrink below this height, even when the
// form above takes up space: at least one message is always readable.
const MESSAGES_MIN_HEIGHT = 200;

// The status and due date, on the row under the subject.
const STATUS_WIDTH = 120;
const DUE_WIDTH = 320;

const DRAWER_PADDING = 40;

/** A team reply: neither a received e-mail, nor a Milo word. */
const fromTeam = (m: SupportMessage): boolean =>
  m.format !== "email" && !m.system && m.author?.id !== MILO_ACTOR_ID;

/**
 * The event that the team's next reply amounts to, based on the thread: empty,
 * only the sender has written there, or the team has already replied.
 */
const threadEvent = (exchanges: SupportMessage[]): SupportContentEvent =>
  exchanges.some(fromTeam)
    ? "reply"
    : exchanges.some((m) => m.format === "email")
      ? "first_reply"
      : "new";

// Much wider than the other drawers (560): a request holds its
// actors, its labels and its exchanges side by side, and its thread reads
// without each comment wrapping.
const DRAWER_WIDTH = 820;

// On creation, 200 px more than for an open request.
const DRAWER_WIDTH_CREATION = DRAWER_WIDTH + 200;

// The actors column, in the "Ticket" tab: enough to hold a few
// bubbles and the "+", without taking the labels' space.
const ACTORS_WIDTH = 140;

// Height of the labels and of the "+" following them, as on a card's
// form.
const CHIP_HEIGHT = 30;

/**
 * A ticket's form. It opens on a click on a row, or
 * empty from "Nouveau ticket", and closes on save.
 *
 * Its actors and labels work like a card's members and labels:
 * you pick as many as needed, in the same checkbox list.
 */
interface SupportRequestDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** "null" on creation, the targeted request otherwise. */
  request: SupportRequest | null;
  /** The context being viewed: a new request receives its label. */
  context: string | null;
  /** The open board: a new request goes there. */
  boardId: Id | null;
  /** On creation: the "Tickets" widget it is entered from. */
  listKey?: string;
  /** The status of the open tab: the one a request created there takes. */
  defaultStatus: SupportStatus;
  /** The subject proposed on creation: that of the item it is created from. */
  defaultSubject?: string;
  /**
   * Whoever creates the request is its actor by default — except from the Accès
   * mode, where a problem is reported without taking charge of it.
   */
  assignCurrentUser?: boolean;
  users: PublicUser[];
  currentUser: PublicUser;
  onSaved: () => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
  /** The person follows this request: they are notified of each change. */
  following: boolean;
  onToggleFollow: () => void | Promise<void>;
}

export default function SupportRequestDrawer({
  opened,
  onClose,
  request,
  context,
  boardId,
  listKey,
  defaultStatus,
  defaultSubject = "",
  assignCurrentUser = true,
  users,
  currentUser,
  onSaved,
  onDeleted,
  following,
  onToggleFollow,
}: SupportRequestDrawerProps) {
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState<SupportStatus>(DEFAULT_SUPPORT_STATUS);
  /** The support labels of the request's board. */
  const [labels, setLabels] = useState<SupportLabel[]>([]);
  /** The retained actors, as strings: those who handle the request. */
  const [actorIds, setActorIds] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  /** The due date, in ISO; empty when the request has none. */
  const [due, setDue] = useState("");
  const [comments, setComments] = useState<SupportMessage[]>([]);
  /** The default contents, which the reply drops into its editor. */
  const [contents, setContents] = useState<SupportContent[]>([]);
  /** The Entra records their variables cite: who writes, and the sender. */
  const [people, setPeople] = useState<{
    user: SupportPerson | null;
    sender: SupportPerson | null;
  }>({ user: null, sender: null });
  const [activeTab, setActiveTab] = useState<string | null>("settings");
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);
  const [registration, setSaving] = useState(false);

  // Without the right to edit requests, the form is read-only.
  const can = useRights();
  const readOnly = Boolean(request) && !can("support", "update");
  const canDelete = Boolean(request) && can("support", "delete");

  useEffect(() => {
    if (!opened) return;
    // A reopened drawer starts from the parameters, whatever tab was left.
    setActiveTab("settings");

    if (!request) {
      setSubject(defaultSubject);
      setStatus(defaultStatus);
      // Whoever creates the request handles it, until decided otherwise.
      setActorIds(assignCurrentUser ? [String(currentUser.id)] : []);
      setLabelIds([]);
      setDue("");
      setComments([]);
      return;
    }

    setSubject(request.subject);
    setStatus(request.status);
    setActorIds(request.actors.map((a) => String(a.id)));
    setLabelIds(request.labels.map((l) => String(l.id)));
    setDue(request.due_date || "");
    api
      .getSupportRequest(request.id)
      .then((record) => setComments(record.comments))
      .catch((e) => notifyError(errorMessage(e)));
  }, [
    opened,
    request,
    defaultStatus,
    defaultSubject,
    assignCurrentUser,
    currentUser.id,
  ]);

  /** The support labels: those of the request's board. */
  const reloadLabels = useCallback(async () => {
    if (boardId == null) return;
    try {
      setLabels(await api.getSupportLabels(boardId));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [boardId]);

  useEffect(() => {
    if (opened) void reloadLabels();
  }, [opened, reloadLabels]);

  useEffect(() => {
    if (!opened) return;
    api
      .getSupportContents()
      .then(setContents)
      .catch((e) => notifyError(errorMessage(e)));
  }, [opened]);

  const requestId = request?.id;
  useEffect(() => {
    if (!opened) return;
    setPeople({ user: null, sender: null });
    api
      .getSupportVariables(requestId)
      .then(setPeople)
      .catch((e) => notifyError(errorMessage(e)));
  }, [opened, requestId]);

  // A single thread server-side, two on the form side: the exchanges with
  // the sender, and the internal comments.
  const exchanges = comments.filter((c) => !c.internal);
  const notes = comments.filter((c) => c.internal);

  // What the reply carries by default: the content for the moment in the thread, then that
  // of any message — a signature — after a blank line; their variables
  // filled in with the Entra record of whoever writes, that of the sender, and the
  // request. Before creation, it has neither a number nor a sender: these
  // variables stay empty. Rendering waits for the records, so as not to place
  // a signature without a phone number that would fix itself before one's eyes.
  const contentFor = (event: SupportContentEvent) =>
    contents.find((c) => c.event === event)?.html ?? "";
  const replyTemplate = (() => {
    const html = [contentFor(threadEvent(exchanges)), contentFor("all")]
      .filter(Boolean)
      .join("<p></p>");
    if (!html || !people.user) return "";
    const values = supportReplyValues({
      ...people,
      request: { number: request?.number ?? 0, subject, status },
    });
    return fillSupportTemplate(html, values);
  })();

  const refreshComments = async () => {
    if (!request) return;
    const record = await api.getSupportRequest(request.id);
    setComments(record.comments);
  };

  /**
   * What the request carries. None of it is mandatory: a request
   * without a subject is read through its thread.
   */
  const input = (): SupportRequestInput => ({
    subject: subject.trim(),
    status,
    actor_ids: actorIds.map(Number),
    due_date: due,
    label_ids: labelIds.map(Number),
  });

  /** Is this address that of whoever wrote to the support inbox? */
  const isSender = (email: string): boolean =>
    Boolean(request?.sender_email) &&
    email.toLowerCase() === request!.sender_email.toLowerCase();

  /** The sender, when no chosen account already carries their address. */
  const sender =
    request?.sender_email &&
    !users.some(
      (u) =>
        actorIds.includes(String(u.id)) &&
        u.email.toLowerCase() === request.sender_email.toLowerCase(),
    )
      ? {
          id: 0,
          name: request.sender_name || request.sender_email,
          email: request.sender_email,
          gravatar_url: "",
        }
      : null;

  /** True as soon as the request says something: enough to be worth creating. */
  // The default actor — who creates the request — is not enough to fill it.
  const isFilled = Boolean(
    subject.trim() ||
    actorIds.some((id) => id !== String(currentUser.id)) ||
    labelIds.length ||
    due ||
    comments.length,
  );

  // "Sauvegarder": the only action that writes. A new request with nothing
  // said is not created. If the server refuses, the drawer stays open
  // with the message rather than discarding the input.
  const persist = async () => {
    if (!request && !isFilled) return onClose();
    setSaving(true);
    try {
      if (request) {
        await api.updateSupportRequest(request.id, input());
      } else {
        const created = await api.createSupportRequest({
          ...input(),
          board_id: boardId ?? undefined,
          // Created in a context, it receives its label (server).
          context: context ?? undefined,
          list_key: listKey || undefined,
        });
        // The exchanges held before creation follow it.
        for (const comment of comments) {
          await api.addSupportComment(
            created.id,
            comment.text,
            Boolean(comment.internal),
          );
        }
      }
      await onSaved();
      // "Mettre à jour" leaves the request open; a creation, on the other hand,
      // closes the drawer.
      if (!request) onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmDeleteOpened(false);
    if (!request) return;
    try {
      await api.deleteSupportRequest(request.id);
      await onDeleted();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  // Before creation, comments live locally and go to the server once
  // the request is saved — like those of a project being opened.
  const addComment = async (text: string, sending?: ReplySending) => {
    // The send button says where the request stands: the form shows it right away.
    if (sending) setStatus(sending.status);
    if (!request) {
      const instant = new Date().toISOString();
      const me = String(currentUser.id);
      setActorIds((already) => (already.includes(me) ? already : [...already, me]));
      setComments((thread) => [
        ...thread,
        {
          id: `draft-${instant}-${thread.length}`,
          text: text,
          author: currentUser,
          created_at: instant,
          updated_at: instant,
        },
      ]);
      return;
    }
    // Attachments go first, one by one: the reply then carries
    // only their storage names.
    const { files = [], ...rest } = sending ?? {};
    const uploaded = [];
    for (const file of files)
      uploaded.push(await api.uploadSupportFile(request.id, file));
    await api.addSupportComment(request.id, text, false, {
      ...rest,
      files: uploaded,
    });
    // Whoever writes becomes an actor: the server set it, the form shows it — and
    // saving the form will not remove them.
    const me = String(currentUser.id);
    setActorIds((already) => (already.includes(me) ? already : [...already, me]));
    await refreshComments();
  };

  // Internal comments: same action as on a card or a project.
  // Before creation, they wait locally, like the exchanges.
  const addNote = async (text: string) => {
    if (!request) {
      const instant = new Date().toISOString();
      setComments((thread) => [
        ...thread,
        {
          id: `draft-${instant}-${thread.length}`,
          text: text,
          internal: true,
          author: currentUser,
          created_at: instant,
          updated_at: instant,
        },
      ]);
      return;
    }
    await api.addSupportComment(request.id, text, true);
    await refreshComments();
  };

  const editNote = async (id: number | string, text: string) => {
    if (!request || typeof id !== "number") {
      setComments((thread) =>
        thread.map((c) =>
          c.id === id
            ? { ...c, text: text, updated_at: new Date().toISOString() }
            : c,
        ),
      );
      return;
    }
    await api.updateSupportComment(id, text);
    await refreshComments();
  };

  const deleteComment = async (id: number | string) => {
    if (!request || typeof id !== "number") {
      setComments((thread) => thread.filter((c) => c.id !== id));
      return;
    }
    await api.deleteSupportComment(id);
    await refreshComments();
  };

  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size={request ? DRAWER_WIDTH : DRAWER_WIDTH_CREATION}
        padding={DRAWER_PADDING}
        withCloseButton={false}
        // Like the other drawers: only the tab's panel scrolls, the
        // tabs and the bottom buttons stay in place, and the bar runs
        // along the right edge (components/ui/DrawerScroll.tsx).
        styles={DRAWER_STYLES}
      >
        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          style={DRAWER_PANEL_STYLE}
          styles={DRAWER_TABS_STYLES}
        >
          <Tabs.List mb="md">
            {TABS.map(({ value, label, icon: Icon }) => (
              <Tabs.Tab
                key={value}
                value={value}
                leftSection={<Icon size={16} />}
                style={tabStyle(activeTab === value)}
              >
                {label}
              </Tabs.Tab>
            ))}

            {/* At the end of the tab row, as on a card. A request being
                created has nothing to follow yet: the menu does not
                appear. */}
            {request && (
              <Menu
                position="bottom-end"
                withinPortal
                shadow="md"
                offset={DRAWER_MENU_OFFSET}
                styles={TAB_MENU_STYLES}
              >
                <Menu.Target>
                  <Button
                    variant="subtle"
                    color="gray"
                    rightSection={<IconChevronDown size={14} />}
                    ml="auto"
                    mb={4}
                    style={
                      {
                        alignSelf: "center",
                        ...ACTIONS_BUTTON_STYLE,
                      } as CSSProperties
                    }
                  >
                    Actions
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {/* The menu does not close, so the checkmark can be seen changing. */}
                  <Menu.Item
                    leftSection={<IconEye size={16} />}
                    rightSection={following ? <IconCheck size={14} /> : null}
                    onClick={() => void onToggleFollow()}
                    closeMenuOnClick={false}
                  >
                    Suivre
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Tabs.List>

          <Tabs.Panel value="settings" style={DRAWER_PANEL_STYLE}>
            {/* The whole panel scrolls when the window is too short; otherwise
                the message thread takes the remaining height. */}
            <DrawerScrollArea fill>
              {/* The form at the top, the messages in their own scrolling
                panel, and the reply at the very bottom: only the thread scrolls, the
                form and the editor stay in place. */}
              <Stack gap="xl" style={{ flex: 1, minHeight: 0 }}>
                {/* In read-only mode, the form's fields are all disabled at
                    once: this is what a disabled "fieldset" does. */}
                <fieldset disabled={readOnly} style={BARE_FIELDSET}>
                  <Stack gap="xl">
                    {/* As on a card's form: the two columns each open
                      on their own checkbox list. The actors' bubbles
                      take little space: their column has a fixed
                      width, the labels take the rest. */}
                    <Group align="flex-start" gap="md" wrap="nowrap">
                      <div
                        style={{ flex: `0 0 ${ACTORS_WIDTH}px`, minWidth: 0 }}
                      >
                        <ActorPicker
                          chipHeight={CHIP_HEIGHT}
                          chipGap={ACTOR_GAP}
                          label="Acteurs"
                          users={users}
                          value={actorIds}
                          onChange={setActorIds}
                          renderChip={(u) => (
                            <span
                              style={{ display: "inline-flex" }}
                              aria-label={u.name}
                            >
                              {isSender(u.email) ? (
                                <SenderAvatar person={u} size={CHIP_HEIGHT} />
                              ) : (
                                <PersonAvatar person={u} size={CHIP_HEIGHT} />
                              )}
                            </span>
                          )}
                          // The e-mail's sender is an actor by default: they are
                          // shown first, and cannot be removed. Whoever has an account
                          // is already among the actors, and is not duplicated.
                          leadingChips={
                            sender && (
                              <span style={{ display: "inline-flex" }}>
                                <SenderAvatar
                                  person={sender}
                                  size={CHIP_HEIGHT}
                                />
                              </span>
                            )
                          }
                        />
                      </div>
                      <div style={{ flex: "7 1 0", minWidth: 0 }}>
                        {/* The board's labels: renaming or recoloring
                          them affects all its requests. */}
                        <LabelPicker
                          chipHeight={CHIP_HEIGHT}
                          labels={labels}
                          value={labelIds}
                          onChange={setLabelIds}
                          boardId={boardId ?? ""}
                          onLabelsChanged={reloadLabels}
                          labelsApi={SUPPORT_LABELS_API}
                          emptyText="Aucune étiquette"
                        />
                      </div>
                      {/* The ticket number, at the end of the row, as in the
                        list: it is what is cited to the sender. */}
                      {request && (
                        <Badge
                          color="green"
                          variant="filled"
                          radius="sm"
                          size="lg"
                          style={{ flexShrink: 0, alignSelf: "center" }}
                        >
                          {supportTicketRef(request.number)}
                        </Badge>
                      )}
                    </Group>

                    {/* The subject: the e-mail's for a received request, and
                      which stays editable. It ends flush with the due date below. */}
                    <div
                      style={{
                        width: `calc(${STATUS_WIDTH + DUE_WIDTH}px + var(--mantine-spacing-md))`,
                        maxWidth: "100%",
                      }}
                    >
                      <TextInput
                        label="Objet"
                        value={subject}
                        onChange={(e) => setSubject(e.currentTarget.value)}
                      />
                    </div>

                    {/* The status and due date, on their own row. */}
                    <Group align="flex-start" gap="md" wrap="nowrap">
                      <div style={{ width: STATUS_WIDTH, flexShrink: 0 }}>
                        {/* The status is what the tabs say: changing it here
                          moves the request from one to the other. */}
                        <Select
                          label="Statut"
                          data={SUPPORT_STATUSES.map((s) => ({
                            value: s.value,
                            label: s.label,
                          }))}
                          value={status}
                          onChange={(value) =>
                            value && setStatus(value as SupportStatus)
                          }
                          allowDeselect={false}
                        />
                      </div>
                      {/* Like a task's: the date, time and state. */}
                      <div style={{ width: DUE_WIDTH, flexShrink: 0 }}>
                        <CardDueDate
                          simple
                          value={{ ...EMPTY_DUE, end: due }}
                          onChange={(v) => setDue(v.end)}
                          onRemove={() => setDue("")}
                        />
                      </div>
                      {/* An open request is saved here, flush right on
                        the row, rather than at the drawer's foot: the exchanges, below,
                        have their own send. Creation keeps "Sauvegarder"
                        at the bottom. */}
                      {request && !readOnly && (
                        <Button
                          color="teal"
                          onClick={persist}
                          loading={registration}
                          style={{
                            alignSelf: "flex-end",
                            flexShrink: 0,
                            marginLeft: "auto",
                          }}
                        >
                          Mettre à jour
                        </Button>
                      )}
                    </Group>
                  </Stack>
                </fieldset>

                {/* The "Échanges" label above the panel, like that
                  of the form's other fields. */}
                <div
                  style={{
                    flex: 1,
                    minHeight: MESSAGES_MIN_HEIGHT,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <Input.Label>Échanges</Input.Label>
                  {/* The background of Mantine's fields ("default" variant):
                    the panel reads like a form field. */}
                  <Paper
                    bg="light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))"
                    style={{
                      flex: 1,
                      minHeight: 0,
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                    }}
                  >
                    {/* Without exchanges, the prompt is centered in the frame, like
                      that of the comments. Otherwise, the thread scrolls in its
                      frame, its thin bar against the frame's right edge:
                      the drawer's own bar scrolls the whole panel. */}
                    {exchanges.length === 0 ? (
                      <EmptyPanel
                        icon={IconMessage}
                        message="Aucun échange pour le moment."
                        size="sm"
                      />
                    ) : (
                      <ScrollArea
                        type="scroll"
                        scrollbars="y"
                        scrollbarSize={4}
                        style={{ flex: 1, minHeight: 0 }}
                      >
                        <Stack gap="md" p={30}>
                          <SupportMessages
                            messages={exchanges}
                            senderEmail={request?.sender_email ?? ""}
                            onDelete={
                              readOnly
                                ? undefined
                                : async (id) => {
                                    try {
                                      await deleteComment(id);
                                    } catch (e) {
                                      notifyError(errorMessage(e));
                                    }
                                  }
                            }
                          />
                          {/* Before creation, the thread only goes to the server with the
                          request: say so rather than let it look
                          saved. */}
                          {!request && exchanges.length > 0 && (
                            <Text size="xs" c="dimmed">
                              {exchanges.length > 1
                                ? `${exchanges.length} messages seront enregistrés`
                                : "Ce message sera enregistré"}{" "}
                              avec la demande.
                            </Text>
                          )}
                        </Stack>
                      </ScrollArea>
                    )}
                  </Paper>
                </div>

                {!readOnly && (
                  <SupportReply
                    template={replyTemplate}
                    byEmail={Boolean(request?.sender_email)}
                    withFiles={Boolean(request)}
                    // On creation, a reply only makes sense if someone
                    // handles the request.
                    blockedReason={
                      !request && !actorIds.length
                        ? "Choisir au moins un acteur avant d'envoyer"
                        : undefined
                    }
                    onSend={async (html, sending) => {
                      try {
                        await addComment(html, sending);
                      } catch (e) {
                        notifyError(errorMessage(e));
                        // Retried: the editor thus keeps the refused text.
                        throw e;
                      }
                    }}
                  />
                )}
              </Stack>
            </DrawerScrollArea>
          </Tabs.Panel>
          <Tabs.Panel value="comments" style={DRAWER_PANEL_STYLE}>
            <DrawerScrollArea fill>
              <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
                {/* Among team members: nothing written here
                    goes to the sender. */}
                <CommentThread
                  comments={notes}
                  onAdd={(text) =>
                    void addNote(text).catch((e) =>
                      notifyError(errorMessage(e)),
                    )
                  }
                  onUpdate={(id, text) =>
                    void editNote(id, text).catch((e) =>
                      notifyError(errorMessage(e)),
                    )
                  }
                  onDelete={(id) =>
                    void deleteComment(id).catch((e) =>
                      notifyError(errorMessage(e)),
                    )
                  }
                  readOnly={readOnly}
                />
                {!request && notes.length > 0 && (
                  <Text size="xs" c="dimmed">
                    {notes.length} commentaire{notes.length > 1 ? "s" : ""}{" "}
                    seront enregistrés avec la demande.
                  </Text>
                )}
              </Stack>
            </DrawerScrollArea>
          </Tabs.Panel>
        </Tabs>

        <DrawerFooter
          onSave={readOnly || request ? undefined : persist}
          onClose={onClose}
          onDelete={
            canDelete ? () => setConfirmDeleteOpened(true) : undefined
          }
          saving={registration}
        />
      </Drawer>

      <DeleteConfirmModal
        opened={confirmDeleteOpened}
        onClose={() => setConfirmDeleteOpened(false)}
        onConfirm={remove}
        title="Supprimer la demande"
        message={
          <>
            Voulez-vous vraiment supprimer cette demande ? Ses échanges seront
            supprimés. Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
