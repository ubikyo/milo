import { Stack } from "@mantine/core";
import { IconList } from "@tabler/icons-react";
import BoitesDeReception, { ressembleAUneAdresse } from "../components/support/BoitesDeReception";
import { receptionsAProbleme, receptionsDe } from "../components/ui/ChampReception";
import { useConfirmations } from "../lib/confirmations";
import { cleDeListe } from "@milo/shared";
import ProblemeDeConfiguration from "../components/ui/ProblemeDeConfiguration";
import { TIROIR_LARGEUR } from "../components/ui/IndicatorDrawer";
import { useReferences } from "../lib/references";
import ChampsColonnes from "../components/ui/ChampsColonnes";
import SupportRequestsList, {
  BOITES,
  COLONNES_SUPPORT,
} from "../components/support/SupportRequestsList";
import type { IndicatorConfigProps, SupportIndicatorWidget } from "./types";

/**
 * Les réglages de la liste : les adresses dont elle reçoit les demandes,
 * chacune vers un contexte du tableau et confirmée par sa boîte, ce qu'elle
 * fait des e-mails relevés, puis ses colonnes.
 */
function ChampsListe(props: IndicatorConfigProps) {
  return (
    <Stack gap="xl">
      <BoitesDeReception {...props} />
      <ChampsColonnes colonnes={COLONNES_SUPPORT} {...props} />
    </Stack>
  );
}

/** La liste, ou l'invite à revoir ses réglages quand ses boîtes ne tiennent pas. */
function Liste({ config }: { config: unknown }) {
  const { contexts } = useReferences();
  const ids = contexts.map((c) => c.id);
  const emails = receptionsDe(config, BOITES).map((b) =>
    typeof b.email === "string" ? b.email : "",
  );
  const { lus, confirmee } = useConfirmations(cleDeListe(config), emails);
  // Chaque boîte doit avoir une adresse e-mail lisible, son contexte, et
  // être confirmée.
  if (receptionsAProbleme(config, BOITES, "email", ids, ressembleAUneAdresse)) {
    return <ProblemeDeConfiguration widget={listeIndicator.label} />;
  }
  // Tant que les confirmations ne sont pas lues, rien ne se montre : la liste
  // ne paraît pas pour céder la place à l'avertissement un instant après.
  if (!lus) return null;
  if (emails.some((e) => !confirmee(e))) {
    return <ProblemeDeConfiguration widget={listeIndicator.label} />;
  }
  return <SupportRequestsList config={config} />;
}

// La liste des demandes, en widget : elle se pose dans une section comme un
// indicateur, et sa configuration ne dit que les colonnes qu'elle montre. Ce
// qu'elle liste — l'onglet ouvert, trié, filtré — vient de la page
// (SupportListeContext).

export const listeIndicator: SupportIndicatorWidget = {
  type: "list",
  kind: "helpdesk",
  label: "Tickets",
  icon: IconList,
  defaultConfig: {},
  ownClicks: true,
  fill: true,
  Display: ({ config }) => <Liste config={config} />,
  // Les boîtes de réception portent leur contexte et leur état sur la ligne.
  drawerSize: TIROIR_LARGEUR + 100,
  Config: ChampsListe,
};
