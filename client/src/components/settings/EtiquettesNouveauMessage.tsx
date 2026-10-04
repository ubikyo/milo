import { ColorSwatch, Group, Input, Menu, Select, Stack } from "@mantine/core";
import { IconChevronDown, IconTag, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import type { SupportLabel } from "@milo/shared";
import { RED } from "../../themes/colors";
import AddButton from "../ui/AddButton";
import { useLabelColors } from "../ui/LabelChip";
import {
  ARRONDI,
  ListeVide,
  RETRAIT_LIGNE,
  RETRAIT_NOM,
  styleChampNom,
  styleLigne,
} from "../ui/LignesDuTiroir";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "../ui/PointMenu";

// Les étiquettes qu'un ticket arrivé par e-mail reçoit d'office, au
// Paramétrage. Elles se présentent comme les colonnes d'une liste
// (ChampsColonnes) : une ligne par étiquette, sa pastille et son nom, qu'un
// clic remplace par une autre. Le clic droit la retire ; « Ajouter » pose une
// ligne vide au bout, où l'on choisit laquelle — quittée sans choix, elle
// s'efface. Une étiquette ne revient pas deux fois.

/** La taille de la pastille de couleur, dans le champ. */
const TAILLE_PASTILLE = 12;

interface EtiquettesNouveauMessageProps {
  /** Les étiquettes du Support. */
  etiquettes: SupportLabel[];
  /** Celles qu'un nouveau message reçoit. */
  value: string[];
  onChange: (ids: string[]) => void;
  canEdit: boolean;
}

export default function EtiquettesNouveauMessage({
  etiquettes,
  value,
  onChange,
  canEdit,
}: EtiquettesNouveauMessageProps) {
  const couleurs = useLabelColors();
  // La ligne ajoutée, en attente de son étiquette.
  const [enAjout, setEnAjout] = useState(false);
  /** Le rang de la ligne dont la liste est ouverte : son champ prend le fond. */
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ rang: number; position: PointMenuPosition } | null>(null);

  // Une étiquette supprimée depuis ne se montre plus.
  const choisies = value.filter((id) => etiquettes.some((e) => String(e.id) === id));
  const lignes = enAjout ? [...choisies, ""] : choisies;

  /** Les étiquettes qu'une ligne peut prendre : la sienne, et celles qui ne sont pas déjà prises. */
  const options = (id: string) =>
    etiquettes
      .filter((e) => String(e.id) === id || !choisies.includes(String(e.id)))
      .map((e) => ({ value: String(e.id), label: e.name }));

  const remplacer = (rang: number, id: string | null) => {
    setEnAjout(false);
    if (!id) return;
    if (rang === choisies.length) return onChange([...choisies, id]);
    onChange(choisies.map((c, i) => (i === rang ? id : c)));
  };

  const pastille = (id: string) => {
    const etiquette = etiquettes.find((e) => String(e.id) === id);
    return etiquette ? (
      <ColorSwatch
        color={couleurs(etiquette.color).backgroundColor}
        size={TAILLE_PASTILLE}
        withShadow={false}
      />
    ) : null;
  };

  return (
    <Input.Wrapper label="Étiquettes nouveau message">
      {lignes.length === 0 ? (
        <ListeVide icon={IconTag} message="Aucune étiquette" />
      ) : (
        <Stack gap={1}>
          {lignes.map((id, rang) => {
            const nouvelle = rang === choisies.length;
            return (
              <Group
                key={nouvelle ? "nouvelle" : id}
                gap="sm"
                wrap="nowrap"
                onContextMenu={(e) => {
                  if (!canEdit || nouvelle) return;
                  setMenu({ rang, position: positionDuMenu(e) });
                }}
                style={{ ...styleLigne(rang, lignes.length, false), paddingLeft: RETRAIT_LIGNE }}
              >
                <Select
                  size="sm"
                  radius={ARRONDI}
                  style={{ flex: 1, minWidth: 0 }}
                  data={options(id)}
                  value={id || null}
                  placeholder="Choisir une étiquette"
                  onChange={(choix) => remplacer(rang, choix)}
                  // La ligne ajoutée, quittée sans étiquette, s'efface.
                  onBlur={() => nouvelle && setEnAjout(false)}
                  onDropdownOpen={() => setOuverte(rang)}
                  onDropdownClose={() => setOuverte(null)}
                  allowDeselect={false}
                  autoFocus={nouvelle}
                  disabled={!canEdit}
                  // La pastille de l'étiquette, devant son nom.
                  leftSection={pastille(id)}
                  leftSectionWidth={id ? RETRAIT_NOM + TAILLE_PASTILLE : undefined}
                  rightSection={<IconChevronDown size={14} />}
                  rightSectionPointerEvents="none"
                  comboboxProps={{ shadow: "md", withinPortal: true }}
                  styles={{
                    section: { justifyContent: "flex-end" },
                    input: {
                      ...styleChampNom(ouverte === rang),
                      cursor: "pointer",
                      ...(id ? { paddingLeft: RETRAIT_NOM + TAILLE_PASTILLE + 8 } : null),
                    },
                  }}
                  aria-label={nouvelle ? "Étiquette à ajouter" : "Étiquette"}
                />
              </Group>
            );
          })}
        </Stack>
      )}

      {/* Au plus près de la liste qu'il allonge — tant qu'il reste une étiquette à ajouter. */}
      {canEdit && choisies.length < etiquettes.length && (
        <AddButton label="Ajouter une étiquette" onClick={() => setEnAjout(true)} mt={4} />
      )}

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              onChange(choisies.filter((_, i) => i !== menu.rang));
              setMenu(null);
            }}
          >
            Retirer
          </Menu.Item>
        </PointMenu>
      )}
    </Input.Wrapper>
  );
}
