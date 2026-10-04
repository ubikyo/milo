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
import { RED, defaultMilestoneColor } from "../../themes/colors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import LabelColorPicker from "../ui/LabelColorPicker";
import { useLabelColors } from "../ui/LabelChip";
import AddButton from "../ui/AddButton";
import {
  ROUNDING,
  ROW_INSET,
  NAME_INSET,
  INPUT_STYLE,
  nameFieldStyle,
  rowStyle,
} from "../ui/LignesDuTiroir";
import PointMenu, { menuPosition, type PointMenuPosition } from "../ui/PointMenu";
import { MilestoneLabels, milestoneMarks } from "./milestoneMarks";
import { errorMessage, notifyError } from "../../lib/errors";
import { DEFAULT_LABEL_COLOR } from "@milo/shared";
import type { Milestone, MilestoneType } from "@milo/shared";
import CloseButton from "../ui/BoutonFermer";

/** Un jalon en cours de saisie : la valeur peut être vidée pendant la frappe. */
interface InputEntry {
  key: number;
  value: number | "";
  label: string;
  /** La couleur de la tranche que le jalon ferme. */
  color: string;
  /** Le jalon de fin, à 100 % : toujours là, ni déplaçable ni supprimable. */
  fixed?: boolean;
}

/** La valeur du jalon de fin. */
const END = 100;

interface MilestonesModalProps {
  /** Le type dont on règle les jalons ; « null » ferme la fenêtre. */
  type: MilestoneType | null;
  onClose: () => void;
  onSave: (milestones: Milestone[]) => Promise<unknown>;
}

/** L'air ajouté à gauche de la pastille de couleur d'un jalon. */
const COLOR_GAP = 3;
/** L'air entre le pourcentage et le libellé. */
const LABEL_GAP = 4;
/** L'air entre la pastille et le pourcentage. */
const PERCENT_GAP = 10;

// Largeur du pourcentage : de quoi écrire « 100 % » dans un champ.
const PERCENT_WIDTH = 54;

interface PercentageFieldProps {
  value: number | "";
  onChange: (value: number | "") => void;
  onBlur?: () => void;
  label: string;
}

// Les autres jalons s'arrêtent avant la fin : 100 % est déjà pris.
const MAX_JALON = END - 1;

/** Le pourcentage d'un jalon : un champ « xs » de la ligne, comme une largeur de colonne. */
function PercentageField({
  value,
  onChange,
  onBlur,
  label,
}: PercentageFieldProps) {
  const [entered, setEntered] = useState(false);
  return (
    <NumberInput
      value={value}
      onChange={(v) => onChange(v === "" ? "" : Number(v))}
      onFocus={() => setEntered(true)}
      onBlur={() => {
        setEntered(false);
        onBlur?.();
      }}
      min={0}
      max={MAX_JALON}
      clampBehavior="strict"
      allowDecimal={false}
      suffix="%"
      hideControls
      size="xs"
      radius={ROUNDING}
      w={PERCENT_WIDTH}
      style={{ flexShrink: 0 }}
      // Le corps du libellé, à droite : un champ « xs » a la hauteur des
      // autres, mais un texte plus petit.
      styles={{
        input: { fontSize: "var(--mantine-font-size-sm)", ...(entered ? INPUT_STYLE : null) },
      }}
      aria-label={label}
    />
  );
}

// Le jalon ajouté se pose à mi-chemin entre le dernier jalon et la fin : son
// pourcentage se règle ensuite sur sa ligne.
const halfway = (list: InputEntry[]) => {
  const last = list
    .filter((s) => !s.fixed)
    .reduce((max, s) => Math.max(max, Number(s.value) || 0), 0);
  return Math.min(MAX_JALON, Math.round((last + END) / 2));
};

let nextKey = 0;
const toInput = (m: Milestone): InputEntry => ({
  key: nextKey++,
  value: m.value,
  label: m.label,
  color: m.color ?? defaultMilestoneColor(m.value),
});

/**
 * La liste reçue, avec son jalon de fin : repris s'il a été enregistré avec
 * un libellé, ajouté sans libellé sinon. Il ferme toujours la liste.
 */
const withEnd = (milestones: Milestone[]): InputEntry[] => {
  const end = milestones.find((m) => m.value === END);
  return [
    ...milestones.filter((m) => m.value !== END).map(toInput),
    { ...toInput(end ?? { value: END, label: "" }), fixed: true },
  ];
};

/**
 * Le fond de l'aperçu, par tranches : de 0 au premier jalon, puis de jalon
 * en jalon, chaque tranche prend la couleur du jalon qui la ferme — celle
 * qu'aura la barre d'un projet dont la progression y tombe.
 */
const bands = (bounds: { value: number; color: string }[]): string => {
  let start = 0;
  const stops = bounds.map(({ value, color }) => {
    const colorStop = `${color} ${start}% ${value}%`;
    start = value;
    return colorStop;
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
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
  const [inputs, setInputs] = useState<InputEntry[]>([]);
  const [saving, setSaving] = useState(false);
  // Le champ qui a le focus : il prend le fond de la fenêtre.
  const [input, setInput] = useState<number | null>(null);
  // Le jalon qu'on vient d'ajouter : son libellé prend le focus.
  const [toName, setToName] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ key: number; position: PointMenuPosition } | null>(null);
  const colors = useLabelColors();

  useEffect(() => {
    if (!type) return;
    const list = withEnd(type.milestones);
    setInputs(list);
    setInput(null);
    setToName(null);
  }, [type]);

  const updateStatement = (key: number, patch: Partial<InputEntry>) =>
    setInputs((list) =>
      list.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    );

  // Les jalons se rangent dans l'ordre du curseur : après un ajout, et quand
  // on quitte le pourcentage d'une ligne — pas pendant la frappe, où la ligne
  // sauterait sous le curseur.
  const sortBy = () =>
    setInputs((list) =>
      [...list].sort(
        (a, b) => (Number(a.value) || 0) - (Number(b.value) || 0),
      ),
    );

  // Le libellé est facultatif : la couleur suffit. Le jalon se range à sa
  // place, et son libellé prend le focus.
  const add = () => {
    const newValue = toInput({
      value: halfway(inputs),
      label: "",
      color: DEFAULT_LABEL_COLOR,
    });
    setInputs(
      [...inputs, newValue].sort((a, b) => (Number(a.value) || 0) - (Number(b.value) || 0)),
    );
    setToName(newValue.key);
  };

  // Le libellé est facultatif : un jalon sans libellé colore sa tranche mais
  // ne s'écrit pas sous le curseur. Seule la valeur est demandée.
  const validEntries = inputs
    .filter((s) => s.value !== "")
    .map((s) => ({
      value: Number(s.value),
      label: s.label.trim(),
      color: s.color,
    }))
    .sort((a, b) => a.value - b.value);
  const values = validEntries.map((s) => s.value);
  const duplicateOf = values.some((v, i) => values.indexOf(v) !== i);
  const isIncomplete = validEntries.length !== inputs.length;

  const bounds = validEntries.map((s) => ({
    value: s.value,
    color: colors(s.color).backgroundColor,
  }));

  const save = async () => {
    setSaving(true);
    try {
      await onSave(validEntries);
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
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
            {inputs.map((s, rank) => (
              <Group
                key={s.key}
                gap="sm"
                wrap="nowrap"
                onContextMenu={(e) => {
                  if (s.fixed) return;
                  setMenu({ key: s.key, position: menuPosition(e) });
                }}
                style={{
                  ...rowStyle(rank, inputs.length, false),
                  // La pastille de couleur, en tête, s'écarte un peu plus du bord.
                  paddingLeft: ROW_INSET + COLOR_GAP,
                }}
              >
                {/* La pastille et le pourcentage se suivent de près : le champ
                    du pourcentage porte déjà son propre retrait. */}
                <Group gap={PERCENT_GAP} wrap="nowrap" style={{ flexShrink: 0 }}>
                  <LabelColorPicker
                    color={s.color}
                    onChange={(color) => updateStatement(s.key, { color })}
                    label={s.label || `le jalon à ${s.value}%`}
                  />

                  {s.fixed ? (
                    // La fin ne se déplace pas : sa valeur se lit, sans champ.
                    <Text
                      size="sm"
                      w={PERCENT_WIDTH}
                      pl={NAME_INSET}
                      style={{ flexShrink: 0 }}
                    >
                      {END}%
                    </Text>
                  ) : (
                    <PercentageField
                      value={s.value}
                      onChange={(value) => updateStatement(s.key, { value })}
                      onBlur={sortBy}
                      label={`Pourcentage de ${s.label || "ce jalon"}`}
                    />
                  )}
                </Group>

                <TextInput
                  size="sm"
                  radius={ROUNDING}
                  // Plus près du pourcentage que l'écart de la ligne.
                  style={{
                    flex: 1,
                    minWidth: 0,
                    marginLeft: `calc(${LABEL_GAP}px - var(--mantine-spacing-sm))`,
                  }}
                  styles={{ input: nameFieldStyle(input === s.key) }}
                  placeholder="Libellé (facultatif)"
                  aria-label="Libellé du jalon"
                  value={s.label}
                  onChange={(e) => updateStatement(s.key, { label: e.currentTarget.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
                  }}
                  autoFocus={toName === s.key}
                  onFocus={() => setInput(s.key)}
                  onBlur={() => {
                    setInput(null);
                    setToName(null);
                  }}
                />
              </Group>
            ))}
          </Stack>
          {/* Au plus près de la liste qu'il allonge. */}
          <AddButton label="Ajouter un jalon" onClick={add} mt={4} />
        </div>

        {menu && (
          <PointMenu position={menu.position} onClose={() => setMenu(null)}>
            <Menu.Item
              color={RED}
              leftSection={<IconTrash size={16} />}
              onClick={() => {
                setInputs((list) => list.filter((x) => x.key !== menu.key));
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
            value={END}
            min={0}
            max={END}
            marks={milestoneMarks(validEntries)}
            disabled
            styles={{
              bar: { background: bands(bounds) },
              thumb: { display: "none" },
            }}
            // 30px entre la liste et l'aperçu : les 16 de l'écart de la pile
            // (« md »), plus ces 14.
            mt={14}
          />
          <MilestoneLabels milestones={validEntries} />
        </div>

        {duplicateOf && (
          <Text size="xs" c={RED}>
            Deux jalons ne peuvent pas porter la même valeur.
          </Text>
        )}

        <Group justify="flex-end" mt={MODAL_PADDING - 16}>
          <CloseButton onClick={onClose} />
          <Button
            color="teal"
            onClick={save}
            loading={saving}
            disabled={duplicateOf || isIncomplete}
          >
            Enregistrer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
