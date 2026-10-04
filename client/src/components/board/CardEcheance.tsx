import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Input,
  Select,
  Text,
} from "@mantine/core";
import { DatePickerInput, TimeInput } from "@mantine/dates";
import { IconChevronDown, IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";
import { FORMES_ECHEANCE, RAPPELS, RECURRENCES } from "@milo/shared";
import type { FormeEcheance, Rappel, Recurrence } from "@milo/shared";
import champs from "../../assets/styles/EcartField.module.css";
import classes from "../../assets/styles/CardEcheance.module.css";
import { ARRONDI, RETRAIT_NOM, styleLigne } from "../ui/LignesDuTiroir";
import {
  COULEUR_ECHEANCE,
  MOT_ECHEANCE,
  etatEcheance,
  sansHeure,
} from "../../lib/echeance";
import { largeurChamp, largeurTexte } from "../../lib/largeurChamp";
import { GREEN, RED, STRONG_TEXT } from "../../themes/colors";

/** L'échéance d'une carte, telle que la fiche la saisit. */
export interface Echeance {
  /** Une date seule, ou une période : elle s'enregistre avec la carte. */
  forme: FormeEcheance;
  /** Le début de la période, « AAAA-MM-JJ » ; vide pour une date seule. */
  debut: string;
  /** La fin, en ISO ; minuit à l'heure locale vaut « sans heure » (lib/echeance.ts). */
  fin: string;
  recurrence: Recurrence;
  rappel: Rappel;
}

export const ECHEANCE_VIDE: Echeance = {
  forme: "date",
  debut: "",
  fin: "",
  recurrence: "",
  rappel: "",
};

/** La largeur du statut : tous les badges la prennent, « Bientôt » comme « En retard ». */
const STATUT_L = 98;

// Les champs de date et d'heure ne prennent que leur largeur : le texte le plus
// long qu'ils montrent, à la taille des champs « xs » (12 px), et RETRAIT_CHAMP
// de part et d'autre. Ni bordure (CardEcheance.module.css) ni icône : Mantine
// masque l'horloge du champ d'heure.
const TAILLE_CHAMP = 12;

/** L'air de part et d'autre de la valeur, dans le champ. */
const RETRAIT_CHAMP = 5;

const largeurDe = (...textes: string[]): number =>
  Math.max(...textes.map((t) => largeurTexte(t, TAILLE_CHAMP))) +
  2 * RETRAIT_CHAMP;

/**
 * Un petit choix discret, comme le type de jalons à droite de la progression
 * d'un projet : sans cadre tant qu'on ne le survole pas, à la largeur de ce
 * qu'il montre.
 */
interface PetitChoixProps<T extends string> {
  data: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** Le nom écrit à gauche du choix ; à défaut, son libellé. */
  nom?: string;
  disabled?: boolean;
}

export function PetitChoix<T extends string>({
  data,
  value,
  onChange,
  label,
  nom = label,
  disabled,
}: PetitChoixProps<T>) {
  // Mantine refuse une valeur vide : « Jamais » et « Aucun » passent par une clé.
  const VIDE = "-";
  const choisi = data.find((d) => d.value === value)?.label ?? "";
  return (
    // Le nom à gauche, au contraste plein — blanc sur le sombre — : il se lit
    // d'abord, la valeur grise ensuite.
    <Group gap={4} wrap="nowrap" align="center">
      <Text span c={STRONG_TEXT} style={{ whiteSpace: "nowrap", fontSize: 11 }}>
        {nom}
      </Text>
      <Select
        data={data.map((d) => ({ value: d.value || VIDE, label: d.label }))}
        value={value || VIDE}
        onChange={(v) => onChange((v === VIDE || v === null ? "" : v) as T)}
        allowDeselect={false}
        size="xs"
        w={largeurChamp(choisi) + 14}
        withCheckIcon={false}
        rightSection={<IconChevronDown size={10} />}
        rightSectionWidth={14}
        comboboxProps={{
          width: 200,
          position: "bottom-end",
          withinPortal: true,
        }}
        aria-label={label}
        title={label}
        disabled={disabled}
        className={`${champs.champ} ${champs.unite}`}
      />
    </Group>
  );
}

/**
 * Un mot entre deux champs — « du 05/10 au 12/10 à 17:00 » : la ligne se lit
 * comme une phrase. Collé à ses voisins, l'écart de la ligne ne s'y applique
 * pas ; l'air vient du retrait des champs eux-mêmes.
 */
function Liaison({ mot }: { mot: string }) {
  return (
    <Text
      size="xs"
      c="dimmed"
      style={{
        flexShrink: 0,
        marginInline: "calc(5px - var(--mantine-spacing-xs))",
      }}
    >
      {mot}
    </Text>
  );
}

/** La date (« AAAA-MM-JJ ») et l'heure (« HH:mm », vide à minuit) d'une fin ISO. */
const decouper = (fin: string): { jour: string; heure: string } => {
  const d = dayjs(fin);
  if (!fin || !d.isValid()) return { jour: "", heure: "" };
  return {
    jour: d.format("YYYY-MM-DD"),
    heure: sansHeure(fin) ? "" : d.format("HH:mm"),
  };
};

const assembler = (jour: string, heure: string): string =>
  jour ? dayjs(`${jour} ${heure || "00:00"}`).toISOString() : "";

/**
 * L'échéance d'une carte, au-dessus de son titre. À droite de l'intitulé, sur
 * une ligne : la forme — « À partir du, jusqu'à » ou « Jusqu'à » seul —, la
 * récurrence et le rappel. Dessous, les dates : le début s'il y en a un, puis
 * le jour et l'heure de la fin. L'heure est facultative.
 */
interface CardEcheanceProps {
  value: Echeance;
  onChange: (value: Echeance) => void;
  onRemove: () => void;
  readOnly?: boolean;
  /**
   * Une date et son heure seulement, sans forme, récurrence ni rappel : celle
   * d'un ticket. La corbeille n'y paraît qu'une date posée.
   */
  simple?: boolean;
}

export default function CardEcheance({
  value,
  onChange,
  onRemove,
  readOnly,
  simple,
}: CardEcheanceProps) {
  const mode = value.forme;

  const { jour, heure } = decouper(value.fin);
  const etat = etatEcheance(value.fin);
  const changer = (modif: Partial<Echeance>) =>
    onChange({ ...value, ...modif });

  return (
    <div>
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        {simple ? (
          // Dans un bloc, comme Mantine pose le libellé d'un champ : sa ligne
          // prend alors la hauteur de celle du texte, et la ligne d'échéance
          // tombe au niveau du champ voisin — le statut d'une demande.
          <div>
            <Input.Label>Échéance</Input.Label>
          </div>
        ) : (
          <Input.Label>Échéance</Input.Label>
        )}
        {!simple && (
          <Group gap="sm" wrap="nowrap">
            <PetitChoix
              data={FORMES_ECHEANCE}
              value={mode}
              // Une date seule n'a pas de début. Passée en période, sa date en
              // devient le début ; la fin la garde aussi, le temps d'en choisir
              // une autre — sans fin, l'échéance ne s'enregistrerait pas.
              onChange={(forme) =>
                changer(
                  forme === "date"
                    ? { forme, debut: "" }
                    : { forme, debut: value.debut || jour },
                )
              }
              label="Forme de l'échéance"
              nom="Forme"
              disabled={readOnly}
            />
            <PetitChoix
              data={RECURRENCES}
              value={value.recurrence}
              onChange={(recurrence) => changer({ recurrence })}
              label="Récurrence"
              disabled={readOnly}
            />
            <PetitChoix
              data={RAPPELS}
              value={value.rappel}
              onChange={(rappel) => changer({ rappel })}
              label="Rappel"
              disabled={readOnly}
            />
          </Group>
        )}
      </Group>

      {/* Une ligne, comme celle d'une catégorie dans le tiroir d'un widget :
          le début, la fin et son heure, l'état, et de quoi la retirer. */}
      {/* Les champs n'ont pas de retrait : c'est la ligne qui pose le
          premier à RETRAIT_NOM de son bord. */}
      <Group
        gap="xs"
        wrap="nowrap"
        align="center"
        style={{
          ...styleLigne(0, 1, false),
          paddingLeft: RETRAIT_NOM,
          // Seule, à côté d'un champ ordinaire — le statut d'une demande —,
          // la ligne en prend la hauteur pour tomber à son niveau.
          ...(simple && {
            // La hauteur d'un champ « sm » : sa variable, Mantine ne la pose que
            // sur ses champs.
            height: "calc(2.25rem * var(--mantine-scale))",
            paddingBlock: 0,
          }),
        }}
      >
        {mode === "periode" && (
          <DatePickerInput
            size="xs"
            radius={ARRONDI}
            placeholder="Du"
            aria-label="Du"
            value={value.debut || null}
            onChange={(d) => changer({ debut: d ?? "" })}
            maxDate={jour || undefined}
            valueFormat="DD/MM/YYYY"
            popoverProps={{ withinPortal: true }}
            className={classes.champ}
            styles={{
              input: { paddingInline: RETRAIT_CHAMP, textAlign: "center" },
            }}
            w={largeurDe("00/00/0000", "Du")}
            style={{ flexShrink: 0 }}
            readOnly={readOnly}
          />
        )}
        {mode === "periode" && <Liaison mot="au" />}
        <DatePickerInput
          size="xs"
          radius={ARRONDI}
          placeholder={mode === "periode" ? "Au" : "Jusqu'au"}
          aria-label={mode === "periode" ? "Au" : "Jusqu'au"}
          value={jour || null}
          onChange={(d) => changer({ fin: assembler(d ?? "", heure) })}
          minDate={value.debut || undefined}
          valueFormat="DD/MM/YYYY"
          popoverProps={{ withinPortal: true }}
          className={classes.champ}
          styles={{
            input: { paddingInline: RETRAIT_CHAMP, textAlign: "center" },
          }}
          w={largeurDe("00/00/0000", "Au", "Jusqu'au")}
          style={{ flexShrink: 0 }}
          readOnly={readOnly}
        />
        <Liaison mot="à" />
        <TimeInput
          size="xs"
          radius={ARRONDI}
          aria-label="Heure"
          value={heure}
          onChange={(e) =>
            changer({ fin: assembler(jour, e.currentTarget.value) })
          }
          disabled={!jour || readOnly}
          className={classes.champ}
          styles={{
            input: { paddingInline: RETRAIT_CHAMP, textAlign: "center" },
          }}
          w={largeurDe("00:00")}
        />
        {/* L'état et le bouton se calent au bout de la ligne. */}
        <div style={{ flex: 1 }} />
        {/* L'état : en retard, bientôt, ou à venir. */}
        <Box
          w={STATUT_L}
          style={{ flexShrink: 0, display: "flex", justifyContent: "center" }}
        >
          {etat === "aucun" ? (
            // Loin encore : le vert de ce qui va bien, comme une carte
            // terminée.
            jour && (
              <Badge color={GREEN} variant="filled" radius="sm" fullWidth>
                À venir
              </Badge>
            )
          ) : (
            <Badge
              color={COULEUR_ECHEANCE[etat]}
              variant="filled"
              radius="sm"
              fullWidth
            >
              {MOT_ECHEANCE[etat]}
            </Badge>
          )}
        </Box>
        {!readOnly && (!simple || jour) && (
          <ActionIcon
            variant="subtle"
            color={RED}
            onClick={onRemove}
            aria-label="Supprimer l'échéance"
            title="Supprimer l'échéance"
          >
            <IconTrash size={16} />
          </ActionIcon>
        )}
      </Group>
    </div>
  );
}
