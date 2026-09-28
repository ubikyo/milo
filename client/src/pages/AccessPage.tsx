import { Box, Group, Menu, Stack, UnstyledButton } from "@mantine/core";
import { IconColumns, IconKey } from "@tabler/icons-react";
import type { CSSProperties } from "react";
import SectionDropZone from "../components/access/SectionDropZone";
import BoardTabs from "../components/ui/BoardTabs";
import EmptyPanel from "../components/ui/EmptyPanel";
import { pluginDe } from "../plugins";
import type { AccessBlock, AccessCategory, AccessSection } from "@milo/shared";

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
  onEditCategory: () => void;
  onDeleteCategory: () => void | Promise<void>;
  /** « null » tant que les sections de la catégorie ouverte ne sont pas lues. */
  sections: AccessSection[] | null;
  onAddSection: () => void;
  /** Ce que les sections portent, toutes colonnes confondues. */
  blocks: AccessBlock[];
  /** La zone en pointillé d'une colonne : elle ouvre la boîte de choix. */
  onAddBlock: (section: AccessSection) => void;
  onEditBlock: (block: AccessBlock) => void;
  loading: boolean;
}

// Espace entre deux colonnes, et largeur en deçà de laquelle une colonne
// automatique ne se resserre plus : la même respiration que la rangée de
// listes du mode Tâche.
const SECTION_GAP = 15;
const SECTION_MIN_WIDTH = 200;

// Espace entre deux éléments d'une même colonne, et entre le dernier et la
// zone d'ajout.
const BLOCK_GAP = 8;

/**
 * La largeur que la section dit. « Automatique » laisse la rangée la répartir
 * à parts égales ; les deux autres la fixent, et la colonne ne se resserre ni
 * ne s'étire — celles qui ne tiennent plus passent à la ligne suivante.
 */
const largeurDe = (section: AccessSection): CSSProperties => {
  if (section.width_unit === "auto") {
    return { flex: `1 1 ${SECTION_MIN_WIDTH}px`, minWidth: SECTION_MIN_WIDTH };
  }
  const unite = section.width_unit === "percent" ? "%" : "px";
  return { flex: `0 0 ${section.width_value ?? 0}${unite}`, minWidth: 0 };
};

export default function AccessPage({
  categories,
  categoryId,
  onCategoryChange,
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
  sections,
  onAddSection,
  blocks,
  onAddBlock,
  onEditBlock,
  loading,
}: AccessPageProps) {
  // Rien à montrer tant que les catégories ne sont pas connues, ni pendant une
  // lecture : l'écran vide attend d'être une certitude.
  if (!categories) return null;
  if (categories.length === 0) {
    return loading ? null : (
      <EmptyPanel
        icon={IconKey}
        message="Aucune catégorie"
        actionLabel="Nouvelle catégorie"
        onAction={onAddCategory}
      />
    );
  }

  // Les colonnes de la catégorie ouverte. Tant qu'elles ne sont pas lues, on
  // n'affiche rien : « aucune section » serait une conclusion prématurée.
  const colonnes = !sections ? null : sections.length === 0 ? (
    <EmptyPanel
      icon={IconColumns}
      message="Aucune section"
      actionLabel="Ajouter une section"
      onAction={onAddSection}
    />
  ) : (
    <Group
      align="stretch"
      gap={SECTION_GAP}
      wrap="wrap"
      // Les colonnes occupent la hauteur restante : c'est elle que la zone en
      // pointillé remplit, sous ce que la section porte déjà.
      style={{ flex: 1, minHeight: 0 }}
    >
      {sections.map((section) => (
        // Une colonne n'est qu'une place : ni fond, ni cadre, ni retrait. Le
        // seul écart est celui qui la sépare de la suivante, posé par la
        // rangée.
        <Box
          key={section.id}
          style={{
            ...largeurDe(section),
            display: "flex",
            flexDirection: "column",
            gap: BLOCK_GAP,
          }}
        >
          {/* Ce que la colonne porte, dans l'ordre où on l'y a posé. Chaque
              élément est rendu par son greffon ; un type que cette version ne
              connaît pas est passé plutôt que de faire tomber la colonne. */}
          {blocks
            .filter((bloc) => bloc.section_id === section.id)
            .map((bloc) => {
              const plugin = pluginDe(bloc.type);
              if (!plugin) return null;
              return (
                <UnstyledButton
                  key={bloc.id}
                  onClick={() => onEditBlock(bloc)}
                  style={{ display: "block", width: "100%" }}
                >
                  <plugin.Display config={bloc.config} />
                </UnstyledButton>
              );
            })}

          <SectionDropZone onClick={() => onAddBlock(section)} />
        </Box>
      ))}
    </Group>
  );

  return (
    <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
      <BoardTabs
        boards={categories}
        value={categoryId}
        onChange={onCategoryChange}
        onAdd={onAddCategory}
        onEdit={onEditCategory}
        onDelete={onDeleteCategory}
        deleteTitle="Supprimer la catégorie"
        // Une catégorie ne porte encore rien : ses onglets se posent au milieu
        // plutôt que de border un vide.
        centered
        // Ce qui garnit la catégorie ouverte, avant ce qui porte sur l'onglet.
        extraActions={
          <Menu.Item leftSection={<IconColumns size={16} />} onClick={onAddSection}>
            Ajouter une section
          </Menu.Item>
        }
      />

      {colonnes}
    </Stack>
  );
}
