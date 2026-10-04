import { Group, Menu, Modal, ScrollArea, Stack, Text } from "@mantine/core";
import { IconStack2, IconTrash, IconUsers } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { messageErreur, notifierErreur } from "../../lib/errors";
import { RED } from "../../themes/colors";
import {
  HAUTEUR_MAX_PARAMETRAGE,
  HAUTEUR_PARAMETRAGE,
  LARGEUR_PARAMETRAGE,
  PADDING_PARAMETRAGE,
  modalHeaderStyles,
} from "../../themes/modals";
import defilement from "../../assets/styles/ListeScroll.module.css";
import AddButton from "../ui/AddButton";
import BoutonFermer from "../ui/BoutonFermer";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import {
  BoutonDeLigne,
  ChampDeLigne,
  ListeVide,
  RETRAIT_LIGNE,
  styleLigne,
} from "../ui/LignesDuTiroir";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "../ui/PointMenu";
import WorkspaceAccess from "./WorkspaceAccess";
import type { Workspace } from "@milo/shared";

interface WorkspacesTabProps {
  workspaces: Workspace[];
  /** Relit la liste — et le compte, dont le sélecteur la propose. */
  onChanged: () => Promise<void>;
  /** Relit le compte, après un changement des accès : le sélecteur en dépend. */
  onAccessChanged: () => void;
}

/**
 * Les workspaces : une équipe chacun, avec ses vues, ses tableaux et ses
 * contextes, isolés de ceux des autres. Ils se présentent comme les listes
 * des tiroirs (ChampsColonnes) : une ligne par workspace, son nom à même la
 * ligne. Le clic droit ouvre ses accès ou le supprime — le dernier ne se
 * supprime pas ; « Ajouter » pose une ligne vide au bout, créée dès qu'elle a
 * un nom.
 */
export default function WorkspacesTab({
  workspaces,
  onChanged,
  onAccessChanged,
}: WorkspacesTabProps) {
  // Le workspace dont la fenêtre des accès est ouverte.
  const [accesDe, setAccesDe] = useState<Workspace | null>(null);
  const [aSupprimer, setASupprimer] = useState<Workspace | null>(null);
  const [menu, setMenu] = useState<{ workspace: Workspace; position: PointMenuPosition } | null>(
    null,
  );
  // La ligne ajoutée, en attente de son nom.
  const [enAjout, setEnAjout] = useState(false);
  // Le nombre d'accès de chaque workspace : les utilisateurs et les groupes
  // qui y ont un droit. Relus à la fermeture de leur fenêtre.
  const [acces, setAcces] = useState<Record<number, number>>({});

  const lireAcces = useCallback(async () => {
    try {
      const comptes = await Promise.all(
        workspaces.map(async (w) => [w.id, (await api.getAssignments(w.id)).length] as const),
      );
      setAcces(Object.fromEntries(comptes));
    } catch (e) {
      notifierErreur(messageErreur(e));
    }
  }, [workspaces]);

  useEffect(() => {
    void lireAcces();
  }, [lireAcces]);

  const ecrire = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await onChanged();
    } catch (e) {
      notifierErreur(messageErreur(e));
    }
  };

  const total = workspaces.length + (enAjout ? 1 : 0);

  return (
    <Stack gap="sm">
      {/* 15 px de plus que l'écart de la pile avant la liste. */}
      <Text size="sm" c="dimmed" mb={15}>
        Un workspace naît avec une vue et son tableau, sans aucun accès :
        chacun a les siens, à régler par un clic droit sur sa ligne.
        Le supprimer emporte toutes ses vues et tout ce qu'elles contiennent.
      </Text>

      <div>
        {total === 0 ? (
          <ListeVide icon={IconStack2} message="Aucun workspace" />
        ) : (
          <Stack gap={1}>
            {workspaces.map((w, rang) => (
              <Group
                key={w.id}
                gap="sm"
                wrap="nowrap"
                onContextMenu={(e) => setMenu({ workspace: w, position: positionDuMenu(e) })}
                style={{ ...styleLigne(rang, total, false), paddingLeft: RETRAIT_LIGNE }}
              >
                <ChampDeLigne
                  nom={w.name}
                  placeholder="Nom du workspace"
                  label={`Nom de ${w.name}`}
                  onValider={(nom) => {
                    if (nom && nom !== w.name) void ecrire(() => api.updateWorkspace(w.id, nom));
                  }}
                />
                {/* Ses accès : leur nombre, et leur fenêtre au clic. */}
                {acces[w.id] !== undefined && (
                  <BoutonDeLigne
                    icon={IconUsers}
                    onClick={() => setAccesDe(w)}
                    // À 5 px du bout de la ligne, retrait compris.
                    margeDroite={5 - RETRAIT_LIGNE}
                  >
                    {/* « accès » est invariable. */}
                    {`${acces[w.id]} accès`}
                  </BoutonDeLigne>
                )}
              </Group>
            ))}
            {enAjout && (
              <Group
                gap="sm"
                wrap="nowrap"
                style={{ ...styleLigne(total - 1, total, false), paddingLeft: RETRAIT_LIGNE }}
              >
                <ChampDeLigne
                  nom=""
                  placeholder="Nom du workspace"
                  label="Nom du nouveau workspace"
                  autoFocus
                  // Quittée sans nom, la ligne s'efface ; nommée, elle est créée.
                  onValider={(nom) => {
                    setEnAjout(false);
                    if (nom) void ecrire(() => api.createWorkspace(nom));
                  }}
                />
              </Group>
            )}
          </Stack>
        )}
        {/* Au plus près de la liste qu'il allonge. */}
        <AddButton label="Ajouter un workspace" onClick={() => setEnAjout(true)} mt={4} />
      </div>

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            leftSection={<IconUsers size={16} />}
            onClick={() => {
              setAccesDe(menu.workspace);
              setMenu(null);
            }}
          >
            Accès
          </Menu.Item>
          {workspaces.length > 1 && (
            <>
              <Menu.Divider />
              <Menu.Item
                color={RED}
                leftSection={<IconTrash size={16} />}
                onClick={() => {
                  setASupprimer(menu.workspace);
                  setMenu(null);
                }}
              >
                Supprimer
              </Menu.Item>
            </>
          )}
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={aSupprimer !== null}
        onClose={() => setASupprimer(null)}
        onConfirm={async () => {
          const w = aSupprimer;
          setASupprimer(null);
          if (w) await ecrire(() => api.deleteWorkspace(w.id));
        }}
        title="Supprimer le workspace"
        message={
          <>
            Voulez-vous vraiment supprimer « {aSupprimer?.name} » ? Toutes ses vues et tout ce
            qu'elles contiennent seront supprimés. Cette action est irréversible.
          </>
        }
      />

      <Modal
        opened={accesDe !== null}
        onClose={() => {
          setAccesDe(null);
          void lireAcces();
        }}
        title={`Accès — ${accesDe?.name ?? ""}`}
        centered
        // Un fondu sur place, sans glisser : de la taille du Paramétrage et
        // au même endroit, elle paraît par-dessus lui. Sans voile non plus :
        // celui du Paramétrage est déjà derrière.
        transitionProps={{ transition: "fade" }}
        withOverlay={false}
        // La taille du Paramétrage, d'où elle s'ouvre : la liste défile dans
        // sa hauteur, « Fermer » reste en bas.
        size={LARGEUR_PARAMETRAGE}
        padding={PADDING_PARAMETRAGE}
        withCloseButton={false}
        styles={{
          ...modalHeaderStyles(PADDING_PARAMETRAGE),
          content: {
            height: HAUTEUR_PARAMETRAGE,
            maxHeight: HAUTEUR_MAX_PARAMETRAGE,
            display: "flex",
            flexDirection: "column",
          },
          body: {
            ...modalHeaderStyles(PADDING_PARAMETRAGE).body,
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <Stack gap="xl" style={{ flex: 1, minHeight: 0 }}>
          <ScrollArea
            type="auto"
            scrollbars="y"
            style={{ flex: 1, minHeight: 0 }}
            classNames={{ scrollbar: defilement.scrollbar, thumb: defilement.thumb }}
          >
            {accesDe && <WorkspaceAccess workspace={accesDe.id} onChange={onAccessChanged} />}
          </ScrollArea>
          <Group justify="flex-end">
            <BoutonFermer
              onClick={() => {
                setAccesDe(null);
                void lireAcces();
              }}
            />
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
