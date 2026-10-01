import { Stack } from "@mantine/core";
import { IconKey } from "@tabler/icons-react";
import { useState } from "react";
import SectionBlocks from "../components/access/SectionBlocks";
import BoardTabs from "../components/ui/BoardTabs";
import DeleteConfirmModal from "../components/ui/DeleteConfirmModal";
import EmptyPanel from "../components/ui/EmptyPanel";
import SectionsBoard from "../components/ui/SectionsBoard";
import type { AccountSlot } from "../components/ui/AccountControls";
import type {
  AccessBlock,
  AccessBlockType,
  AccessCategory,
  AccessSection,
  Id,
} from "@milo/shared";

// Le mode Accès : ses catégories en onglets, comme les tableaux des modes
// Projet et Tâche, et les sections de la catégorie ouverte en colonnes. Les
// données et les tiroirs restent à l'application (App.tsx), cette page ne fait
// que les mettre en scène.
interface AccessPageProps {
  /** « null » tant que les catégories ne sont pas lues ; « [] » quand il n'y en a pas. */
  categories: AccessCategory[] | null;
  categoryId: string | null;
  onCategoryChange: (id: string | null) => void;
  onAddCategory: () => void;
  /** Rendre une catégorie privée, ou de nouveau visible de tous, depuis le menu de son onglet. */
  onTogglePrivateCategory: (id: number) => void | Promise<void>;
  /** Renommer un onglet sur place, au double clic sur son nom. */
  onRenameCategory: (id: number, name: string) => void | Promise<void>;
  onDeleteCategory: (id: number) => void | Promise<void>;
  /** Le nouvel ordre des onglets, glissés dans la rangée. */
  onReorderCategories: (ids: number[]) => void | Promise<void>;
  /** Verrouiller ou déverrouiller une catégorie depuis le menu de son onglet. */
  onToggleCategoryLock: (id: number) => void | Promise<void>;
  /** « null » tant que les sections de la catégorie ouverte ne sont pas lues. */
  sections: AccessSection[] | null;
  /** Sans rang, la section va au bout ; le « + » entre deux colonnes en donne un. */
  onAddSection: (index?: number) => void;
  onEditSection: (section: AccessSection) => void;
  /** La copie, avec ses éléments, se pose à droite de l'original. */
  onDuplicateSection: (section: AccessSection) => void | Promise<void>;
  /** Supprimée depuis le clic droit : la page a déjà posé la question. */
  onDeleteSection: (section: AccessSection) => void | Promise<void>;
  /** Le nouvel ordre des colonnes, posé par leur poignée. */
  onReorderSections: (ids: Id[]) => void | Promise<void>;
  /** L'écart qui suit une colonne, saisi au-dessus de lui. */
  onChangeSectionGap: (section: AccessSection, gap: number) => void | Promise<void>;
  /** Ce que les sections portent, toutes colonnes confondues. */
  blocks: AccessBlock[];
  /** La zone en pointillé d'une colonne : elle ouvre la boîte de choix. */
  onAddBlock: (section: AccessSection) => void;
  onEditBlock: (block: AccessBlock) => void;
  /** Un élément modifié depuis la colonne même, sans passer par son tiroir. */
  onChangeBlockConfig: (
    block: AccessBlock,
    config: Record<string, unknown>,
  ) => void | Promise<void>;
  /** Ce que la colonne porte désormais, dans l'ordre : le rangement part au serveur. */
  onReorderBlocks: (sectionId: Id, ids: Id[]) => void | Promise<void>;
  /** La copie se pose sous l'original, et son tiroir s'ouvre. */
  onDuplicateBlock: (block: AccessBlock) => void | Promise<void>;
  onDeleteBlock: (block: AccessBlock) => void | Promise<void>;
  /** « Créer une tâche », au clic droit sur un élément. */
  onCreateTask: (block: AccessBlock) => void;
  /** « Créer une demande de support », au clic droit sur un lien. */
  onCreateSupportRequest: (block: AccessBlock) => void;
  /** Une catégorie devient sous-catégorie, et l'inverse. */
  onConvertBlock: (block: AccessBlock, type: AccessBlockType) => void | Promise<void>;
  /** La société et le compte, posés au bout de la rangée d'onglets. */
  account: AccountSlot;
  loading: boolean;
}

export default function AccessPage({
  categories,
  categoryId,
  onCategoryChange,
  onAddCategory,
  onTogglePrivateCategory,
  onRenameCategory,
  onDeleteCategory,
  onReorderCategories,
  onToggleCategoryLock,
  sections,
  onAddSection,
  onEditSection,
  onDuplicateSection,
  onDeleteSection,
  onReorderSections,
  onChangeSectionGap,
  blocks,
  onAddBlock,
  onEditBlock,
  onChangeBlockConfig,
  onReorderBlocks,
  onDuplicateBlock,
  onDeleteBlock,
  onCreateTask,
  onCreateSupportRequest,
  onConvertBlock,
  account,
  loading,
}: AccessPageProps) {
  /** L'élément dont on vient de demander la suppression, ou « null ». */
  const [blocASupprimer, setBlocASupprimer] = useState<AccessBlock | null>(null);

  // Le verrou est celui de la catégorie ouverte : il vaut pour toutes ses
  // colonnes et tout ce qu'elles portent.
  const categorieOuverte = categories?.find((c) => String(c.id) === categoryId);
  const verrouille = categorieOuverte?.is_locked === 1;

  /** Ce qu'une colonne porte, dans l'ordre. */
  const blocsDe = (section: AccessSection) =>
    blocks.filter((bloc) => bloc.section_id === section.id);

  // Les colonnes de la catégorie ouverte, et ce qu'elles portent.
  const colonnes = (
    <SectionsBoard
      sections={sections}
      locked={verrouille}
      widgetIds={(section) => blocsDe(section).map((b) => b.id)}
      renderWidgets={(section, drag) => (
        <SectionBlocks
          blocks={blocsDe(section)}
          sectionId={section.id}
          drag={drag}
          onEditBlock={onEditBlock}
          onConfigChange={onChangeBlockConfig}
          onCreateTask={onCreateTask}
          onCreateSupportRequest={onCreateSupportRequest}
          onDuplicateBlock={onDuplicateBlock}
          onDeleteBlock={setBlocASupprimer}
          onConvertBlock={onConvertBlock}
          locked={verrouille}
        />
      )}
      onAddWidget={onAddBlock}
      onReorderWidgets={onReorderBlocks}
      onAddSection={onAddSection}
      onEditSection={onEditSection}
      onDuplicateSection={onDuplicateSection}
      onDeleteSection={onDeleteSection}
      onReorderSections={onReorderSections}
      onChangeGap={onChangeSectionGap}
    />
  );

  // Sans catégorie, l'invite prend la place du contenu — mais sous la rangée,
  // qui reste : c'est elle qui porte le compte, et on doit pouvoir s'en servir
  // même quand le mode est vide. Rien pendant une lecture : « aucune
  // catégorie » serait une conclusion prématurée.
  const contenu =
    !categories || categories.length === 0 ? (
      loading || !categories ? null : (
        <EmptyPanel
          icon={IconKey}
          message="Aucune catégorie"
          actionLabel="Nouvelle catégorie"
          onAction={onAddCategory}
        />
      )
    ) : (
      colonnes
    );

  return (
    <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
      <BoardTabs
        boards={categories ?? []}
        value={categoryId}
        onChange={onCategoryChange}
        onAdd={onAddCategory}
        onTogglePrivate={onTogglePrivateCategory}
        onRename={onRenameCategory}
        onDelete={onDeleteCategory}
        onReorder={onReorderCategories}
        onToggleLock={onToggleCategoryLock}
        deleteTitle="Supprimer la catégorie"
        account={account}
      />

      {contenu}

      {/* La suppression demandée au clic droit : elle se confirme, comme
          partout ailleurs. */}
      <DeleteConfirmModal
        opened={blocASupprimer !== null}
        onClose={() => setBlocASupprimer(null)}
        onConfirm={async () => {
          const bloc = blocASupprimer;
          setBlocASupprimer(null);
          if (bloc) await onDeleteBlock(bloc);
        }}
        title="Supprimer l'élément"
        message={<>Voulez-vous vraiment supprimer cet élément ? Cette action est irréversible.</>}
      />

    </Stack>
  );
}
