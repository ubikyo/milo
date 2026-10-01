import {
  Button,
  Group,
  Modal,
  NumberInput,
  Slider,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { IconFlag, IconPencil, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { RED, couleurJalonParDefaut } from "../../themes/colors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import ErrorAlert from "../ui/ErrorAlert";
import LabelColorPicker from "../ui/LabelColorPicker";
import { useLabelColors } from "../ui/LabelChip";
import ListItems from "../ui/ListItems";
import { MilestoneLabels, marquesJalons } from "./milestoneMarks";
import { messageErreur } from "../../lib/errors";
import { DEFAULT_LABEL_COLOR } from "@milo/shared";
import type { Milestone, MilestoneType } from "@milo/shared";
import BoutonFermer from "../ui/BoutonFermer";

/** Un jalon en cours de saisie : la valeur peut être vidée pendant la frappe. */
interface Saisie {
  cle: number;
  value: number | "";
  label: string;
  /** La couleur de la tranche que le jalon ferme. */
  color: string;
  /** Le jalon de fin, à 100 % : toujours là, ni déplaçable ni supprimable. */
  fixe?: boolean;
}

/** La valeur du jalon de fin. */
const FIN = 100;

interface MilestonesModalProps {
  /** Le type dont on règle les jalons ; « null » ferme la fenêtre. */
  type: MilestoneType | null;
  onClose: () => void;
  onSave: (milestones: Milestone[]) => Promise<unknown>;
}

// Hauteur d'une ligne de jalon et de ses champs : celles des étiquettes
// (LabelsManager), dont la liste reprend la présentation.
const ROW_HEIGHT_JALON = 40;
const FIELD_HEIGHT = 22;

// Largeur du pourcentage : de quoi écrire « 100 % », à la place qu'occupe la
// pastille de couleur d'une étiquette.
const LARGEUR_POURCENTAGE = 52;

interface ChampPourcentageProps {
  value: number | "";
  onChange: (value: number | "") => void;
  onBlur?: () => void;
  label: string;
}

// Les autres jalons s'arrêtent avant la fin : 100 % est déjà pris.
const MAX_JALON = FIN - 1;

/** Le pourcentage d'un jalon, sans cadre : la liste en est le cadre. */
function ChampPourcentage({
  value,
  onChange,
  onBlur,
  label,
}: ChampPourcentageProps) {
  return (
    <NumberInput
      value={value}
      onChange={(v) => onChange(v === "" ? "" : Number(v))}
      onBlur={onBlur}
      min={0}
      max={MAX_JALON}
      clampBehavior="strict"
      allowDecimal={false}
      suffix="%"
      hideControls
      variant="unstyled"
      size="sm"
      w={LARGEUR_POURCENTAGE}
      style={{ flexShrink: 0 }}
      styles={{
        input: {
          height: FIELD_HEIGHT,
          minHeight: FIELD_HEIGHT,
          lineHeight: `${FIELD_HEIGHT}px`,
        },
      }}
      aria-label={label}
    />
  );
}

// La ligne d'ajout porte un pourcentage et un libellé, comme une étiquette
// porte une couleur et un nom. Le pourcentage proposé est à mi-chemin entre
// le dernier jalon et la fin.
const aMiChemin = (liste: Saisie[]) => {
  const dernier = liste
    .filter((s) => !s.fixe)
    .reduce((max, s) => Math.max(max, Number(s.value) || 0), 0);
  return Math.min(MAX_JALON, Math.round((dernier + FIN) / 2));
};

let prochaineCle = 0;
const versSaisie = (m: Milestone): Saisie => ({
  cle: prochaineCle++,
  value: m.value,
  label: m.label,
  color: m.color ?? couleurJalonParDefaut(m.value),
});

/**
 * La liste reçue, avec son jalon de fin : repris s'il a été enregistré avec
 * un libellé, ajouté sans libellé sinon. Il ferme toujours la liste.
 */
const avecFin = (jalons: Milestone[]): Saisie[] => {
  const fin = jalons.find((m) => m.value === FIN);
  return [
    ...jalons.filter((m) => m.value !== FIN).map(versSaisie),
    { ...versSaisie(fin ?? { value: FIN, label: "" }), fixe: true },
  ];
};

/**
 * Le fond de l'aperçu, par tranches : de 0 au premier jalon, puis de jalon
 * en jalon, chaque tranche prend la couleur du jalon qui la ferme — celle
 * qu'aura la barre d'un projet dont la progression y tombe.
 */
const tranches = (bornes: { value: number; couleur: string }[]): string => {
  let debut = 0;
  const arrets = bornes.map(({ value, couleur }) => {
    const arret = `${couleur} ${debut}% ${value}%`;
    debut = value;
    return arret;
  });
  return `linear-gradient(to right, ${arrets.join(", ")})`;
};

/**
 * Les jalons d'un type : ceux que ses projets montrent sous leur curseur
 * de progression. On en ajoute, on en retire, ou on n'en garde aucun ; l'aperçu
 * montre le curseur tel que le verra un projet.
 */
export default function MilestonesModal({
  type,
  onClose,
  onSave,
}: MilestonesModalProps) {
  const [saisies, setSaisies] = useState<Saisie[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // La ligne dont le libellé est en cours de modification.
  const [enEdition, setEnEdition] = useState<number | null>(null);
  const [nouveauLibelle, setNouveauLibelle] = useState("");
  const [nouvelleValeur, setNouvelleValeur] = useState<number | "">(50);
  const [nouvelleCouleur, setNouvelleCouleur] = useState(DEFAULT_LABEL_COLOR);
  const couleurs = useLabelColors();

  useEffect(() => {
    if (!type) return;
    const liste = avecFin(type.milestones);
    setSaisies(liste);
    setEnEdition(null);
    setNouveauLibelle("");
    setNouvelleValeur(aMiChemin(liste));
    setNouvelleCouleur(DEFAULT_LABEL_COLOR);
    setError(null);
  }, [type]);

  const modifier = (cle: number, patch: Partial<Saisie>) =>
    setSaisies((liste) =>
      liste.map((s) => (s.cle === cle ? { ...s, ...patch } : s)),
    );

  // Les jalons se rangent dans l'ordre du curseur : après un ajout, et quand
  // on quitte le pourcentage d'une ligne — pas pendant la frappe, où la ligne
  // sauterait sous le curseur.
  const trier = () =>
    setSaisies((liste) =>
      [...liste].sort(
        (a, b) => (Number(a.value) || 0) - (Number(b.value) || 0),
      ),
    );

  const ajouter = () => {
    // Le libellé est facultatif : la valeur et la couleur suffisent.
    if (nouvelleValeur === "") return;
    const liste = [
      ...saisies,
      versSaisie({
        value: nouvelleValeur,
        label: nouveauLibelle.trim(),
        color: nouvelleCouleur,
      }),
    ].sort((a, b) => (Number(a.value) || 0) - (Number(b.value) || 0));
    setSaisies(liste);
    setNouveauLibelle("");
    setNouvelleValeur(aMiChemin(liste));
  };

  // Le libellé est facultatif : un jalon sans libellé colore sa tranche mais
  // ne s'écrit pas sous le curseur. Seule la valeur est demandée.
  const valides = saisies
    .filter((s) => s.value !== "")
    .map((s) => ({
      value: Number(s.value),
      label: s.label.trim(),
      color: s.color,
    }))
    .sort((a, b) => a.value - b.value);
  const valeurs = valides.map((s) => s.value);
  const doublon = valeurs.some((v, i) => valeurs.indexOf(v) !== i);
  const incomplet = valides.length !== saisies.length;

  const bornes = valides.map((s) => ({
    value: s.value,
    couleur: couleurs(s.color).backgroundColor,
  }));

  const enregistrer = async () => {
    setError(null);
    setSaving(true);
    try {
      await onSave(valides);
      onClose();
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={type !== null}
      onClose={onClose}
      title={`Jalons — ${type?.name ?? ""}`}
      centered
      size="lg"
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      <Stack gap="md">
        {error && (
          <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>
        )}

        {/* La même liste que les étiquettes d'un tableau (LabelsManager) :
            le pourcentage tient la place de la couleur, le libellé se
            modifie d'un clic, la dernière ligne ajoute. */}
        <ListItems
          // Cinq jalons visibles : au-delà, la liste défile.
          maxRows={5}
          rowHeight={ROW_HEIGHT_JALON}
          isEmpty={saisies.length === 0}
          emptyIcon={IconFlag}
          emptyText="Aucun jalon : le curseur des projets de cette catégorie restera nu"
          add={{
            placeholder: "Nouveau jalon (libellé facultatif)",
            value: nouveauLibelle,
            onChange: setNouveauLibelle,
            onSubmit: ajouter,
            onCancel: () => setNouveauLibelle(""),
            // La couleur puis le pourcentage, dans les colonnes des lignes
            // au-dessus.
            section: (
              <>
                <LabelColorPicker
                  color={nouvelleCouleur}
                  onChange={setNouvelleCouleur}
                  label="le nouveau jalon"
                />
                <ChampPourcentage
                  value={nouvelleValeur}
                  onChange={setNouvelleValeur}
                  label="Pourcentage du nouveau jalon"
                />
              </>
            ),
          }}
        >
          {saisies.map((s) => (
            <ListItems.Row
              key={s.cle}
              height={ROW_HEIGHT_JALON}
              // La fin ne se supprime pas : son menu n'a que « Modifier ».
              actions={[
                {
                  label: "Modifier",
                  icon: IconPencil,
                  onClick: () => setEnEdition(s.cle),
                },
                ...(s.fixe
                  ? []
                  : [
                      {
                        label: "Retirer",
                        icon: IconTrash,
                        onClick: () =>
                          setSaisies((liste) =>
                            liste.filter((x) => x.cle !== s.cle),
                          ),
                        danger: true,
                      },
                    ]),
              ]}
            >
              <>
                <LabelColorPicker
                  color={s.color}
                  onChange={(color) => modifier(s.cle, { color })}
                  label={s.label || `le jalon à ${s.value}%`}
                />

                {s.fixe ? (
                  // La fin ne se déplace pas : sa valeur se lit, sans champ.
                  <Text
                    size="sm"
                    w={LARGEUR_POURCENTAGE}
                    style={{ flexShrink: 0 }}
                  >
                    {FIN}%
                  </Text>
                ) : (
                  <ChampPourcentage
                    value={s.value}
                    onChange={(value) => modifier(s.cle, { value })}
                    onBlur={trier}
                    label={`Pourcentage de ${s.label || "ce jalon"}`}
                  />
                )}

                {enEdition === s.cle ? (
                  <TextInput
                    value={s.label}
                    onChange={(e) =>
                      modifier(s.cle, { label: e.currentTarget.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Escape")
                        setEnEdition(null);
                    }}
                    onBlur={() => setEnEdition(null)}
                    variant="unstyled"
                    size="sm"
                    style={{ flex: 1, minWidth: 0 }}
                    // Le champ occupe exactement la place du libellé qu'il
                    // remplace : la ligne ne bouge pas d'un pixel.
                    styles={{
                      input: {
                        height: FIELD_HEIGHT,
                        minHeight: FIELD_HEIGHT,
                        lineHeight: `${FIELD_HEIGHT}px`,
                      },
                    }}
                    placeholder="Libellé (facultatif)"
                    autoFocus
                    aria-label="Libellé du jalon"
                  />
                ) : (
                  <UnstyledButton
                    onClick={() => setEnEdition(s.cle)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      alignItems: "center",
                      height: FIELD_HEIGHT,
                    }}
                  >
                    <Text
                      size="sm"
                      truncate
                      c={s.label.trim() ? undefined : "dimmed"}
                    >
                      {s.label.trim() || "Libellé (facultatif)"}
                    </Text>
                  </UnstyledButton>
                )}
              </>
            </ListItems.Row>
          ))}
        </ListItems>

        {/* Le curseur tel qu'un projet le montrera, sans y toucher : rempli
            jusqu'au bout, chaque tranche de la couleur de son jalon. */}
        <div>
          <Slider
            value={FIN}
            min={0}
            max={FIN}
            marks={marquesJalons(valides)}
            disabled
            styles={{
              bar: { background: tranches(bornes) },
              thumb: { display: "none" },
            }}
            // 30px entre la liste et l'aperçu : les 16 de l'écart de la pile
            // (« md »), plus ces 14.
            mt={14}
          />
          <MilestoneLabels jalons={valides} />
        </div>

        {doublon && (
          <Text size="xs" c={RED}>
            Deux jalons ne peuvent pas porter la même valeur.
          </Text>
        )}
        {incomplet && (
          <Text size="xs" c="dimmed">
            Chaque jalon demande une valeur.
          </Text>
        )}

        <Group justify="flex-end" mt={MODAL_PADDING - 16}>
          <BoutonFermer onClick={onClose} />
          <Button
            color="teal"
            onClick={enregistrer}
            loading={saving}
            disabled={doublon || incomplet}
          >
            Enregistrer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
