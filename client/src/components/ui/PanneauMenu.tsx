import { Menu } from "@mantine/core";
import { IconCheck, IconHierarchy2, IconLock } from "@tabler/icons-react";
import { useState } from "react";
import HeriteConfirmModal, { type PanelInheritance } from "./HeriteConfirmModal";
import PointMenu, { type PointMenuPosition } from "./PointMenu";

interface PanneauMenuProps {
  /** Là où le clic droit a ouvert le menu ; « null » : fermé. */
  position: PointMenuPosition | null;
  onClose: () => void;
  locked: boolean;
  /** Sans lui — sans le droit —, le menu ne propose pas le verrou. */
  onToggleLock?: () => void | Promise<void>;
  /** Sans lui, le menu ne propose pas « Hérité ». */
  inheritance?: PanelInheritance;
}

/**
 * Le menu d'un onglet fixe — les statuts du Support, les familles d'Assets :
 * il ne porte que ce qui vaut pour les sections de l'écran, le verrou et
 * « Hérité ». Toujours monté : la confirmation de « Hérité » survit au menu
 * qui l'a demandée.
 */
export default function PanneauMenu({
  position,
  onClose,
  locked,
  onToggleLock,
  inheritance,
}: PanneauMenuProps) {
  // La confirmation de « Hérité », et l'état qu'on s'apprête à quitter. Il
  // reste posé à la fermeture : le message ne change pas pendant que la
  // fenêtre s'efface.
  const [confirmation, setConfirmation] = useState({ ouverte: false, herite: true });
  const utile = Boolean(onToggleLock || inheritance);

  return (
    <>
      {position && utile && (
        <PointMenu position={position} onClose={onClose}>
          <Menu.Label>Affichage</Menu.Label>
          {inheritance && (
            <Menu.Item
              leftSection={<IconHierarchy2 size={16} />}
              rightSection={inheritance.inherited ? <IconCheck size={14} /> : null}
              // Dans un sens comme dans l'autre, le geste se confirme.
              onClick={() => setConfirmation({ ouverte: true, herite: inheritance.inherited })}
            >
              Hérité
            </Menu.Item>
          )}
          {onToggleLock && (
            <Menu.Item
              leftSection={<IconLock size={16} />}
              rightSection={locked ? <IconCheck size={14} /> : null}
              onClick={() => onToggleLock()}
            >
              Verrouillé
            </Menu.Item>
          )}
        </PointMenu>
      )}
      <HeriteConfirmModal
        opened={confirmation.ouverte}
        inherited={confirmation.herite}
        onClose={() => setConfirmation((c) => ({ ...c, ouverte: false }))}
        onConfirm={() => {
          setConfirmation((c) => ({ ...c, ouverte: false }));
          void inheritance?.onToggle();
        }}
      />
    </>
  );
}
