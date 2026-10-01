import { Anchor, Stack, Switch, Text, TextInput } from "@mantine/core";
import { IconLink } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import classes from "../assets/styles/AccessLink.module.css";
import { avec, texte } from "./types";
import type { AccessWidget, WidgetDisplayProps } from "./types";

// Un lien : l'adresse d'un service, le mot qui la désigne, et de quoi
// l'éteindre sans le perdre.
//
// Le clic simple ouvre l'adresse dans une autre page ; le double-clic renomme
// le lien là où il est, comme un titre de colonne — c'est l'intitulé qu'on
// retouche le plus souvent, et le tiroir n'a plus à s'ouvrir pour lui. Le
// reste — l'adresse, l'interrupteur — se règle dans le tiroir, que le clic
// droit ouvre.
//
// Les deux gestes partagent le même mot, d'où le délai ci-dessous : le premier
// clic attend de savoir s'il en vient un second. C'est ce que fait déjà une
// carte du mode Tâche.

const LIBELLE = "libelle";
const URL = "url";
const ACTIF = "actif";

/**
 * Délai laissé à un second clic avant que le premier n'ouvre l'adresse. Assez
 * court pour que l'ouverture ne traîne pas, assez long pour un double-clic
 * ordinaire — et bien en deçà de la fenêtre pendant laquelle le navigateur
 * tient encore le clic pour un geste de la personne, sans quoi il bloquerait
 * l'ouverture.
 */
const DELAI_DOUBLE_CLIC = 250;

/**
 * L'interligne d'une ligne de lien. Celui de Mantine pour un texte « sm »
 * vaut 1,55 : la ligne devient alors nettement plus haute que le mot qu'elle
 * porte, et deux liens à la suite paraissent espacés sans qu'aucune marge
 * ne les sépare. Resserré à la valeur des titres de la colonne, la ligne fait
 * la hauteur du lien.
 *
 * Posé en style plutôt que par la propriété « lh » : celle-ci n'atteint pas
 * la variable que Mantine lit pour l'interligne d'un « Text », et resterait
 * sans effet — comme « fz » sur un titre.
 */
const INTERLIGNE = { lineHeight: 1.3 };

/**
 * L'ancre, elle, demande une précaution de plus. Mantine lui remet
 * « display: inline », et cette règle passe après celle qui la met en bloc
 * pour la couper à une ligne. Restée en ligne, l'ancre ne commande plus la
 * hauteur de sa rangée : c'est l'interligne du conteneur qui la fixe, soit
 * celui du corps de page — près de 25 pixels pour un mot de 14. On la remet
 * donc en bloc, dans la forme que la coupure à une ligne réclame.
 */
const LIGNE_DE_LIEN = {
  ...INTERLIGNE,
  display: "-webkit-box" as const,
  // L'ancre s'arrête au mot : en bloc, elle occuperait toute la colonne et le
  // survol s'allumerait bien au-delà du texte. « max-width » la borne tout de
  // même, sans quoi un libellé trop long déborderait au lieu d'être coupé.
  width: "fit-content" as const,
  maxWidth: "100%" as const,
};

/** Un lien neuf est allumé : on le crée pour s'en servir. */
const estActif = (config: unknown): boolean => {
  const valeur = (config as Record<string, unknown> | null)?.[ACTIF];
  return valeur === undefined ? true : Boolean(valeur);
};

function Lien({ config, onChange, locked }: WidgetDisplayProps) {
  const minuteur = useRef<number | null>(null);
  const champ = useRef<HTMLInputElement | null>(null);
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState("");

  // Un lien démonté pendant l'attente n'ouvrira rien.
  useEffect(
    () => () => {
      if (minuteur.current !== null) window.clearTimeout(minuteur.current);
    },
    [],
  );

  // Le champ prend le focus dès qu'il paraît, et la saisie s'y trouve déjà
  // sélectionnée : le double-clic vaut « je remplace cet intitulé ».
  useEffect(() => {
    if (!edition) return;
    champ.current?.focus();
    champ.current?.select();
  }, [edition]);

  const url = texte(config, URL);
  const intitule = texte(config, LIBELLE);
  const libelle = intitule || url;
  const actif = estActif(config);

  const clic = () => {
    // Le second clic d'un double-clic retombe ici : il ne relance rien, c'est
    // « onDoubleClick » qui prendra la main et annulera l'attente.
    if (minuteur.current !== null) return;
    minuteur.current = window.setTimeout(() => {
      minuteur.current = null;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    }, DELAI_DOUBLE_CLIC);
  };

  const doubleClic = () => {
    if (minuteur.current !== null) {
      window.clearTimeout(minuteur.current);
      minuteur.current = null;
    }
    if (locked) return;
    setBrouillon(intitule);
    setEdition(true);
  };

  // L'intitulé part au serveur en refermant la saisie — c'est le seul geste
  // qu'elle porte. Inchangé, rien n'est envoyé. Effacé, le lien se remet à se
  // lire par son adresse.
  const fermer = async () => {
    setEdition(false);
    const nouveau = brouillon.trim();
    if (nouveau === intitule) return;
    await onChange(avec(config, LIBELLE, nouveau));
  };

  if (edition) {
    return (
      // Le champ prend exactement la place du mot qu'il remplace : la taille
      // et l'interligne de la ligne de lien, sans la bordure ni la hauteur
      // minimale que Mantine laisse à un champ « unstyled » — sans quoi la
      // colonne sauterait au double-clic.
      <TextInput
        ref={champ}
        aria-label="Intitulé du lien"
        placeholder={url || "Lien"}
        value={brouillon}
        onChange={(e) => setBrouillon(e.currentTarget.value)}
        onBlur={fermer}
        onKeyDown={(e) => {
          if (e.key === "Enter") fermer();
          // Échap renonce : l'intitulé d'avant reste.
          if (e.key === "Escape") setEdition(false);
        }}
        variant="unstyled"
        styles={{
          input: {
            ...INTERLIGNE,
            fontSize: "var(--mantine-font-size-sm)",
            color: "var(--mantine-color-text)",
            height: "auto",
            minHeight: 0,
            border: "none",
          },
        }}
      />
    );
  }

  // Éteint, le lien se lit encore — barré et grisé — tant que la catégorie
  // est ouverte : c'est de là qu'on le rallume. Verrouillée, il ne paraît
  // plus du tout (voir « hidden » plus bas).
  if (!actif) {
    return (
      <Text
        size="sm"
        style={INTERLIGNE}
        c="dimmed"
        td="line-through"
        onDoubleClick={doubleClic}
        lineClamp={1}
      >
        {libelle || "Lien"}
      </Text>
    );
  }

  // Sans adresse, le lien n'ouvre rien, mais il garde la couleur des autres :
  // il vient d'être ajouté et attend seulement d'être renseigné.
  if (!url) {
    return (
      <Text
        size="sm"
        style={INTERLIGNE}
        c="var(--mantine-color-text)"
        onDoubleClick={doubleClic}
        lineClamp={1}
      >
        {libelle || "Lien"}
      </Text>
    );
  }

  return (
    // L'adresse s'ouvre à côté. « href » est conservé pour ce que le clic
    // droit et le clavier en font, mais c'est le gestionnaire qui ouvre :
    // sans lui, un double-clic ouvrirait deux pages.
    <Anchor
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      size="sm"
      style={LIGNE_DE_LIEN}
      lineClamp={1}
      // Ni bleu ni souligné : le lien se lit comme le reste de la colonne.
      // La couleur est posée ici plutôt qu'en feuille de style — elle
      // l'emporte alors à coup sûr sur celle de Mantine, quel que soit l'ordre
      // des feuilles. Le retrait et le fond au survol, eux, n'ont pas
      // d'équivalent en ligne (assets/styles/AccessLink.module.css).
      c="var(--mantine-color-text)"
      underline="never"
      className={classes.lien}
      onClick={(e) => {
        e.preventDefault();
        clic();
      }}
      onDoubleClick={doubleClic}
    >
      {libelle}
    </Anchor>
  );
}

export const lienWidget: AccessWidget = {
  type: "link",
  label: "Lien",
  icon: IconLink,
  defaultConfig: { [LIBELLE]: "", [URL]: "", [ACTIF]: true },
  // Le clic simple appartient au lien : la page ne l'enveloppe pas d'un
  // bouton qui ouvrirait le tiroir.
  ownClicks: true,
  // Éteint et verrouillé, il disparaît : plus personne n'a à le voir, et
  // personne ne peut plus le rallumer de toute façon.
  hidden: (config, locked) => locked && !estActif(config),

  Display: Lien,

  // Serrés comme les lignes d'un paragraphe : l'interligne suffit à les séparer.
  marges: () => ({ haute: 0, basse: 0 }),

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <TextInput
        label="Nom"
        placeholder="Nom du lien"
        value={texte(config, LIBELLE)}
        onChange={(e) => onChange(avec(config, LIBELLE, e.currentTarget.value))}
        autoFocus
      />
      <TextInput
        label="URL"
        placeholder="https://"
        value={texte(config, URL)}
        onChange={(e) => onChange(avec(config, URL, e.currentTarget.value))}
      />
    </Stack>
  ),

  // Éteindre plutôt que supprimer : l'adresse est conservée, elle ne se
  // montre simplement plus une fois la catégorie verrouillée. Posé après les
  // marges, en dernier du tiroir.
  ConfigFin: ({ config, onChange }) => (
    <Switch
      label="Activé"
      checked={estActif(config)}
      onChange={(e) => onChange(avec(config, ACTIF, e.currentTarget.checked))}
      color="teal"
    />
  ),
};
