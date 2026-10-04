import { Stack } from "@mantine/core";
import { IconList, IconTag } from "@tabler/icons-react";
import AssetsList, { COLONNES_ASSETS, TAGS } from "../components/assets/AssetsList";
import ChampReception, { receptionsAProbleme } from "../components/ui/ChampReception";
import ProblemeDeConfiguration from "../components/ui/ProblemeDeConfiguration";
import ChampsColonnes from "../components/ui/ChampsColonnes";
import { useReferences } from "../lib/references";
import type { IndicatorConfigProps } from "../indicators/types";
import type { AssetIndicatorWidget } from "./types";

/**
 * Les réglages de la liste : les tags d'agent GLPI dont elle reçoit les
 * postes, chacun vers un contexte du tableau, puis ses colonnes.
 */
function ChampsListe(props: IndicatorConfigProps) {
  const { assetTags } = useReferences();
  return (
    <Stack gap="xl">
      <ChampReception
        cle={TAGS}
        champ="tag"
        label="Tags de l'agent GLPI"
        placeholder="Tag de l'agent"
        ajouter="Ajouter un tag GLPI agent"
        icone={IconTag}
        vide="Aucun tag GLPI agent"
        suggestions={assetTags}
        {...props}
      />
      <ChampsColonnes colonnes={COLONNES_ASSETS} {...props} />
    </Stack>
  );
}

/** La liste, ou l'invite à revoir ses réglages quand ses tags ne tiennent pas. */
function Liste({ config }: { config: unknown }) {
  const { contexts } = useReferences();
  if (receptionsAProbleme(config, TAGS, "tag", contexts.map((c) => c.id))) {
    return <ProblemeDeConfiguration widget={listeAssetIndicator.label} />;
  }
  return <AssetsList config={config} />;
}

// La liste des postes, en widget : elle se pose dans une section comme un
// indicateur, et sa configuration ne dit que les colonnes qu'elle montre. Les
// postes viennent de la page (AssetsListeContext).

export const listeAssetIndicator: AssetIndicatorWidget = {
  type: "list",
  kind: "asset",
  label: "Assets",
  icon: IconList,
  defaultConfig: {},
  ownClicks: true,
  fill: true,
  Display: ({ config }) => <Liste config={config} />,
  Config: ChampsListe,
};
