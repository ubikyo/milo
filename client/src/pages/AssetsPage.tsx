import { Menu, Stack, Tabs } from "@mantine/core";
import { IconCheck, IconLock } from "@tabler/icons-react";
import { Fragment, useMemo, useState } from "react";
import AssetIndicatorsPanel from "../components/assets/AssetIndicatorsPanel";
import { AssetsListeContext } from "../components/assets/AssetsList";
import ModeBar from "../components/ui/ModeBar";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "../components/ui/PointMenu";
import { InsertLine, useTabReorder } from "../components/ui/useTabReorder";
import { tabStyle } from "../themes/tabs";
import type { AccountSlot } from "../components/ui/AccountControls";
import { ordonnerOnglets } from "@milo/shared";
import type { Asset, AssetIndicator, IndicatorSection } from "@milo/shared";

/** Les postes : ce qu'un agent d'inventaire remonte d'une machine. */
const POSTE = "poste";

/** Ce que porte un onglet : sa valeur, et ce qu'il dit. */
const ONGLETS: { value: string; label: string }[] = [{ value: POSTE, label: "Poste" }];

/**
 * Le mode Assets : les postes de la société choisie, un par ligne. Comme le
 * mode Projet, il suit la liste déroulante — « toutes » y compris, et c'est là
 * que se voient les postes dont le tag ne désigne aucune société.
 *
 * Sous les onglets, des sections portent les widgets : la liste des postes
 * (components/assets/AssetsList) et les indicateurs.
 */
interface AssetsPageProps {
  /** « null » tant que les postes ne sont pas lus ; « [] » quand il n'y en a pas. */
  assets: Asset[] | null;
  onOpenAsset: (asset: Asset) => void;
  /** « Créer une tâche », au clic droit sur un poste. */
  onCreateTask: (asset: Asset) => void;
  loading: boolean;
  /** L'ordre rangé des onglets : leurs valeurs, commun à tous. */
  tabOrder: string[];
  /** Le nouvel ordre des onglets, une fois l'un d'eux glissé. */
  onReorderTabs: (values: string[]) => void | Promise<void>;
  /** La société et le compte, posés au bout de la rangée. */
  account: AccountSlot;
  /**
   * Les sections de l'écran et leurs widgets — la liste des postes et les
   * indicateurs —, communs à toutes les sociétés. « null » tant qu'elles ne
   * sont pas lues.
   */
  indicatorSections: IndicatorSection[] | null;
  indicators: AssetIndicator[];
  onIndicatorsChanged: () => void | Promise<void>;
  /** Le verrou des sections : ni ajout ni déplacement. */
  indicatorsLocked: boolean;
  onToggleIndicatorsLock: () => void | Promise<void>;
}

export default function AssetsPage({
  assets,
  onOpenAsset,
  onCreateTask,
  loading,
  tabOrder,
  onReorderTabs,
  account,
  indicatorSections,
  indicators,
  onIndicatorsChanged,
  indicatorsLocked,
  onToggleIndicatorsLock,
}: AssetsPageProps) {
  // Le menu contextuel d'un onglet : il porte le verrou et l'écart des sections.
  const [menuOnglet, setMenuOnglet] = useState<PointMenuPosition | null>(null);
  // L'onglet ouvert reste ici, contrairement au mode Support : l'application
  // n'en fait encore rien — aucune lecture, aucun tiroir n'en dépend. Il
  // remontera le jour où elle en aura besoin.
  const [onglet, setOnglet] = useState<string>(POSTE);

  // Les onglets dans l'ordre rangé, et le glisser qui le change.
  const ongletsRanges = useMemo(() => ordonnerOnglets(ONGLETS, tabOrder), [tabOrder]);
  const { ordered, tabProps, guardChange, insertAt } = useTabReorder(
    ongletsRanges,
    (o) => o.value,
    onReorderTabs,
  );

  return (
    <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
      <ModeBar
        value={onglet}
        onChange={guardChange((valeur: string | null) => setOnglet(valeur ?? POSTE))}
        account={account}
      >
        {ordered.map(({ value, label }, index) => (
          <Fragment key={value}>
            {insertAt(index) && <InsertLine />}
            <Tabs.Tab
              value={value}
              {...tabProps(value, index, tabStyle(onglet === value))}
              onContextMenu={(e) => setMenuOnglet(positionDuMenu(e))}
            >
              {label}
            </Tabs.Tab>
          </Fragment>
        ))}
        {insertAt(ordered.length) && <InsertLine />}
      </ModeBar>

      {/* Les sections et leurs widgets. La liste des postes en est un : elle
          lit ici les postes, et ce qu'on en ouvre. */}
      <AssetsListeContext.Provider value={{ assets, loading, onOpenAsset, onCreateTask }}>
        <AssetIndicatorsPanel
          sections={indicatorSections}
          indicators={indicators}
          assets={assets ?? []}
          onChanged={onIndicatorsChanged}
          locked={indicatorsLocked}
        />
      </AssetsListeContext.Provider>

      {/* Le menu d'un onglet ne porte que le verrou et l'écart des sections, pour tous. */}
      {menuOnglet && (
        <PointMenu position={menuOnglet} onClose={() => setMenuOnglet(null)}>
          <Menu.Label>Affichage</Menu.Label>
          <Menu.Item
            leftSection={<IconLock size={16} />}
            rightSection={indicatorsLocked ? <IconCheck size={14} /> : null}
            onClick={() => onToggleIndicatorsLock()}
          >
            Verrouillé
          </Menu.Item>
        </PointMenu>
      )}
    </Stack>
  );
}
