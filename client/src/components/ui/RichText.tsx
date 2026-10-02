import { Input } from "@mantine/core";
import { RichTextEditor } from "@mantine/tiptap";
import { Placeholder } from "@tiptap/extensions";
import Image from "@tiptap/extension-image";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import { RED } from "../../themes/colors";
import type { Editor } from "@tiptap/react";
import type { CSSProperties, ReactNode } from "react";
import classes from "../../assets/styles/RichText.module.css";

// La zone de saisie se peint sur « --mantine-color-body », un cran plus sombre
// que les champs sur le thème sombre. On lui rend le fond des autres champs :
// celui d'un « input » de variante « default ». La barre d'outils prend le
// même, et un trait la sépare de la zone de saisie.
export const FIELD_BG = "light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))";

// La corbeille du bouton qui retire une image : l'icône de Tabler, recopiée
// telle quelle. La vue ci-dessous est en DOM et non en React (voir pourquoi
// juste en dessous) : elle ne peut donc pas monter un composant d'icône.
const ICONE_CORBEILLE = `
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
       fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 7l16 0" />
    <path d="M10 11l0 6" />
    <path d="M14 11l0 6" />
    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
    <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
  </svg>`;

/**
 * L'image de tiptap, rendue avec le bouton qui la retire. Le bouton ne se
 * montre qu'au survol — une description se lit d'abord.
 *
 * La vue est écrite en DOM et non avec `ReactNodeViewRenderer`, bien que le
 * reste de l'application soit en React : une vue React n'est montée que si
 * l'éditeur porte au même instant son point d'ancrage React
 * (`editor.contentComponent`). Quand il ne l'a pas, tiptap rend un élément
 * vide à la place, sans rien dire — l'image était bien dans le texte, mais
 * invisible jusqu'à ce qu'on referme et rouvre la fiche. Le DOM, lui,
 * s'affiche toujours.
 */
const ImageAvecRetrait = Image.extend({
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const enveloppe = document.createElement("div");
      enveloppe.className = classes.image ?? "";

      const image = document.createElement("img");
      image.src = String(node.attrs["src"] ?? "");
      image.alt = String(node.attrs["alt"] ?? "");

      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = classes.imageRemove ?? "";
      bouton.setAttribute("aria-label", "Supprimer l'image");
      // Le rouge de l'application, tenu en un seul endroit (themes/colors.ts).
      bouton.style.backgroundColor = RED;
      bouton.innerHTML = ICONE_CORBEILLE;

      // Sans cela, appuyer sur le bouton déplace d'abord le curseur dans la
      // description : le clic partirait sur une sélection qui a bougé.
      bouton.addEventListener("mousedown", (e) => e.preventDefault());
      bouton.addEventListener("click", () => {
        const position = getPos();
        if (typeof position !== "number") return;
        editor
          .chain()
          .focus()
          .deleteRange({ from: position, to: position + node.nodeSize })
          .run();
      });

      enveloppe.append(image, bouton);

      return {
        dom: enveloppe,
        // L'adresse d'une image peut changer sans que la vue soit refaite.
        update: (nouveau) => {
          if (nouveau.type.name !== node.type.name) return false;
          image.src = String(nouveau.attrs["src"] ?? "");
          image.alt = String(nouveau.attrs["alt"] ?? "");
          return true;
        },
        // Le bouton est à nous : l'éditeur n'a pas à interpréter ce qui s'y
        // passe, ni à s'inquiéter de ce que nous changeons dans cette enveloppe.
        stopEvent: (event) => event.target instanceof Node && bouton.contains(event.target),
        ignoreMutation: () => true,
      };
    };
  },
});

/** Le fichier de chaque image trouvée dans un presse-papiers. */
const imagesCollees = (data: DataTransfer | null): File[] =>
  Array.from(data?.files ?? []).filter((f) => f.type.startsWith("image/"));

interface RichEditorOptions {
  placeholder?: string;
  /**
   * Que faire d'une image collée : la déposer, et rendre son adresse. Une
   * chaîne vide — un dépôt refusé, dont l'appelant a déjà dit un mot — ne
   * laisse rien dans la description.
   *
   * Sans cette fonction, coller une image ne fait rien : c'est le cas des
   * descriptions qui ne s'accompagnent pas d'un endroit où déposer.
   */
  onPasteImage?: (file: File) => Promise<string>;
}

/**
 * L'éditeur de texte enrichi de l'application, posé sur tiptap. Un seul jeu
 * d'extensions pour tout ce qui s'écrit ainsi — la description d'une fiche, un
 * commentaire — pour que les deux acceptent exactement la même mise en forme.
 * « StarterKit » porte déjà le souligné et les liens : les ajouter à la main
 * ferait doublon.
 */
export function useRichEditor({ placeholder = "", onPasteImage }: RichEditorOptions = {}) {
  // L'éditeur n'est construit qu'une fois : ce que le collage doit appeler
  // passe donc par des références, sans quoi il appellerait toujours la
  // première version de la fonction reçue.
  const deposer = useRef(onPasteImage);
  const courant = useRef<Editor | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder }), ImageAvecRetrait],
    content: "",
    editorProps: {
      // Une image collée ne se colle pas telle quelle : elle part au serveur,
      // et c'est son adresse qui entre dans la description. Le presse-papiers
      // peut en porter plusieurs — elles s'insèrent l'une après l'autre.
      handlePaste: (_view, event) => {
        const images = imagesCollees(event.clipboardData);
        if (images.length === 0 || !deposer.current) return false;

        event.preventDefault();
        void (async () => {
          for (const image of images) {
            try {
              const url = await deposer.current?.(image);
              if (url) courant.current?.chain().focus().setImage({ src: url }).run();
            } catch {
              // Le dépôt a déjà dit ce qui n'allait pas : rien à ajouter ici.
            }
          }
        })();
        return true;
      },
    },
  });

  // Les deux références suivent ce que le rendu vient de produire, et c'est le
  // collage — bien plus tard — qui les lit.
  useEffect(() => {
    deposer.current = onPasteImage;
    courant.current = editor;
  });

  return editor;
}

/**
 * Le champ qui va avec : sa barre d'outils et sa zone de saisie. Il tient sur
 * une ligne tant qu'on n'a rien écrit, grandit à mesure qu'on va à la ligne, et
 * se met à défiler passé cinq lignes (assets/styles/RichText.module.css).
 *
 * `label` est facultatif : sans lui, le champ se passe d'intitulé — un
 * commentaire en cours d'écriture n'en a pas besoin.
 */
interface RichTextFieldProps {
  editor: Editor | null;
  label?: string;
  /**
   * Ce qui se pose sous la zone de saisie, sur toute la largeur, sans marge,
   * collé aux bordures de l'éditeur : le bouton « Envoyer » d'une réponse.
   */
  bottomBar?: ReactNode;
  /** Des commandes de plus, au bout de la barre d'outils — « CC » et « CCI » d'une réponse. */
  toolbarControls?: ReactNode;
  /** Ce qui se pose entre la barre d'outils et la zone de saisie : les lignes « CC » d'une réponse. */
  topSection?: ReactNode;
  /** Ce qui se pose sous la zone de saisie, avant « bottomBar » : les pièces jointes d'une réponse. */
  contentEnd?: ReactNode;
  /** Les lignes que la zone montre avant de défiler : cinq par défaut. */
  maxLines?: number;
  /** Les lignes que la zone montre même vide : une seule par défaut. */
  minLines?: number;
}

export default function RichTextField({
  editor,
  label,
  bottomBar,
  toolbarControls,
  topSection,
  contentEnd,
  maxLines,
  minLines,
}: RichTextFieldProps) {
  // Aucune infobulle : les boutons de la barre d'outils reçoivent de Mantine un
  // « title » (leur libellé) qu'aucune propriété ne retire pour tous — celui du
  // lien s'impose même par-dessus. On l'efface du DOM à chaque fois qu'il revient ;
  // l'« aria-label » reste.
  const racine = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const noeud = racine.current;
    if (!noeud) return;
    const effacer = () =>
      noeud.querySelectorAll("[title]").forEach((el) => el.removeAttribute("title"));
    effacer();
    const observateur = new MutationObserver(effacer);
    observateur.observe(noeud, { subtree: true, childList: true, attributeFilter: ["title"] });
    return () => observateur.disconnect();
  }, []);

  const champ = (
    <RichTextEditor
      ref={racine}
      editor={editor}
      variant="subtle"
      classNames={{
        toolbar: classes.toolbar,
        control: classes.control,
        controlsGroup: classes.controlsGroup,
      }}
      // La zone s'emboîte en deux : une enveloppe qui porte la hauteur, et le
      // contenu qui ne fait que celle du texte. Les deux prennent le fond,
      // sinon il s'arrêterait à la dernière ligne écrite.
      styles={{
        content: { backgroundColor: FIELD_BG },
        toolbar: {
          backgroundColor: FIELD_BG,
          borderBottom:
            "1px solid light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-4))",
        },
      }}
    >
      <RichTextEditor.Toolbar sticky stickyOffset={0}>
        <RichTextEditor.ControlsGroup>
          <RichTextEditor.Bold />
          <RichTextEditor.Italic />
          <RichTextEditor.Underline />
          <RichTextEditor.Strikethrough />
          <RichTextEditor.ClearFormatting />
        </RichTextEditor.ControlsGroup>
        <RichTextEditor.ControlsGroup>
          <RichTextEditor.BulletList />
          <RichTextEditor.OrderedList />
          <RichTextEditor.Blockquote />
          <RichTextEditor.CodeBlock />
        </RichTextEditor.ControlsGroup>
        <RichTextEditor.ControlsGroup>
          <RichTextEditor.Link />
          <RichTextEditor.Unlink />
        </RichTextEditor.ControlsGroup>
        <RichTextEditor.ControlsGroup>
          <RichTextEditor.Undo />
          <RichTextEditor.Redo />
        </RichTextEditor.ControlsGroup>
        {toolbarControls && (
          <RichTextEditor.ControlsGroup>{toolbarControls}</RichTextEditor.ControlsGroup>
        )}
      </RichTextEditor.Toolbar>
      {topSection}
      <RichTextEditor.Content
        className={minLines ? `${classes.content} ${classes.minLines}` : classes.content}
        style={
          {
            backgroundColor: FIELD_BG,
            ...(maxLines ? { "--milo-rich-lines": maxLines } : {}),
            ...(minLines ? { "--milo-rich-min-lines": minLines } : {}),
          } as CSSProperties
        }
      />
      {contentEnd && <div style={{ backgroundColor: FIELD_BG }}>{contentEnd}</div>}
      {bottomBar && <div style={{ display: "flex" }}>{bottomBar}</div>}
    </RichTextEditor>
  );

  return label ? <Input.Wrapper label={label}>{champ}</Input.Wrapper> : champ;
}
