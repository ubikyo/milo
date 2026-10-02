import {
  ActionIcon,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconCornerDownLeft,
  IconDeviceLaptop,
  IconNetwork,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { ASSET_MODEL_MAX, VLAN_NAME_MAX } from "@milo/shared";
import type { AssetSettings } from "@milo/shared";
import { api } from "../../api";
import { messageErreur } from "../../lib/errors";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import ErrorAlert from "../ui/ErrorAlert";
import ListItems from "../ui/ListItems";
import type { ClipboardEvent, ComponentType, KeyboardEvent } from "react";

// La section « Assets » du Paramétrage, et ses deux listes :
// - « Modèles » : le nom commercial de l'identifiant qu'un poste déclare —
//   Apple ne remonte que « Mac14,6 » ;
// - « VLAN » : le VLAN qui porte chaque sous-réseau (« 10.1.106.0/24 » → 106).
// Chacune est celle des sociétés (ListItems, comme LookupManager), à
// plusieurs champs par ligne.
//
// Tout se passe sur la ligne : cliquer une ligne l'édite sur place (Entrée
// enregistre, Échap annule), le clic droit ouvre « Modifier » et
// « Supprimer ». La ligne d'ajout garde le focus : on enchaîne les saisies.
// Les VLAN se collent aussi par lots : une ligne « sous-réseau VLAN nom »
// chacun, le nom facultatif.

/** La largeur de la première colonne : identifiant ou sous-réseau. */
const LARGEUR_PREMIERE = 200;

/** Assez pour « 4094 ». */
const VLAN_LONGUEUR = 4;

/** La largeur de la colonne des numéros de VLAN. */
const LARGEUR_VLAN = 60;

/** Hauteur d'un champ d'édition : celle du texte qu'il remplace (LookupManager). */
const FIELD_HEIGHT = 22;

const STYLES_CHAMP = {
  input: {
    height: FIELD_HEIGHT,
    minHeight: FIELD_HEIGHT,
    lineHeight: `${FIELD_HEIGHT}px`,
  },
};

/** Taille du symbole Entrée au bout de la ligne d'ajout (ListItems). */
const ENTER_SIZE = 14;

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
  colonne.largeur
    ? { width: colonne.largeur, flexShrink: 0 }
    : { flex: 1, minWidth: 0 };

/** Les champs d'une ligne, côte à côte : à l'ajout comme à l'édition. */
function ChampsLigne({
  colonnes,
  valeur,
  onChange,
  onKeyDown,
  onBlur,
  onPaste,
  disabled,
  autoFocus,
}: {
  colonnes: Colonne[];
  valeur: Ligne;
  onChange: (valeur: Ligne) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  onPaste?: (e: ClipboardEvent<HTMLInputElement>) => void;
  disabled: boolean;
  autoFocus?: boolean;
}) {
  return (
    <>
      {colonnes.map((colonne, i) => (
        <TextInput
          key={colonne.label}
          placeholder={colonne.label}
          value={valeur[i] ?? ""}
          onChange={(e) => {
            const texte = e.currentTarget.value;
            onChange(
              valeur.map((v, j) =>
                j === i
                  ? colonne.numerique
                    ? texte.replace(/\D/g, "")
                    : texte
                  : v,
              ),
            );
          }}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          onPaste={onPaste}
          maxLength={colonne.maxLength}
          inputMode={colonne.numerique ? "numeric" : undefined}
          variant="unstyled"
          size="sm"
          styles={STYLES_CHAMP}
          style={styleColonne(colonne)}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-label={colonne.label}
        />
      ))}
    </>
  );
}

const nettoye = (l: Ligne): Ligne => l.map((v) => v.trim());

/**
 * Une liste à plusieurs champs par ligne. Elle part entière au serveur à chaque
 * changement (`enregistrer`), qui la vérifie et la renvoie telle qu'il la
 * garde.
 *
 * `decouper`, s'il est donné, permet de coller plusieurs lignes d'un coup dans
 * la ligne d'ajout : chaque ligne du presse-papiers devient une ligne.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState<Ligne>(() => vide(colonnes));
  // Le rang de la ligne en cours d'édition, et ses champs.
  const [enEdition, setEnEdition] = useState<number | null>(null);
  const [brouillon, setBrouillon] = useState<Ligne>(() => vide(colonnes));
  const [aSupprimer, setASupprimer] = useState<number | null>(null);
  // Quitter un champ pour l'autre de la même ligne n'enregistre pas.
  const ligneEditee = useRef<HTMLDivElement | null>(null);

  // Les colonnes obligatoires remplies : la ligne peut partir.
  const complet = (l: Ligne) =>
    colonnes.every((c, i) => c.facultative || Boolean(l[i]?.trim()));

  const envoyer = async (liste: Ligne[]): Promise<boolean> => {
    setError(null);
    setBusy(true);
    try {
      return await enregistrer(liste);
    } catch (e) {
      setError(messageErreur(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const ajouter = async () => {
    if (!complet(nouveau)) return;
    if (await envoyer([...lignes, nettoye(nouveau)]))
      setNouveau(vide(colonnes));
  };

  /**
   * Un collage de plusieurs lignes — ou d'une seule qui porte déjà ses
   * champs — les ajoute toutes d'un coup. Une ligne illisible arrête tout :
   * rien n'est ajouté, et on dit laquelle.
   */
  const coller = (e: ClipboardEvent<HTMLInputElement>) => {
    if (!decouper) return;
    const texte = e.clipboardData.getData("text");
    const brutes = texte
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
        setError(`Ligne illisible : « ${brute} »`);
        return;
      }
      lues.push(lue);
    }
    void envoyer([...lignes, ...lues]).then(
      (ok) => ok && setNouveau(vide(colonnes)),
    );
  };

  const editer = (rang: number) => {
    setError(null);
    setEnEdition(rang);
    setBrouillon(lignes[rang] ?? vide(colonnes));
  };

  const annulerEdition = () => {
    setEnEdition(null);
    setBrouillon(vide(colonnes));
  };

  // Une ligne vidée ou inchangée : on referme sans rien demander au serveur.
  const enregistrerEdition = async () => {
    if (enEdition === null) return;
    const avant = lignes[enEdition];
    const apres = nettoye(brouillon);
    if (!complet(apres) || apres.every((v, i) => v === avant?.[i])) {
      return annulerEdition();
    }
    if (await envoyer(lignes.map((l, i) => (i === enEdition ? apres : l))))
      annulerEdition();
  };

  const touches =
    (valider: () => void, annuler: () => void) =>
    (e: KeyboardEvent<HTMLInputElement>) => {
      // Consommée : la fenêtre qui porte ce champ n'enregistre pas en plus.
      if (e.key === "Enter") {
        e.preventDefault();
        valider();
      }
      if (e.key === "Escape") annuler();
    };

  return (
    <Stack gap={4}>
      {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}
      {/* Le libellé au-dessus de la liste, comme celui d'un champ. */}
      <Text size="sm" fw={500}>
        {titre}
      </Text>
      <ListItems
        maxRows={5}
        isEmpty={lignes.length === 0}
        emptyIcon={emptyIcon}
        emptyText={emptyText}
        add={{
          input: (
            <>
              <ChampsLigne
                colonnes={colonnes}
                valeur={nouveau}
                onChange={setNouveau}
                onKeyDown={touches(
                  () => void ajouter(),
                  () => setNouveau(vide(colonnes)),
                )}
                onPaste={decouper ? coller : undefined}
                disabled={busy}
              />
              {/* Au bout, la touche qui valide : Entrée ajoute. Elle se clique
                  aussi, pour qui préfère la souris. */}
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={() => void ajouter()}
                disabled={busy}
                style={{ flexShrink: 0, opacity: 0.5 }}
                aria-label={libelleAjout}
              >
                <IconCornerDownLeft size={ENTER_SIZE} />
              </ActionIcon>
            </>
          ),
        }}
      >
        {lignes.map((ligne, rang) => (
          <ListItems.Row
            key={`${ligne[0]}-${rang}`}
            actions={[
              {
                label: "Modifier",
                icon: IconPencil,
                onClick: () => editer(rang),
              },
              {
                label: "Supprimer",
                icon: IconTrash,
                onClick: () => setASupprimer(rang),
                danger: true,
              },
            ]}
          >
            {enEdition === rang ? (
              <div
                ref={ligneEditee}
                style={{
                  display: "flex",
                  gap: "var(--mantine-spacing-xs)",
                  flex: 1,
                  minWidth: 0,
                }}
                onBlur={(e) => {
                  if (
                    !ligneEditee.current?.contains(
                      e.relatedTarget as Node | null,
                    )
                  ) {
                    void enregistrerEdition();
                  }
                }}
              >
                <ChampsLigne
                  colonnes={colonnes}
                  valeur={brouillon}
                  onChange={setBrouillon}
                  onKeyDown={touches(
                    () => void enregistrerEdition(),
                    annulerEdition,
                  )}
                  disabled={busy}
                  autoFocus
                />
              </div>
            ) : (
              <UnstyledButton
                onClick={() => editer(rang)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  gap: "var(--mantine-spacing-xs)",
                }}
              >
                {colonnes.map((colonne, i) => (
                  <Text
                    key={colonne.label}
                    size="sm"
                    c={i === 0 ? "dimmed" : undefined}
                    truncate
                    style={styleColonne(colonne)}
                  >
                    {ligne[i]}
                  </Text>
                ))}
              </UnstyledButton>
            )}
          </ListItems.Row>
        ))}
      </ListItems>

      <DeleteConfirmModal
        opened={aSupprimer !== null}
        onClose={() => setASupprimer(null)}
        onConfirm={async () => {
          if (aSupprimer !== null)
            await envoyer(lignes.filter((_, i) => i !== aSupprimer));
          setASupprimer(null);
        }}
        title={titreSuppression}
        message={
          <>
            Voulez-vous vraiment supprimer « {lignes[aSupprimer ?? -1]?.[0]} » ?
            Cette action est irréversible.
          </>
        }
      />
    </Stack>
  );
}

const COLONNES_MODELES: Colonne[] = [
  {
    label: "Identifiant",
    maxLength: ASSET_MODEL_MAX,
    largeur: LARGEUR_PREMIERE,
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getAssetSettings()
      .then(setReglages)
      .catch((e) => setError(messageErreur(e)));
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
      {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}
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
        emptyText="Aucun modèle pour le moment"
        libelleAjout="Ajouter le modèle"
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
        emptyText="Aucun VLAN pour le moment"
        libelleAjout="Ajouter le VLAN"
        titreSuppression="Supprimer le VLAN"
        decouper={decouperVlan}
      />
    </Stack>
  );
}
