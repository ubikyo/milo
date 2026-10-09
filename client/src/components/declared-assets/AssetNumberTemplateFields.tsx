import { IconCode, IconHash } from "@tabler/icons-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  ASSET_NUMBER_TEMPLATE_NAME_MAX,
  DEFAULT_ASSET_NUMBER_CODE,
  isCustomAssetNumberCode,
} from "@milo/shared";
import type { AssetNumberTemplate, AssetNumberTemplates, DeclaredAssetKind } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import AssetNumberTemplateModal from "../settings/AssetNumberTemplateModal";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import { Reset } from "../ui/SettingRows";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import { DrawerRegistrationsContext } from "../ui/IndicatorDrawer";
import { ROW_INSET, RowButton, pluralize } from "../ui/DrawerRows";
import { ListRows } from "../ui/EditableRows";
import type { Column, Row } from "../ui/EditableRows";

// The open board's asset number templates of a declared asset kind, in the
// drawer of its list widget: a name each, and the TypeScript its "Modèle"
// button opens (AssetNumberTemplateModal). As the label templates
// (LabelTemplatesFields), they are board data, shared by all the kind's
// widgets: the rows go with "Sauvegarder", a template's code is written as
// soon as its window's "Enregistrer" is clicked, the list with it.

/** Nothing recorded yet. */
const NOTHING: AssetNumberTemplates = { templates: [], variables: [] };

const COLUMNS: Column[] = [{ label: "Nom", maxLength: ASSET_NUMBER_TEMPLATE_NAME_MAX }];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function AssetNumberTemplateFields({ kind }: { kind: DeclaredAssetKind }) {
  const board = useContext(CopyPasteContext);
  const register = useContext(DrawerRegistrationsContext);
  const boardId = board?.board?.id ?? null;
  // A paste from the "Actions" menu may change the board: it is re-read.
  const pastes = board?.pastes ?? 0;

  /** What the server holds, and the draft made from it. */
  const [original, setOriginal] = useState<AssetNumberTemplates>(NOTHING);
  const [draft, setDraft] = useState<AssetNumberTemplates>(NOTHING);
  /** The template whose code is open, by rank. */
  const [edited, setEdited] = useState<number | null>(null);
  /** The template whose code is about to go back to Milo's, by rank. */
  const [toReset, setToReset] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (boardId === null) return;
    try {
      const read = await api.getAssetNumberTemplates(kind, boardId);
      setOriginal(read);
      setDraft(read);
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [kind, boardId]);

  useEffect(() => {
    void reload();
  }, [reload, pastes]);

  // "Sauvegarder": the list goes whole, if it changed. The server checks it;
  // an error stops the drawer's save, the draft kept.
  const state = useRef({ original, draft });
  useEffect(() => {
    state.current = { original, draft };
  }, [original, draft]);
  useEffect(() => {
    if (!register || boardId === null) return;
    return register(async () => {
      const { original: before, draft: after } = state.current;
      if (same(before.templates, after.templates)) return;
      const saved = await api.updateAssetNumberTemplates(kind, boardId, after.templates);
      setOriginal(saved);
      setDraft(saved);
    });
  }, [register, kind, boardId]);

  if (boardId === null || !register) return null;

  /**
   * The rows as typed, back to templates: each keeps its code — by its rank
   * when the list keeps its length (a row renamed), by its name otherwise (a
   * row added at the end, rows deleted). An added one starts from Milo's.
   */
  const save = async (list: Row[]): Promise<boolean> => {
    setDraft((before) => {
      const byName = new Map(before.templates.map((t) => [t.name.toLowerCase(), t.code]));
      const kept = list.length === before.templates.length;
      const templates: AssetNumberTemplate[] = list.map(([name = ""], rank) => ({
        name,
        code:
          (kept ? before.templates[rank]?.code : byName.get(name.toLowerCase())) ??
          DEFAULT_ASSET_NUMBER_CODE,
      }));
      return { ...before, templates };
    });
    return true;
  };

  /**
   * A template's code, written at once, as a label template's: the list goes
   * with it, as the drawer shows it — the template may be a row not yet saved.
   */
  const writeCode = async (rank: number, code: string) => {
    const templates = draft.templates.map((t, i) => (i === rank ? { ...t, code } : t));
    const saved = await api.updateAssetNumberTemplates(kind, boardId, templates);
    setOriginal(saved);
    setDraft(saved);
  };

  const reset = async (rank: number) => {
    setToReset(null);
    try {
      await writeCode(rank, DEFAULT_ASSET_NUMBER_CODE);
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const template = edited === null ? null : (draft.templates[edited] ?? null);

  return (
    <>
      <ListRows
        title="Formats de numéro d'asset"
        description="Les formats configurés ci-dessous sont communs à l'ensemble des widgets, de ce type, du tableau actuel et uniquement pour ce tableau. Écrit en TypeScript, chacun construit le numéro d'un nouvel asset à partir de ses étiquettes."
        columns={COLUMNS}
        rows={draft.templates.map((t) => [t.name])}
        save={save}
        emptyIcon={IconHash}
        emptyText="Aucun format de numéro d'asset"
        addLabel="Ajouter un format de numéro d'asset"
        deleteTitle="Supprimer le format"
        several={(n) => pluralize(n, "format")}
        // At the start, as the label templates': the button that goes back to
        // Milo's, green once the code is modified — the added row's starts
        // from it.
        leading={(row, rank) => (
          <Reset
            active={row !== null && isCustomAssetNumberCode(draft.templates[rank]?.code ?? "")}
            what="du format"
            onClick={() => setToReset(rank)}
          />
        )}
        trailing={(_row, rank) => (
          <RowButton icon={IconCode} onClick={() => setEdited(rank)} rightMargin={5 - ROW_INSET}>
            Modèle
          </RowButton>
        )}
      />
      <AssetNumberTemplateModal
        template={template}
        variables={draft.variables}
        onClose={() => setEdited(null)}
        onSave={(code) => (edited === null ? Promise.resolve() : writeCode(edited, code))}
        canEdit
      />
      <DeleteConfirmModal
        opened={toReset !== null}
        onClose={() => setToReset(null)}
        onConfirm={() => toReset !== null && void reset(toReset)}
        title="Réinitialiser le format"
        message={`Le format « ${toReset === null ? "" : (draft.templates[toReset]?.name ?? "")} » reprendra sa version d'origine. Ses modifications seront perdues.`}
        confirmLabel="Réinitialiser"
      />
    </>
  );
}
