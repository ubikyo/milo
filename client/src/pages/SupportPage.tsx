import { Stack, Tabs } from "@mantine/core";
import { IconLifebuoy } from "@tabler/icons-react";
import { Fragment, useMemo, useState } from "react";
import SupportActions from "../components/support/SupportActions";
import SupportIndicatorsPanel from "../components/support/SupportIndicatorsPanel";
import {
  SupportListeContext,
  TOUS,
  useSupportListe,
} from "../components/support/SupportRequestsList";
import EmptyPanel from "../components/ui/EmptyPanel";
import ModeBar from "../components/ui/ModeBar";
import type { PanelInheritance } from "../components/ui/HeriteConfirmModal";
import PanneauMenu from "../components/ui/PanneauMenu";
import { positionDuMenu, type PointMenuPosition } from "../components/ui/PointMenu";
import { InsertLine, useTabReorder } from "../components/ui/useTabReorder";
import { tabStyle } from "../themes/tabs";
import { DEFAULT_SUPPORT_STATUS, SUPPORT_STATUSES, ordonnerOnglets } from "@milo/shared";
import type { AccountSlot } from "../components/ui/AccountControls";
import type {
  IndicatorSection,
  PublicUser,
  SupportIndicator,
  SupportRequest,
  SupportStatus,
} from "@milo/shared";

/** Ce que porte un onglet : sa valeur, et ce qu'il dit. */
const ONGLETS: { value: string; label: string }[] = [
  { value: TOUS, label: "Tous" },
  ...SUPPORT_STATUSES.map((s) => ({ value: s.value, label: s.label })),
];

/**
 * Le mode Support : les demandes de la société choisie dans l'entête, rangées
 * par statut en onglets. Sous les onglets, des sections portent les widgets :
 * la liste des demandes de l'onglet ouvert, et les indicateurs. Les données
 * et le tiroir restent à l'application (App.tsx), cette page ne fait que les
 * mettre en scène — et tient ce qui ne regarde que la liste : le tri, les
 * filtres, les cases cochées (useSupportListe).
 */
interface SupportPageProps {
  /** « null » tant que les demandes ne sont pas lues ; « [] » quand il n'y en a pas. */
  requests: SupportRequest[] | null;
  /** L'onglet ouvert : « all », ou l'un des statuts. */
  statusTab: string;
  onStatusTabChange: (value: string) => void;
  onOpenRequest: (request: SupportRequest) => void;
  onCreateTask?: (request: SupportRequest) => void;
  onAddRequest?: () => void;
  /** Les comptes à qui assigner une demande. */
  users: PublicUser[];
  /** Après une action du menu : les demandes se relisent. */
  onRequestsChanged: () => void | Promise<void>;
  /** Faux tant qu'aucune société n'est choisie : il n'y a alors rien à montrer. */
  hasCompany: boolean;
  loading: boolean;
  /** L'ordre rangé des onglets : leurs valeurs, commun à tous. */
  tabOrder: string[];
  /** Le nouvel ordre des onglets, une fois l'un d'eux glissé. */
  onReorderTabs: (values: string[]) => void | Promise<void>;
  /** La société et le compte, posés au bout de la rangée d'onglets. */
  account: AccountSlot;
  /** Les demandes suivies, et de quoi suivre ou cesser de suivre l'une d'elles. */
  followedIds: number[];
  onToggleFollow: (request: SupportRequest) => void;
  /**
   * Les sections de l'écran et leurs widgets — la liste des demandes et les
   * indicateurs —, communs à toutes les sociétés. « null » tant qu'elles ne
   * sont pas lues.
   */
  indicatorSections: IndicatorSection[] | null;
  indicators: SupportIndicator[];
  onIndicatorsChanged: () => void | Promise<void>;
  /** Le verrou des sections : ni ajout ni déplacement. */
  indicatorsLocked: boolean;
  onToggleIndicatorsLock?: () => void | Promise<void>;
  /** « Hérité » des sections : la structure partagée, ou la sienne. */
  indicatorsInheritance?: PanelInheritance;
}

export default function SupportPage({
  requests,
  statusTab,
  onStatusTabChange,
  onOpenRequest,
  onCreateTask,
  onAddRequest,
  users,
  onRequestsChanged,
  hasCompany,
  loading,
  tabOrder,
  onReorderTabs,
  account,
  followedIds,
  onToggleFollow,
  indicatorSections,
  indicators,
  onIndicatorsChanged,
  indicatorsLocked,
  onToggleIndicatorsLock,
  indicatorsInheritance,
}: SupportPageProps) {
  // Le menu contextuel d'un onglet : il porte le verrou et l'écart des sections.
  const [menuOnglet, setMenuOnglet] = useState<PointMenuPosition | null>(null);
  // L'onglet ouvert vit dans l'application, comme le tableau ouvert des autres
  // modes : c'est lui qui dit le statut d'une demande créée ici.
  const onglet = statusTab;

  // Les onglets dans l'ordre rangé, et le glisser qui le change.
  const ongletsRanges = useMemo(() => ordonnerOnglets(ONGLETS, tabOrder), [tabOrder]);
  const { ordered, tabProps, guardChange, insertAt } = useTabReorder(
    ongletsRanges,
    (o) => o.value,
    onReorderTabs,
  );

  const liste = useSupportListe(requests, onglet);
  const { contexte, setContexte, selection, setCochees } = liste;

  return (
    <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
      {/* Les statuts en onglets, comme les tableaux des autres modes. Ils ne se
          gèrent pas : ils sont la liste des états d'une demande, pas des
          tableaux qu'on ajoute. Le menu « Actions » porte sur les demandes
          cochées dans la liste. */}
      <ModeBar
        value={onglet}
        onChange={guardChange((valeur: string | null) => onStatusTabChange(valeur ?? TOUS))}
        account={account}
        actions={
          <SupportActions
            contexte={contexte}
            onContexteClose={() => setContexte(null)}
            selected={selection}
            users={users}
            onEdit={onOpenRequest}
            onCreateTask={onCreateTask}
            followedIds={followedIds}
            onToggleFollow={onToggleFollow}
            onRefresh={onRequestsChanged}
            onDone={async () => {
              setCochees(new Set());
              await onRequestsChanged();
            }}
          />
        }
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

      {!hasCompany ? (
        loading ? null : (
          <EmptyPanel icon={IconLifebuoy} message="Aucune société" />
        )
      ) : (
        // Les sections et leurs widgets. La liste des demandes en est un : elle
        // lit ici l'onglet ouvert, le tri, les filtres et les cases cochées.
        <SupportListeContext.Provider value={{ ...liste, loading, onOpenRequest, onAddRequest }}>
          <SupportIndicatorsPanel
            sections={indicatorSections}
            indicators={indicators}
            requests={requests ?? []}
            onChanged={onIndicatorsChanged}
            locked={indicatorsLocked}
            userId={account.user.id}
          />
        </SupportListeContext.Provider>
      )}

      {/* Des onglets fixes : leur menu ne porte que ce qui vaut pour les
          sections de l'écran, le verrou et « Hérité ». */}
      <PanneauMenu
        position={menuOnglet}
        onClose={() => setMenuOnglet(null)}
        locked={indicatorsLocked}
        onToggleLock={onToggleIndicatorsLock}
        inheritance={indicatorsInheritance}
      />
    </Stack>
  );
}

/** Le statut que prend une demande ouverte depuis un onglet donné. */
export const statutDeLOnglet = (onglet: string): SupportStatus =>
  SUPPORT_STATUSES.some((s) => s.value === onglet)
    ? (onglet as SupportStatus)
    : DEFAULT_SUPPORT_STATUS;
