import { Group, Input, Menu, Select, Stack } from "@mantine/core";
import { IconTemplate, IconTrash } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import type { Id, SupportVariableGroup } from "@milo/shared";
import { messageErreur } from "../../lib/errors";
import { RED } from "../../themes/colors";
import AddButton from "../ui/AddButton";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import {
  ARRONDI,
  BoutonDeLigne,
  ChampDeLigne,
  ListeVide,
  RETRAIT_LIGNE,
  STYLE_SAISIE,
  styleLigne,
} from "../ui/LignesDuTiroir";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "../ui/PointMenu";
import SupportReplyModal from "./SupportReplyModal";
import type { ComponentType } from "react";

// Une liste de modèles du Support, au Paramétrage : les notifications
// automatiques, les contenus par défaut. Elle se présente comme les listes
// des tiroirs (ChampsColonnes) : une ligne par modèle, son intitulé à même la
// ligne, l'évènement qui s'en sert — un seul par modèle, et un seul modèle
// par évènement —, puis le bouton « Modèle » qui ouvre son HTML. Le clic
// droit le supprime ; « Ajouter » pose une ligne vide, créée dès qu'elle a
// un intitulé.

/** De quoi lire « Demande prise en charge ». */
const LARGEUR_EVENEMENT = 190;

interface Modele<E extends string> {
  id: Id;
  name: string;
  html: string;
  event: E | null;
}

interface ChoixEvenementProps<E extends string> {
  evenements: readonly { value: E; label: string }[];
  value: E | null;
  onChange: (event: E | null) => void;
  /** Les évènements que portent déjà les autres modèles : grisés. */
  pris: E[];
  disabled?: boolean;
}

/** L'évènement d'un modèle : un champ « xs » de la ligne. */
function ChoixEvenement<E extends string>({
  evenements,
  value,
  onChange,
  pris,
  disabled,
}: ChoixEvenementProps<E>) {
  const [saisi, setSaisi] = useState(false);
  return (
    <Select
      data={evenements.map((e) => ({
        value: e.value,
        label: e.label,
        disabled: pris.includes(e.value),
      }))}
      value={value}
      onChange={(v) => onChange(evenements.find((e) => e.value === v)?.value ?? null)}
      placeholder="Aucun évènement"
      allowDeselect
      size="xs"
      radius={ARRONDI}
      w={LARGEUR_EVENEMENT}
      style={{ flexShrink: 0 }}
      comboboxProps={{ withinPortal: true }}
      onFocus={() => setSaisi(true)}
      onBlur={() => setSaisi(false)}
      styles={saisi ? { input: STYLE_SAISIE } : undefined}
      disabled={disabled}
      aria-label="Évènement"
    />
  );
}

interface SupportTemplatesProps<E extends string> {
  label: string;
  evenements: readonly { value: E; label: string }[];
  charger: () => Promise<Modele<E>[]>;
  creer: (name: string, event: E | null) => Promise<unknown>;
  modifier: (id: Id, data: { name?: string; html?: string; event?: E | null }) => Promise<unknown>;
  supprimer: (id: Id) => Promise<unknown>;
  /** Le bouton d'ajout, et ce qu'on supprime : « la réponse ». */
  addTitle: string;
  entityLabel: string;
  emptyIcon: ComponentType<{ size?: number }>;
  emptyText: string;
  canEdit: boolean;
  onError: (message: string) => void;
  /** Les provenances de variables que ses modèles peuvent citer. */
  groupesVariables?: readonly SupportVariableGroup[];
}

export default function SupportTemplates<E extends string>({
  label,
  evenements,
  charger,
  creer,
  modifier,
  supprimer,
  addTitle,
  entityLabel,
  emptyIcon,
  emptyText,
  canEdit,
  onError,
  groupesVariables,
}: SupportTemplatesProps<E>) {
  // Les modèles, et celui dont la fenêtre est ouverte.
  const [modeles, setModeles] = useState<Modele<E>[]>([]);
  const [modeleDe, setModeleDe] = useState<Id | null>(null);
  // La ligne ajoutée, en attente de son intitulé.
  const [enAjout, setEnAjout] = useState(false);
  const [menu, setMenu] = useState<{ modele: Modele<E>; position: PointMenuPosition } | null>(
    null,
  );
  const [aSupprimer, setASupprimer] = useState<Modele<E> | null>(null);

  const relire = useCallback(async () => {
    try {
      setModeles(await charger());
    } catch (e) {
      onError(messageErreur(e));
    }
  }, [charger, onError]);

  useEffect(() => {
    void relire();
  }, [relire]);

  /** Un appel à l'API, suivi de la relecture des modèles. */
  const ecrire = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      onError(messageErreur(e));
    }
    await relire();
  };

  /** Les évènements déjà pris, sauf celui du modèle donné. */
  const evenementsPris = (sauf?: Id): E[] =>
    modeles.flatMap((m) => (m.id !== sauf && m.event ? [m.event] : []));

  const total = modeles.length + (enAjout ? 1 : 0);

  return (
    <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <Input.Wrapper label={label}>
        {total === 0 ? (
          <ListeVide icon={emptyIcon} message={emptyText} />
        ) : (
          <Stack gap={1}>
            {modeles.map((m, rang) => (
              <Group
                key={m.id}
                gap="sm"
                wrap="nowrap"
                onContextMenu={(e) => {
                  if (!canEdit) return;
                  setMenu({ modele: m, position: positionDuMenu(e) });
                }}
                style={{ ...styleLigne(rang, total, false), paddingLeft: RETRAIT_LIGNE }}
              >
                <ChampDeLigne
                  nom={m.name}
                  placeholder="Intitulé"
                  label={`Intitulé de ${m.name}`}
                  onValider={(nom) => {
                    if (nom && nom !== m.name) void ecrire(() => modifier(m.id, { name: nom }));
                  }}
                />
                <ChoixEvenement
                  evenements={evenements}
                  value={m.event}
                  onChange={(event) => void ecrire(() => modifier(m.id, { event }))}
                  pris={evenementsPris(m.id)}
                  disabled={!canEdit}
                />
                <BoutonDeLigne
                  icon={IconTemplate}
                  onClick={() => setModeleDe(m.id)}
                  // À 5 px du bout de la ligne, retrait compris.
                  margeDroite={5 - RETRAIT_LIGNE}
                >
                  Modèle
                </BoutonDeLigne>
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
                  placeholder="Intitulé"
                  label={`Intitulé de ${entityLabel}`}
                  autoFocus
                  // Quittée sans intitulé, la ligne s'efface ; nommée, elle est
                  // créée, sans évènement : il se choisit ensuite sur sa ligne.
                  onValider={(nom) => {
                    setEnAjout(false);
                    if (nom) void ecrire(() => creer(nom, null));
                  }}
                />
              </Group>
            )}
          </Stack>
        )}
        {/* Au plus près de la liste qu'il allonge. */}
        {canEdit && <AddButton label={addTitle} onClick={() => setEnAjout(true)} mt={4} />}
      </Input.Wrapper>

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              setASupprimer(menu.modele);
              setMenu(null);
            }}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={aSupprimer !== null}
        onClose={() => setASupprimer(null)}
        onConfirm={async () => {
          const m = aSupprimer;
          setASupprimer(null);
          if (m) await ecrire(() => supprimer(m.id));
        }}
        title={`Supprimer ${entityLabel}`}
        message={
          <>
            Voulez-vous vraiment supprimer « {aSupprimer?.name} » ? Cette action est
            irréversible.
          </>
        }
      />

      <SupportReplyModal
        reply={modeles.find((m) => m.id === modeleDe) ?? null}
        onClose={() => setModeleDe(null)}
        onSave={async (modele: { html: string }) => {
          if (modeleDe !== null) await modifier(modeleDe, modele);
          await relire();
        }}
        canEdit={canEdit}
        groupes={groupesVariables}
      />
    </fieldset>
  );
}
