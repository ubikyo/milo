import { Stack } from "@mantine/core";
import { IconList } from "@tabler/icons-react";
import Inboxes, { looksLikeAddress } from "../components/support/Inboxes";
import { inboxesWithProblem, inboxesOf } from "../components/ui/ReceptionField";
import { useConfirmations } from "../lib/confirmations";
import { listKey } from "@milo/shared";
import ConfigurationProblem from "../components/ui/ConfigurationProblem";
import { DRAWER_WIDTH } from "../components/ui/IndicatorDrawer";
import { useReferences } from "../lib/references";
import ColumnFields from "../components/ui/ColumnFields";
import SupportRequestsList, {
  MAILBOXES,
  SUPPORT_COLUMNS,
} from "../components/support/SupportRequestsList";
import type { IndicatorConfigProps, SupportIndicatorWidget } from "./types";

/**
 * The list's settings: the addresses it receives requests from,
 * each to a board context and confirmed by its inbox, what it
 * does with the retrieved e-mails, then its columns.
 */
function ListFields(props: IndicatorConfigProps) {
  return (
    <Stack gap="xl">
      <Inboxes {...props} />
      <ColumnFields columns={SUPPORT_COLUMNS} {...props} />
    </Stack>
  );
}

/** The list, or the prompt to review its settings when its inboxes do not hold. */
function ListIndicator({ config }: { config: unknown }) {
  const { contexts } = useReferences();
  const ids = contexts.map((c) => c.id);
  const emails = inboxesOf(config, MAILBOXES).map((b) =>
    typeof b.email === "string" ? b.email : "",
  );
  const { isRead, confirmed } = useConfirmations(listKey(config), emails);
  // Each inbox must have a readable e-mail address, its context, and
  // be confirmed.
  if (inboxesWithProblem(config, MAILBOXES, "email", ids, looksLikeAddress)) {
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
  defaultConfig: {},
  ownClicks: true,
  fill: true,
  Display: ({ config }) => <ListIndicator config={config} />,
  // Inboxes carry their context and state on the row.
  drawerSize: DRAWER_WIDTH + 100,
  Config: ListFields,
};
