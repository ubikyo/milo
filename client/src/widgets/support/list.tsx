import { Stack } from "@mantine/core";
import { IconList, IconMailbox } from "@tabler/icons-react";
import Inboxes, { looksLikeAddress } from "../../components/support/Inboxes";
import { inboxesWithProblem, inboxesOf } from "../../components/ui/ReceptionField";
import { useConfirmations } from "../../lib/confirmations";
import {
  NEW_MESSAGE_LABELS,
  NEW_TICKET_ACTORS,
  SUPPORT_NEW_MESSAGE_LABELS,
  TICKETS_MAIL_TEMPLATE_KEYS,
  listKey,
} from "@milo/shared";
import MailTemplates from "../../components/settings/MailTemplates";
import ActorPicker from "../../components/ui/ActorPicker";
import { useUsers } from "../../lib/users";
import SupportOptions from "../../components/support/SupportOptions";
import { useSettingsMode, useTemplatesAccess } from "../../lib/rights";
import ConfigurationProblem from "../../components/ui/ConfigurationProblem";
import EmptyPanel from "../../components/ui/EmptyPanel";
import { DRAWER_WIDTH } from "../../components/ui/IndicatorDrawer";
import ColumnFields from "../../components/ui/ColumnFields";
import LabelGroupFields from "../../components/ui/LabelGroupFields";
import NewMessageLabels from "../../components/settings/NewMessageLabels";
import { useSupportLabels } from "../../lib/label-groups";
import { withField } from "../types";
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
 * The list's settings: who is told of its new tickets, the addresses it receives requests from, each with
 * the label it sets and confirmed by its inbox,
 * what it does with the retrieved e-mails, then its columns, the board's
 * Support labels and those an e-mail receives. For whoever may modify the
 * Paramétrage, Support's options and the templates of the e-mails the list
 * sends follow.
 */
function ListFields(props: IndicatorConfigProps) {
  const canEditSettings = useSettingsMode();
  const canEditTemplates = useTemplatesAccess();
  return (
    <Stack gap="xl">
      <NewTicketActors {...props} />
      <Inboxes {...props} />
      <ColumnFields columns={SUPPORT_COLUMNS} {...props} />
      {/* The board's Support labels: they go to saving. */}
      <LabelGroupFields kind="support-labels" />
      {/* Right under the labels it picks from. */}
      <NewMessageFields {...props} />
      {canEditSettings && (
        <>
          <SupportOptions canEdit part="settings" />
          <MailTemplates canEdit={canEditTemplates} only={TICKETS_MAIL_TEMPLATE_KEYS} />
          {/* The replies after the templates they are laid out in. */}
          <SupportOptions canEdit part="replies" />
        </>
      )}
    </Stack>
  );
}

/** The list, or the prompt to review its settings when its inboxes do not hold. */
function ListIndicator({
  config,
  onEdit,
  locked,
}: Pick<IndicatorDisplayProps, "config" | "onEdit" | "locked">) {
  const emails = inboxesOf(config, MAILBOXES).map((b) =>
    typeof b.email === "string" ? b.email : "",
  );
  const { isRead, confirmed } = useConfirmations(listKey(config), emails);
  // No inbox: "Ajouter" opens the drawer, where they are named — as for Mail.
  if (emails.length === 0) {
    return (
      <EmptyPanel
        icon={IconMailbox}
        message="Aucune boîte aux lettres"
        actionLabel={locked ? undefined : "Ajouter"}
        onAction={onEdit}
        fill={false}
      />
    );
  }
  // Each inbox must have a readable e-mail address, and be confirmed.
  if (inboxesWithProblem(config, MAILBOXES, "email", looksLikeAddress)) {
    return <ConfigurationProblem widget={listIndicator.label} />;
  }
  // As long as the confirmations are not read, nothing shows: the list
  // does not appear only to make way for the warning a moment later.
  if (!isRead) return null;
  if (emails.some((e) => !confirmed(e))) {
    return <ConfigurationProblem widget={listIndicator.label} />;
  }
  return <SupportRequestsList config={config} />;
}

// The requests list, as a widget: it sits in a section like an
// indicator, and its configuration only says which columns it shows. What
// it lists — the open tab, sorted, filtered — comes from the page
// (SupportListContext).

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
