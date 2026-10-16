import { Stack } from "@mantine/core";
import { IconList, IconMailbox } from "@tabler/icons-react";
import Inboxes, { looksLikeAddress } from "../../components/support/Inboxes";
import { inboxesOf } from "../../components/ui/ReceptionField";
import { useConfirmations } from "../../lib/confirmations";
import {
  NEW_MESSAGE_LABELS,
  NEW_TICKET_ACTORS,
  PROJECT_CREATION,
  SUPPORT_DEFAULT_COLUMNS,
  SUPPORT_NEW_MESSAGE_LABELS,
  TASK_CREATION,
  TICKETS_MAIL_TEMPLATE_KEYS,
  listKey,
} from "@milo/shared";
import MailTemplates from "../../components/settings/MailTemplates";
import ActorPicker from "../../components/ui/ActorPicker";
import { useUsers } from "../../lib/users";
import SupportOptions from "../../components/support/SupportOptions";
import { useSettingsMode, useTemplatesAccess } from "../../lib/rights";
import EmptyPanel from "../../components/ui/EmptyPanel";
import { DRAWER_WIDTH } from "../../components/ui/IndicatorDrawer";
import ColumnFields from "../../components/ui/ColumnFields";
import { WidgetLinksField } from "../../components/ui/WidgetLinks";
import LabelGroupFields from "../../components/ui/LabelGroupFields";
import NewMessageLabels from "../../components/settings/NewMessageLabels";
import { useSupportLabels } from "../../lib/label-groups";
import { withField } from "../types";
import { useListRef } from "../../lib/list-ref";
import SupportRequestsList, {
  MAILBOXES,
  SUPPORT_COLUMNS,
} from "../../components/support/SupportRequestsList";
import type { IndicatorConfigProps, IndicatorDisplayProps, SupportIndicatorWidget } from "./types";
import { PERCENT_HEIGHT } from "../height";

/**
 * The labels a ticket received by e-mail gets automatically, among the
 * board's. Never chosen, those bearing the default names.
 */
function NewMessageFields({ config, onChange }: IndicatorConfigProps) {
  const labels = useSupportLabels();
  const chosen = (config as Record<string, unknown> | null)?.[NEW_MESSAGE_LABELS];
  const names = SUPPORT_NEW_MESSAGE_LABELS.map((n) => n.toLowerCase());
  const value = Array.isArray(chosen)
    ? chosen.map(String)
    : labels.filter((l) => names.includes(l.name.toLowerCase())).map((l) => String(l.id));
  return (
    <NewMessageLabels
      labels={labels}
      value={value}
      onChange={(ids) => onChange(withField(config, NEW_MESSAGE_LABELS, ids.map(Number)))}
      canEdit
    />
  );
}

/**
 * The actors told of each new ticket the list receives ("Réception d'un
 * nouveau ticket"): the same picker as a ticket's actors.
 */
function NewTicketActors({ config, onChange }: IndicatorConfigProps) {
  const users = useUsers();
  const chosen = (config as Record<string, unknown> | null)?.[NEW_TICKET_ACTORS];
  const value = Array.isArray(chosen) ? chosen.map(String) : [];
  return (
    <ActorPicker
      kind="helpdesk"
      label="Acteurs"
      users={users}
      value={value}
      onChange={(ids) => onChange(withField(config, NEW_TICKET_ACTORS, ids.map(Number)))}
    />
  );
}

/**
 * The list's settings: the Tâches and Projets widgets its tickets create
 * in, then its columns, who is told of its new tickets, the
 * board's Support labels and those an e-mail receives, then the addresses it
 * receives requests from, each with the label it sets and confirmed by its
 * inbox, and what it does with the retrieved e-mails. For whoever may modify the
 * Paramétrage, Support's options and the templates of the e-mails the list
 * sends follow.
 */
function ListFields(props: IndicatorConfigProps) {
  const canEditSettings = useSettingsMode();
  const canEditTemplates = useTemplatesAccess();
  // Its e-mail templates and replies are its own.
  const list = useListRef();
  return (
    <Stack gap="xl">
      <WidgetLinksField
        direction="out"
        inputs={[
          { field: TASK_CREATION, label: "Création d'une tâche", types: ["task.list"] },
          { field: PROJECT_CREATION, label: "Création d'un projet", types: ["project.list"], single: true },
        ]}
        config={props.config}
        onChange={props.onChange}
      />
      <ColumnFields columns={SUPPORT_COLUMNS} defaults={SUPPORT_DEFAULT_COLUMNS} {...props} />
      <NewTicketActors {...props} />
      {/* The board's Support labels: they go to saving. */}
      <LabelGroupFields kind="support-labels" />
      {/* Right under the labels it picks from. */}
      <NewMessageFields {...props} />
      <Inboxes {...props} />
      {canEditSettings && (
        <>
          <SupportOptions canEdit part="settings" />
          <MailTemplates canEdit={canEditTemplates} only={TICKETS_MAIL_TEMPLATE_KEYS} list={list} />
          {/* The replies after the templates they are laid out in. */}
          <SupportOptions canEdit part="replies" />
        </>
      )}
    </Stack>
  );
}

/** The list, or the prompt to add an inbox while none is confirmed. */
function ListIndicator({
  config,
  onEdit,
  locked,
}: Pick<IndicatorDisplayProps, "config" | "onEdit" | "locked">) {
  const emails = inboxesOf(config, MAILBOXES).map((b) =>
    typeof b.email === "string" ? b.email : "",
  );
  const { isRead, confirmed } = useConfirmations(listKey(config), emails);
  // As long as the confirmations are not read, nothing shows: the list
  // does not appear only to make way for the prompt a moment later.
  if (emails.length > 0 && !isRead) return null;
  // No confirmed inbox — none yet, or still waiting for its code: "Ajouter"
  // opens the drawer, where they are named and confirmed — as for Mail. One
  // confirmed inbox is enough for the list to work.
  if (!emails.some((e) => looksLikeAddress(e.trim()) && confirmed(e))) {
    return (
      <EmptyPanel
        icon={IconMailbox}
        message="Aucune boîte aux lettres"
        actionLabel={locked ? undefined : "Ajouter"}
        onAction={onEdit}
      />
    );
  }
  return <SupportRequestsList config={config} />;
}

// The requests list, as a widget: it sits in a section like an
// indicator, and its configuration only says which columns it shows. The
// requests of the open tab and the checked boxes come from the page
// (SupportListContext); it sorts and filters them itself.

export const listIndicator: SupportIndicatorWidget = {
  type: "list",
  kind: "helpdesk",
  label: "Tickets",
  icon: IconList,
  defaultConfig: { ...PERCENT_HEIGHT },
  ownClicks: true,
  fill: true,
  Display: ({ config, onEdit, locked }) => (
    <ListIndicator config={config} onEdit={onEdit} locked={locked} />
  ),
  // Inboxes carry their label and state on the row.
  drawerSize: DRAWER_WIDTH + 100,
  Config: ListFields,
};
