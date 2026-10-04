import {
  Button,
  Group,
  Menu,
  Modal,
  NumberInput,
  Slider,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { RED, couleurJalonParDefaut } from "../../themes/colors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import LabelColorPicker from "../ui/LabelColorPicker";
import { useLabelColors } from "../ui/LabelChip";
import AddButton from "../ui/AddButton";
import {
  ARRONDI,
  RETRAIT_LIGNE,
  RETRAIT_NOM,
  STYLE_SAISIE,
  styleChampNom,
  styleLigne,
} from "../ui/LignesDuTiroir";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "../ui/PointMenu";
import { MilestoneLabels, marquesJalons } from "./milestoneMarks";
import { messageErreur, notifierErreur } from "../../lib/errors";
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

/** L'air ajouté à gauche de la pastille de couleur d'un jalon. */
const ECART_COULEUR = 3;
/** L'air entre le pourcentage et le libellé. */
const ECART_LIBELLE = 4;
/** L'air entre la pastille et le pourcentage. */
const ECART_POURCENTAGE = 10;

// Largeur du pourcentage : de quoi écrire « 100 % » dans un champ.
const LARGEUR_POURCENTAGE = 54;

interface ChampPourcentageProps {
  value: number | "";
  onChange: (value: number | "") => void;
  onBlur?: () => void;
  label: string;
}

// Les autres jalons s'arrêtent avant la fin : 100 % est déjà pris.
const MAX_JALON = FIN - 1;

/** Le pourcentage d'un jalon : un champ « xs » de la ligne, comme une largeur de colonne. */
function ChampPourcentage({
  value,
  onChange,
  onBlur,
  label,
}: ChampPourcentageProps) {
  const [saisi, setSaisi] = useState(false);
  return (
    <NumberInput
      value={value}
      onChange={(v) => onChange(v === "" ? "" : Number(v))}
      onFocus={() => setSaisi(true)}
      onBlur={() => {
        setSaisi(false);
        onBlur?.();
      }}
      min={0}
      max={MAX_JALON}
      clampBehavior="strict"
      allowDecimal={false}
      suffix="%"
      hideControls
      size="xs"
      radius={ARRONDI}
      w={LARGEUR_POURCENTAGE}
      style={{ flexShrink: 0 }}
      // Le corps du libellé, à droite : un champ « xs » a la hauteur des
      // autres, mais un texte plus petit.
      styles={{
        input: { fontSize: "var(--mantine-font-size-sm)", ...(saisi ? STYLE_SAISIE : null) },
      }}
      aria-label={label}
    />
  );
}

// Le jalon ajouté se pose à mi-chemin entre le dernier jalon et la fin : son
// pourcentage se règle ensuite sur sa ligne.
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
  const [saving, setSaving] = useState(false);
  // Le champ qui a le focus : il prend le fond de la fenêtre.
  const [saisie, setSaisie] = useState<number | null>(null);
  // Le jalon qu'on vient d'ajouter : son libellé prend le focus.
  const [aNommer, setANommer] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ cle: number; position: PointMenuPosition } | null>(null);
  const couleurs = useLabelColors();

  useEffect(() => {
    if (!type) return;
    const liste = avecFin(type.milestones);
    setSaisies(liste);
    setSaisie(null);
    setANommer(null);
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

  // Le libellé est facultatif : la couleur suffit. Le jalon se range à sa
  // place, et son libellé prend le focus.
  const ajouter = () => {
    const nouveau = versSaisie({
      value: aMiChemin(saisies),
      label: "",
      color: DEFAULT_LABEL_COLOR,
    });
    setSaisies(
      [...saisies, nouveau].sort((a, b) => (Number(a.value) || 0) - (Number(b.value) || 0)),
    );
    setANommer(nouveau.cle);
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
    setSaving(true);
    try {
      await onSave(valides);
      onClose();
    } catch (e) {
      notifierErreur(messageErreur(e));
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

        {/* Les jalons se présentent comme les listes des tiroirs
            (ChampsColonnes) : une ligne par jalon — sa couleur, son
            pourcentage, son libellé à même la ligne. Le clic droit le retire
            — la fin, à 100 %, reste ; « Ajouter » en pose un à mi-chemin. */}
        <div>
          <Stack gap={1}>
            {saisies.map((s, rang) => (
              <Group
                key={s.cle}
                gap="sm"
                wrap="nowrap"
                onContextMenu={(e) => {
                  if (s.fixe) return;
                  setMenu({ cle: s.cle, position: positionDuMenu(e) });
                }}
                style={{
                  ...styleLigne(rang, saisies.length, false),
                  // La pastille de couleur, en tête, s'écarte un peu plus du bord.
                  paddingLeft: RETRAIT_LIGNE + ECART_COULEUR,
                }}
              >
                {/* La pastille et le pourcentage se suivent de près : le champ
                    du pourcentage porte déjà son propre retrait. */}
                <Group gap={ECART_POURCENTAGE} wrap="nowrap" style={{ flexShrink: 0 }}>
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
                      pl={RETRAIT_NOM}
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
                </Group>

                <TextInput
                  size="sm"
                  radius={ARRONDI}
                  // Plus près du pourcentage que l'écart de la ligne.
                  style={{
                    flex: 1,
                    minWidth: 0,
                    marginLeft: `calc(${ECART_LIBELLE}px - var(--mantine-spacing-sm))`,
                  }}
                  styles={{ input: styleChampNom(saisie === s.cle) }}
                  placeholder="Libellé (facultatif)"
                  aria-label="Libellé du jalon"
                  value={s.label}
                  onChange={(e) => modifier(s.cle, { label: e.currentTarget.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
                  }}
                  autoFocus={aNommer === s.cle}
                  onFocus={() => setSaisie(s.cle)}
                  onBlur={() => {
                    setSaisie(null);
                    setANommer(null);
                  }}
                />
              </Group>
            ))}
          </Stack>
          {/* Au plus près de la liste qu'il allonge. */}
          <AddButton label="Ajouter un jalon" onClick={ajouter} mt={4} />
        </div>

        {menu && (
          <PointMenu position={menu.position} onClose={() => setMenu(null)}>
            <Menu.Item
              color={RED}
              leftSection={<IconTrash size={16} />}
              onClick={() => {
                setSaisies((liste) => liste.filter((x) => x.cle !== menu.cle));
                setMenu(null);
              }}
            >
              Retirer
            </Menu.Item>
          </PointMenu>
        )}

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
