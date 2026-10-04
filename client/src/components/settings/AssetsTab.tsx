import { Group, Input, Menu, ScrollArea, Stack, TextInput } from "@mantine/core";
import { IconDeviceLaptop, IconNetwork, IconTrash } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { ASSET_MODEL_MAX, VLAN_NAME_MAX } from "@milo/shared";
import type { AssetSettings } from "@milo/shared";
import { api } from "../../api";
import defilement from "../../assets/styles/ListeScroll.module.css";
import { messageErreur, notifierErreur } from "../../lib/errors";
import { RED } from "../../themes/colors";
import AddButton from "../ui/AddButton";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import {
  ARRONDI,
  ListeVide,
  RETRAIT_LIGNE,
  styleChampNom,
  styleLigne,
} from "../ui/LignesDuTiroir";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "../ui/PointMenu";
import type { ClipboardEvent, ComponentType } from "react";

// La section « Assets » du Paramétrage, et ses deux listes :
// - « Modèles » : le nom commercial de l'identifiant qu'un poste déclare —
//   Apple ne remonte que « Mac14,6 » ;
// - « VLAN » : le VLAN qui porte chaque sous-réseau (« 10.1.106.0/24 » → 106).
// Elles se présentent comme les listes des tiroirs (ChampsColonnes) : une
// ligne par entrée, ses champs à même la ligne. Une ligne part au serveur
// quand on la quitte, complète et changée ; Échap la ramène à ce qu'elle
// était. Le clic droit la supprime ; « Ajouter » pose une ligne vide au bout.
// Les VLAN se collent aussi par lots dans une ligne ajoutée : une ligne
// « sous-réseau VLAN nom » chacun, le nom facultatif.

/** La largeur de la première colonne : identifiant ou sous-réseau. */
const LARGEUR_PREMIERE = 200;

/** Assez pour « 4094 ». */
const VLAN_LONGUEUR = 4;

/** La largeur de la colonne des numéros de VLAN. */
const LARGEUR_VLAN = 60;

/** Au-delà, la liste défile. */
const LIGNES_VISIBLES = 5;

/**
 * La hauteur d'une ligne et de l'écart qui la suit : un champ « xs » (30 px),
 * le retrait de la ligne en haut et en bas (2 × 4 px), et le filet de 1 px.
 */
const HAUTEUR_LIGNE = 30 + 2 * 4 + 1;

/** Une ligne d'une liste : ses champs, tels qu'on les saisit, dans l'ordre des colonnes. */
type Ligne = string[];

/**
 * Une colonne : son libellé, sa longueur, et sa largeur — fixe, ou le reste
 * de la ligne. Une colonne « facultative » peut rester vide.
 */
interface Colonne {
  label: string;
  maxLength: number;
  largeur?: number;
  numerique?: boolean;
  facultative?: boolean;
}

const vide = (colonnes: Colonne[]): Ligne => colonnes.map(() => "");

const styleColonne = (colonne: Colonne) =>
  colonne.largeur ? { width: colonne.largeur, flexShrink: 0 } : { flex: 1, minWidth: 0 };

const nettoye = (l: Ligne): Ligne => l.map((v) => v.trim());

interface LigneEditableProps {
  colonnes: Colonne[];
  valeur: Ligne;
  rang: number;
  total: number;
  /** Vrai pour la ligne ajoutée, pas encore enregistrée. */
  nouvelle?: boolean;
  /** La ligne complète et changée part : vrai quand le serveur l'a prise. */
  onValider: (ligne: Ligne) => Promise<boolean>;
  /** La ligne ajoutée, quittée vide ou abandonnée. */
  onAbandon?: () => void;
  onContextMenu?: (e: React.MouseEvent<HTMLElement>) => void;
  onPaste?: (e: ClipboardEvent<HTMLInputElement>) => void;
}

/** Une ligne : ses champs à même la ligne, et son brouillon le temps de la saisie. */
function LigneEditable({
  colonnes,
  valeur,
  rang,
  total,
  nouvelle,
  onValider,
  onAbandon,
  onContextMenu,
  onPaste,
}: LigneEditableProps) {
  const [brouillon, setBrouillon] = useState<Ligne>(valeur);
  const [focus, setFocus] = useState<number | null>(null);
  const ligne = useRef<HTMLDivElement | null>(null);
  // Échap quitte la ligne sans rien envoyer : la sortie qui suit le sait.
  const annule = useRef(false);

  const complet = (l: Ligne) => colonnes.every((c, i) => c.facultative || Boolean(l[i]));

  // Quitter un champ pour un autre de la même ligne n'enregistre pas.
  const quitter = async () => {
    const apres = nettoye(brouillon);
    if (annule.current) {
      annule.current = false;
      if (nouvelle) return onAbandon?.();
      return setBrouillon(valeur);
    }
    if (nouvelle) {
      if (apres.every((v) => !v)) return onAbandon?.();
      // Incomplète, la ligne ajoutée attend la suite.
      if (complet(apres)) await onValider(apres);
      return;
    }
    // Vidée ou inchangée : elle revient à ce qu'elle était.
    if (!complet(apres) || apres.every((v, i) => v === valeur[i])) return setBrouillon(valeur);
    if (!(await onValider(apres))) setBrouillon(valeur);
  };

  return (
    <Group
      ref={ligne}
      gap="xs"
      wrap="nowrap"
      onContextMenu={onContextMenu}
      onBlur={(e) => {
        if (ligne.current?.contains(e.relatedTarget as Node | null)) return;
        void quitter();
      }}
      style={{ ...styleLigne(rang, total, false), paddingLeft: RETRAIT_LIGNE }}
    >
      {colonnes.map((colonne, i) => (
        <TextInput
          key={colonne.label}
          size="sm"
          radius={ARRONDI}
          placeholder={colonne.label}
          aria-label={colonne.label}
          value={brouillon[i] ?? ""}
          onChange={(e) => {
            const texte = e.currentTarget.value;
            setBrouillon((avant) =>
              avant.map((v, j) => (j === i ? (colonne.numerique ? texte.replace(/\D/g, "") : texte) : v)),
            );
          }}
          onKeyDown={(e) => {
            // Consommée : la fenêtre qui porte ce champ n'enregistre pas en plus.
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              annule.current = true;
              e.currentTarget.blur();
            }
          }}
          onPaste={i === 0 ? onPaste : undefined}
          maxLength={colonne.maxLength}
          inputMode={colonne.numerique ? "numeric" : undefined}
          autoFocus={nouvelle && i === 0}
          onFocus={() => setFocus(i)}
          onBlurCapture={() => setFocus(null)}
          style={styleColonne(colonne)}
          styles={{ input: styleChampNom(focus === i) }}
        />
      ))}
    </Group>
  );
}

/**
 * Une liste à plusieurs champs par ligne. Elle part entière au serveur à chaque
 * changement (`enregistrer`), qui la vérifie et la renvoie telle qu'il la
 * garde.
 *
 * `decouper`, s'il est donné, permet de coller plusieurs lignes d'un coup dans
 * la ligne ajoutée : chaque ligne du presse-papiers devient une ligne.
 */
function ListeLignes({
  titre,
  colonnes,
  lignes,
  enregistrer,
  emptyIcon,
  emptyText,
  libelleAjout,
  titreSuppression,
  decouper,
}: {
  titre: string;
  colonnes: Colonne[];
  lignes: Ligne[];
  enregistrer: (liste: Ligne[]) => Promise<boolean>;
  emptyIcon: ComponentType<{ size?: number }>;
  emptyText: string;
  libelleAjout: string;
  titreSuppression: string;
  decouper?: (ligne: string) => Ligne | null;
}) {
  // La ligne ajoutée, en attente de ses champs.
  const [enAjout, setEnAjout] = useState(false);
  const [menu, setMenu] = useState<{ rang: number; position: PointMenuPosition } | null>(null);
  const [aSupprimer, setASupprimer] = useState<number | null>(null);

  const envoyer = async (liste: Ligne[]): Promise<boolean> => {
    try {
      return await enregistrer(liste);
    } catch (e) {
      notifierErreur(messageErreur(e));
      return false;
    }
  };

  /**
   * Un collage de plusieurs lignes — ou d'une seule qui porte déjà ses
   * champs — les ajoute toutes d'un coup. Une ligne illisible arrête tout :
   * rien n'est ajouté, et on dit laquelle.
   */
  const coller = (e: ClipboardEvent<HTMLInputElement>) => {
    if (!decouper) return;
    const brutes = e.clipboardData
      .getData("text")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (brutes.length === 0) return;
    if (brutes.length === 1 && !decouper(brutes[0] ?? "")) return; // un collage ordinaire
    e.preventDefault();
    const lues: Ligne[] = [];
    for (const brute of brutes) {
      const lue = decouper(brute);
      if (!lue) {
        notifierErreur(`Ligne illisible : « ${brute} »`);
        return;
      }
      lues.push(lue);
    }
    void envoyer([...lignes, ...lues]).then((ok) => ok && setEnAjout(false));
  };

  const total = lignes.length + (enAjout ? 1 : 0);

  return (
    <Input.Wrapper label={titre}>
      {total === 0 ? (
        <ListeVide icon={emptyIcon} message={emptyText} />
      ) : (
        // Cinq lignes au plus à la fois : au-delà, la liste défile. Une ligne
        // ajoutée, qui prend le focus, s'y montre d'elle-même.
        <ScrollArea.Autosize
          mah={LIGNES_VISIBLES * HAUTEUR_LIGNE}
          type="auto"
          scrollbars="y"
          classNames={{ scrollbar: defilement.scrollbar, thumb: defilement.thumb }}
        >
          <Stack gap={1}>
            {lignes.map((ligne, rang) => (
              <LigneEditable
                // Une ligne relue du serveur repart de sa nouvelle valeur.
                key={`${rang}-${ligne.join("|")}`}
                colonnes={colonnes}
                valeur={ligne}
                rang={rang}
                total={total}
                onValider={(apres) => envoyer(lignes.map((l, i) => (i === rang ? apres : l)))}
                onContextMenu={(e) => setMenu({ rang, position: positionDuMenu(e) })}
              />
            ))}
            {enAjout && (
              <LigneEditable
                colonnes={colonnes}
                valeur={vide(colonnes)}
                rang={total - 1}
                total={total}
                nouvelle
                onValider={async (apres) => {
                  const ok = await envoyer([...lignes, apres]);
                  if (ok) setEnAjout(false);
                  return ok;
                }}
                onAbandon={() => setEnAjout(false)}
                onPaste={decouper ? coller : undefined}
              />
            )}
          </Stack>
        </ScrollArea.Autosize>
      )}
      {/* Au plus près de la liste qu'il allonge. */}
      <AddButton label={libelleAjout} onClick={() => setEnAjout(true)} mt={4} />

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              setASupprimer(menu.rang);
              setMenu(null);
            }}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={aSupprimer !== null}
        onClose={() => setASupprimer(null)}
        onConfirm={async () => {
          const rang = aSupprimer;
          setASupprimer(null);
          if (rang !== null) await envoyer(lignes.filter((_, i) => i !== rang));
        }}
        title={titreSuppression}
        message={
          <>
            Voulez-vous vraiment supprimer « {lignes[aSupprimer ?? -1]?.[0]} » ? Cette action est
            irréversible.
          </>
        }
      />
    </Input.Wrapper>
  );
}

const COLONNES_MODELES: Colonne[] = [
  {
    label: "Identifiant",
    maxLength: ASSET_MODEL_MAX,
    // Plus court qu'un sous-réseau : « Mac14,6 ».
    largeur: LARGEUR_PREMIERE - 40,
  },
  { label: "Nom commercial", maxLength: ASSET_MODEL_MAX },
];

const COLONNES_VLAN: Colonne[] = [
  { label: "Sous-réseau", maxLength: 18, largeur: LARGEUR_PREMIERE },
  {
    label: "VLAN",
    maxLength: VLAN_LONGUEUR,
    largeur: LARGEUR_VLAN,
    numerique: true,
  },
  { label: "Nom", maxLength: VLAN_NAME_MAX, facultative: true },
];

/**
 * « 10.1.106.0/24 106 Wi-Fi invités » : le sous-réseau, le VLAN, puis le nom
 * facultatif — séparés d'espaces, d'une tabulation, d'un « ; » ou d'une « , ».
 */
const LIGNE_VLAN = /^(\S+\/\d+)[\s;,]+(\d+)(?:[\s;,]+(.*))?$/;

const decouperVlan = (ligne: string): Ligne | null => {
  const m = LIGNE_VLAN.exec(ligne);
  if (!m) return null;
  return [m[1] ?? "", m[2] ?? "", (m[3] ?? "").trim()];
};

export default function AssetsTab() {
  const [reglages, setReglages] = useState<AssetSettings>({
    models: [],
    vlans: [],
  });

  useEffect(() => {
    api
      .getAssetSettings()
      .then(setReglages)
      .catch((e) => notifierErreur(messageErreur(e)));
  }, []);

  /** Une table part entière : le serveur la remplace d'un coup. */
  const enregistrer = async (
    data: Partial<AssetSettings>,
  ): Promise<boolean> => {
    setReglages(await api.updateAssetSettings(data));
    return true;
  };

  return (
    <Stack gap="xl">
      <ListeLignes
        titre="Modèles"
        colonnes={COLONNES_MODELES}
        lignes={reglages.models.map((m) => [m.identifier, m.name])}
        enregistrer={(liste) =>
          enregistrer({
            models: liste.map(([identifier = "", name = ""]) => ({
              identifier,
              name,
            })),
          })
        }
        emptyIcon={IconDeviceLaptop}
        emptyText="Aucun modèle"
        libelleAjout="Ajouter un modèle"
        titreSuppression="Supprimer le modèle"
      />
      <ListeLignes
        titre="VLAN"
        colonnes={COLONNES_VLAN}
        lignes={reglages.vlans.map((v) => [v.subnet, String(v.vlan), v.name])}
        enregistrer={(liste) =>
          enregistrer({
            vlans: liste.map(([subnet = "", vlan = "", name = ""]) => ({
              subnet,
              vlan: Number(vlan),
              name,
            })),
          })
        }
        emptyIcon={IconNetwork}
        emptyText="Aucun VLAN"
        libelleAjout="Ajouter un VLAN"
        titreSuppression="Supprimer le VLAN"
        decouper={decouperVlan}
      />
    </Stack>
  );
}
