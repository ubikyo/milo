import { ActionIcon, Box, Checkbox, Group, Progress, Stack, Text, TextInput } from "@mantine/core";
import { IconListCheck, IconPlus, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import classes from "../assets/styles/AccessNumero.module.css";
import { avec } from "./types";
import type { AccessWidget, WidgetConfigProps, WidgetDisplayProps } from "./types";

// Une liste de choses à faire : des éléments qu'on coche, à même la colonne.
// On y ajoute un élément par le champ du bas, on le coche d'un clic, on le
// renomme d'un double-clic et on le retire par sa croix. Tout se range dans la
// configuration du widget : la liste est celle du tableau, la même pour qui le
// regarde. Catégorie verrouillée, elle se lit sans se modifier.

const ELEMENTS = "elements";
const MASQUER_FAITS = "masquerFaits";
const FAITS_EN_BAS = "faitsEnBas";
const PROGRESSION = "progression";
const ENCADRE = "encadre";

interface Element {
  id: string;
  texte: string;
  fait: boolean;
}

const coche = (config: unknown, cle: string, defaut: boolean): boolean => {
  const valeur = (config as Record<string, unknown> | null)?.[cle];
  return valeur === undefined ? defaut : Boolean(valeur);
};

/** Les éléments rangés, sans ce qui n'en a pas la forme. */
const elementsDe = (config: unknown): Element[] => {
  const valeur = (config as Record<string, unknown> | null)?.[ELEMENTS];
  if (!Array.isArray(valeur)) return [];
  return valeur.flatMap((e: unknown) => {
    const o = e as Partial<Element> | null;
    if (!o || typeof o.texte !== "string") return [];
    return [{ id: typeof o.id === "string" ? o.id : crypto.randomUUID(), texte: o.texte, fait: Boolean(o.fait) }];
  });
};

const nouvelId = () => crypto.randomUUID();

function Ligne({
  element,
  locked,
  onToggle,
  onRename,
  onRemove,
}: {
  element: Element;
  locked: boolean;
  onToggle: () => void;
  onRename: (texte: string) => void;
  onRemove: () => void;
}) {
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState(element.texte);
  const [survol, setSurvol] = useState(false);

  const fermer = () => {
    setEdition(false);
    const texte = brouillon.trim();
    if (texte && texte !== element.texte) onRename(texte);
  };

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      align="flex-start"
      onMouseEnter={() => setSurvol(true)}
      onMouseLeave={() => setSurvol(false)}
    >
      <Checkbox
        checked={element.fait}
        onChange={onToggle}
        disabled={locked}
        color="teal"
        size="xs"
        mt={3}
        aria-label={element.texte}
      />
      {edition ? (
        <TextInput
          value={brouillon}
          onChange={(e) => setBrouillon(e.currentTarget.value)}
          onBlur={fermer}
          onKeyDown={(e) => {
            if (e.key === "Enter") fermer();
            if (e.key === "Escape") setEdition(false);
          }}
          autoFocus
          variant="unstyled"
          size="xs"
          style={{ flex: 1 }}
          styles={{ input: { fontSize: "var(--mantine-font-size-sm)", height: "auto", minHeight: 0, lineHeight: 1.3 } }}
        />
      ) : (
        <Text
          size="sm"
          lh={1.3}
          style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", cursor: locked ? undefined : "pointer" }}
          td={element.fait ? "line-through" : undefined}
          c={element.fait ? "dimmed" : undefined}
          // Un clic sur le texte coche, comme le ferait une étiquette ; le
          // double-clic renomme.
          onClick={() => !locked && onToggle()}
          onDoubleClick={() => {
            if (locked) return;
            setBrouillon(element.texte);
            setEdition(true);
          }}
        >
          {element.texte}
        </Text>
      )}
      {!locked && !edition && (
        <ActionIcon
          variant="subtle"
          color="gray"
          size="xs"
          onClick={onRemove}
          aria-label="Retirer"
          style={{ visibility: survol ? "visible" : "hidden" }}
        >
          <IconX size={12} />
        </ActionIcon>
      )}
    </Group>
  );
}

function ListeAFaire({ config, onChange, locked }: WidgetDisplayProps) {
  // Les éléments se changent aussitôt à l'écran, sans attendre que le serveur
  // ait rangé la configuration ; ce qu'il renvoie les remplace ensuite.
  const [elements, setElements] = useState(() => elementsDe(config));
  const [saisie, setSaisie] = useState("");
  const ranges = JSON.stringify((config as Record<string, unknown> | null)?.[ELEMENTS] ?? []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setElements(elementsDe(config)), [ranges]);

  const ranger = (suivants: Element[]) => {
    setElements(suivants);
    void onChange(avec(config, ELEMENTS, suivants));
  };

  const ajouter = () => {
    const texte = saisie.trim();
    if (!texte) return;
    ranger([...elements, { id: nouvelId(), texte, fait: false }]);
    setSaisie("");
  };

  const masquer = coche(config, MASQUER_FAITS, false);
  const enBas = coche(config, FAITS_EN_BAS, true);
  const faits = elements.filter((e) => e.fait).length;
  const visibles = elements
    .filter((e) => !(masquer && e.fait))
    .sort((a, b) => (enBas ? Number(a.fait) - Number(b.fait) : 0));

  // Cocher, saisir ou sélectionner un mot ne fait pas glisser le widget.
  const contenu = (
    <Stack gap={6} data-no-widget-drag>
      {coche(config, PROGRESSION, false) && elements.length > 0 && (
        <Group gap="xs" wrap="nowrap">
          <Progress value={(faits / elements.length) * 100} color="teal" size="sm" style={{ flex: 1 }} />
          <Text size="xs" c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>
            {faits}/{elements.length}
          </Text>
        </Group>
      )}
      {visibles.map((e) => (
        <Ligne
          key={e.id}
          element={e}
          locked={locked}
          onToggle={() => ranger(elements.map((x) => (x.id === e.id ? { ...x, fait: !x.fait } : x)))}
          onRename={(texte) => ranger(elements.map((x) => (x.id === e.id ? { ...x, texte } : x)))}
          onRemove={() => ranger(elements.filter((x) => x.id !== e.id))}
        />
      ))}
      {elements.length === 0 && locked && (
        <Text size="sm" c="dimmed">
          Rien à faire
        </Text>
      )}
      {masquer && faits > 0 && (
        <Text size="xs" c="dimmed">
          {faits} élément{faits > 1 ? "s" : ""} fait{faits > 1 ? "s" : ""} masqué{faits > 1 ? "s" : ""}
        </Text>
      )}
      {!locked && (
        <TextInput
          placeholder="Ajouter un élément"
          value={saisie}
          onChange={(e) => setSaisie(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && ajouter()}
          size="xs"
          variant="unstyled"
          leftSection={<IconPlus size={14} />}
          leftSectionWidth={22}
          styles={{ input: { fontSize: "var(--mantine-font-size-sm)" } }}
        />
      )}
    </Stack>
  );

  if (!coche(config, ENCADRE, false)) return contenu;
  return (
    <Box className={classes.encart} style={{ border: "none" }}>
      {contenu}
    </Box>
  );
}

function Champs({ config, onChange }: WidgetConfigProps) {
  const elements = elementsDe(config);
  const faits = elements.filter((e) => e.fait).length;
  return (
    <Stack gap="sm">
      <Checkbox
        label="Placer les éléments faits en bas de la liste"
        checked={coche(config, FAITS_EN_BAS, true)}
        onChange={(e) => onChange(avec(config, FAITS_EN_BAS, e.currentTarget.checked))}
        color="teal"
      />
      <Checkbox
        label="Masquer les éléments faits"
        checked={coche(config, MASQUER_FAITS, false)}
        onChange={(e) => onChange(avec(config, MASQUER_FAITS, e.currentTarget.checked))}
        color="teal"
      />
      <Checkbox
        label="Afficher la progression"
        checked={coche(config, PROGRESSION, false)}
        onChange={(e) => onChange(avec(config, PROGRESSION, e.currentTarget.checked))}
        color="teal"
      />
      {faits > 0 && (
        <Text
          size="sm"
          c="red"
          style={{ cursor: "pointer", width: "fit-content" }}
          onClick={() => onChange(avec(config, ELEMENTS, elements.filter((e) => !e.fait)))}
        >
          Retirer les {faits} élément{faits > 1 ? "s" : ""} fait{faits > 1 ? "s" : ""}
        </Text>
      )}
    </Stack>
  );
}

export const todoWidget: AccessWidget = {
  type: "todo",
  kind: "common",
  label: "À faire",
  icon: IconListCheck,
  defaultConfig: { [ELEMENTS]: [], [FAITS_EN_BAS]: true, [MASQUER_FAITS]: false, [PROGRESSION]: false },
  // On coche, renomme et retire à même la colonne.
  ownClicks: true,

  Display: ListeAFaire,

  marges: () => ({ haute: 0, basse: 15 }),

  Config: Champs,

  ConfigFin: ({ config, onChange }) => (
    <Checkbox
      label="Encadrer"
      checked={coche(config, ENCADRE, false)}
      onChange={(e) => onChange(avec(config, ENCADRE, e.currentTarget.checked))}
      color="teal"
    />
  ),
};
