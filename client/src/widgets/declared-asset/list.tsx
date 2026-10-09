import { Stack } from "@mantine/core";
import type { DeclaredAssetKind } from "@milo/shared";
import DeclaredAssetsList, {
  declaredAssetColumns,
} from "../../components/declared-assets/DeclaredAssetsList";
import AssetNumberTemplateFields from "../../components/declared-assets/AssetNumberTemplateFields";
import DeclaredAssetTablesFields from "../../components/declared-assets/DeclaredAssetTablesFields";
import { DECLARED_ASSET_LOOKS } from "../../components/declared-assets/kinds";
import ColumnFields from "../../components/ui/ColumnFields";
import LabelGroupFields from "../../components/ui/LabelGroupFields";
import LabelTemplatesFields from "../../components/ui/LabelTemplatesFields";
import type { IndicatorConfigProps } from "../support/types";
import type { DeclaredAssetWidget } from ".";

// The list of a declared asset kind, as a widget: its configuration names the
// columns it shows.

/**
 * The list settings: at the top, the board's labels of the kind, then its
 * lists — categories, suppliers, makers, products —, then its columns, then
 * its label templates and its asset number template.
 */
const listFields = (kind: DeclaredAssetKind) =>
  function ListFields(props: IndicatorConfigProps) {
    return (
      <Stack gap="xl">
        {/* The board's labels: they go to saving. */}
        <LabelGroupFields kind={DECLARED_ASSET_LOOKS[kind].labels} />
        {/* The board's lists: they go to saving too. */}
        <DeclaredAssetTablesFields kind={kind} />
        <ColumnFields columns={declaredAssetColumns(kind)} {...props} />
        {/* Its label templates, before the "Apparence" block: board data too. */}
        <LabelTemplatesFields kind={kind} />
        <AssetNumberTemplateFields kind={kind} />
      </Stack>
    );
  };

export const declaredAssetListWidget = (kind: DeclaredAssetKind): DeclaredAssetWidget => ({
  type: "list",
  kind,
  label: DECLARED_ASSET_LOOKS[kind].words.label,
  icon: DECLARED_ASSET_LOOKS[kind].icon,
  defaultConfig: {},
  ownClicks: true,
  fill: true,
  Display: ({ config, id }) => <DeclaredAssetsList kind={kind} config={config} blockId={id} />,
  Config: listFields(kind),
});
