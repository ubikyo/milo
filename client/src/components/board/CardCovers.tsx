import { Group, Input, Menu, Stack } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { ROTATIONS_COUVERTURE } from "@milo/shared";
import type { CardCover } from "@milo/shared";
import { RED } from "../../themes/colors";
import AddButton from "../ui/AddButton";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import PointMenu, { type PointMenuPosition } from "../ui/PointMenu";
import { LigneFichier, useFichiersRanges } from "./CardAttachments";
import { PetitChoix } from "./CardEcheance";

const ROTATIONS = ROTATIONS_COUVERTURE.map((r) => ({ value: String(r.value), label: r.label }));

/**
 * Les images de couverture d'une carte, en tête de sa fiche, sous la même
 * allure que ses pièces jointes : une ligne par image, qui l'ouvre au clic, et
 * « Supprimer » au clic droit. Une poignée devant chaque ligne les range — la
 * première est celle que la carte montre sur le tableau —, et l'intervalle de
 * rotation, à droite de l'intitulé, les fait se relayer.
 *
 * Le bloc porte « data-couvertures » : un fichier lâché dessus devient une
 * couverture plutôt qu'une pièce jointe (CardDrawer).
 */
interface CardCoversProps {
  covers: CardCover[];
  /** Les secondes entre deux images sur le tableau ; zéro, la première reste. */
  intervalle: number;
  onIntervalle: (secondes: number) => void;
  onPick: () => void;
  onReorder: (ids: CardCover["id"][]) => void | Promise<void>;
  onDelete: (cover: CardCover) => void | Promise<void>;
  readOnly?: boolean;
}

export default function CardCovers({
  covers,
  intervalle,
  onIntervalle,
  onPick,
  onReorder,
  onDelete,
  readOnly,
}: CardCoversProps) {
  const [aSupprimer, setASupprimer] = useState<CardCover | null>(null);
  const [menu, setMenu] = useState<{ cover: CardCover; position: PointMenuPosition } | null>(
    null,
  );

  const { affiches, ligne } = useFichiersRanges(covers, onReorder, !readOnly);
  if (covers.length === 0) return null;

  return (
    <div data-couvertures>
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <Input.Label>Images de couverture</Input.Label>
        <PetitChoix
          data={ROTATIONS}
          value={String(intervalle)}
          onChange={(v) => onIntervalle(Number(v))}
          label="Intervalle de rotation"
          disabled={readOnly}
        />
      </Group>

      <Stack gap={2}>
        {affiches.map((cover, rang) => (
          <LigneFichier
            key={cover.id}
            piece={{ ...cover, is_image: true }}
            onContextMenu={(position) => !readOnly && setMenu({ cover, position })}
            {...ligne(cover, rang)}
          />
        ))}
      </Stack>

      {!readOnly && <AddButton label="Ajouter une image" onClick={onPick} mt={4} />}

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => setASupprimer(menu.cover)}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={aSupprimer !== null}
        onClose={() => setASupprimer(null)}
        onConfirm={() => {
          const cover = aSupprimer;
          setASupprimer(null);
          if (cover) void onDelete(cover);
        }}
        title="Supprimer l'image de couverture"
        message={<>Voulez-vous vraiment supprimer « {aSupprimer?.name || "cette image"} » ?</>}
      />
    </div>
  );
}
