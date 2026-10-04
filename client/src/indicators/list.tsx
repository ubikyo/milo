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
 * Les réglages de la liste : les adresses dont elle reçoit les demandes,
 * chacune vers un contexte du tableau et confirmée par sa boîte, ce qu'elle
 * fait des e-mails relevés, puis ses colonnes.
 */
function ListFields(props: IndicatorConfigProps) {
  return (
    <Stack gap="xl">
      <Inboxes {...props} />
      <ColumnFields columns={SUPPORT_COLUMNS} {...props} />
    </Stack>
  );
}

/** La liste, ou l'invite à revoir ses réglages quand ses boîtes ne tiennent pas. */
function ListIndicator({ config }: { config: unknown }) {
  const { contexts } = useReferences();
  const ids = contexts.map((c) => c.id);
  const emails = inboxesOf(config, MAILBOXES).map((b) =>
    typeof b.email === "string" ? b.email : "",
  );
  const { isRead, confirmed } = useConfirmations(listKey(config), emails);
  // Chaque boîte doit avoir une adresse e-mail lisible, son contexte, et
  // être confirmée.
  if (inboxesWithProblem(config, MAILBOXES, "email", ids, looksLikeAddress)) {
    return <ConfigurationProblem widget={listIndicator.label} />;
  }
  // Tant que les confirmations ne sont pas lues, rien ne se montre : la liste
  // ne paraît pas pour céder la place à l'avertissement un instant après.
  if (!isRead) return null;
  if (emails.some((e) => !confirmed(e))) {
    return <ConfigurationProblem widget={listIndicator.label} />;
  }
  return <SupportRequestsList config={config} />;
}

// La liste des demandes, en widget : elle se pose dans une section comme un
// indicateur, et sa configuration ne dit que les colonnes qu'elle montre. Ce
// qu'elle liste — l'onglet ouvert, trié, filtré — vient de la page
// (SupportListeContext).

export const listIndicator: SupportIndicatorWidget = {
  type: "list",
  kind: "helpdesk",
  label: "Tickets",
  icon: IconList,
  defaultConfig: {},
  ownClicks: true,
  fill: true,
  Display: ({ config }) => <ListIndicator config={config} />,
  // Les boîtes de réception portent leur contexte et leur état sur la ligne.
  drawerSize: DRAWER_WIDTH + 100,
  Config: ListFields,
};
