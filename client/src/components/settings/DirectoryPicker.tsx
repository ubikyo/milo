import { Group, Select, Text } from "@mantine/core";
import { IconUser, IconUsersGroup } from "@tabler/icons-react";
import OrigineAnnuaire from "../ui/OrigineAnnuaire";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { messageErreur } from "../../lib/errors";
import type { EntraPrincipal } from "@milo/shared";
import type { SelectProps } from "@mantine/core";

// Le temps de laisser finir la frappe avant d'interroger l'annuaire.
const ATTENTE = 300;

/** La clé d'un principal dans la liste : un utilisateur et un groupe peuvent partager un nom. */
const cle = (p: EntraPrincipal) => `${p.type}:${p.id}`;

interface DirectoryPickerProps extends Omit<
  SelectProps,
  "value" | "onChange" | "data" | "searchValue" | "onSearchChange"
> {
  value: EntraPrincipal | null;
  onChange: (principal: EntraPrincipal | null) => void;
  /** Ne chercher que des groupes : celui des administrateurs. */
  groupsOnly?: boolean;
  /**
   * Repartir d'un champ vide après chaque choix : la ligne d'ajout des accès,
   * prête pour le suivant.
   */
  resetOnSelect?: boolean;
}

/**
 * Un utilisateur ou un groupe de l'annuaire Entra, cherché pendant la frappe
 * — deux caractères au moins. Ce que Microsoft répond en cas d'échec
 * (permission manquante, par exemple) s'affiche à la place des résultats.
 */
export default function DirectoryPicker({
  value,
  onChange,
  groupsOnly = false,
  resetOnSelect = false,
  ...props
}: DirectoryPickerProps) {
  const [recherche, setRecherche] = useState("");
  const [trouves, setTrouves] = useState<EntraPrincipal[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    const terme = recherche.trim();
    // Le champ affiche le nom du principal choisi : ce n'est pas une recherche.
    if (terme.length < 2 || terme === value?.name) {
      setTrouves([]);
      return undefined;
    }
    let abandonne = false;
    const minuterie = window.setTimeout(() => {
      setEnCours(true);
      api
        .searchDirectory(terme, groupsOnly)
        .then((liste) => {
          if (abandonne) return;
          setTrouves(liste);
          setErreur(null);
        })
        .catch((e) => {
          if (!abandonne) setErreur(messageErreur(e));
        })
        .finally(() => {
          if (!abandonne) setEnCours(false);
        });
    }, ATTENTE);
    return () => {
      abandonne = true;
      window.clearTimeout(minuterie);
    };
  }, [recherche, groupsOnly, value?.name]);

  // Le principal choisi reste dans la liste, sans quoi le champ se viderait.
  const tous =
    value && !trouves.some((p) => cle(p) === cle(value))
      ? [value, ...trouves]
      : trouves;
  const parCle = new Map(tous.map((p) => [cle(p), p]));

  return (
    <Select
      searchable
      data={tous.map((p) => ({ value: cle(p), label: p.name || p.email }))}
      value={value ? cle(value) : null}
      onChange={(v) => {
        onChange(v ? (parCle.get(v) ?? null) : null);
        // Mantine pose le nom choisi dans le champ juste après : on l'efface
        // derrière lui.
        if (v && resetOnSelect) window.setTimeout(() => setRecherche(""), 0);
      }}
      searchValue={recherche}
      onSearchChange={setRecherche}
      // L'annuaire a déjà filtré : la liste ne refiltre pas derrière lui.
      filter={({ options }) => options}
      nothingFoundMessage={
        erreur ??
        (enCours
          ? "Recherche…"
          : recherche.trim().length < 2
            ? "Tapez au moins deux caractères"
            : "Aucun résultat")
      }
      renderOption={({ option }) => {
        const p = parCle.get(option.value);
        const Icone = p?.type === "group" ? IconUsersGroup : IconUser;
        return (
          <Group gap="xs" wrap="nowrap" style={{ width: "100%" }}>
            <Icone size={16} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" truncate>
                {option.label}
              </Text>
              {p?.email && (
                <Text size="xs" c="dimmed" truncate>
                  {p.email}
                </Text>
              )}
            </div>
            {/* L'origine du compte, à droite : deux comptes de même nom et
                de même adresse se distinguent ainsi. */}
            {p && <OrigineAnnuaire synced={p.synced} />}
          </Group>
        );
      }}
      {...props}
    />
  );
}
