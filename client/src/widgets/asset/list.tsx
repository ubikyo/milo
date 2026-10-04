import { Stack } from "@mantine/core";
import { IconList, IconTag } from "@tabler/icons-react";
import AssetsList, { ASSET_COLUMNS, TAGS } from "../../components/assets/AssetsList";
import ReceptionField, { inboxesWithProblem } from "../../components/ui/ReceptionField";
import ConfigurationProblem from "../../components/ui/ConfigurationProblem";
import ColumnFields from "../../components/ui/ColumnFields";
import { useReferences } from "../../lib/references";
import type { IndicatorConfigProps } from "../support/types";
import type { AssetIndicatorWidget } from "./types";

/**
 * The list settings: the GLPI agent tags whose workstations it receives,
 * each mapped to a board context, then its columns.
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

/** The list, or the prompt to review its settings when its tags don't fit. */
function ListIndicator({ config }: { config: unknown }) {
  const { contexts } = useReferences();
  if (inboxesWithProblem(config, TAGS, "tag", contexts.map((c) => c.id))) {
    return <ConfigurationProblem widget={assetListIndicator.label} />;
  }
  return <AssetsList config={config} />;
}

// The workstation list, as a widget: it sits in a section like an
// indicator, and its configuration only names the columns it shows. The
// workstations come from the page (AssetsListContext).

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
