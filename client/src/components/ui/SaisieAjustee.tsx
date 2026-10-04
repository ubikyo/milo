import type { InputHTMLAttributes } from "react";

// Le champ d'un nom qu'on tape sur place — un onglet de tableau, une vue —,
// exactement à la largeur du texte. Une largeur en « ch » laissait un blanc à
// droite : un « ch » vaut la chasse du zéro, plus large que la plupart des
// lettres. Ici, un double invisible du texte, posé dans la même case de
// grille, donne sa largeur au champ.

type AdjustedInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value"> & {
  value: string;
};

export default function AdjustedInput({ value, style, ...props }: AdjustedInputProps) {
  const common = { gridArea: "1 / 1", font: "inherit", padding: 0, margin: 0 } as const;
  return (
    <span style={{ display: "inline-grid", verticalAlign: "top" }}>
      <span aria-hidden style={{ ...common, visibility: "hidden", whiteSpace: "pre" }}>
        {value || " "}
      </span>
      {/* « size » à 1 : sans lui, le champ réclame d'office la place de
          vingt caractères, et la case s'élargit d'autant. */}
      <input
        {...props}
        size={1}
        value={value}
        style={{
          ...common,
          width: "100%",
          minWidth: 0,
          color: "inherit",
          background: "transparent",
          border: "none",
          outline: "none",
          ...style,
        }}
      />
    </span>
  );
}
