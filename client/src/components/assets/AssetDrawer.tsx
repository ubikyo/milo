import {
  Accordion,
  Badge,
  Box,
  Button,
  Drawer,
  Group,
  ScrollArea,
  Stack,
  Table,
  Tabs,
  Text,
} from "@mantine/core";
import { IconDeviceLaptop, IconRefresh } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import SuccessAlert from "../ui/SuccessAlert";
import { errorMessage, notifyError } from "../../lib/errors";
import { tabStyle } from "../../themes/tabs";
import { WITHOUT_FRAME, TABLEAUX, EMPTY } from "./InventoryTables";
import AssetSummaryPanel, { CARD_BACKGROUND } from "./AssetSummaryPanel";
import OperatingSystem from "./SystemeExploitation";
import RecordTitle, { SPACE_BELOW_TITLE } from "./TitreFiche";
import classes from "../../assets/styles/AssetDrawer.module.css";
import type { CSSProperties } from "react";
import type { Asset, AssetDetail, AssetEntry, AssetSection } from "@milo/shared";
import CloseButton from "../ui/BoutonFermer";

const DRAWER_PADDING = 40;
const DRAWER_WIDTH = 1100;

/** Largeur de la colonne d'onglets : « Utilisateurs et groupes » y tient. */
const TABS_WIDTH = 210;

/** L'espace entre les boutons de l'en-tête et le reste de la fiche. */
const SPACE_BELOW_HEADER = 30;

/**
 * Après une demande d'inventaire, l'agent refait son tour de machine et
 * renvoie le résultat : cela prend quelques secondes à quelques dizaines de
 * secondes selon le poste. On relit à intervalle régulier jusqu'à voir une
 * date changer, puis on renonce — sans bloquer quoi que ce soit, le tiroir
 * reste lisible pendant ce temps.
 */
const REREAD_DELAY = 3_000;
const RELOAD_ATTEMPTS = 10;

/**
 * Ce qu'on ouvre pour prendre la main. Le schéma « teamviewer10: » lance le
 * TeamViewer installé sur le poste de qui clique ; l'adresse de secours passe
 * par le site de TeamViewer, qui le lance à son tour — utile depuis
 * TeamViewer 15, où le schéma ouvre parfois l'application sans enchaîner la
 * connexion.
 *
 * Aucun mot de passe ne voyage dans l'un ni dans l'autre : il est demandé à
 * l'arrivée, sauf si le poste figure dans les appareils du compte TeamViewer.
 */
export const teamviewerLink = (id: string) => `teamviewer10://control?device=${id}`;
export const teamviewerFallbackLink = (id: string) =>
  `https://start.teamviewer.com/device/${id}/authorization/password/mode/control`;

/**
 * La fiche d'un poste : ce que l'agent d'inventaire a remonté, rangé en
 * quelques onglets. Rien ne s'y modifie — un poste se décrit lui-même,
 * personne ne le saisit —, le pied ne porte donc que « Fermer ».
 */
interface AssetDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** Le poste de la liste : le tiroir va chercher le reste lui-même. */
  asset: Asset | null;
}

/**
 * Les champs qu'on sait nommer en français, par section. Les autres gardent
 * le nom de l'agent.
 */
const FIELD_LABELS: Record<string, Record<string, string>> = {
  BIOS: { SMANUFACTURER: "Fabricant", SMODEL: "Modèle", SSN: "Numéro de série" },
};

/** Les champs d'une entrée, en deux colonnes : le nom, la valeur. */
function Entry({ section, entry }: { section: string; entry: AssetEntry }) {
  const labels = FIELD_LABELS[section] ?? {};
  return (
    <Table withRowBorders={false} verticalSpacing={2} horizontalSpacing={0}>
      <Table.Tbody>
        {Object.entries(entry).map(([field, value]) => (
          <Table.Tr key={field}>
            {/* Le nom des champs est celui de l'agent, en capitales, quand on
                ne lui en connaît pas de meilleur : c'est lui qu'on retrouvera
                dans la doc et dans le XML le jour où il faudra en discuter. */}
            <Table.Td style={{ width: "30%", verticalAlign: "top" }}>
              {labels[field] ? (
                <Text size="sm" c="dimmed">
                  {labels[field]}
                </Text>
              ) : (
                <Text size="xs" c="dimmed" ff="monospace">
                  {field}
                </Text>
              )}
            </Table.Td>
            <Table.Td style={{ verticalAlign: "top" }}>
              <Text size="sm" style={{ wordBreak: "break-word" }}>
                {value || EMPTY}
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/** Un groupe d'onglet : une section de l'inventaire, sous son libellé. */
interface LocalGroup {
  section: string;
  label: string;
}

/** Un onglet de la fiche : plusieurs sections de l'inventaire, à la suite. */
interface Tab {
  value: string;
  label: string;
  groups: LocalGroup[];
}

/**
 * Les onglets de la fiche et, dans chacun, les sections de l'inventaire
 * qu'il réunit, dans l'ordre où elles s'affichent. Les libellés disent ce
 * qu'on y trouve mieux que les noms de l'agent : DRIVES liste des volumes —
 * des partitions, des lecteurs réseau —, pas des disques ; ANTIVIRUS recense
 * aussi bien les EDR que les antivirus d'autrefois.
 */
const TABS: Tab[] = [
  {
    value: "utilisateurs",
    label: "Utilisateurs et groupes",
    groups: [
      { section: "LOCAL_USERS", label: "Utilisateurs locaux" },
      { section: "LOCAL_GROUPS", label: "Groupes locaux" },
    ],
  },
  {
    value: "materiel",
    label: "Matériel",
    groups: [
      { section: "BIOS", label: "BIOS" },
      { section: "CPUS", label: "Processeurs" },
      { section: "MEMORIES", label: "Mémoire" },
      { section: "BATTERIES", label: "Batterie" },
      { section: "POWERSUPPLIES", label: "Alimentation" },
      { section: "CONTROLLERS", label: "Contrôleurs" },
      { section: "VIDEOS", label: "Vidéo" },
      { section: "SOUNDS", label: "Audio" },
      { section: "STORAGES", label: "Stockage" },
    ],
  },
  {
    value: "peripheriques",
    label: "Périphériques",
    groups: [
      { section: "INPUTS", label: "Périphériques d'entrée" },
      { section: "MONITORS", label: "Moniteurs" },
      { section: "PRINTERS", label: "Imprimantes" },
      { section: "USBDEVICES", label: "USB" },
    ],
  },
  {
    value: "systeme",
    label: "Système d'exploitation",
    groups: [
      { section: "OPERATINGSYSTEM", label: "Description" },
      { section: "NETWORKS", label: "Réseaux" },
      { section: "DRIVES", label: "Volumes" },
      { section: "ANTIVIRUS", label: "EPP / EDR" },
      { section: "FIREWALL", label: "Pare-feu" },
      { section: "SOFTWARES", label: "Applications" },
      { section: "PROCESSES", label: "Process" },
      { section: "VIRTUALMACHINES", label: "Machines virtuelles" },
    ],
  },
];

/**
 * Ce qu'on laisse de côté pour le moment : HARDWARE répète ce que disent les
 * autres sections, USERS ce que disent les comptes locaux.
 */
const EXCLUDED_SECTIONS = new Set(["HARDWARE", "USERS"]);

/** L'onglet « Résumé », toujours le premier : il ne se lit pas dans une section. */
const SUMMARY = "resume";

/** Les sections déjà rangées dans un onglet. */
const PLACED_SECTIONS = new Set(TABS.flatMap((o) => o.groups.map((g) => g.section)));

/** Un groupe tel qu'il s'affiche : son libellé, et la section de l'inventaire. */
interface DisplayedGroup {
  label: string;
  section: AssetSection;
}

/**
 * Les onglets qui ont quelque chose à montrer, et leurs groupes non vides.
 * Ce qu'aucun onglet ne range — une section que l'agent ajouterait, ou que
 * seuls certains postes déclarent — va dans « Autres », sous son nom
 * d'agent, plutôt que de disparaître sans qu'on le sache.
 */
const tabsOf = (sections: AssetSection[]) => {
  const byName = new Map(sections.map((s) => [s.name, s]));
  const tabs = TABS.map(({ value, label, groups }) => ({
    value,
    label,
    groups: groups.flatMap(({ section, label: title }): DisplayedGroup[] => {
      const foundItem = byName.get(section);
      return foundItem ? [{ label: title, section: foundItem }] : [];
    }),
  }));
  const others = sections
    .filter((s) => !PLACED_SECTIONS.has(s.name) && !EXCLUDED_SECTIONS.has(s.name))
    .map((section) => ({ label: section.name, section }));
  tabs.push({ value: "autres", label: "Autres", groups: others });
  return tabs.filter((o) => o.groups.length > 0);
};

/** L'air sous une section dépliée, avant l'en-tête de la suivante. */
const SPACE_BELOW_SECTION = 30;

/**
 * Les sections d'un onglet à la suite, chacune dans un accordéon, toutes
 * repliées à l'ouverture : on déplie ce qu'on vient lire. Repliée, une section
 * a son titre comme le reste du texte, en gris ; dépliée, celui d'une
 * catégorie.
 * Le compte dit si elle décrit une chose ou six cents. L'onglet n'est monté
 * qu'ouvert : y revenir replie tout de nouveau.
 */
function SectionsTab({
  groups,
  os,
}: {
  groups: DisplayedGroup[];
  /** Le système du poste, dont la Description prend le logo. */
  os: AssetDetail["os"];
}) {
  const [openSessions, setOpenedItems] = useState<string[]>([]);
  return (
    <Accordion
      multiple
      value={openSessions}
      onChange={setOpenedItems}
      chevronPosition="right"
      // Le titre de la première section tombe à la hauteur de « Résumé » :
      // l'en-tête n'a pas de marge à lui, l'écart entre deux en-têtes vient
      // de la feuille de style (AssetDrawer.module.css). Sous le titre, la
      // grille s'écarte comme les cartes du Résumé.
      classNames={{ item: classes.section, control: classes.controle }}
      styles={{
        item: { border: "none" },
        control: { paddingInline: 0 },
        label: { paddingBlock: 0 },
        content: { paddingInline: 0, paddingTop: SPACE_BELOW_TITLE, paddingBottom: 0 },
      }}
    >
      {groups.map(({ label, section }) => (
        <Accordion.Item
          key={section.name}
          value={section.name}
          // Dépliée, la section s'écarte de la suivante.
          mb={openSessions.includes(section.name) ? SPACE_BELOW_SECTION : 0}
        >
          <Accordion.Control>
            <Group gap="xs">
              <RecordTitle collapsed={!openSessions.includes(section.name)}>{label}</RecordTitle>
              {section.entries.length > 1 && (
                <Badge size="xs" variant="light" color="gray">
                  {section.entries.length}
                </Badge>
              )}
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            {/* La grille sur le gris des cartes du Résumé, à leur arrondi. */}
            {WITHOUT_FRAME.has(section.name) ? (
              <SectionContent section={section} os={os} />
            ) : (
              <Box p="md" style={{ backgroundColor: CARD_BACKGROUND, borderRadius: 10 }}>
                <SectionContent section={section} os={os} />
              </Box>
            )}
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

/** Le contenu d'une section : son tableau quand elle en a un, ses fiches sinon. */
function SectionContent({ section, os }: { section: AssetSection; os: AssetDetail["os"] }) {
  // La description du système, en cartes comme le Résumé.
  if (section.name === "OPERATINGSYSTEM") return <OperatingSystem section={section} os={os} />;
  const SectionTable = TABLEAUX[section.name];
  if (SectionTable) return <SectionTable section={section} />;
  return (
    <Stack gap="md">
      {section.entries.map((entry, rank) => (
        <Entry key={rank} section={section.name} entry={entry} />
      ))}
    </Stack>
  );
}

export default function AssetDrawer({ opened, onClose, asset }: AssetDrawerProps) {
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  /** L'onglet affiché ; le premier s'ouvre avec la fiche. */
  const [domain, setDomain] = useState<string | null>(null);
  /** Ce qu'a donné la dernière demande d'inventaire, dit en une phrase. */
  const [notice, setNotice] = useState<string | null>(null);
  /** Vrai de la demande jusqu'au retour de l'agent, ou jusqu'à ce qu'on renonce. */
  const [request, setRequested] = useState(false);
  /**
   * Faux dès que le tiroir se ferme ou change de poste : l'attente d'un
   * inventaire dure plusieurs secondes, et ce qui revient ensuite ne concerne
   * peut-être plus ce qu'on regarde.
   */
  const alive = useRef(true);

  // L'identifiant, et non le poste : la liste se relit à chaque écriture que le
  // serveur annonce, et le poste est alors un nouvel objet pour les mêmes
  // données. S'y fier rechargerait le tiroir sous les yeux de qui le lit, et
  // refermerait les sections qu'il vient d'ouvrir.
  const assetId = asset?.id ?? null;

  useEffect(() => {
    if (!opened || assetId === null) return;
    // Le poste change, ou le tiroir se rouvre : on repart de la liste fermée
    // et on relit. L'inventaire est volumineux, il ne voyage que là.
    setDomain(null);
    setNotice(null);
    setRequested(false);
    setDetail(null);
    alive.current = true;

    let abandoned = false;
    api
      .getAsset(assetId)
      .then((received) => {
        if (abandoned) return;
        setDetail(received);
        // Le résumé s'ouvre : c'est ce qu'on vient chercher.
        setDomain(SUMMARY);
      })
      .catch((e) => {
        if (!abandoned) notifyError(errorMessage(e));
      });
    return () => {
      abandoned = true;
      alive.current = false;
    };
  }, [opened, assetId]);

  const wait = (ms: number) => new Promise((followUp) => setTimeout(followUp, ms));

  /**
   * Redemander l'inventaire au poste. Le serveur ne fait que transmettre :
   * l'agent renvoie son inventaire par la porte des agents, et c'est en
   * relisant qu'on voit arriver le nouveau. Tant qu'il n'est pas là, ce qui
   * est affiché reste affiché — c'est l'inventaire précédent, et il est daté.
   */
  const refetchInventory = async () => {
    if (assetId === null || request) return;
    setNotice(null);
    setRequested(true);

    const before = detail?.last_inventory;
    try {
      const { address } = await api.refreshAsset(assetId);
      if (!alive.current) return;
      setNotice(`Demande envoyée à ${address}. L'agent refait son tour de machine…`);

      for (let attempt = 0; attempt < RELOAD_ATTEMPTS; attempt++) {
        await wait(REREAD_DELAY);
        if (!alive.current) return;
        const received = await api.getAsset(assetId);
        if (!alive.current) return;
        if (received.last_inventory !== before) {
          setDetail(received);
          // L'onglet ouvert le reste s'il existe encore : on regardait ce
          // qu'il disait, c'est bien pour cela qu'on a redemandé l'inventaire.
          const tabs = tabsOf(received.sections);
          setDomain((current) =>
            current === SUMMARY || (current && tabs.some((o) => o.value === current))
              ? current
              : SUMMARY,
          );
          setNotice("Inventaire reçu à l'instant.");
          return;
        }
      }
      setNotice(
        "Demande transmise, mais rien n'est revenu dans les trente secondes. "
          + "L'inventaire arrivera peut-être plus tard : rouvrez le poste pour voir.",
      );
    } catch (e) {
      if (alive.current) notifyError(errorMessage(e));
    } finally {
      if (alive.current) setRequested(false);
    }
  };

  const tabs = useMemo(() => (detail ? tabsOf(detail.sections) : []), [detail]);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={DRAWER_WIDTH}
      padding={DRAWER_PADDING}
      withCloseButton={false}
      styles={{
        content: {
          display: "flex",
          flexDirection: "column",
          "--milo-drawer-padding": `${DRAWER_PADDING}px`,
        } as CSSProperties,
        body: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
      }}
    >
      <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
        {/* Le tag de l'asset est dans la carte Identité du Résumé. */}
        <Group justify="flex-end" wrap="nowrap" align="center" pb={SPACE_BELOW_HEADER}>

          <Group gap="sm" wrap="nowrap">
            {/* Prendre la main. Le bouton n'existe que si l'agent a trouvé un
                identifiant TeamViewer sur le poste : sans lui, il n'y a
                personne à appeler. */}
            {detail?.teamviewer_id && (
              <Button
                component="a"
                href={teamviewerLink(detail.teamviewer_id)}
                variant="light"
                color="teal"
                leftSection={<IconDeviceLaptop size={16} />}
              >
                TeamViewer
              </Button>
            )}

            {/* L'adresse vient du dernier inventaire : en DHCP elle a pu
                changer, et c'est le serveur qui le dira en échouant. */}
            <Button
              variant="subtle"
              color="gray"
              leftSection={<IconRefresh size={16} />}
              onClick={refetchInventory}
              loading={request}
              disabled={!detail?.address}
            >
              Rafraîchir
            </Button>
          </Group>
        </Group>

        {notice && <SuccessAlert onClose={() => setNotice(null)}>{notice}</SuccessAlert>}

        {/* Les onglets en colonne le long du bord gauche, chacun réunissant
            plusieurs sections de l'inventaire. */}
        {detail && (
          <Tabs
            orientation="vertical"
            value={domain}
            onChange={setDomain}
            // Seul l'onglet ouvert est monté : un inventaire porte parfois
            // six cents logiciels, et les garder tous en place alourdirait la
            // fiche pour rien.
            keepMounted={false}
            style={{ flex: 1, minHeight: 0, display: "flex" }}
            styles={{ panel: { paddingLeft: 20 } }}
          >
            {/* La colonne d'onglets descend jusqu'au bas de la fiche : son
                filet borde le panneau sur toute sa hauteur. Cinq onglets
                tiennent sans défiler. */}
            <Tabs.List style={{ flex: `0 0 ${TABS_WIDTH}px` }}>
              <Tabs.Tab value={SUMMARY} style={tabStyle(domain === SUMMARY)}>
                Résumé
              </Tabs.Tab>
              {tabs.map((tab) => (
                <Tabs.Tab
                  key={tab.value}
                  value={tab.value}
                  style={tabStyle(domain === tab.value)}
                >
                  {tab.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>

            {/* Le domaine ouvert défile, et sa barre quitte le contenu pour
                aller se coucher tout au bord droit du tiroir, sur toute sa
                hauteur — comme celle des tableaux des modes Projet et Support
                le long de la fenêtre. Elle ne mange donc plus de largeur au
                panneau, d'où l'abandon de « offsetScrollbars ». */}
            <ScrollArea
              type="always"
              scrollbarSize={2}
              style={{ flex: 1, minHeight: 0 }}
              styles={{
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
              <Tabs.Panel value={SUMMARY} px={40}>
                <AssetSummaryPanel detail={detail} />
              </Tabs.Panel>
              {tabs.map((tab) => (
                <Tabs.Panel key={tab.value} value={tab.value} px={40}>
                  <SectionsTab groups={tab.groups} os={detail.os} />
                </Tabs.Panel>
              ))}
            </ScrollArea>
          </Tabs>
        )}

        <Group justify="flex-end" mt="auto" pt="md">
          <CloseButton onClick={onClose} />
        </Group>
      </Stack>
    </Drawer>
  );
}
