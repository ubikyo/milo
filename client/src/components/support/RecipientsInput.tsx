import { Group, Text, TagsInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { FIELD_BG } from "../ui/RichText";
import type { DirectoryUser } from "@milo/shared";

// Une ligne « CC » ou « CCI » d'une réponse : les adresses retenues en tags,
// chacun avec sa croix, et un champ qui cherche dans l'annuaire Entra. Une
// adresse externe se tape telle quelle, et Entrée, la virgule ou le
// point-virgule la posent.

const DELAI_RECHERCHE = 300;
const RECHERCHE_MIN = 2;

/** Une adresse e-mail, à peu près : de quoi écarter une faute de frappe. */
export const estUneAdresse = (texte: string): boolean =>
  /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(texte.trim());

/** La largeur du libellé : « CC » et « CCI » alignent leur champ. */
const LARGEUR_LIBELLE = 36;

interface RecipientsInputProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}

export default function RecipientsInput({ label, value, onChange }: RecipientsInputProps) {
  const [recherche, setRecherche] = useState("");
  const [annuaire, setAnnuaire] = useState<DirectoryUser[]>([]);

  useEffect(() => {
    const terme = recherche.trim();
    if (terme.length < RECHERCHE_MIN || estUneAdresse(terme)) {
      setAnnuaire([]);
      return;
    }
    let annule = false;
    const minuterie = setTimeout(() => {
      api
        .searchDirectoryUsers(terme)
        .then((trouves) => !annule && setAnnuaire(trouves.filter((p) => p.email)))
        .catch(() => !annule && setAnnuaire([]));
    }, DELAI_RECHERCHE);
    return () => {
      annule = true;
      clearTimeout(minuterie);
    };
  }, [recherche]);

  // Les personnes de l'annuaire, par leur adresse : c'est elle que le tag
  // porte, et elle qui part dans l'e-mail. Une adresse n'y figure qu'une
  // fois : l'annuaire peut rendre deux fiches pour la même, et la liste de
  // Mantine refuse — en faisant tomber la page — deux options de même valeur.
  const suggestions = [
    ...new Map(
      annuaire
        .map((p) => ({ value: p.email.toLowerCase(), label: `${p.name} <${p.email}>` }))
        .filter((o) => !value.includes(o.value))
        .map((o) => [o.value, o] as const),
    ).values(),
  ];

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      px="xs"
      py={4}
      // Le fond du reste de l'éditeur : la ligne en fait partie.
      style={{
        backgroundColor: FIELD_BG,
        borderBottom: "1px solid light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-4))",
      }}
    >
      <Text size="sm" fw={600} c="dimmed" w={LARGEUR_LIBELLE} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <TagsInput
        variant="unstyled"
        size="sm"
        style={{ flex: 1, minWidth: 0 }}
        aria-label={label}
        placeholder={value.length ? undefined : "Nom ou adresse e-mail"}
        value={value}
        // Seules les adresses bien formées deviennent des tags : un nom tapé
        // sans choisir la personne dans la liste ne part nulle part.
        onChange={(tags) =>
          onChange([...new Set(tags.map((t) => t.trim().toLowerCase()).filter(estUneAdresse))])
        }
        searchValue={recherche}
        onSearchChange={setRecherche}
        data={suggestions}
        // L'annuaire a déjà cherché : la liste ne se refiltre pas sur ce qu'on tape.
        filter={({ options }) => options}
        splitChars={[",", ";", " "]}
        clearable={false}
        comboboxProps={{ withinPortal: true }}
      />
    </Group>
  );
}
