import { Badge, Group, ScrollArea, Stack, Table, Tabs, Text } from "@mantine/core";
import { IconLifebuoy } from "@tabler/icons-react";
import dayjs from "dayjs";
import AddButton from "../components/ui/AddButton";
import ActorAvatars, { ACTOR_AVATAR_SIZE } from "../components/ui/ActorAvatars";
import EmptyPanel from "../components/ui/EmptyPanel";
import LabelChip from "../components/ui/LabelChip";
import { COULEUR_ECHEANCE, MOT_ECHEANCE, dateCourte, etatEcheance } from "../lib/echeance";
import { TAB_ROW_HEIGHT, tabStyle } from "../themes/tabs";
import { DEFAULT_SUPPORT_STATUS, SUPPORT_STATUSES, supportStatusLabel } from "@milo/shared";
import type { SupportRequest, SupportStatus } from "@milo/shared";

/** L'onglet qui ne filtre rien : il montre les demandes de tous les statuts. */
const TOUS = "all";

/** Ce que porte un onglet : sa valeur, et ce qu'il dit. */
const ONGLETS: { value: string; label: string }[] = [
  { value: TOUS, label: "Tous" },
  ...SUPPORT_STATUSES.map((s) => ({ value: s.value, label: s.label })),
];

// Padding vertical des lignes, comme dans le tableau des projets : la hauteur
// inclut le padding (box-sizing).
const ROW_PADDING_Y = 5;

// Les étiquettes d'une demande, sur une seule ligne : au-delà de deux, le
// compte des autres remplace la liste.
const LABELS_SHOWN = 2;
const LABEL_HEIGHT = 20;

const NOMBRE_DE_COLONNES = 6;

/** Une valeur absente se lit pareil partout : un tiret discret. */
function Vide() {
  return (
    <Text size="sm" c="dimmed">
      —
    </Text>
  );
}

function LabelsCell({ labels }: { labels: SupportRequest["labels"] }) {
  if (!labels.length) return <Vide />;

  const montrees = labels.slice(0, LABELS_SHOWN);
  const restantes = labels.length - montrees.length;

  return (
    // Boîte de hauteur fixe : sans elle, la line-box ajoute un demi-pixel et la
    // ligne devient plus haute que les autres.
    <div
      style={{
        height: ACTOR_AVATAR_SIZE,
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <Group gap={4} wrap="nowrap">
        {montrees.map((label) => (
          <LabelChip key={label.id} label={label} size="xs" height={LABEL_HEIGHT} />
        ))}
        {restantes > 0 && (
          <Text size="xs" c="dimmed">
            +{restantes}
          </Text>
        )}
      </Group>
    </div>
  );
}

/** L'échéance, et la bulle qui dit où on en est — la même qu'une carte. */
function EcheanceCell({ due }: { due: string }) {
  const etat = etatEcheance(due);
  if (!due) return <Vide />;

  return (
    <Group gap="xs" wrap="nowrap">
      <Text size="sm">{dateCourte(due)}</Text>
      {etat !== "aucun" && (
        <Badge color={COULEUR_ECHEANCE[etat]} variant="filled" radius="sm" size="sm">
          {MOT_ECHEANCE[etat]}
        </Badge>
      )}
    </Group>
  );
}

/**
 * Le mode Support : les demandes de la société choisie dans l'entête, rangées
 * par statut en onglets. Les données et le tiroir restent à l'application
 * (App.tsx), cette page ne fait que les mettre en scène.
 */
interface SupportPageProps {
  /** « null » tant que les demandes ne sont pas lues ; « [] » quand il n'y en a pas. */
  requests: SupportRequest[] | null;
  /** L'onglet ouvert : « all », ou l'un des statuts. */
  statusTab: string;
  onStatusTabChange: (value: string) => void;
  onOpenRequest: (request: SupportRequest) => void;
  onAddRequest: () => void;
  /** Faux tant qu'aucune société n'est choisie : il n'y a alors rien à montrer. */
  hasCompany: boolean;
  loading: boolean;
}

export default function SupportPage({
  requests,
  statusTab,
  onStatusTabChange,
  onOpenRequest,
  onAddRequest,
  hasCompany,
  loading,
}: SupportPageProps) {
  // L'onglet ouvert vit dans l'application, comme le tableau ouvert des autres
  // modes : c'est lui qui dit le statut d'une demande créée ici.
  const onglet = statusTab;

  // Sans société, il n'y a pas de demandes : elles pendent à celle de la liste
  // déroulante de l'entête.
  if (!hasCompany) {
    return loading ? null : <EmptyPanel icon={IconLifebuoy} message="Aucune société" />;
  }

  // Rien à conclure tant que les demandes ne sont pas lues : on n'affiche rien
  // plutôt qu'un écran vide qui se démentirait aussitôt.
  if (!requests) return null;

  const montrees = onglet === TOUS ? requests : requests.filter((r) => r.status === onglet);

  const table = (
    <Table
      highlightOnHover
      verticalSpacing={0}
      styles={{
        // content-box : la hauteur décrit la zone de contenu, sans que le
        // padding ni la bordure la rognent.
        td: {
          boxSizing: "content-box",
          height: ACTOR_AVATAR_SIZE,
          paddingTop: ROW_PADDING_Y,
          paddingBottom: ROW_PADDING_Y,
        },
        th: {
          boxSizing: "content-box",
          height: ACTOR_AVATAR_SIZE,
          paddingTop: ROW_PADDING_Y,
          paddingBottom: ROW_PADDING_Y,
          verticalAlign: "middle",
        },
      }}
    >
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Acteurs</Table.Th>
          <Table.Th>Étiquettes</Table.Th>
          <Table.Th>Échéance</Table.Th>
          <Table.Th>Statut</Table.Th>
          <Table.Th>Échanges</Table.Th>
          <Table.Th>Ouverte le</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {montrees.map((demande) => (
          <Table.Tr
            key={demande.id}
            onClick={() => onOpenRequest(demande)}
            style={{ cursor: "pointer" }}
          >
            <Table.Td>
              <ActorAvatars actors={demande.actors} />
            </Table.Td>
            <Table.Td>
              <LabelsCell labels={demande.labels} />
            </Table.Td>
            <Table.Td>
              <EcheanceCell due={demande.due_date} />
            </Table.Td>
            <Table.Td>
              <Text size="sm">{supportStatusLabel(demande.status)}</Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{demande.comment_count}</Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{dayjs(demande.created_at).format("DD/MM/YYYY HH:mm")}</Text>
            </Table.Td>
          </Table.Tr>
        ))}

        {/* Dernière ligne : l'ajout se fait là où la liste se termine. Le fond
            explicite neutralise le survol — cette ligne n'est pas une demande. */}
        <Table.Tr style={{ backgroundColor: "transparent" }}>
          <Table.Td colSpan={NOMBRE_DE_COLONNES}>
            <AddButton label="Nouvelle demande de support" onClick={onAddRequest} />
          </Table.Td>
        </Table.Tr>
      </Table.Tbody>
    </Table>
  );

  // Sans demande à montrer, seul l'écran vide s'affiche : hors zone de
  // défilement, il occupe toute la hauteur et s'y centre.
  const contenu =
    montrees.length === 0 ? (
      loading ? null : (
        <EmptyPanel
          icon={IconLifebuoy}
          message={
            onglet === TOUS
              ? "Aucune demande de support"
              : `Aucune demande « ${supportStatusLabel(onglet as SupportStatus)} »`
          }
          actionLabel="Nouvelle demande de support"
          onAction={onAddRequest}
        />
      )
    ) : (
      <ScrollArea
        style={{ flex: 1, minHeight: 0 }}
        type="always"
        scrollbarSize={2}
        styles={{
          // La barre pilote la liste mais se cale sur le bord droit de la
          // fenêtre, sur toute sa hauteur — comme au mode Projet.
          root: { position: "static" },
          scrollbar: {
            position: "fixed",
            top: 0,
            bottom: 0,
            right: 0,
            left: "auto",
            height: "auto",
            width: "var(--scrollarea-scrollbar-size)",
          },
        }}
      >
        {table}
      </ScrollArea>
    );

  return (
    <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
      {/* Les statuts en onglets, comme les tableaux des autres modes. Ils ne se
          gèrent pas : ils sont la liste des états d'une demande, pas des
          tableaux qu'on ajoute. */}
      <Tabs value={onglet} onChange={(valeur) => onStatusTabChange(valeur ?? TOUS)} mb={50}>
        {/* Sans le bouton « Actions » des autres modes, la rangée se réglerait
            sur ses seuls onglets et se poserait six pixels plus haut. */}
        <Tabs.List mih={TAB_ROW_HEIGHT}>
          {ONGLETS.map(({ value, label }) => (
            <Tabs.Tab key={value} value={value} style={tabStyle(onglet === value)}>
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      {contenu}
    </Stack>
  );
}

/** Le statut que prend une demande ouverte depuis un onglet donné. */
export const statutDeLOnglet = (onglet: string): SupportStatus =>
  SUPPORT_STATUSES.some((s) => s.value === onglet)
    ? (onglet as SupportStatus)
    : DEFAULT_SUPPORT_STATUS;
