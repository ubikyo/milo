import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Menu,
  Paper,
  Stack,
  Text,
  Typography,
} from "@mantine/core";
import { RichTextEditor } from "@mantine/tiptap";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconMailCheck,
  IconMailOff,
  IconPaperclip,
  IconX,
  IconSend2,
  IconTrash,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { RED } from "../../themes/colors";
import { PersonAvatar, SenderAvatar } from "../ui/ActorAvatars";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import RichTextField, { useRichEditor } from "../ui/RichText";
import type { FilItem } from "../project/CommentThread";
import { MILO_ACTOR_ID } from "@milo/shared";
import type {
  SqliteBool,
  SupportAttachment,
  SupportCommentFormat,
  SupportMailStatus,
  SupportStatus,
} from "@milo/shared";
import RecipientsInput from "./RecipientsInput";
import EmailFrame from "./EmailFrame";
import classes from "../../assets/styles/SupportMessages.module.css";

/** Un message du fil, et ce qu'il est advenu de son envoi par e-mail. */
export type MessageSupport = FilItem & {
  mail_status?: SupportMailStatus;
  mail_to?: string;
  mail_cc?: string;
  mail_bcc?: string;
  /** « email » : un e-mail reçu, montré tel quel dans un cadre. */
  format?: SupportCommentFormat;
  attachments?: SupportAttachment[];
  /** Un commentaire interne, de l'onglet « Commentaires ». */
  internal?: SqliteBool | boolean;
};

/** Ce que dit le pied d'une réponse, selon son envoi. */
const ENVOI: Record<
  Exclude<SupportMailStatus, "">,
  { icone: typeof IconMailCheck; couleur: string; texte: (a: string) => string }
> = {
  sent: {
    icone: IconMailCheck,
    couleur: "teal",
    texte: (a) => `Envoyé par e-mail à ${a}`,
  },
  simulated: {
    icone: IconMailOff,
    couleur: "dimmed",
    texte: (a) => `Simulation : non envoyé à ${a}`,
  },
  failed: {
    icone: IconAlertTriangle,
    couleur: "red",
    texte: (a) => `Échec de l'envoi à ${a}`,
  },
};

// Le fil d'une demande, lu comme une conversation par e-mail : ce qui vient
// de l'expéditeur à gauche, ce que l'équipe écrit à droite, chacun sur les
// trois quarts de la largeur. Les mots de l'application — création, fusion,
// fermeture — se posent au milieu, en petit : ils ne sont de personne.

const LARGEUR_MESSAGE = "75%";

/** L'air entre deux messages, et autour du corps de chacun. */
const ECART_MESSAGES = 30;
const MARGE_MESSAGE = 30;

/** Le fond d'un message, reçu comme envoyé : c'est la place qui dit de qui il vient. */
const FOND_MESSAGE =
  "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-7))";

/** « 1,2 Mo » : la taille d'une pièce jointe. */
const tailleLisible = (octets: number): string => {
  if (octets >= 1024 * 1024) {
    return `${(octets / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
  }
  if (octets >= 1024)
    return `${Math.round(octets / 1024).toLocaleString("fr-FR")} Ko`;
  return `${octets} o`;
};

/** Une ligne de la liste des fichiers : ce qu'on montre, et ce qu'on en fait. */
interface LigneFichier {
  key: string;
  name: string;
  size: number;
  /** L'adresse où le télécharger, une fois rangé. */
  href?: string;
  /** Le retirer, tant que la réponse n'est pas partie. */
  onRemove?: () => void;
}

/**
 * Des fichiers, un par ligne : le nom à gauche, et les tailles alignées à
 * droite en colonne. Sert aux pièces jointes d'un message comme à celles d'une
 * réponse en cours d'écriture, qui se retirent d'une croix.
 */
function ListeFichiers({
  lignes,
  px = MARGE_MESSAGE,
}: {
  lignes: LigneFichier[];
  px?: number;
}) {
  const retirables = lignes.some((l) => l.onRemove);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: retirables
          ? "minmax(0, 1fr) auto auto"
          : "minmax(0, 1fr) auto",
        alignItems: "center",
        columnGap: 16,
        rowGap: 4,
        padding: `var(--mantine-spacing-sm) ${px}px`,
        borderTop: "1px dotted var(--mantine-color-default-border)",
      }}
    >
      {lignes.map((ligne) => {
        const nom = (
          <>
            <IconPaperclip size={14} style={{ flexShrink: 0 }} />
            <Text span size="sm" c="inherit" truncate>
              {ligne.name}
            </Text>
          </>
        );
        const style = {
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          minWidth: 0,
        };
        return (
          <Fragment key={ligne.key}>
            {ligne.href ? (
              <Anchor
                href={ligne.href}
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
                style={style}
              >
                {nom}
              </Anchor>
            ) : (
              // Pas encore rangé, donc pas de lien : mais le même composant
              // que les pièces jointes des messages, donc la même couleur.
              <Anchor
                component="span"
                size="sm"
                underline="never"
                style={style}
              >
                {nom}
              </Anchor>
            )}
            <Text size="sm" c="dimmed" ta="right">
              {tailleLisible(ligne.size)}
            </Text>
            {retirables && (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={ligne.onRemove}
                aria-label={`Retirer ${ligne.name}`}
              >
                <IconX size={14} />
              </ActionIcon>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

/** Les pièces jointes d'un e-mail, sous son corps : chacune se télécharge. */
function PiecesJointes({ pieces }: { pieces: SupportAttachment[] }) {
  return (
    <ListeFichiers
      px={10}
      lignes={pieces.map((p) => ({
        key: p.url,
        name: p.name,
        size: p.size,
        href: p.url,
      }))}
    />
  );
}

const formatDate = (value: string): string =>
  dayjs(value).format("DD/MM/YYYY HH:mm");

const echapper = (texte: string): string =>
  texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Le texte d'un message, en HTML. Ceux d'avant l'éditeur sont du texte brut :
 * ils sont échappés et mis en paragraphes, comme le serveur le fait des
 * e-mails qu'il importe. Le reste a été nettoyé par le serveur à l'écriture ;
 * les paragraphes vides qu'y laisse l'éditeur, en fin de texte, sont retirés.
 */
const commeHtml = (texte: string): string =>
  /<[a-z][\s\S]*>/i.test(texte)
    ? texte.replace(/(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+$/i, "")
    : texte
        .split(/\n{2,}/)
        .map((bloc) => bloc.trim())
        .filter(Boolean)
        .map((bloc) => `<p>${echapper(bloc).replace(/\n/g, "<br>")}</p>`)
        .join("");

/** Un éditeur vide rend « <p></p> » : ce n'est pas un message. */
const estVide = (html: string): boolean =>
  !/<img\b/i.test(html) &&
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim() === "";

interface SupportMessagesProps {
  messages: MessageSupport[];
  /** L'adresse de l'expéditeur de la demande : ses messages sont les reçus. */
  senderEmail: string;
  /** Sans lui — sans le droit de modifier la demande —, rien ne s'efface. */
  onDelete?: (id: number | string) => Promise<void>;
}

/** Le pied d'une réponse : partie, simulée, ou refusée — et qui était en copie. */
function PiedEnvoi({
  statut,
  a,
  cc = "",
  bcc = "",
}: {
  statut: Exclude<SupportMailStatus, "">;
  a: string;
  cc?: string;
  bcc?: string;
}) {
  const { icone: Icone, couleur, texte } = ENVOI[statut];
  const copies = [cc && `Cc : ${cc}`, bcc && `Cci : ${bcc}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <Group
      gap={6}
      px="md"
      py={6}
      justify="flex-end"
      style={{ borderTop: "1px dotted var(--mantine-color-default-border)" }}
    >
      <Icone
        size={14}
        color={
          couleur === "dimmed"
            ? "var(--mantine-color-dimmed)"
            : `var(--mantine-color-${couleur}-6)`
        }
      />
      <Text size="xs" c={couleur}>
        {texte(a)}
        {copies && (
          <Text span size="xs" c="dimmed">
            {" "}
            · {copies}
          </Text>
        )}
      </Text>
    </Group>
  );
}

/**
 * Le fil des messages. Il ne défile pas lui-même : c'est le panneau qui le
 * contient qui s'en charge, et le dernier message y est amené en vue.
 */
export default function SupportMessages({
  messages,
  senderEmail,
  onDelete,
}: SupportMessagesProps) {
  const [aSupprimer, setASupprimer] = useState<MessageSupport | null>(null);
  const fin = useRef<HTMLDivElement | null>(null);

  // Le dernier message en vue, comme dans une messagerie : à l'ouverture et à
  // chaque message ajouté. Seul le cadre du fil défile — « scrollIntoView »
  // ferait aussi descendre le tiroir, qui doit s'ouvrir en haut du ticket.
  useEffect(() => {
    let cadre = fin.current?.parentElement ?? null;
    while (cadre) {
      const { overflowY } = getComputedStyle(cadre);
      if (overflowY === "auto" || overflowY === "scroll") break;
      cadre = cadre.parentElement;
    }
    if (cadre) cadre.scrollTop = cadre.scrollHeight;
  }, [messages.length]);

  /**
   * Reçu : écrit par l'expéditeur, qu'il ait un compte ou non. Un message parti
   * — ou qui devait partir — par e-mail est toujours une réponse de l'équipe,
   * même quand celui qui l'écrit est aussi l'expéditeur de la demande.
   */
  const recu = (m: MessageSupport): boolean =>
    !m.mail_status &&
    Boolean(
      m.author &&
      (m.author.id === 0 ||
        (senderEmail &&
          m.author.email.toLowerCase() === senderEmail.toLowerCase())),
    );

  // Un seul bloc : dans la pile du tiroir, le repère de fin et la fenêtre de
  // suppression prendraient chacun son écart sous le dernier message.
  return (
    <div>
      <Stack gap={ECART_MESSAGES}>
        {messages.map((m) => {
          if (m.system && !m.author) {
            return (
              <Text key={m.id} size="xs" c="dimmed" ta="center">
                {m.text} · {formatDate(m.created_at)}
              </Text>
            );
          }
          // L'ouverture du fil, signée Milo : un fait, avec son logo.
          if (m.system && m.author?.id === MILO_ACTOR_ID) {
            return (
              <Group key={m.id} gap={6} justify="center" wrap="nowrap">
                <PersonAvatar person={m.author} size={18} />
                <Text size="xs" c="dimmed">
                  {m.text} — {m.author.name}
                </Text>
              </Group>
            );
          }
          // Un mot de l'application signé d'un compte — « Fusionnée dans… »,
          // « Fermée le… » — reste un fait, pas un message.
          if (m.system && !recu(m)) {
            return (
              <Text key={m.id} size="xs" c="dimmed" ta="center">
                {m.text} — {m.author?.name}
              </Text>
            );
          }

          const gauche = recu(m);
        // L'adresse et la date : estompées sur le fond du message, en blanc
        // adouci sur le vert d'une réponse.
        const secondaire = gauche ? "dimmed" : "inherit";
        const opacite = gauche ? undefined : 0.85;
          return (
            <Paper
              key={m.id}
              w={LARGEUR_MESSAGE}
              ml={gauche ? 0 : "auto"}
              bg={FOND_MESSAGE}
              style={{
                borderRadius: "var(--mantine-radius-md)",
                overflow: "hidden",
              }}
            >
              {/* L'entête d'un e-mail : qui, son adresse, quand. */}
              <Group
                justify="space-between"
                wrap="nowrap"
                px="md"
                py={8}
                // Une réponse de l'équipe : l'entête au vert du bouton d'envoi,
                // son texte en blanc.
                style={
                  gauche
                    ? { borderBottom: "1px solid var(--mantine-color-default-border)" }
                    : { backgroundColor: "var(--mantine-color-teal-filled)", color: "white" }
                }
              >
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                  {gauche && m.author ? (
                    <SenderAvatar person={m.author} size={26} />
                  ) : (
                    <PersonAvatar person={m.author} size={26} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} c="inherit" truncate>
                      {m.author?.name ?? "—"}
                    </Text>
                    {m.author?.email && (
                      <Text size="xs" c={secondaire} opacity={opacite} truncate>
                        {m.author.email}
                      </Text>
                    )}
                  </div>
                </Group>
                <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                  <Text size="xs" c={secondaire} opacity={opacite}>
                    {formatDate(m.created_at)}
                    {m.updated_at !== m.created_at ? " (modifié)" : ""}
                  </Text>
                  {/* Un mot de l'application ne s'efface pas, ni une réponse :
                    elle est peut-être déjà partie chez l'expéditeur. */}
                  {!m.system && gauche && onDelete && (
                    <ActionIcon
                      variant="subtle"
                      color={RED}
                      size="sm"
                      onClick={() => setASupprimer(m)}
                      aria-label="Supprimer le message"
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  )}
                </Group>
              </Group>
              {/* Un e-mail reçu tel qu'il a été écrit, dans son cadre ; un
                message de Milo avec la typographie de l'éditeur. */}
              {m.format === "email" ? (
                <div style={{ padding: MARGE_MESSAGE }}>
                  <EmailFrame html={m.text} />
                </div>
              ) : (
                <Typography
                  p={MARGE_MESSAGE}
                  style={{ fontSize: "var(--mantine-font-size-sm)" }}
                >
                  <div
                    className={classes.corps}
                    dangerouslySetInnerHTML={{ __html: commeHtml(m.text) }}
                  />
                </Typography>
              )}
              {m.attachments && m.attachments.length > 0 && (
                <PiecesJointes pieces={m.attachments} />
              )}
              {/* Seul un échec se signale : une réponse partie va de soi, et
                une simulation ne concerne que la mise au point. */}
              {m.mail_status === "failed" && (
                <PiedEnvoi
                  statut={m.mail_status}
                  a={m.mail_to ?? ""}
                  cc={m.mail_cc ?? ""}
                  bcc={m.mail_bcc ?? ""}
                />
              )}
            </Paper>
          );
        })}
      </Stack>

      {/* Hors de la pile : son écart s'ajouterait sous le dernier message. */}
      <div ref={fin} />

      <DeleteConfirmModal
        opened={aSupprimer !== null}
        onClose={() => setASupprimer(null)}
        onConfirm={() => {
          const m = aSupprimer;
          setASupprimer(null);
          if (m) void onDelete?.(m.id);
        }}
        title="Supprimer le message"
        message="Voulez-vous vraiment supprimer ce message ? Cette action est irréversible."
      />
    </div>
  );
}

/** Ce que le bouton d'envoi fait de la demande, une fois la réponse partie. */
export interface EnvoiReponse {
  status: SupportStatus;
  cc: string[];
  bcc: string[];
  /** Les pièces jointes, à déposer avant d'envoyer la réponse. */
  files: File[];
}

/**
 * Le plafond des pièces jointes d'une réponse qui part par e-mail : celui du
 * serveur (lib/ticket-files.ts), que Graph impose.
 */
const TAILLE_MAX_ENVOI = 3 * 1024 * 1024;

/** Les trois façons d'envoyer, la première par défaut. */
const ENVOIS: { status: SupportStatus; label: string }[] = [
  { status: "pending", label: "Envoyer et définir en attente" },
  { status: "resolved", label: "Envoyer et définir comme résolu" },
  { status: "closed", label: "Envoyer et définir comme fermé" },
];

/**
 * La réponse : l'éditeur et son bouton, posés sous le panneau des messages.
 * L'éditeur se vide une fois le message parti ; s'il est refusé, le texte
 * reste, pour qu'on ne le perde pas.
 *
 * Le bouton envoie et met la demande « En attente » ; sa flèche propose de la
 * dire résolue ou fermée à la place. « CC » et « CCI », dans la barre
 * d'outils, ouvrent chacun sa ligne d'adresses — seulement quand la réponse
 * part par e-mail.
 */
export function SupportReply({
  modele = "",
  onSend,
  parEmail = false,
  avecFichiers = false,
  bloque,
}: {
  /**
   * Ce que l'éditeur porte d'office — les contenus par défaut du Paramétrage :
   * posé à vide, et de nouveau une fois la réponse partie.
   */
  modele?: string;
  onSend: (html: string, envoi: EnvoiReponse) => Promise<void>;
  /** Vrai quand la réponse part par e-mail : la copie a alors un sens. */
  parEmail?: boolean;
  /** Vrai quand la réponse peut porter des pièces jointes : la demande existe. */
  avecFichiers?: boolean;
  /** Quand l'envoi n'est pas encore possible : la raison, en infobulle. */
  bloque?: string;
}) {
  const editor = useRichEditor({ placeholder: "Écrire une réponse…" });
  const [envoi, setEnvoi] = useState(false);
  const [cc, setCc] = useState<string[] | null>(null);
  const [bcc, setBcc] = useState<string[] | null>(null);
  const [fichiers, setFichiers] = useState<File[]>([]);
  const selecteur = useRef<HTMLInputElement | null>(null);
  // Ce que l'éditeur a reçu du modèle, tel que l'éditeur le rend.
  const pose = useRef("");

  /** Pose le modèle, le curseur au début : on écrit avant la signature. */
  const poserModele = useCallback(() => {
    if (!editor) return;
    editor.chain().setContent(modele).setTextSelection(1).run();
    pose.current = editor.getHTML();
  }, [editor, modele]);

  // Un modèle qui change — le fil avance, une autre demande s'ouvre —
  // remplace l'ancien tant qu'on n'y a pas touché ; jamais un texte écrit.
  useEffect(() => {
    if (!editor) return;
    const actuel = editor.getHTML();
    if (estVide(actuel) || actuel === pose.current) poserModele();
  }, [editor, poserModele]);

  const total = fichiers.reduce((somme, f) => somme + f.size, 0);
  const tropLourd = parEmail && total > TAILLE_MAX_ENVOI;

  const envoyer = async (status: SupportStatus) => {
    if (!editor || tropLourd || bloque) return;
    const html = editor.getHTML();
    if (estVide(html)) return;
    setEnvoi(true);
    try {
      await onSend(html, {
        status,
        cc: cc ?? [],
        bcc: bcc ?? [],
        files: fichiers,
      });
      poserModele();
      setCc(null);
      setBcc(null);
      setFichiers([]);
    } catch {
      // Le tiroir a déjà dit ce qui n'allait pas : le texte reste en place.
    } finally {
      setEnvoi(false);
    }
  };

  /** Ouvre la ligne, ou la referme — ses adresses avec elle. */
  const basculer = (
    ligne: string[] | null,
    poser: (v: string[] | null) => void,
  ) => poser(ligne === null ? [] : null);

  // Le bouton envoie « en attente » ; sa flèche propose les deux autres issues.
  // Sur toute la largeur, le bouton s'étire et prend les coins bas de l'éditeur.
  // Gris foncé, un cran plus clair sur le thème sombre pour se détacher du
  // champ ; le survol s'assombrit d'autant.
  const coin = "calc(var(--mantine-radius-default) - 1px)";
  const gris = {
    "--button-bg": "light-dark(var(--mantine-color-dark-6), var(--mantine-color-dark-4))",
    "--button-hover": "light-dark(var(--mantine-color-dark-7), var(--mantine-color-dark-5))",
    "--ai-bg": "light-dark(var(--mantine-color-dark-6), var(--mantine-color-dark-4))",
    "--ai-hover": "light-dark(var(--mantine-color-dark-7), var(--mantine-color-dark-5))",
  } as CSSProperties;
  const boutons = (
    <Group gap={1} wrap="nowrap" style={{ flex: 1 }}>
      <Button
        color="dark"
        variant="filled"
        size="compact-sm"
        h={36}
        leftSection={<IconSend2 size={16} />}
        onClick={() => void envoyer("pending")}
        loading={envoi}
        disabled={Boolean(bloque)}
        title={bloque ?? ENVOIS[0]!.label}
        style={{
          ...gris,
          flex: 1,
          borderRadius: `0 0 0 ${coin}`,
        }}
      >
        Envoyer
      </Button>
      <Menu position="top-end" withinPortal shadow="md">
        <Menu.Target>
          <ActionIcon
            color="dark"
            variant="filled"
            size={36}
            disabled={envoi || Boolean(bloque)}
            aria-label="Autres façons d'envoyer"
            style={{
              ...gris,
              borderRadius: `0 0 ${coin} 0`,
            }}
          >
            <IconChevronDown size={14} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {ENVOIS.map(({ status, label }) => (
            <Menu.Item key={status} onClick={() => void envoyer(status)}>
              {label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );

  return (
    <RichTextField
      editor={editor}
      // Une réponse s'écrit plus longuement qu'un commentaire : quinze lignes
      // avant de défiler.
      maxLines={15}
      toolbarControls={
        (parEmail || avecFichiers) && (
          <>
            {avecFichiers && (
              <RichTextEditor.Control
                onClick={() => selecteur.current?.click()}
                aria-label="Joindre des fichiers"
              >
                <IconPaperclip size={16} />
              </RichTextEditor.Control>
            )}
            {parEmail && (
              <>
                <RichTextEditor.Control
                  onClick={() => basculer(cc, setCc)}
                  active={cc !== null}
                  aria-label="Copie"
                  px={6}
                  w="auto"
                >
                  <Text size="xs" fw={600} c="inherit">
                    CC
                  </Text>
                </RichTextEditor.Control>
                <RichTextEditor.Control
                  onClick={() => basculer(bcc, setBcc)}
                  active={bcc !== null}
                  aria-label="Copie cachée"
                  px={6}
                  w="auto"
                >
                  <Text size="xs" fw={600} c="inherit">
                    CCI
                  </Text>
                </RichTextEditor.Control>
              </>
            )}
            {/* Le sélecteur lui-même, caché : le trombone l'ouvre. Plusieurs
                fichiers à la fois, qui s'ajoutent à ceux déjà choisis. */}
            <input
              ref={selecteur}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const choisis = [...(e.currentTarget.files ?? [])];
                setFichiers((deja) => [...deja, ...choisis]);
                e.currentTarget.value = "";
              }}
            />
          </>
        )
      }
      // Les pièces jointes choisies, comme dans les messages, sous le texte ;
      // chacune se retire d'une croix tant que la réponse n'est pas partie.
      contentEnd={
        fichiers.length > 0 && (
          <>
            <ListeFichiers
              px={10}
              lignes={fichiers.map((f, rang) => ({
                key: `${rang}-${f.name}`,
                name: f.name,
                size: f.size,
                onRemove: () =>
                  setFichiers((deja) => deja.filter((_, i) => i !== rang)),
              }))}
            />
            {tropLourd && (
              <Text size="xs" c="red" px={12} pb={6}>
                Les pièces jointes d'une réponse par e-mail ne dépassent pas 3
                Mo au total.
              </Text>
            )}
          </>
        )
      }
      topSection={
        parEmail &&
        (cc !== null || bcc !== null) && (
          <>
            {cc !== null && (
              <RecipientsInput label="CC" value={cc} onChange={setCc} />
            )}
            {bcc !== null && (
              <RecipientsInput label="CCI" value={bcc} onChange={setBcc} />
            )}
          </>
        )
      }
      // Sous l'éditeur, sur toute sa largeur, collé aux bordures.
      bottomBar={boutons}
    />
  );
}
