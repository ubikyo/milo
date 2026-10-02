import { Box, Input, Select } from "@mantine/core";
import { IconTemplate } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import type { Id, SupportVariableGroup } from "@milo/shared";
import { messageErreur } from "../../lib/errors";
import LookupManager from "../ui/LookupManager";
import SupportReplyModal from "./SupportReplyModal";
import type { ComponentType } from "react";

// Une liste de modèles du Support, au Paramétrage : les notifications
// automatiques, les contenus par défaut. Un intitulé par ligne, son modèle
// HTML dans la fenêtre qu'ouvre le menu de la ligne (« Modèle »), et
// l'évènement qui s'en sert au bout de la ligne, dès l'ajout : un seul par
// modèle, et un seul modèle par évènement.

// Hauteur et largeur du choix de l'évènement : celles du texte de la ligne
// (LookupManager), et de quoi lire « Demande prise en charge ».
const HAUTEUR_EVENEMENT = 22;
const LARGEUR_EVENEMENT = 210;

// Ce qui suit l'évènement de la ligne d'ajout : la touche Entrée (ActionIcon
// « sm », 22 px), et son retrait droit (10 px) au lieu de celui des lignes
// (5 px, LookupManager). Réservé au bout des lignes, il aligne leur évènement
// sur celui de la ligne d'ajout.
const RESERVE_ENTREE = 22 + 10 - 5;

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

/** L'évènement d'un modèle, sans cadre : la liste en est le cadre. */
function ChoixEvenement<E extends string>({
  evenements,
  value,
  onChange,
  pris,
  disabled,
}: ChoixEvenementProps<E>) {
  return (
    <Select
      data={evenements.map((e) => ({
        value: e.value,
        label: e.label,
        disabled: pris.includes(e.value),
      }))}
      value={value}
      onChange={(v) =>
        onChange(evenements.find((e) => e.value === v)?.value ?? null)
      }
      placeholder="Aucun évènement"
      allowDeselect
      variant="unstyled"
      size="sm"
      w={LARGEUR_EVENEMENT}
      style={{ flexShrink: 0 }}
      comboboxProps={{ withinPortal: true }}
      styles={{
        input: {
          height: HAUTEUR_EVENEMENT,
          minHeight: HAUTEUR_EVENEMENT,
          lineHeight: `${HAUTEUR_EVENEMENT}px`,
          textAlign: "right",
        },
      }}
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
  modifier: (
    id: Id,
    data: { name?: string; html?: string; event?: E | null },
  ) => Promise<unknown>;
  supprimer: (id: Id) => Promise<unknown>;
  /** Le texte de la ligne d'ajout, et ce qu'on supprime : « la réponse ». */
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
  // L'évènement du modèle en cours d'ajout.
  const [nouvelEvenement, setNouvelEvenement] = useState<E | null>(null);

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
  const puisRelire =
    <Args extends unknown[]>(fn: (...args: Args) => Promise<unknown>) =>
    async (...args: Args) => {
      await fn(...args);
      await relire();
    };

  /** Les évènements déjà pris, sauf celui du modèle donné. */
  const evenementsPris = (sauf?: Id): E[] =>
    modeles.flatMap((m) => (m.id !== sauf && m.event ? [m.event] : []));

  const choisirEvenement = async (id: Id, event: E | null) => {
    try {
      await modifier(id, { event });
    } catch (e) {
      onError(messageErreur(e));
    }
    await relire();
  };

  return (
    <fieldset
      disabled={!canEdit}
      style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
    >
      <Input.Wrapper label={label}>
        <LookupManager
          items={modeles}
          onCreate={puisRelire(async (name: string) => {
            await creer(name, nouvelEvenement);
            setNouvelEvenement(null);
          })}
          onUpdate={puisRelire((id: number, name: string) =>
            modifier(id, { name }),
          )}
          onDelete={puisRelire(supprimer)}
          addTitle={addTitle}
          maxRows={10}
          emptyIcon={emptyIcon}
          emptyText={emptyText}
          entityLabel={entityLabel}
          addEnd={
            <ChoixEvenement
              evenements={evenements}
              value={nouvelEvenement}
              onChange={setNouvelEvenement}
              pris={evenementsPris()}
              disabled={!canEdit}
            />
          }
          renderTags={(item) => (
            <>
              <ChoixEvenement
                evenements={evenements}
                value={modeles.find((m) => m.id === item.id)?.event ?? null}
                onChange={(event) => void choisirEvenement(item.id, event)}
                pris={evenementsPris(item.id)}
                disabled={!canEdit}
              />
              <Box w={RESERVE_ENTREE} style={{ flexShrink: 0 }} />
            </>
          )}
          renderActions={(item) => [
            {
              label: "Modèle",
              icon: IconTemplate,
              onClick: () => setModeleDe(item.id),
            },
          ]}
        />
      </Input.Wrapper>

      <SupportReplyModal
        reply={modeles.find((m) => m.id === modeleDe) ?? null}
        onClose={() => setModeleDe(null)}
        onSave={puisRelire(async (modele: { html: string }) => {
          if (modeleDe !== null) await modifier(modeleDe, modele);
        })}
        canEdit={canEdit}
        groupes={groupesVariables}
      />
    </fieldset>
  );
}
