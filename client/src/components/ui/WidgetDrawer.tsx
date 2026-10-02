import { Drawer, Group, ScrollArea, Stack, Text, Title } from "@mantine/core";
import { IconGripVertical } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import encart from "../../assets/styles/AccessNumero.module.css";
import type { ComponentType, DragEvent } from "react";
import { libelleDuGenre, type WidgetKind } from "../../widgets/genres";
import { ECART_SOUS_CATEGORIE } from "../../widgets/sous-categorie";

// Ce qu'une section peut recevoir, un widget par ligne : sa poignée, son
// icône, son nom, dans l'encart des widgets. Le tiroir s'ouvre à gauche, et
// chaque ligne se glisse là où le widget doit se poser — entre deux widgets,
// ou dans une colonne vide. Dès que le pointeur quitte le tiroir pour
// l'interface, le tiroir se referme, et laisse voir où l'on pose.
//
// La liste vient du registre du mode : le tiroir ne connaît aucun widget en
// particulier. Il la range par type (widgets/genres.ts), dans l'ordre où le
// registre présente le premier widget de chacun, sous un titre de
// sous-catégorie.

/** Ce que le tiroir montre d'un widget. */
export interface ChoixDeWidget {
  type: string;
  /** Le groupe où il se range dans le tiroir. */
  kind: WidgetKind;
  label: string;
  icon: ComponentType<{ size?: number }>;
}

interface WidgetDrawerProps<P extends ChoixDeWidget> {
  opened: boolean;
  onClose: () => void;
  widgets: P[];
  /** Une ligne prise : la rangée des sections tient désormais ce widget. */
  onDragStart: (widget: P) => void;
  /** Le glisser fini, posé ou non. */
  onDragEnd: () => void;
}

const LARGEUR = 320;

/** L'air au-dessus du titre d'un type, quand d'autres widgets le précèdent. */
const ECART_GROUPES = 40;

export default function WidgetDrawer<P extends ChoixDeWidget>({
  opened,
  onClose,
  widgets,
  onDragStart,
  onDragEnd,
}: WidgetDrawerProps<P>) {
  /** Vrai pendant qu'un widget est tenu. */
  const [tenu, setTenu] = useState(false);

  // Le pointeur sorti du tiroir, au-dessus de l'interface, le referme. Lu sur
  // toute la page : c'est le voile du tiroir qui reçoit d'abord le survol.
  useEffect(() => {
    if (!tenu || !opened) return;
    const survoler = (e: globalThis.DragEvent) => {
      if (e.clientX > LARGEUR) onClose();
    };
    window.addEventListener("dragover", survoler);
    return () => window.removeEventListener("dragover", survoler);
  }, [tenu, opened, onClose]);

  const prendre = (e: DragEvent<HTMLElement>, widget: P) => {
    // Certains navigateurs n'amorcent pas le glisser sans charge.
    e.dataTransfer.setData("text/plain", widget.type);
    e.dataTransfer.effectAllowed = "copy";
    setTenu(true);
    onDragStart(widget);
  };

  const lacher = () => {
    setTenu(false);
    onDragEnd();
  };

  // Les widgets par type, chaque groupe à la place de son premier widget.
  const groupes: { kind: WidgetKind; widgets: P[] }[] = [];
  for (const widget of widgets) {
    const groupe = groupes.find((g) => g.kind === widget.kind);
    if (groupe) groupe.widgets.push(widget);
    else groupes.push({ kind: widget.kind, widgets: [widget] });
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="left"
      size={LARGEUR}
      padding={30}
      withCloseButton={false}
      // Refermé en plein glisser, le tiroir reste dans la page, caché : la
      // ligne prise doit encore recevoir la fin du glisser, sans quoi la
      // rangée croirait tenir le widget.
      keepMounted
      // La barre de défilement de Mantine, le long du bord droit du tiroir.
      scrollAreaComponent={ScrollArea.Autosize}
    >
      {/* Le titre d'une catégorie (widgets/categorie.tsx) : sa taille, sa
          couleur, et 20 px d'air avant la liste. */}
      <Title order={1} size={18} c="var(--mantine-color-white)" mb={20}>
        Widgets
      </Title>
      {groupes.map((groupe, rang) => (
        <div key={groupe.kind}>
          {/* Le titre d'une sous-catégorie (widgets/sous-categorie.tsx) : sa
              taille, sa graisse, l'air sous lui ; 40 px au-dessus quand
              d'autres widgets le précèdent. */}
          <Title
            order={2}
            size={16}
            fw={400}
            c="var(--mantine-color-white)"
            mb={ECART_SOUS_CATEGORIE}
            pt={rang > 0 ? ECART_GROUPES : 0}
          >
            {libelleDuGenre(groupe.kind)}
          </Title>
          <Stack gap={4}>
            {groupe.widgets.map((widget) => (
              // L'encart des widgets, sans son trait : le fond suffit à détacher
              // chaque ligne.
              <Group
                key={widget.type}
                draggable
                onDragStart={(e) => prendre(e, widget)}
                onDragEnd={lacher}
                aria-label={`Glisser le widget ${widget.label}`}
                gap="sm"
                wrap="nowrap"
                className={encart.encart}
                style={{ padding: 10, border: "none", cursor: "grab" }}
              >
                <Text c="dimmed" component="span" style={{ display: "flex" }}>
                  <IconGripVertical size={16} />
                </Text>
                <widget.icon size={20} />
                <Text size="sm" truncate>
                  {widget.label}
                </Text>
              </Group>
            ))}
          </Stack>
        </div>
      ))}
    </Drawer>
  );
}
