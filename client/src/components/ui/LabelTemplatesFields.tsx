import { IconTag, IconTemplate } from "@tabler/icons-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { DEFAULT_LABEL_ZPL, LABEL_TEMPLATE_NAME_MAX, isCustomLabelZpl } from "@milo/shared";
import type { LabelTemplate, LabelTemplateKind, LabelTemplates, PaperFormat } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import LabelTemplateModal from "../settings/LabelTemplateModal";
import DeleteConfirmModal from "./DeleteConfirmModal";
import { Reset } from "./SettingRows";
import { CopyPasteContext } from "./CopyPasteActions";
import { DrawerRegistrationsContext } from "./IndicatorDrawer";
import { ROW_INSET, RowButton, pluralize } from "./DrawerRows";
import { ListRows } from "./EditableRows";
import type { Column, Row } from "./EditableRows";

// The open board's label templates of an asset kind, in the drawer of its
// list widget: a name and a paper format each, and the ZPL its "Modèle"
// button opens (LabelTemplateModal). Like the asset lists
// (DeclaredAssetTablesFields), they are board data, shared by all the kind's
// widgets: the rows go with "Sauvegarder", a template's ZPL is written as soon
// as its window's "Enregistrer" is clicked — as an e-mail template's —, the
// list with it.

/** The width of the format column. */
const FORMAT_WIDTH = 150;

/** Nothing recorded yet. */
const NOTHING: LabelTemplates = { templates: [], variables: [] };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function LabelTemplatesFields({ kind }: { kind: LabelTemplateKind }) {
  const board = useContext(CopyPasteContext);
  const register = useContext(DrawerRegistrationsContext);
  const boardId = board?.board?.id ?? null;
  // A paste from the "Actions" menu may change the board: it is re-read.
  const pastes = board?.pastes ?? 0;

  /** What the server holds, and the draft made from it. */
  const [original, setOriginal] = useState<LabelTemplates>(NOTHING);
  const [draft, setDraft] = useState<LabelTemplates>(NOTHING);
  const [formats, setFormats] = useState<PaperFormat[]>([]);
  /** The template whose ZPL is open, by rank. */
  const [edited, setEdited] = useState<number | null>(null);
  /** The template whose ZPL is about to go back to Milo's, by rank. */
  const [toReset, setToReset] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (boardId === null) return;
    try {
      const [read, paper] = await Promise.all([
        api.getLabelTemplates(kind, boardId),
        api.getPaperFormats(),
      ]);
      setOriginal(read);
      setDraft(read);
      setFormats(paper);
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
      const saved = await api.updateLabelTemplates(kind, boardId, after.templates);
      setOriginal(saved);
      setDraft(saved);
    });
  }, [register, kind, boardId]);

  if (boardId === null || !register) return null;

  const formatName = (id: number | null) => formats.find((f) => f.id === id)?.name ?? "";

  const columns: Column[] = [
    { label: "Nom", maxLength: LABEL_TEMPLATE_NAME_MAX },
    {
      label: "Format d'étiquette",
      maxLength: LABEL_TEMPLATE_NAME_MAX,
      width: FORMAT_WIDTH,
      options: formats.map((f) => f.name),
    },
  ];

  /**
   * The rows as typed, back to templates: each keeps its ZPL — by its rank
   * when the list keeps its length (a row renamed), by its name otherwise (a
   * row added at the end, rows deleted). An added one starts from Milo's.
   */
  const save = async (list: Row[]): Promise<boolean> => {
    setDraft((before) => {
      const byName = new Map(before.templates.map((t) => [t.name.toLowerCase(), t.zpl]));
      const kept = list.length === before.templates.length;
      const templates: LabelTemplate[] = list.map(([name = "", format = ""], rank) => ({
        name,
        paper_format_id: formats.find((f) => f.name === format)?.id ?? null,
        zpl:
          (kept ? before.templates[rank]?.zpl : byName.get(name.toLowerCase())) ?? DEFAULT_LABEL_ZPL,
      }));
      return { ...before, templates };
    });
    return true;
  };

  /**
   * A template's ZPL, written at once, as an e-mail template's: the list goes
   * with it, as the drawer shows it — the template may be a row not yet saved.
   */
  const writeZpl = async (rank: number, zpl: string) => {
    const templates = draft.templates.map((t, i) => (i === rank ? { ...t, zpl } : t));
    const saved = await api.updateLabelTemplates(kind, boardId, templates);
    setOriginal(saved);
    setDraft(saved);
  };

  const reset = async (rank: number) => {
    setToReset(null);
    try {
      await writeZpl(rank, DEFAULT_LABEL_ZPL);
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const template = edited === null ? null : (draft.templates[edited] ?? null);

  return (
    <>
      <ListRows
        title="Modèles d'étiquette"
        description="Les modèles d'étiquette configurés ci-dessous sont communs à l'ensemble des widgets, de ce type, du tableau actuel et uniquement pour ce tableau. Chacun s'imprime sur l'imprimante de son format d'étiquette."
        columns={columns}
        rows={draft.templates.map((t) => [t.name, formatName(t.paper_format_id)])}
        save={save}
        emptyIcon={IconTag}
        emptyText="Aucun modèle d'étiquette"
        addLabel="Ajouter un modèle"
        deleteTitle="Supprimer le modèle"
        several={(n) => pluralize(n, "modèle")}
        // At the start, as the e-mail templates': the button that goes back
        // to Milo's, green once the template is modified — the added row's
        // starts from it.
        leading={(row, rank) => (
          <Reset
            active={row !== null && isCustomLabelZpl(draft.templates[rank]?.zpl ?? "")}
            what="du modèle"
            onClick={() => setToReset(rank)}
          />
        )}
        trailing={(_row, rank) => (
          <RowButton icon={IconTemplate} onClick={() => setEdited(rank)} rightMargin={5 - ROW_INSET}>
            Modèle
          </RowButton>
        )}
      />
      <LabelTemplateModal
        template={template}
        kind={kind}
        boardId={boardId}
        variables={draft.variables}
        format={formats.find((f) => f.id === template?.paper_format_id) ?? null}
        onClose={() => setEdited(null)}
        onSave={(zpl) => (edited === null ? Promise.resolve() : writeZpl(edited, zpl))}
        canEdit
      />
      <DeleteConfirmModal
        opened={toReset !== null}
        onClose={() => setToReset(null)}
        onConfirm={() => toReset !== null && void reset(toReset)}
        title="Réinitialiser le modèle"
        message={`Le modèle « ${toReset === null ? "" : (draft.templates[toReset]?.name ?? "")} » reprendra sa version d'origine. Ses modifications seront perdues.`}
        confirmLabel="Réinitialiser"
      />
    </>
  );
}
