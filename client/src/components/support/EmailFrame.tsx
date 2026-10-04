import { useComputedColorScheme } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { BLUE } from "../../themes/colors";

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

const POLICY =
  "default-src 'none'; img-src 'self' data: https: http:; style-src 'unsafe-inline' https:; font-src https: data:";

/** Les couleurs imposées à l'e-mail en thème sombre (celles du texte de Mantine). */
const DARK = `
  html, body { color: #c9c9c9 !important; }
  body * {
    background-color: transparent !important;
    background-image: none !important;
    color: inherit !important;
    border-color: #424242 !important;
  }
  a, a * { color: ${BLUE} !important; }
`;

const documentOf = (html: string, dark: boolean): string => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${POLICY}">
<base target="_blank">
<style>
  :root { color-scheme: ${dark ? "dark" : "light"}; }
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
  ${dark ? DARK : ""}
</style>
</head>
<body>${html}</body>
</html>`;

/**
 * Ce que le rognage laisse en place, et où il ne descend pas : les tableaux de
 * mise en page — une cellule vide retirée décalerait leurs colonnes — et les
 * feuilles de style, qui ne se voient pas.
 */
const INTACT = new Set(["STYLE", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH"]);

/** Un bloc qui ne montre rien : ni texte, ni image, ni tableau. */
const isEmpty = (element: Element): boolean =>
  (element.textContent ?? "").replace(/\u00a0/g, " ").trim() === "" &&
  !element.querySelector("img, table, hr, video, iframe");

/**
 * Retire les blocs vides en tête et en fin d'e-mail — les « <p>&nbsp;</p> » et
 * « <div><br></div> » qu'Outlook laisse volontiers autour du texte —, en
 * descendant dans les enveloppes qui ne portent qu'un bloc : le message
 * s'arrête à son contenu.
 */
const clip = (root: Element): void => {
  for (const edgeChild of ["firstElementChild", "lastElementChild"] as const) {
    let parent: Element | null = root;
    while (parent) {
      let child: Element | null = parent[edgeChild];
      while (child && !INTACT.has(child.tagName) && isEmpty(child)) {
        const next: Element | null =
          edgeChild === "firstElementChild" ? child.nextElementSibling : child.previousElementSibling;
        child.remove();
        child = next;
      }
      // Les feuilles de style ne comptent pas : elles ne se voient pas.
      while (child && child.tagName === "STYLE") {
        child =
          edgeChild === "firstElementChild" ? child.nextElementSibling : child.previousElementSibling;
      }
      parent = child && !INTACT.has(child.tagName) && child.children.length > 0 ? child : null;
    }
  }
};

export default function EmailFrame({ html }: { html: string }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const dark = useComputedColorScheme("light") === "dark";
  const [height, setHeight] = useState(0);

  // Le cadre prend la hauteur de ce qu'il porte, et la reprend quand une
  // image finit d'arriver : il ne défile jamais lui-même, c'est le fil qui
  // défile.
  useEffect(() => {
    const iframe = frame.current;
    if (!iframe) return undefined;
    let observer: ResizeObserver | null = null;
    // La hauteur du corps, et non celle de la page : celle-ci ne descend
    // jamais sous la hauteur du cadre, qui ne pourrait alors que grandir.
    const measure = () => {
      const body = iframe.contentDocument?.body;
      if (!body) return;
      setHeight(Math.ceil(body.getBoundingClientRect().height));
    };
    const loaded = () => {
      const body = iframe.contentDocument?.body;
      if (!body) return;
      clip(body);
      measure();
      observer?.disconnect();
      observer = new ResizeObserver(measure);
      observer.observe(body);
      body.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure));
    };
    iframe.addEventListener("load", loaded);
    return () => {
      iframe.removeEventListener("load", loaded);
      observer?.disconnect();
    };
  }, [html, dark]);

  return (
    <iframe
      ref={frame}
      aria-label="E-mail reçu"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={documentOf(html, dark)}
      scrolling="no"
      style={{
        display: "block",
        width: "100%",
        height: height,
        border: 0,
        background: "transparent",
        // Le cadre n'est transparent que si son document et lui partagent le
        // même schéma de couleurs ; sinon le navigateur y peint un fond.
        colorScheme: dark ? "dark" : "light",
      }}
    />
  );
}
