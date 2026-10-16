import { Stack } from "@mantine/core";
import { DECLARED_ASSET_DEFAULT_COLUMNS, DECLARED_ASSET_LIST_SOURCES, DECLARED_ASSET_SUPPLIER_SOURCES, TAX_SOURCES } from "@milo/shared";
import type { DeclaredAssetKind } from "@milo/shared";
import DeclaredAssetsList, {
  declaredAssetColumns,
} from "../../components/declared-assets/DeclaredAssetsList";
import AssetNumberTemplateFields from "../../components/declared-assets/AssetNumberTemplateFields";
import DeclaredAssetTablesFields from "../../components/declared-assets/DeclaredAssetTablesFields";
import { DECLARED_ASSET_LOOKS, EXTRA_ENTRY_LISTS } from "../../components/declared-assets/kinds";
import ColumnFields from "../../components/ui/ColumnFields";
import { DRAWER_WIDTH } from "../../components/ui/IndicatorDrawer";
import { WidgetLinksField } from "../../components/ui/WidgetLinks";
import LabelGroupFields from "../../components/ui/LabelGroupFields";
import LabelTemplatesFields from "../../components/ui/LabelTemplatesFields";
import { PERCENT_HEIGHT } from "../height";
import type { IndicatorConfigProps } from "../support/types";
import type { DeclaredAssetWidget } from ".";

// The list of a declared asset kind, as a widget: its configuration names the
// columns it shows.

/**
 * The list settings: at the top, the Contact widgets its suppliers come
 * from and the Taxes widgets its prices' taxes come from, then its columns,
 * the board's labels of the kind, its lists — categories, makers, products —,
 * then its label templates and its asset number template.
 */
/**
 * The lists the widget may take from Liste widgets, as inputs: a device's
 * brands and identification types, an application's publishers and license
 * information types.
 */
const sourcedInputs = (kind: DeclaredAssetKind) =>
  Object.entries(DECLARED_ASSET_LIST_SOURCES[kind]).map(([list, field]) => ({
    field,
    label:
      list === "makers"
        ? DECLARED_ASSET_LOOKS[kind].words.maker.titles
        : EXTRA_ENTRY_LISTS[list as keyof typeof EXTRA_ENTRY_LISTS].title,
    types: ["value.list"],
  }));

const listFields = (kind: DeclaredAssetKind) =>
  function ListFields(props: IndicatorConfigProps) {
    return (
      <Stack gap="xl">
        {/* Its suppliers: the companies of these Contact widgets; its
            prices' taxes: those of these Taxes widgets; its makers and its
            types of typed values, if named: the items of these Liste widgets. */}
        <WidgetLinksField
          inputs={[
            { field: DECLARED_ASSET_SUPPLIER_SOURCES, label: "Fournisseurs", types: ["contact.list"] },
            { field: TAX_SOURCES, label: "Taxes", types: ["tax.list"] },
            ...sourcedInputs(kind),
          ]}
          config={props.config}
          onChange={props.onChange}
        />
        <ColumnFields columns={declaredAssetColumns(kind)} defaults={DECLARED_ASSET_DEFAULT_COLUMNS[kind]} {...props} />
        {/* The board's labels: they go to saving. */}
        <LabelGroupFields kind={DECLARED_ASSET_LOOKS[kind].labels} />
        {/* The board's lists: they go to saving too. */}
        <DeclaredAssetTablesFields kind={kind} config={props.config} />
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
  defaultConfig: { ...PERCENT_HEIGHT },
  ownClicks: true,
  fill: true,
  Display: ({ config, id }) => <DeclaredAssetsList kind={kind} config={config} blockId={id} />,
  drawerSize: DRAWER_WIDTH + 100,
  Config: listFields(kind),
});
