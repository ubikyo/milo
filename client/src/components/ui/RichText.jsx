import { Input } from "@mantine/core";
import { RichTextEditor } from "@mantine/tiptap";
import { Placeholder } from "@tiptap/extensions";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import classes from "../../assets/styles/RichText.module.css";

// La zone de saisie se peint sur « --mantine-color-body », un cran plus sombre
// que les champs sur le thème sombre. On lui rend le fond des autres champs :
// celui d'un « input » de variante « default ». La barre d'outils, elle, garde
// le sien : ce ne sont pas des champs.
const FIELD_BG = "light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))";

/**
 * L'éditeur de texte enrichi de l'application, posé sur tiptap. Un seul jeu
 * d'extensions pour tout ce qui s'écrit ainsi — la description d'une fiche, un
 * commentaire — pour que les deux acceptent exactement la même mise en forme.
 * « StarterKit » porte déjà le souligné et les liens : les ajouter à la main
 * ferait doublon.
 */
export function useRichEditor({ placeholder = "" } = {}) {
  return useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder })],
    content: "",
  });
}

/**
 * Le champ qui va avec : sa barre d'outils et sa zone de saisie. Il tient sur
 * une ligne tant qu'on n'a rien écrit, grandit à mesure qu'on va à la ligne, et
 * se met à défiler passé cinq lignes (assets/styles/RichText.module.css).
 *
 * `label` est facultatif : sans lui, le champ se passe d'intitulé — un
 * commentaire en cours d'écriture n'en a pas besoin.
 */
export default function RichTextField({ editor, label }) {
  const champ = (
    <RichTextEditor
      editor={editor}
      mt={label ? 4 : 0}
      variant="subtle"
      // La zone s'emboîte en deux : une enveloppe qui porte la hauteur, et le
      // contenu qui ne fait que celle du texte. Les deux prennent le fond,
      // sinon il s'arrêterait à la dernière ligne écrite.
      styles={{ content: { backgroundColor: FIELD_BG } }}
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
      </RichTextEditor.Toolbar>
      <RichTextEditor.Content
        className={classes.content}
        style={{ backgroundColor: FIELD_BG }}
      />
    </RichTextEditor>
  );

  return label ? <Input.Wrapper label={label}>{champ}</Input.Wrapper> : champ;
}
