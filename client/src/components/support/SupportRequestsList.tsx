import {
  ActionIcon,
  Badge,
  Center,
  Checkbox,
  Group,
  Menu,
  Popover,
  Table,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconFilter,
  IconLifebuoy,
  IconSelector,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { createContext, useContext, useMemo, useState } from "react";
import ActorAvatars, { ACTOR_AVATAR_SIZE, ACTOR_GAP, SenderAvatar } from "../ui/ActorAvatars";
import AddButton from "../ui/AddButton";
import { colonnesGardees } from "../ui/ChampsColonnes";
import EmptyPanel from "../ui/EmptyPanel";
import GrilleScroll from "../ui/GrilleScroll";
import LabelChip from "../ui/LabelChip";
import { ReferenceTag } from "../ui/ReferenceTag";
import { positionDuMenu, type PointMenuPosition } from "../ui/PointMenu";
import { useColonnesRedimensionnables } from "../ui/useColonnesRedimensionnables";
import { COULEUR_ECHEANCE, MOT_ECHEANCE, dateCourte, etatEcheance } from "../../lib/echeance";
import { STRONG_TEXT } from "../../themes/colors";
import { SUPPORT_STATUSES, supportStatusLabel, supportTicketRef } from "@milo/shared";
import type { CSSProperties, ReactNode } from "react";
import type { Actor, SupportRequest, SupportStatus } from "@milo/shared";

// La liste des demandes du mode Support : un widget des sections, comme les
// indicateurs (indicators/liste.tsx). Ce qu'elle montre et ce qu'on y fait —
// l'onglet ouvert, le tri, les filtres, les cases cochées, le menu du clic
// droit — appartient à la page : le menu « Actions » de la rangée d'onglets
// porte sur les demandes cochées ici. La page le donne par
// « SupportListeContext » ; le widget ne choisit que ses colonnes.

/** L'onglet qui ne filtre rien : il montre les demandes de tous les statuts. */
export const TOUS = "all";

// Padding vertical des lignes, comme dans le tableau des projets : la hauteur
// inclut le padding (box-sizing).
const ROW_PADDING_Y = 5;

// Les étiquettes d'une demande, sur une seule ligne : au-delà de deux, le
// compte des autres remplace la liste.
const LABELS_SHOWN = 2;
const LABEL_HEIGHT = 20;

// Le numéro de ticket le plus long qu'on attend : le tag en prend la largeur.
const REFERENCE_GABARIT = supportTicketRef(9999);

/**
 * La couleur du tag de chaque statut, dessiné comme une étiquette : le
 * rouge de ce que personne n'a encore pris, l'orange de ce qui est en cours,
 * le vert de ce qui est réglé.
 */
const COULEUR_STATUT: Record<SupportStatus, string> = {
  new: "red.6",
  open: "orange.6",
  pending: "orange.6",
  resolved: "green.6",
  closed: "green.6",
};

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

  // Les plus lourdes devant : le serveur les range ainsi, la saisie du tiroir
  // non.
  const montrees = [...labels].sort((a, b) => b.weight - a.weight).slice(0, LABELS_SHOWN);
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

/** L'expéditeur d'une demande reçue par e-mail, en acteur à afficher. */
const expediteurDe = (demande: SupportRequest): Actor | null =>
  demande.sender_email
    ? {
        id: 0,
        name: demande.sender_name || demande.sender_email,
        email: demande.sender_email,
        gravatar_url: "",
      }
    : null;

/**
 * Les acteurs qu'on montre : l'expéditeur en tête — il est acteur d'office —,
 * puis les désignés. Celui qui a un compte y est déjà, il n'est pas redoublé.
 */
const acteursMontres = (demande: SupportRequest): Actor[] => {
  const expediteur = expediteurSansCompte(demande);
  return expediteur ? [expediteur, ...demande.actors] : demande.actors;
};

/** L'expéditeur, s'il n'est pas déjà parmi les acteurs sous son compte. */
const expediteurSansCompte = (demande: SupportRequest): Actor | null => {
  const expediteur = expediteurDe(demande);
  if (!expediteur) return null;
  const adresse = expediteur.email.toLowerCase();
  return demande.actors.some((a) => a.email.toLowerCase() === adresse) ? null : expediteur;
};

/** La clé d'un acteur dans le filtre : un compte, ou une adresse sans compte. */
const cleActeur = (a: Actor): string => (a.id ? `u:${a.id}` : `e:${a.email.toLowerCase()}`);

function ActeursCell({ demande }: { demande: SupportRequest }) {
  // L'expéditeur passe en tête, marqué de son enveloppe — qu'il ait un compte
  // ou non. Avec un compte, il est déjà parmi les acteurs : il en sort pour
  // n'être montré qu'une fois, mais avec sa marque, comme dans le tiroir.
  const adresse = demande.sender_email.toLowerCase();
  const avecCompte = adresse
    ? demande.actors.find((a) => a.email.toLowerCase() === adresse)
    : undefined;
  const expediteur = avecCompte ?? expediteurDe(demande);
  if (!expediteur) return <ActorAvatars actors={demande.actors} />;
  const autres = avecCompte ? demande.actors.filter((a) => a !== avecCompte) : demande.actors;
  return (
    <Group gap={ACTOR_GAP} wrap="nowrap">
      <div style={{ display: "inline-flex" }}>
        <SenderAvatar person={expediteur} />
      </div>
      {autres.length > 0 && <ActorAvatars actors={autres} />}
    </Group>
  );
}

/** L'échéance, et la bulle qui dit où on en est — la même qu'une carte. */
function EcheanceCell({ due }: { due: string }) {
  const etat = etatEcheance(due);
  if (!due) {
    return (
      <Text size="sm" c="dimmed">
        Aucune
      </Text>
    );
  }

  return (
    <Group gap="xs" wrap="nowrap">
      {/* La date prend elle-même la couleur de l'état : orange à trois jours,
          rouge une fois passée. */}
      <Text size="sm" c={COULEUR_ECHEANCE[etat]} fw={etat === "aucun" ? undefined : 600}>
        {dateCourte(due)}
      </Text>
      {etat !== "aucun" && (
        <Badge color={COULEUR_ECHEANCE[etat]} variant="filled" radius="sm" size="sm">
          {MOT_ECHEANCE[etat]}
        </Badge>
      )}
    </Group>
  );
}

// --- Tri et filtres --------------------------------------------------------
// Comme au tableau des projets : le libellé trie, l'entonnoir filtre, et les
// deux sont des commandes distinctes.

// La colonne « Objet » a une largeur fixe : un objet trop long se coupe
// d'une ellipse plutôt que d'élargir la colonne.
const SUBJECT_WIDTH = 475;
/** Largeur des colonnes de dates : « Reçu le » et « Échéance ». */
const DATE_WIDTH = 130;
export type ColumnKey = "ticket" | "subject" | "actors" | "labels" | "due" | "status" | "received";

interface Sort {
  key: ColumnKey;
  direction: "asc" | "desc";
}

/** Une option d'entonnoir : « all » vaut « pas de filtre ». */
interface FilterOption {
  value: string;
  label: string;
}

const TOUT = "all";

const ORDRE_STATUT = Object.fromEntries(SUPPORT_STATUSES.map((s, i) => [s.value, i])) as Record<
  SupportStatus,
  number
>;

/** La valeur sur laquelle chaque colonne se trie ; « null » passe en bas. */
const VALEURS: Record<ColumnKey, (d: SupportRequest) => string | number | null> = {
  ticket: (d) => d.number,
  subject: (d) => d.subject || null,
  actors: (d) => {
    const a = acteursMontres(d);
    return a.length ? a.map((x) => x.name).join(", ") : null;
  },
  // Par la plus lourde des étiquettes : celle que la cellule montre en tête.
  labels: (d) => (d.labels.length ? Math.max(...d.labels.map((l) => l.weight)) : null),
  due: (d) => d.due_date || null,
  status: (d) => ORDRE_STATUT[d.status],
  received: (d) => d.created_at,
};

const ECHEANCES: FilterOption[] = [
  { value: TOUT, label: "Toutes" },
  { value: "retard", label: MOT_ECHEANCE.retard },
  { value: "bientot", label: MOT_ECHEANCE.bientot },
  { value: "avec", label: "Avec échéance" },
  { value: "sans", label: "Sans échéance" },
];

const PERIODES: FilterOption[] = [
  { value: TOUT, label: "Toutes les dates" },
  { value: "1", label: "Aujourd'hui" },
  { value: "7", label: "7 derniers jours" },
  { value: "30", label: "30 derniers jours" },
];

interface Filtres {
  ticket: string;
  subject: string;
  actor: string;
  label: string;
  due: string;
  status: string;
  received: string;
}

const SANS_FILTRE: Filtres = {
  ticket: "",
  subject: "",
  actor: TOUT,
  label: TOUT,
  due: TOUT,
  status: TOUT,
  received: TOUT,
};

const retenue = (f: Filtres, d: SupportRequest): boolean => {
  if (f.ticket && !supportTicketRef(d.number).toLowerCase().includes(f.ticket.trim().toLowerCase()))
    return false;
  if (f.subject && !d.subject.toLowerCase().includes(f.subject.trim().toLowerCase())) return false;
  if (f.actor !== TOUT && !acteursMontres(d).some((a) => cleActeur(a) === f.actor)) return false;
  if (f.label !== TOUT && !d.labels.some((l) => l.name === f.label)) return false;
  if (f.due !== TOUT) {
    if (f.due === "sans" ? d.due_date : !d.due_date) return false;
    if ((f.due === "retard" || f.due === "bientot") && etatEcheance(d.due_date) !== f.due)
      return false;
  }
  if (f.status !== TOUT && d.status !== f.status) return false;
  if (f.received !== TOUT) {
    const depuis = dayjs()
      .startOf("day")
      .subtract(Number(f.received) - 1, "day");
    if (dayjs(d.created_at).isBefore(depuis)) return false;
  }
  return true;
};

/** L'entonnoir d'une liste de choix. Il se colore tant qu'il retient quelque chose. */
function ChoixFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const actif = value !== TOUT;
  return (
    <Menu position="bottom-end" withinPortal shadow="md">
      <Menu.Target>
        <ActionIcon
          variant={actif ? "light" : "subtle"}
          color={actif ? "teal" : "gray"}
          size="sm"
          aria-label={`Filtrer par ${label}`}
        >
          <IconFilter size={14} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown mah={360} style={{ overflowY: "auto" }}>
        {options.map((option) => (
          <Menu.Item
            key={option.value}
            onClick={() => onChange(option.value)}
            leftSection={
              option.value === value ? <IconCheck size={14} /> : <span style={{ width: 14 }} />
            }
          >
            {option.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

/** L'entonnoir d'une colonne de texte : on tape ce qu'on cherche. */
function TexteFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const actif = value.trim() !== "";
  return (
    <Popover position="bottom-end" withinPortal shadow="md" trapFocus>
      <Popover.Target>
        <ActionIcon
          variant={actif ? "light" : "subtle"}
          color={actif ? "teal" : "gray"}
          size="sm"
          aria-label={`Filtrer par ${label}`}
        >
          <IconFilter size={14} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <TextInput
          size="xs"
          placeholder={`Rechercher un ${label}`}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          data-autofocus
          w={220}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

function SortableTh({
  label,
  column,
  sort,
  onSort,
  filter,
  style,
  poignee,
}: {
  label: string;
  column: ColumnKey;
  sort: Sort;
  onSort: (key: ColumnKey) => void;
  filter?: ReactNode;
  style?: CSSProperties;
  poignee: ReactNode;
}) {
  const active = sort.key === column;
  const Icon = !active ? IconSelector : sort.direction === "asc" ? IconChevronUp : IconChevronDown;
  return (
    <Table.Th style={style}>
      <Group gap={4} wrap="nowrap">
        <UnstyledButton onClick={() => onSort(column)} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={4} wrap="nowrap" justify="space-between">
            <Text size="sm" fw={600} c={STRONG_TEXT}>
              {label}
            </Text>
            <Center c={active ? undefined : "dimmed"}>
              <Icon size={14} />
            </Center>
          </Group>
        </UnstyledButton>
        {filter}
      </Group>
      {poignee}
    </Table.Th>
  );
}

/** Les colonnes que la liste sait montrer, dans l'ordre. Le ticket est toujours là. */
export const COLONNES_SUPPORT: { key: ColumnKey; label: string; obligatoire?: boolean }[] = [
  { key: "ticket", label: "Ticket", obligatoire: true },
  { key: "subject", label: "Objet" },
  { key: "actors", label: "Acteurs" },
  { key: "labels", label: "Étiquettes" },
  { key: "status", label: "Statut" },
  { key: "received", label: "Reçu le" },
  { key: "due", label: "Échéance" },
];

/**
 * L'état de la liste, tenu par la page : ce qu'on voit dans l'onglet ouvert,
 * trié et filtré, et ce qu'on y a coché.
 */
export const useSupportListe = (requests: SupportRequest[] | null, onglet: string) => {
  // Par défaut, les plus récentes en premier : c'est l'ordre du serveur.
  const [sort, setSort] = useState<Sort>({ key: "received", direction: "desc" });
  const [filtres, setFiltres] = useState<Filtres>(SANS_FILTRE);
  const [cochees, setCochees] = useState<Set<number>>(new Set());
  /** La ligne dont le menu du clic droit est ouvert, et où il s'ouvre. */
  const [contexte, setContexte] = useState<{
    demande: SupportRequest;
    position: PointMenuPosition;
  } | null>(null);

  const dansLOnglet = useMemo(
    () =>
      !requests ? [] : onglet === TOUS ? requests : requests.filter((r) => r.status === onglet),
    [requests, onglet],
  );

  // Ce que les entonnoirs proposent : ce qui se trouve dans l'onglet, pas plus.
  const optionsActeurs = useMemo<FilterOption[]>(() => {
    const vus = new Map<string, string>();
    for (const d of dansLOnglet) for (const a of acteursMontres(d)) vus.set(cleActeur(a), a.name);
    return [
      { value: TOUT, label: "Tous" },
      ...[...vus]
        .sort((a, b) => a[1].localeCompare(b[1], "fr"))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [dansLOnglet]);
  const optionsEtiquettes = useMemo<FilterOption[]>(() => {
    const noms = new Set(dansLOnglet.flatMap((d) => d.labels.map((l) => l.name)));
    return [
      { value: TOUT, label: "Toutes" },
      ...[...noms].sort((a, b) => a.localeCompare(b, "fr")).map((n) => ({ value: n, label: n })),
    ];
  }, [dansLOnglet]);

  const montrees = useMemo(() => {
    const valeur = VALEURS[sort.key];
    const facteur = sort.direction === "asc" ? 1 : -1;
    return dansLOnglet
      .filter((d) => retenue(filtres, d))
      .sort((a, b) => {
        const gauche = valeur(a);
        const droite = valeur(b);
        if (gauche == null && droite == null) return 0;
        if (gauche == null) return 1;
        if (droite == null) return -1;
        if (typeof gauche === "number" && typeof droite === "number")
          return (gauche - droite) * facteur;
        return String(gauche).localeCompare(String(droite), "fr", { numeric: true }) * facteur;
      });
  }, [dansLOnglet, filtres, sort]);

  // Les cases cochées ne valent que pour ce qu'on voit : une demande filtrée
  // ou passée dans un autre onglet ne subit pas une action à l'aveugle.
  const selection = montrees.filter((d) => cochees.has(d.id));

  return {
    onglet,
    sort,
    setSort,
    filtres,
    setFiltres,
    cochees,
    setCochees,
    contexte,
    setContexte,
    dansLOnglet,
    montrees,
    selection,
    optionsActeurs,
    optionsEtiquettes,
  };
};

export interface SupportListe extends ReturnType<typeof useSupportListe> {
  loading: boolean;
  onOpenRequest: (request: SupportRequest) => void;
  onAddRequest: () => void;
}

/** L'état de la liste, donné par la page au widget. Hors du mode Support, il n'y en a pas. */
export const SupportListeContext = createContext<SupportListe | null>(null);

export default function SupportRequestsList({ config }: { config: unknown }) {
  const liste = useContext(SupportListeContext);

  if (!liste) return null;
  const {
    onglet,
    sort,
    setSort,
    filtres,
    setFiltres,
    cochees,
    setCochees,
    contexte,
    setContexte,
    montrees,
    dansLOnglet,
    optionsActeurs,
    optionsEtiquettes,
    loading,
    onOpenRequest,
    onAddRequest,
  } = liste;

  const colonnes = colonnesGardees(COLONNES_SUPPORT, config).map((c) => c.key);
  const montre = (cle: ColumnKey) => colonnes.includes(cle);
  // La case à cocher en tête de chaque ligne, puis les colonnes.
  const nombreDeColonnes = colonnes.length + 1;
  const redim = useColonnesRedimensionnables("support", ["case", ...colonnes]);

  const filtre = Object.entries(filtres).some(
    ([cle, v]) => v !== SANS_FILTRE[cle as keyof Filtres],
  );
  const filtrer = (cle: keyof Filtres) => (valeur: string) =>
    setFiltres((f) => ({ ...f, [cle]: valeur }));

  const basculer = (id: number) =>
    setCochees((deja) => {
      const suivant = new Set(deja);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });

  const trier = (key: ColumnKey) =>
    setSort((courant) =>
      courant.key === key
        ? { key, direction: courant.direction === "asc" ? "desc" : "asc" }
        : {
            key,
            direction: key === "subject" || key === "actors" || key === "labels" ? "asc" : "desc",
          },
    );

  const th = (label: string, column: ColumnKey, filter?: ReactNode, style?: CSSProperties) =>
    montre(column) && (
      <SortableTh
        label={label}
        column={column}
        sort={sort}
        onSort={trier}
        filter={filter}
        style={style}
        poignee={redim.poignee(column)}
      />
    );

  // Sans demande dans l'onglet, seul l'écran vide s'affiche. Une liste vidée
  // par les filtres, elle, garde ses entêtes : c'est là qu'on les retire.
  if (dansLOnglet.length === 0 && !filtre) {
    return loading ? null : (
      <EmptyPanel
        icon={IconLifebuoy}
        message="Aucune demande"
        actionLabel="Nouvelle demande de support"
        onAction={onAddRequest}
        size="md"
        fill={false}
      />
    );
  }

  return (
    // Une section plus étroite que la liste la fait défiler de côté, plutôt
    // que d'écraser ses colonnes.
    <GrilleScroll>
      <Table
        {...redim.tableProps}
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
        {redim.colgroup}
        <Table.Thead>
          <Table.Tr>
            {/* Pas de « tout cocher » : on choisit les demandes une à une. */}
            <Table.Th style={{ width: 1 }} />
            {th(
              "Ticket",
              "ticket",
              <TexteFilter label="ticket" value={filtres.ticket} onChange={filtrer("ticket")} />,
              { width: 1, whiteSpace: "nowrap" },
            )}
            {th(
              "Objet",
              "subject",
              <TexteFilter label="objet" value={filtres.subject} onChange={filtrer("subject")} />,
              { width: SUBJECT_WIDTH },
            )}
            {th(
              "Acteurs",
              "actors",
              <ChoixFilter
                label="acteur"
                options={optionsActeurs}
                value={filtres.actor}
                onChange={filtrer("actor")}
              />,
            )}
            {/* Les étiquettes juste avant le statut : les deux se lisent ensemble. */}
            {th(
              "Étiquettes",
              "labels",
              <ChoixFilter
                label="étiquette"
                options={optionsEtiquettes}
                value={filtres.label}
                onChange={filtrer("label")}
              />,
            )}
            {th(
              "Statut",
              "status",
              // Sous un onglet de statut, le filtre n'aurait rien à choisir.
              onglet === TOUS ? (
                <ChoixFilter
                  label="statut"
                  options={[{ value: TOUT, label: "Tous" }, ...SUPPORT_STATUSES]}
                  value={filtres.status}
                  onChange={filtrer("status")}
                />
              ) : undefined,
            )}
            {th(
              "Reçu le",
              "received",
              <ChoixFilter
                label="date de réception"
                options={PERIODES}
                value={filtres.received}
                onChange={filtrer("received")}
              />,
              { width: DATE_WIDTH, maxWidth: DATE_WIDTH },
            )}
            {th(
              "Échéance",
              "due",
              <ChoixFilter
                label="échéance"
                options={ECHEANCES}
                value={filtres.due}
                onChange={filtrer("due")}
              />,
              { width: DATE_WIDTH, maxWidth: DATE_WIDTH },
            )}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {montrees.map((demande) => (
            <Table.Tr
              key={demande.id}
              onClick={() => onOpenRequest(demande)}
              onContextMenu={(e) => setContexte({ demande, position: positionDuMenu(e) })}
              // La ligne dont le menu est ouvert garde le fond du survol : on
              // voit sur quelle demande il porte.
              style={{
                cursor: "pointer",
                backgroundColor:
                  contexte?.demande.id === demande.id ? "var(--table-hover-color)" : undefined,
              }}
            >
              {/* La case ne doit pas ouvrir la demande : le clic s'arrête là. */}
              <Table.Td onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  size="xs"
                  color="teal"
                  aria-label={`Cocher ${supportTicketRef(demande.number)}`}
                  checked={cochees.has(demande.id)}
                  onChange={() => basculer(demande.id)}
                />
              </Table.Td>
              <Table.Td style={{ whiteSpace: "nowrap" }}>
                <ReferenceTag
                  reference={supportTicketRef(demande.number)}
                  gabarit={REFERENCE_GABARIT}
                />
              </Table.Td>
              {montre("subject") && (
                <Table.Td style={{ maxWidth: SUBJECT_WIDTH, width: SUBJECT_WIDTH }}>
                  {demande.subject ? (
                    <Text size="sm" truncate>
                      {demande.subject}
                    </Text>
                  ) : (
                    <Vide />
                  )}
                </Table.Td>
              )}
              {montre("actors") && (
                <Table.Td>
                  <ActeursCell demande={demande} />
                </Table.Td>
              )}
              {montre("labels") && (
                <Table.Td>
                  <LabelsCell labels={demande.labels} />
                </Table.Td>
              )}
              {montre("status") && (
                <Table.Td>
                  <LabelChip
                    label={{
                      name: supportStatusLabel(demande.status),
                      color: COULEUR_STATUT[demande.status],
                    }}
                    size="xs"
                    height={LABEL_HEIGHT}
                  />
                </Table.Td>
              )}
              {montre("received") && (
                <Table.Td style={{ whiteSpace: "nowrap", width: DATE_WIDTH, maxWidth: DATE_WIDTH }}>
                  <Text size="sm">{dayjs(demande.created_at).format("DD/MM/YYYY HH:mm")}</Text>
                </Table.Td>
              )}
              {montre("due") && (
                <Table.Td style={{ width: DATE_WIDTH, maxWidth: DATE_WIDTH }}>
                  <EcheanceCell due={demande.due_date} />
                </Table.Td>
              )}
            </Table.Tr>
          ))}

          {/* Filtrée jusqu'au vide, la liste le dit, et de quoi défaire. */}
          {montrees.length === 0 && (
            <Table.Tr style={{ backgroundColor: "transparent" }}>
              <Table.Td colSpan={nombreDeColonnes}>
                <Group gap="xs">
                  <Text size="sm" c="dimmed">
                    Aucune demande ne correspond aux filtres.
                  </Text>
                  <UnstyledButton onClick={() => setFiltres(SANS_FILTRE)}>
                    <Text size="sm" c="teal">
                      Retirer les filtres
                    </Text>
                  </UnstyledButton>
                </Group>
              </Table.Td>
            </Table.Tr>
          )}

          {/* Dernière ligne : l'ajout se fait là où la liste se termine. Le fond
              explicite neutralise le survol — cette ligne n'est pas une demande. */}
          <Table.Tr style={{ backgroundColor: "transparent" }}>
            <Table.Td colSpan={nombreDeColonnes}>
              <AddButton label="Nouvelle demande de support" onClick={onAddRequest} />
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
    </GrilleScroll>
  );
}
