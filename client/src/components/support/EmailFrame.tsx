import { useComputedColorScheme } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { BLEU } from "../../themes/colors";

// Un e-mail reçu, montré tel que son expéditeur l'a écrit : ses styles, ses
// tableaux, ses images. Il vit dans un cadre à part, pour que ses feuilles de
// style ne débordent pas sur Milo, ni celles de Milo sur lui.
//
// Le cadre n'exécute rien : « sandbox » sans « allow-scripts », et une
// politique de sécurité qui n'admet ni script, ni formulaire, ni cadre. Le
// serveur a déjà retiré tout cela (lib/html.ts) ; le cadre le garantit une
// seconde fois. « allow-same-origin » ne sert qu'à mesurer sa hauteur : sans
// script dedans, il n'ouvre rien.
//
// Le fond est transparent : l'e-mail se pose sur celui de son message. En
// thème sombre, ses couleurs sont reprises comme le fait un logiciel de
// messagerie en mode sombre : ses fonds s'effacent et son texte s'éclaircit,
// sans quoi un texte noir écrit pour le blanc ne se lirait plus. Les liens
// gardent une couleur de lien.

const POLITIQUE =
  "default-src 'none'; img-src 'self' data: https: http:; style-src 'unsafe-inline' https:; font-src https: data:";

/** Les couleurs imposées à l'e-mail en thème sombre (celles du texte de Mantine). */
const SOMBRE = `
  html, body { color: #c9c9c9 !important; }
  body * {
    background-color: transparent !important;
    background-image: none !important;
    color: inherit !important;
    border-color: #424242 !important;
  }
  a, a * { color: ${BLEU} !important; }
`;

const documentDe = (html: string, sombre: boolean): string => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${POLITIQUE}">
<base target="_blank">
<style>
  :root { color-scheme: ${sombre ? "dark" : "light"}; }
  html, body { margin: 0; padding: 0; background: transparent !important; color: #222; }
  /* Le cadre ne défile jamais : il prend la hauteur de ce qu'il porte. */
  html, body { overflow: hidden !important; height: auto !important; min-height: 0 !important; }
  /* Les marges du premier et du dernier bloc restent dans le corps, sans quoi
     la mesure les manquerait ; celles des bords, elles, ne servent à rien. */
  body { display: flow-root; }
  body > :first-child { margin-top: 0 !important; }
  body > :last-child { margin-bottom: 0 !important; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 14px; overflow-wrap: anywhere; }
  img { max-width: 100%; height: auto; }
  ${sombre ? SOMBRE : ""}
</style>
</head>
<body>${html}</body>
</html>`;

/**
 * Ce que le rognage laisse en place, et où il ne descend pas : les tableaux de
 * mise en page — une cellule vide retirée décalerait leurs colonnes — et les
 * feuilles de style, qui ne se voient pas.
 */
const INTACTS = new Set(["STYLE", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH"]);

/** Un bloc qui ne montre rien : ni texte, ni image, ni tableau. */
const estVide = (element: Element): boolean =>
  (element.textContent ?? "").replace(/\u00a0/g, " ").trim() === "" &&
  !element.querySelector("img, table, hr, video, iframe");

/**
 * Retire les blocs vides en tête et en fin d'e-mail — les « <p>&nbsp;</p> » et
 * « <div><br></div> » qu'Outlook laisse volontiers autour du texte —, en
 * descendant dans les enveloppes qui ne portent qu'un bloc : le message
 * s'arrête à son contenu.
 */
const rogner = (racine: Element): void => {
  for (const bout of ["firstElementChild", "lastElementChild"] as const) {
    let parent: Element | null = racine;
    while (parent) {
      let enfant: Element | null = parent[bout];
      while (enfant && !INTACTS.has(enfant.tagName) && estVide(enfant)) {
        const suivant: Element | null =
          bout === "firstElementChild" ? enfant.nextElementSibling : enfant.previousElementSibling;
        enfant.remove();
        enfant = suivant;
      }
      // Les feuilles de style ne comptent pas : elles ne se voient pas.
      while (enfant && enfant.tagName === "STYLE") {
        enfant =
          bout === "firstElementChild" ? enfant.nextElementSibling : enfant.previousElementSibling;
      }
      parent = enfant && !INTACTS.has(enfant.tagName) && enfant.children.length > 0 ? enfant : null;
    }
  }
};

export default function EmailFrame({ html }: { html: string }) {
  const cadre = useRef<HTMLIFrameElement | null>(null);
  const sombre = useComputedColorScheme("light") === "dark";
  const [hauteur, setHauteur] = useState(0);

  // Le cadre prend la hauteur de ce qu'il porte, et la reprend quand une
  // image finit d'arriver : il ne défile jamais lui-même, c'est le fil qui
  // défile.
  useEffect(() => {
    const iframe = cadre.current;
    if (!iframe) return undefined;
    let observateur: ResizeObserver | null = null;
    // La hauteur du corps, et non celle de la page : celle-ci ne descend
    // jamais sous la hauteur du cadre, qui ne pourrait alors que grandir.
    const mesurer = () => {
      const corps = iframe.contentDocument?.body;
      if (!corps) return;
      setHauteur(Math.ceil(corps.getBoundingClientRect().height));
    };
    const charge = () => {
      const corps = iframe.contentDocument?.body;
      if (!corps) return;
      rogner(corps);
      mesurer();
      observateur?.disconnect();
      observateur = new ResizeObserver(mesurer);
      observateur.observe(corps);
      corps.querySelectorAll("img").forEach((img) => img.addEventListener("load", mesurer));
    };
    iframe.addEventListener("load", charge);
    return () => {
      iframe.removeEventListener("load", charge);
      observateur?.disconnect();
    };
  }, [html, sombre]);

  return (
    <iframe
      ref={cadre}
      aria-label="E-mail reçu"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={documentDe(html, sombre)}
      scrolling="no"
      style={{
        display: "block",
        width: "100%",
        height: hauteur,
        border: 0,
        background: "transparent",
        // Le cadre n'est transparent que si son document et lui partagent le
        // même schéma de couleurs ; sinon le navigateur y peint un fond.
        colorScheme: sombre ? "dark" : "light",
      }}
    />
  );
}
