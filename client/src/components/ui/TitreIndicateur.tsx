import { Text } from "@mantine/core";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { texte } from "../../widgets/types";

// Le titre d'un indicateur : son nom, ou à défaut celui que le widget lui
// donne. Un double clic le change sur place ; un simple clic ouvre le tiroir,
// comme ailleurs sur la carte — attendu le temps de voir s'il en vient un
// second. En gras et en blanc, comme les titres des colonnes.

/** La clé du nom dans la configuration : la même pour tous les widgets. */
export const NOM = "nom";

/** Le temps laissé à un second clic avant d'ouvrir le tiroir. */
const DOUBLE_CLIC = 250;

interface CarteIndicateur {
  /** Ouvre le tiroir de l'indicateur. */
  ouvrir: () => void;
  /** Range le nouveau nom ; vide, l'indicateur reprend celui de son type. */
  renommer: (nom: string) => Promise<void>;
}

/** Ce que la carte d'un panneau donne à son titre. Hors panneau, il n'est que lu. */
export const CarteIndicateurContext = createContext<CarteIndicateur | null>(null);

export default function TitreIndicateur({ config, defaut }: { config: unknown; defaut: string }) {
  const carte = useContext(CarteIndicateurContext);
  const nom = texte(config, NOM).trim() || defaut;
  const [saisie, setSaisie] = useState<string | null>(null);
  const attente = useRef<number | undefined>(undefined);
  // Échap referme la saisie sans rien ranger : le « blur » qui peut suivre ne
  // doit pas l'enregistrer quand même.
  const annule = useRef(false);
  useEffect(() => () => window.clearTimeout(attente.current), []);

  if (saisie !== null && carte) {
    // Le nom du type n'est pas rangé : il reste celui par défaut.
    const valider = async () => {
      if (annule.current) return;
      const valeur = saisie.trim();
      setSaisie(null);
      if (valeur === nom) return;
      await carte.renommer(valeur === defaut ? "" : valeur);
    };
    // La saisie vit dans la carte : ni ses appuis ni ses touches ne doivent
    // la glisser ou l'ouvrir.
    return (
      // Comme le renommage d'un onglet (BoardTabs) : un champ nu, qui prend
      // la police du titre et ne déplace rien.
      <Text size="sm" c="#ffffff" fw={700}>
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.currentTarget.value)}
          onBlur={valider}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              annule.current = true;
              setSaisie(null);
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.currentTarget.select()}
          autoFocus
          aria-label="Renommer l'indicateur"
          style={{
            font: "inherit",
            color: "inherit",
            background: "transparent",
            border: "none",
            outline: "none",
            padding: 0,
            margin: 0,
            width: "100%",
          }}
        />
      </Text>
    );
  }

  return (
    <Text
      size="sm"
      c="#ffffff"
      fw={700}
      truncate
      onClick={
        carte
          ? (e) => {
              e.stopPropagation();
              window.clearTimeout(attente.current);
              if (e.detail === 1) attente.current = window.setTimeout(carte.ouvrir, DOUBLE_CLIC);
            }
          : undefined
      }
      onDoubleClick={
        carte
          ? (e) => {
              e.stopPropagation();
              window.clearTimeout(attente.current);
              annule.current = false;
              setSaisie(nom);
            }
          : undefined
      }
    >
      {nom}
    </Text>
  );
}
