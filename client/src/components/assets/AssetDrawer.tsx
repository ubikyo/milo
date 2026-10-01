import {
  Badge,
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
import ErrorAlert from "../ui/ErrorAlert";
import SuccessAlert from "../ui/SuccessAlert";
import { messageErreur } from "../../lib/errors";
import { tabStyle } from "../../themes/tabs";
import { TABLEAUX, VIDE } from "./InventoryTables";
import AssetSummaryPanel from "./AssetSummaryPanel";
import type { CSSProperties } from "react";
import type { Asset, AssetDetail, AssetEntry, AssetSection } from "@milo/shared";
import BoutonFermer from "../ui/BoutonFermer";

const DRAWER_PADDING = 40;
const DRAWER_WIDTH = 1100;

/** Largeur de la colonne d'onglets : « Utilisateurs et groupes » y tient. */
const LARGEUR_ONGLETS = 210;

/**
 * Le tag de l'asset, moitié plus grand que dans la liste (20 px de haut,
 * 11 px de texte, 10 px de marge) : c'est le titre de la fiche.
 */
const TAG_TITRE = {
  "--badge-height": "30px",
  "--badge-fz": "16.5px",
  "--badge-padding-x": "15px",
} as CSSProperties;

/** L'espace entre le tag de l'asset et le reste de la fiche. */
const ESPACE_SOUS_ENTETE = 30;

/**
 * Après une demande d'inventaire, l'agent refait son tour de machine et
 * renvoie le résultat : cela prend quelques secondes à quelques dizaines de
 * secondes selon le poste. On relit à intervalle régulier jusqu'à voir une
 * date changer, puis on renonce — sans bloquer quoi que ce soit, le tiroir
 * reste lisible pendant ce temps.
 */
const ATTENTE_RELECTURE = 3_000;
const RELECTURES = 10;

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
export const lienTeamviewer = (id: string) => `teamviewer10://control?device=${id}`;
export const lienTeamviewerSecours = (id: string) =>
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

/** Les champs d'une entrée, en deux colonnes : le nom, la valeur. */
function Entree({ entry }: { entry: AssetEntry }) {
  return (
    <Table withRowBorders={false} verticalSpacing={2} horizontalSpacing={0}>
      <Table.Tbody>
        {Object.entries(entry).map(([champ, valeur]) => (
          <Table.Tr key={champ}>
            {/* Le nom des champs est celui de l'agent, en capitales : on le
                garde tel quel, c'est lui qu'on retrouvera dans la doc et dans
                le XML le jour où il faudra en discuter. */}
            <Table.Td style={{ width: "30%", verticalAlign: "top" }}>
              <Text size="xs" c="dimmed" ff="monospace">
                {champ}
              </Text>
            </Table.Td>
            <Table.Td style={{ verticalAlign: "top" }}>
              <Text size="sm" style={{ wordBreak: "break-word" }}>
                {valeur || VIDE}
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/** Un groupe d'onglet : une section de l'inventaire, sous son libellé. */
interface Groupe {
  section: string;
  libelle: string;
}

/** Un onglet de la fiche : plusieurs sections de l'inventaire, à la suite. */
interface Onglet {
  value: string;
  libelle: string;
  groupes: Groupe[];
}

/**
 * Les onglets de la fiche et, dans chacun, les sections de l'inventaire
 * qu'il réunit, dans l'ordre où elles s'affichent. Les libellés disent ce
 * qu'on y trouve mieux que les noms de l'agent : DRIVES liste des volumes —
 * des partitions, des lecteurs réseau —, pas des disques ; ANTIVIRUS recense
 * aussi bien les EDR que les antivirus d'autrefois.
 */
const ONGLETS: Onglet[] = [
  {
    value: "utilisateurs",
    libelle: "Utilisateurs et groupes",
    groupes: [
      { section: "LOCAL_USERS", libelle: "Utilisateurs locaux" },
      { section: "LOCAL_GROUPS", libelle: "Groupes locaux" },
    ],
  },
  {
    value: "materiel",
    libelle: "Matériel",
    groupes: [
      { section: "BIOS", libelle: "BIOS" },
      { section: "CPUS", libelle: "Processeurs" },
      { section: "MEMORIES", libelle: "Mémoire" },
      { section: "BATTERIES", libelle: "Batterie" },
      { section: "CONTROLLERS", libelle: "Contrôleurs" },
      { section: "VIDEOS", libelle: "Vidéo" },
      { section: "SOUNDS", libelle: "Audio" },
      { section: "STORAGES", libelle: "Stockage" },
    ],
  },
  {
    value: "peripheriques",
    libelle: "Périphériques",
    groupes: [
      { section: "INPUTS", libelle: "Périphériques d'entrée" },
      { section: "MONITORS", libelle: "Moniteurs" },
      { section: "PRINTERS", libelle: "Imprimantes" },
      { section: "USBDEVICES", libelle: "USB" },
    ],
  },
  {
    value: "systeme",
    libelle: "Système d'exploitation",
    groupes: [
      { section: "OPERATINGSYSTEM", libelle: "Description" },
      { section: "NETWORKS", libelle: "Réseaux" },
      { section: "DRIVES", libelle: "Volumes" },
      { section: "ANTIVIRUS", libelle: "EPP / EDR" },
      { section: "FIREWALL", libelle: "Pare-feu" },
      { section: "SOFTWARES", libelle: "Applications" },
      { section: "PROCESSES", libelle: "Process" },
    ],
  },
];

/**
 * Ce qu'on laisse de côté pour le moment : HARDWARE répète ce que disent les
 * autres sections, USERS ce que disent les comptes locaux.
 */
const SECTIONS_ECARTEES = new Set(["HARDWARE", "USERS"]);

/** L'onglet « Résumé », toujours le premier : il ne se lit pas dans une section. */
const RESUME = "resume";

/** Les sections déjà rangées dans un onglet. */
const SECTIONS_RANGEES = new Set(ONGLETS.flatMap((o) => o.groupes.map((g) => g.section)));

/** Un groupe tel qu'il s'affiche : son libellé, et la section de l'inventaire. */
interface GroupeAffiche {
  libelle: string;
  section: AssetSection;
}

/**
 * Les onglets qui ont quelque chose à montrer, et leurs groupes non vides.
 * Ce qu'aucun onglet ne range — une section que l'agent ajouterait, ou que
 * seuls certains postes déclarent — va dans « Autres », sous son nom
 * d'agent, plutôt que de disparaître sans qu'on le sache.
 */
const ongletsDe = (sections: AssetSection[]) => {
  const parNom = new Map(sections.map((s) => [s.name, s]));
  const onglets = ONGLETS.map(({ value, libelle, groupes }) => ({
    value,
    libelle,
    groupes: groupes.flatMap(({ section, libelle: titre }): GroupeAffiche[] => {
      const trouvee = parNom.get(section);
      return trouvee ? [{ libelle: titre, section: trouvee }] : [];
    }),
  }));
  const autres = sections
    .filter((s) => !SECTIONS_RANGEES.has(s.name) && !SECTIONS_ECARTEES.has(s.name))
    .map((section) => ({ libelle: section.name, section }));
  onglets.push({ value: "autres", libelle: "Autres", groupes: autres });
  return onglets.filter((o) => o.groupes.length > 0);
};

/** Le contenu d'une section : son tableau quand elle en a un, ses fiches sinon. */
function ContenuSection({ section }: { section: AssetSection }) {
  const Tableau = TABLEAUX[section.name];
  if (Tableau) return <Tableau section={section} />;
  return (
    <Stack gap="md">
      {section.entries.map((entry, rang) => (
        <Entree key={rang} entry={entry} />
      ))}
    </Stack>
  );
}

export default function AssetDrawer({ opened, onClose, asset }: AssetDrawerProps) {
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** L'onglet affiché ; le premier s'ouvre avec la fiche. */
  const [domaine, setDomaine] = useState<string | null>(null);
  /** Ce qu'a donné la dernière demande d'inventaire, dit en une phrase. */
  const [avis, setAvis] = useState<string | null>(null);
  /** Vrai de la demande jusqu'au retour de l'agent, ou jusqu'à ce qu'on renonce. */
  const [demande, setDemande] = useState(false);
  /**
   * Faux dès que le tiroir se ferme ou change de poste : l'attente d'un
   * inventaire dure plusieurs secondes, et ce qui revient ensuite ne concerne
   * peut-être plus ce qu'on regarde.
   */
  const vivant = useRef(true);

  // L'identifiant, et non le poste : la liste se relit à chaque écriture que le
  // serveur annonce, et le poste est alors un nouvel objet pour les mêmes
  // données. S'y fier rechargerait le tiroir sous les yeux de qui le lit, et
  // refermerait les sections qu'il vient d'ouvrir.
  const assetId = asset?.id ?? null;

  useEffect(() => {
    if (!opened || assetId === null) return;
    // Le poste change, ou le tiroir se rouvre : on repart de la liste fermée
    // et on relit. L'inventaire est volumineux, il ne voyage que là.
    setDomaine(null);
    setError(null);
    setAvis(null);
    setDemande(false);
    setDetail(null);
    vivant.current = true;

    let abandonne = false;
    api
      .getAsset(assetId)
      .then((recu) => {
        if (abandonne) return;
        setDetail(recu);
        // Le résumé s'ouvre : c'est ce qu'on vient chercher.
        setDomaine(RESUME);
      })
      .catch((e) => {
        if (!abandonne) setError(messageErreur(e));
      });
    return () => {
      abandonne = true;
      vivant.current = false;
    };
  }, [opened, assetId]);

  const patienter = (ms: number) => new Promise((suite) => setTimeout(suite, ms));

  /**
   * Redemander l'inventaire au poste. Le serveur ne fait que transmettre :
   * l'agent renvoie son inventaire par la porte des agents, et c'est en
   * relisant qu'on voit arriver le nouveau. Tant qu'il n'est pas là, ce qui
   * est affiché reste affiché — c'est l'inventaire précédent, et il est daté.
   */
  const redemanderInventaire = async () => {
    if (assetId === null || demande) return;
    setError(null);
    setAvis(null);
    setDemande(true);

    const avant = detail?.last_inventory;
    try {
      const { address } = await api.refreshAsset(assetId);
      if (!vivant.current) return;
      setAvis(`Demande envoyée à ${address}. L'agent refait son tour de machine…`);

      for (let essai = 0; essai < RELECTURES; essai++) {
        await patienter(ATTENTE_RELECTURE);
        if (!vivant.current) return;
        const recu = await api.getAsset(assetId);
        if (!vivant.current) return;
        if (recu.last_inventory !== avant) {
          setDetail(recu);
          // L'onglet ouvert le reste s'il existe encore : on regardait ce
          // qu'il disait, c'est bien pour cela qu'on a redemandé l'inventaire.
          const onglets = ongletsDe(recu.sections);
          setDomaine((courant) =>
            courant === RESUME || (courant && onglets.some((o) => o.value === courant))
              ? courant
              : RESUME,
          );
          setAvis("Inventaire reçu à l'instant.");
          return;
        }
      }
      setAvis(
        "Demande transmise, mais rien n'est revenu dans les trente secondes. "
          + "L'inventaire arrivera peut-être plus tard : rouvrez le poste pour voir.",
      );
    } catch (e) {
      if (vivant.current) setError(messageErreur(e));
    } finally {
      if (vivant.current) setDemande(false);
    }
  };

  // Le nom vient de la liste : il s'affiche avant même que l'inventaire soit
  // là, plutôt qu'un titre vide le temps de la lecture.
  const titre = asset?.name ?? "";

  const onglets = useMemo(() => (detail ? ongletsDe(detail.sections) : []), [detail]);

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
        <Group justify="space-between" wrap="nowrap" align="center" pb={ESPACE_SOUS_ENTETE}>
          {titre && (
            <Badge color="green" variant="filled" radius="sm" tt="uppercase" style={TAG_TITRE}>
              {titre}
            </Badge>
          )}

          <Group gap="sm" wrap="nowrap">
            {/* Prendre la main. Le bouton n'existe que si l'agent a trouvé un
                identifiant TeamViewer sur le poste : sans lui, il n'y a
                personne à appeler. */}
            {detail?.teamviewer_id && (
              <Button
                component="a"
                href={lienTeamviewer(detail.teamviewer_id)}
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
              onClick={redemanderInventaire}
              loading={demande}
              disabled={!detail?.address}
            >
              Rafraîchir
            </Button>
          </Group>
        </Group>

        {error && <ErrorAlert>{error}</ErrorAlert>}
        {avis && <SuccessAlert onClose={() => setAvis(null)}>{avis}</SuccessAlert>}

        {/* Les onglets en colonne le long du bord gauche, chacun réunissant
            plusieurs sections de l'inventaire. */}
        {detail && (
          <Tabs
            orientation="vertical"
            value={domaine}
            onChange={setDomaine}
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
            <Tabs.List style={{ flex: `0 0 ${LARGEUR_ONGLETS}px` }}>
              <Tabs.Tab value={RESUME} style={tabStyle(domaine === RESUME)}>
                Résumé
              </Tabs.Tab>
              {onglets.map((onglet) => (
                <Tabs.Tab
                  key={onglet.value}
                  value={onglet.value}
                  style={tabStyle(domaine === onglet.value)}
                >
                  {onglet.libelle}
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
              <Tabs.Panel value={RESUME} px={40}>
                <AssetSummaryPanel detail={detail} />
              </Tabs.Panel>
              {onglets.map((onglet) => (
                <Tabs.Panel key={onglet.value} value={onglet.value} px={40}>
                  {/* Les sections de l'onglet à la suite, chacune sous son
                      libellé ; le compte dit si elle décrit une chose ou six
                      cents. */}
                  <Stack gap={30}>
                    {onglet.groupes.map(({ libelle, section }) => (
                      <Stack key={section.name} gap="xs">
                        <Group gap="xs">
                          <Text fw={600}>{libelle}</Text>
                          {section.entries.length > 1 && (
                            <Badge size="xs" variant="light" color="gray">
                              {section.entries.length}
                            </Badge>
                          )}
                        </Group>
                        <ContenuSection section={section} />
                      </Stack>
                    ))}
                  </Stack>
                </Tabs.Panel>
              ))}
            </ScrollArea>
          </Tabs>
        )}

        <Group justify="flex-end" mt="auto" pt="md">
          <BoutonFermer onClick={onClose} />
        </Group>
      </Stack>
    </Drawer>
  );
}
