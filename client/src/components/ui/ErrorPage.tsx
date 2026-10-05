import { IconChevronDown } from "@tabler/icons-react";
import { Component, useState } from "react";
import type { CSSProperties, ErrorInfo, ReactNode } from "react";
import { PALETTE_RED } from "../../themes/colors";

// The red page of an unknown error: one nobody caught, so that no
// notification (notifyError) announced it. A component that fails to render,
// an exception thrown from a handler, a promise rejected without a "catch".
// Rather than a blank or frozen page, the application gives way to this one,
// which says where the error comes from: its message, the stack of the code
// that threw it and, for a render, that of the components it went through.
//
// It is drawn in plain HTML, without Mantine: it wraps the whole application,
// Mantine's providers included, and must hold even when they are what fails.

/** An unknown error, and where it comes from. */
interface Failure {
  /** "Rendu", "Exception" or "Promesse rejetée". */
  origin: string;
  name: string;
  message: string;
  /** The stack of the code that threw it, when there is one. */
  stack?: string;
  /** For a render: the components it went through. */
  componentStack?: string;
  /** For an exception: the file and the line that threw it. */
  location?: string;
  url: string;
  date: Date;
}

// What the browser reports but is not an error of the application: the
// ResizeObserver notices, harmless, and the "Script error." of a script from
// another origin (an extension), which says nothing.
const IGNORED = [/ResizeObserver loop/, /^Script error\.?$/];

const ignored = (message: string): boolean =>
  IGNORED.some((re) => re.test(message));

const failureOf = (
  origin: string,
  error: unknown,
  extra: Partial<Failure> = {},
): Failure => {
  const asError = error instanceof Error ? error : null;
  return {
    origin,
    name: asError?.name ?? "Erreur",
    message: asError ? asError.message : String(error),
    stack: asError?.stack,
    url: window.location.href,
    date: new Date(),
    ...extra,
  };
};

/** The failure as text: what "Copier" puts in the clipboard. */
const reportOf = (f: Failure): string =>
  [
    `${f.name} : ${f.message}`,
    `Origine : ${f.origin}`,
    f.location && `Fichier : ${f.location}`,
    `Page : ${f.url}`,
    `Date : ${f.date.toLocaleString("fr-FR")}`,
    `Navigateur : ${navigator.userAgent}`,
    f.stack && `\nPile d'appels :\n${f.stack}`,
    f.componentStack && `\nComposants :${f.componentStack}`,
  ]
    .filter(Boolean)
    .join("\n");

interface ErrorPageProps {
  children: ReactNode;
}

interface ErrorPageState {
  failure: Failure | null;
  copied: boolean;
}

export default class ErrorPage extends Component<
  ErrorPageProps,
  ErrorPageState
> {
  override state: ErrorPageState = { failure: null, copied: false };

  // The render failure: its component stack follows in componentDidCatch.
  static getDerivedStateFromError(error: unknown): Partial<ErrorPageState> {
    return { failure: failureOf("Rendu", error) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    this.setState({
      failure: failureOf("Rendu", error, {
        componentStack: info.componentStack ?? undefined,
      }),
    });
  }

  override componentDidMount() {
    window.addEventListener("error", this.onError);
    window.addEventListener("unhandledrejection", this.onRejection);
  }

  override componentWillUnmount() {
    window.removeEventListener("error", this.onError);
    window.removeEventListener("unhandledrejection", this.onRejection);
  }

  // The first failure is the one shown: those that follow are often its
  // consequences.
  private show(failure: Failure) {
    if (this.state.failure || ignored(failure.message)) return;
    console.error(failure);
    this.setState({ failure });
  }

  private onError = (event: ErrorEvent) => {
    // An image or a script that does not load also raises "error", without
    // a message: that is not an exception.
    if (!event.message && !event.error) return;
    this.show(
      failureOf("Exception", event.error ?? event.message, {
        location: event.filename
          ? `${event.filename}:${event.lineno}:${event.colno}`
          : undefined,
      }),
    );
  };

  private onRejection = (event: PromiseRejectionEvent) => {
    this.show(failureOf("Promesse rejetée", event.reason));
  };

  private copy = (failure: Failure) => {
    navigator.clipboard.writeText(reportOf(failure)).then(
      () => this.setState({ copied: true }),
      () => undefined,
    );
  };

  override render() {
    const { failure, copied } = this.state;
    if (!failure) return this.props.children;
    return (
      <div style={styles.page}>
        <div style={styles.content}>
          <h1 style={styles.title}>Milo a rencontré une erreur</h1>
          <p style={styles.text}>
            Elle n'a pas pu être traitée. Rechargez la page pour reprendre ; si l'erreur revient, copiez le rapport
            ci-dessous et transmettez-le.
          </p>
          <div style={styles.buttons}>
            <button
              type="button"
              style={styles.primary}
              onClick={() => window.location.reload()}
            >
              Recharger la page
            </button>
            <button
              type="button"
              style={styles.secondary}
              onClick={() => this.copy(failure)}
            >
              {copied ? "Rapport copié" : "Copier le rapport"}
            </button>
          </div>

          <dl style={styles.facts}>
            <dt style={styles.term}>Erreur</dt>
            <dd style={styles.value}>
              {failure.name} : {failure.message}
            </dd>
            <dt style={styles.term}>Origine</dt>
            <dd style={styles.value}>{failure.origin}</dd>
            {failure.location && (
              <>
                <dt style={styles.term}>Fichier</dt>
                <dd style={styles.value}>{failure.location}</dd>
              </>
            )}
            <dt style={styles.term}>Page</dt>
            <dd style={styles.value}>{failure.url}</dd>
          </dl>

          {/* The stacks, long, folded: the facts above come first. */}
          <div style={styles.folds}>
            {failure.stack && (
              <Fold label="Pile d'appels" openGap={30}>
                {failure.stack}
              </Fold>
            )}
            {failure.componentStack && <Fold label="Composants">{failure.componentStack.trim()}</Fold>}
          </div>
        </div>
      </div>
    );
  }
}

// As Mantine's Accordion: its duration and its easing.
const TRANSITION = "200ms ease";

interface FoldProps {
  label: string;
  /** The space under the fold, once open. */
  openGap?: number;
  children: string;
}

/**
 * A fold, as Mantine's Accordion — which this page does without: the chevron
 * at the end of the label turns, the content unrolls.
 */
function Fold({ label, openGap = 0, children }: FoldProps) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: open ? openGap : 0, transition: `margin-bottom ${TRANSITION}` }}>
      <button type="button" style={styles.foldLabel} aria-expanded={open} onClick={() => setOpen(!open)}>
        {label}
        <IconChevronDown
          size={18}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: `transform ${TRANSITION}` }}
        />
      </button>
      {/* From 0fr to 1fr: the height of its content, animated without measuring it. */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: `grid-template-rows ${TRANSITION}`,
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <pre style={{ ...styles.code, marginTop: 8 }}>{children}</pre>
        </div>
      </div>
    </div>
  );
}

const WHITE = "#ffffff";

const styles: Record<string, CSSProperties> = {
  page: {
    position: "fixed",
    inset: 0,
    zIndex: 10000,
    overflow: "auto",
    background: PALETTE_RED,
    color: WHITE,
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    userSelect: "text",
  },
  content: { maxWidth: 960, padding: 50 },
  title: { fontSize: 28, fontWeight: 700, margin: "0 0 12px" },
  folds: { marginTop: 28 },
  foldLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: 0,
    background: "none",
    border: "none",
    color: WHITE,
    font: "inherit",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
  text: { fontSize: 15, lineHeight: 1.5, margin: "0 0 20px", maxWidth: 640 },
  buttons: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28 },
  primary: {
    background: WHITE,
    color: PALETTE_RED,
    border: "none",
    borderRadius: 4,
    padding: "8px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  secondary: {
    background: "transparent",
    color: WHITE,
    border: `1px solid ${WHITE}`,
    borderRadius: 4,
    padding: "8px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  facts: {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    gap: "6px 16px",
    margin: 0,
    fontSize: 14,
  },
  term: { fontWeight: 600, opacity: 0.85 },
  value: { margin: 0, wordBreak: "break-word" },
  code: {
    margin: 0,
    padding: 12,
    borderRadius: 4,
    background: "rgba(0, 0, 0, 0.25)",
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
};
