import { ActionIcon, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconCornerDownLeft, IconDeviceLaptop, IconPencil, IconTrash } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { ASSET_MODEL_MAX } from "@milo/shared";
import type { AssetModel } from "@milo/shared";
import { api } from "../../api";
import { messageErreur } from "../../lib/errors";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import ErrorAlert from "../ui/ErrorAlert";
import ListItems from "../ui/ListItems";
import type { KeyboardEvent } from "react";

// La section « Assets » du Paramétrage, et sa liste « Modèles » : le nom
// commercial de l'identifiant qu'un poste déclare — Apple ne remonte que
// « Mac14,6 ». La liste est celle des sociétés (ListItems, comme
// LookupManager), à deux champs par ligne : l'identifiant, puis le nom.
//
// Tout se passe sur la ligne : cliquer un modèle l'édite sur place (Entrée
// enregistre, Échap annule), le clic droit ouvre « Modifier » et
// « Supprimer ». La ligne d'ajout garde le focus : on enchaîne les saisies.

/** La largeur de la colonne des identifiants. */
const LARGEUR_IDENTIFIANT = 200;

/** Hauteur d'un champ d'édition : celle du texte qu'il remplace (LookupManager). */
const FIELD_HEIGHT = 22;

const STYLES_CHAMP = {
  input: { height: FIELD_HEIGHT, minHeight: FIELD_HEIGHT, lineHeight: `${FIELD_HEIGHT}px` },
};

/** Taille du symbole Entrée au bout de la ligne d'ajout (ListItems). */
const ENTER_SIZE = 14;

const VIDE: AssetModel = { identifier: "", name: "" };

/** Les deux champs d'un modèle, côte à côte : à l'ajout comme à l'édition. */
function ChampsModele({
  valeur,
  onChange,
  onKeyDown,
  onBlur,
  disabled,
  autoFocus,
}: {
  valeur: AssetModel;
  onChange: (valeur: AssetModel) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  disabled: boolean;
  autoFocus?: boolean;
}) {
  return (
    <>
      <TextInput
        placeholder="Identifiant"
        value={valeur.identifier}
        onChange={(e) => onChange({ ...valeur, identifier: e.currentTarget.value })}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        maxLength={ASSET_MODEL_MAX}
        variant="unstyled"
        size="sm"
        styles={STYLES_CHAMP}
        style={{ width: LARGEUR_IDENTIFIANT, flexShrink: 0 }}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label="Identifiant"
      />
      <TextInput
        placeholder="Nom commercial"
        value={valeur.name}
        onChange={(e) => onChange({ ...valeur, name: e.currentTarget.value })}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        maxLength={ASSET_MODEL_MAX}
        variant="unstyled"
        size="sm"
        styles={STYLES_CHAMP}
        style={{ flex: 1, minWidth: 0 }}
        disabled={disabled}
        aria-label="Nom commercial"
      />
    </>
  );
}

const complet = (m: AssetModel) => Boolean(m.identifier.trim() && m.name.trim());
const nettoye = (m: AssetModel): AssetModel => ({
  identifier: m.identifier.trim(),
  name: m.name.trim(),
});

export default function AssetsTab() {
  const [modeles, setModeles] = useState<AssetModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nouveau, setNouveau] = useState<AssetModel>(VIDE);
  // Le rang du modèle en cours d'édition, et ses champs.
  const [enEdition, setEnEdition] = useState<number | null>(null);
  const [brouillon, setBrouillon] = useState<AssetModel>(VIDE);
  const [aSupprimer, setASupprimer] = useState<number | null>(null);
  // Quitter un champ pour l'autre de la même ligne n'enregistre pas.
  const ligneEditee = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api
      .getAssetSettings()
      .then((r) => setModeles(r.models))
      .catch((e) => setError(messageErreur(e)));
  }, []);

  /** La table part entière : le serveur la remplace d'un coup. */
  const enregistrer = async (liste: AssetModel[]): Promise<boolean> => {
    setError(null);
    setBusy(true);
    try {
      setModeles((await api.updateAssetSettings({ models: liste })).models);
      return true;
    } catch (e) {
      setError(messageErreur(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const ajouter = async () => {
    if (!complet(nouveau)) return;
    if (await enregistrer([...modeles, nettoye(nouveau)])) setNouveau(VIDE);
  };

  const editer = (rang: number) => {
    setError(null);
    setEnEdition(rang);
    setBrouillon(modeles[rang] ?? VIDE);
  };

  const annulerEdition = () => {
    setEnEdition(null);
    setBrouillon(VIDE);
  };

  // Un modèle vidé ou inchangé : on referme sans rien demander au serveur.
  const enregistrerEdition = async () => {
    if (enEdition === null) return;
    const avant = modeles[enEdition];
    const apres = nettoye(brouillon);
    if (!complet(apres) || (apres.identifier === avant?.identifier && apres.name === avant?.name)) {
      return annulerEdition();
    }
    if (await enregistrer(modeles.map((m, i) => (i === enEdition ? apres : m)))) annulerEdition();
  };

  const touches =
    (valider: () => void, annuler: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
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
        Modèles
      </Text>
      <ListItems
        maxRows={10}
        isEmpty={modeles.length === 0}
        emptyIcon={IconDeviceLaptop}
        emptyText="Aucun modèle pour le moment"
        add={{
          input: (
            <>
              <ChampsModele
                valeur={nouveau}
                onChange={setNouveau}
                onKeyDown={touches(
                  () => void ajouter(),
                  () => setNouveau(VIDE),
                )}
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
                aria-label="Ajouter le modèle"
              >
                <IconCornerDownLeft size={ENTER_SIZE} />
              </ActionIcon>
            </>
          ),
        }}
      >
        {modeles.map((modele, rang) => (
          <ListItems.Row
            key={`${modele.identifier}-${rang}`}
            actions={[
              { label: "Modifier", icon: IconPencil, onClick: () => editer(rang) },
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
                style={{ display: "flex", gap: "var(--mantine-spacing-xs)", flex: 1, minWidth: 0 }}
                onBlur={(e) => {
                  if (!ligneEditee.current?.contains(e.relatedTarget as Node | null)) {
                    void enregistrerEdition();
                  }
                }}
              >
                <ChampsModele
                  valeur={brouillon}
                  onChange={setBrouillon}
                  onKeyDown={touches(() => void enregistrerEdition(), annulerEdition)}
                  disabled={busy}
                  autoFocus
                />
              </div>
            ) : (
              <UnstyledButton
                onClick={() => editer(rang)}
                style={{ flex: 1, minWidth: 0, display: "flex", gap: "var(--mantine-spacing-xs)" }}
              >
                <Text
                  size="sm"
                  c="dimmed"
                  w={LARGEUR_IDENTIFIANT}
                  truncate
                  style={{ flexShrink: 0 }}
                >
                  {modele.identifier}
                </Text>
                <Text size="sm" truncate>
                  {modele.name}
                </Text>
              </UnstyledButton>
            )}
          </ListItems.Row>
        ))}
      </ListItems>

      <DeleteConfirmModal
        opened={aSupprimer !== null}
        onClose={() => setASupprimer(null)}
        onConfirm={async () => {
          if (aSupprimer !== null) await enregistrer(modeles.filter((_, i) => i !== aSupprimer));
          setASupprimer(null);
        }}
        title="Supprimer le modèle"
        message={
          <>
            Voulez-vous vraiment supprimer « {modeles[aSupprimer ?? -1]?.identifier} » ? Cette
            action est irréversible.
          </>
        }
      />
    </Stack>
  );
}
