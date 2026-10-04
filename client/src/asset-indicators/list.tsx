import { Stack } from "@mantine/core";
import { IconList, IconTag } from "@tabler/icons-react";
import AssetsList, { ASSET_COLUMNS, TAGS } from "../components/assets/AssetsList";
import ReceptionField, { inboxesWithProblem } from "../components/ui/ReceptionField";
import ConfigurationProblem from "../components/ui/ConfigurationProblem";
import ColumnFields from "../components/ui/ColumnFields";
import { useReferences } from "../lib/references";
import type { IndicatorConfigProps } from "../indicators/types";
import type { AssetIndicatorWidget } from "./types";

/**
 * Les réglages de la liste : les tags d'agent GLPI dont elle reçoit les
 * postes, chacun vers un contexte du tableau, puis ses colonnes.
 */
function ListFields(props: IndicatorConfigProps) {
  const { assetTags } = useReferences();
  return (
    <Stack gap="xl">
      <ReceptionField
        key={TAGS}
        field="tag"
        label="Tags de l'agent GLPI"
        placeholder="Tag de l'agent"
        add="Ajouter un tag GLPI agent"
        icon={IconTag}
        empty="Aucun tag GLPI agent"
        suggestions={assetTags}
        {...props}
      />
      <ColumnFields columns={ASSET_COLUMNS} {...props} />
    </Stack>
  );
}

/** La liste, ou l'invite à revoir ses réglages quand ses tags ne tiennent pas. */
function ListIndicator({ config }: { config: unknown }) {
  const { contexts } = useReferences();
  if (inboxesWithProblem(config, TAGS, "tag", contexts.map((c) => c.id))) {
    return <ConfigurationProblem widget={assetListIndicator.label} />;
  }
  return <AssetsList config={config} />;
}

// La liste des postes, en widget : elle se pose dans une section comme un
// indicateur, et sa configuration ne dit que les colonnes qu'elle montre. Les
// postes viennent de la page (AssetsListeContext).

export const assetListIndicator: AssetIndicatorWidget = {
  type: "list",
  kind: "asset",
  label: "Assets",
  icon: IconList,
  defaultConfig: {},
  ownClicks: true,
  fill: true,
  Display: ({ config }) => <ListIndicator config={config} />,
  Config: ListFields,
};
