import {
  Badge,
  Box,
  Button,
  Checkbox,
  Drawer,
  Group,
  Loader,
  NumberInput,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconExternalLink, IconMail, IconPaperclip } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { api } from "../api";
import classes from "../assets/styles/AccessNumero.module.css";
import EmailFrame from "../components/support/EmailFrame";
import { NEUTRAL_HOVER } from "../themes/colors";
import { withField, count } from "./types";
import type { AccessWidget } from "./types";
import type { AccessMail, AccessMailDetail, Id, MailAddress } from "@milo/shared";

// Le courrier : la boîte de réception de qui regarde, en grille — chacun voit
// la sienne, quel que soit le tableau. Elle est lue dans Entra par le serveur
// (server/src/lib/entra.ts, permission d'application Mail.Read), page par
// page : la suivante arrive quand on descend au bas de la grille. Un clic sur
// une ligne ouvre l'e-mail dans un tiroir, tel que l'expéditeur l'a écrit
// (EmailFrame, celui du Support), avec ses pièces jointes.
//
// Rien n'est modifié dans la boîte : un e-mail ouvert ici n'y est pas marqué lu.

const QUANTITY = "quantite";
const HEIGHT = "hauteur";
const COLUMNS = "colonnes";
const UNREAD = "nonLus";
const HEADER = "entete";
const FRAMED = "encadre";

/** Les e-mails d'une page : ceux que la grille demande d'un coup. */
const QUANTITY_DEFAULT = 15;
const QUANTITY_MIN = 5;
const QUANTITY_MAX = 100;

/** La hauteur de la grille, au-delà de laquelle elle défile. */
const DEFAULT_HEIGHT = 360;
const HEIGHT_MIN = 120;
const HEIGHT_MAX = 1600;

/** La page relit la boîte à ce rythme : les nouveaux e-mails se posent en tête. */
const RELOAD_INTERVAL = 2 * 60_000;

const PROPOSED_COLUMNS = [
  { value: "expediteur", label: "Expéditeur" },
  { value: "objet", label: "Objet" },
  { value: "apercu", label: "Aperçu" },
  { value: "date", label: "Reçu le" },
  { value: "pieces", label: "Pièces jointes" },
];

const DEFAULT_COLUMNS = ["expediteur", "objet", "date"];

const isChecked = (config: unknown, key: string, defaultValue: boolean): boolean => {
  const value = (config as Record<string, unknown> | null)?.[key];
  return value === undefined ? defaultValue : Boolean(value);
};

/** Les colonnes rangées, dans l'ordre de la grille, sans ce qui n'en est pas une. */
const columnsOf = (config: unknown): string[] => {
  const value = (config as Record<string, unknown> | null)?.[COLUMNS];
  if (!Array.isArray(value)) return DEFAULT_COLUMNS;
  return PROPOSED_COLUMNS.map((c) => c.value).filter((c) => value.includes(c));
};

const bound = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Aujourd'hui, l'heure ; cette année, le jour ; avant, la date entière. */
const whenLabel = (iso: string): string => {
  const date = dayjs(iso);
  if (date.isSame(dayjs(), "day")) return date.format("HH:mm");
  if (date.isSame(dayjs(), "year")) return date.format("D MMM");
  return date.format("DD/MM/YYYY");
};

const nameOf = (a: MailAddress) => a.name || a.email || "Inconnu";

const size = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

/** Les e-mails ouverts, pour la durée de la page : les rouvrir ne redemande rien. */
const alreadyOpened = new Map<string, AccessMailDetail>();

function Reader({
  blockId,
  header,
  onClose,
}: {
  blockId: Id;
  header: AccessMail | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<AccessMailDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!header) return;
    const known = alreadyOpened.get(header.id);
    setDetail(known ?? null);
    setError("");
    if (known) return;
    let active = true;
    api
      .getAccessMail(blockId, header.id)
      .then((d) => {
        alreadyOpened.set(d.id, d);
        if (active) setDetail(d);
      })
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [blockId, header]);

  const download = async (attachmentId: string, name: string) => {
    if (!header) return;
    try {
      const file = await api.downloadAccessMailAttachment(blockId, header.id, attachmentId);
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const addresses = (list: MailAddress[]) =>
    list.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(", ");

  return (
    <Drawer
      opened={header !== null}
      onClose={onClose}
      position="right"
      size={760}
      // Dans un portail, mais sous le widget pour React : rien n'y fait glisser le widget.
      data-no-widget-drag
      title={
        <Title order={4} lineClamp={2}>
          {header?.subject || "Sans objet"}
        </Title>
      }
    >
      {/* Le tiroir vit dans un portail, mais ses événements remontent par
          React jusqu'au widget : le clic droit n'y ouvre pas son réglage. */}
      <Stack
        gap="md"
        data-no-widget-drag
        onContextMenu={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {header && (
          <Stack gap={2}>
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Text size="sm" fw={600}>
                {nameOf(header.from)}{" "}
                {header.from.name && (
                  <Text span size="sm" c="dimmed" fw={400}>
                    &lt;{header.from.email}&gt;
                  </Text>
                )}
              </Text>
              <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                {dayjs(header.received_at).format("dddd D MMMM YYYY, HH:mm")}
              </Text>
            </Group>
            {detail && detail.to.length > 0 && (
              <Text size="xs" c="dimmed">
                À : {addresses(detail.to)}
              </Text>
            )}
            {detail && detail.cc.length > 0 && (
              <Text size="xs" c="dimmed">
                Cc : {addresses(detail.cc)}
              </Text>
            )}
          </Stack>
        )}
        {detail && (detail.attachments.length > 0 || detail.url) && (
          <Group gap="xs">
            {detail.attachments.map((p) => (
              <Badge
                key={p.id}
                variant="default"
                leftSection={<IconPaperclip size={12} />}
                style={{ cursor: "pointer", textTransform: "none" }}
                onClick={() => download(p.id, p.name)}
                title="Télécharger"
              >
                {p.name} · {size(p.size)}
              </Badge>
            ))}
            {detail.url && (
              <Button
                component="a"
                href={detail.url}
                target="_blank"
                rel="noopener noreferrer"
                size="compact-xs"
                variant="subtle"
                color="gray"
                rightSection={<IconExternalLink size={12} />}
                ml="auto"
              >
                Ouvrir dans Outlook
              </Button>
            )}
          </Group>
        )}
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
        {!detail && !error && (
          <Group gap="xs" c="dimmed">
            <Loader size="xs" color="gray" />
            <Text size="sm">Chargement de l'e-mail…</Text>
          </Group>
        )}
        {detail && <EmailFrame html={detail.html} />}
      </Stack>
    </Drawer>
  );
}

type State =
  | { phase: "attente" }
  | { phase: "pret"; messages: AccessMail[]; more: boolean; unread: number | null }
  | { phase: "erreur"; message: string };

function Mail({ blockId, config }: { blockId: Id; config: unknown }) {
  const quantity = bound(count(config, QUANTITY, QUANTITY_DEFAULT), QUANTITY_MIN, QUANTITY_MAX);
  const height = bound(count(config, HEIGHT, DEFAULT_HEIGHT), HEIGHT_MIN, HEIGHT_MAX);
  const unreadOnly = isChecked(config, UNREAD, false);
  const columns = columnsOf(config);
  const [state, setState] = useState<State>({ phase: "attente" });
  const [more, setMore] = useState(false);
  const [isOpen, setOpened] = useState<AccessMail | null>(null);
  // La page suivante ne se demande qu'une fois à la fois, même si le bas de la
  // grille est atteint plusieurs fois pendant qu'elle arrive.
  const ongoing = useRef(false);

  // La première page, relue à intervalle : ce qui est arrivé depuis se pose en
  // tête, et les e-mails déjà là reprennent leur état — lu ailleurs, par exemple.
  useEffect(() => {
    if (!blockId) return;
    let active = true;
    setState({ phase: "attente" });
    const read = (first: boolean) =>
      api
        .getAccessMails(blockId, 0, quantity, unreadOnly)
        .then((page) => {
          if (!active) return;
          setState((before) => {
            if (first || before.phase !== "pret") {
              return { phase: "pret", messages: page.messages, more: page.more, unread: page.unread ?? null };
            }
            const fresh = new Map(page.messages.map((m) => [m.id, m]));
            const known = new Set(before.messages.map((m) => m.id));
            return {
              ...before,
              unread: page.unread ?? before.unread,
              messages: [
                ...page.messages.filter((m) => !known.has(m.id)),
                ...before.messages.map((m) => fresh.get(m.id) ?? m),
              ],
            };
          });
        })
        .catch((e: Error) => active && first && setState({ phase: "erreur", message: e.message }));
    read(true);
    const heartbeat = setInterval(() => read(false), RELOAD_INTERVAL);
    return () => {
      active = false;
      clearInterval(heartbeat);
    };
  }, [blockId, quantity, unreadOnly]);

  const loadMore = useCallback(() => {
    if (state.phase !== "pret" || !state.more || ongoing.current) return;
    ongoing.current = true;
    setMore(true);
    api
      .getAccessMails(blockId, state.messages.length, quantity, unreadOnly)
      .then((page) =>
        setState((before) => {
          if (before.phase !== "pret") return before;
          const known = new Set(before.messages.map((m) => m.id));
          return {
            ...before,
            more: page.more,
            messages: [...before.messages, ...page.messages.filter((m) => !known.has(m.id))],
          };
        }),
      )
      .catch((e: Error) => notifications.show({ color: "red", message: e.message }))
      .finally(() => {
        ongoing.current = false;
        setMore(false);
      });
  }, [state, blockId, quantity, unreadOnly]);

  const content = (() => {
    if (state.phase === "attente") {
      return (
        <Group gap="xs" c="dimmed">
          <Loader size="xs" color="gray" />
          <Text size="sm">Chargement de la boîte de réception…</Text>
        </Group>
      );
    }
    if (state.phase === "erreur") {
      return (
        <Group gap={6} wrap="nowrap" align="flex-start">
          <IconMail size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <Text size="sm" c="red" lineClamp={3}>
            {state.message}
          </Text>
        </Group>
      );
    }

    return (
      <Stack gap={6}>
        {isChecked(config, HEADER, true) && (
          <Group gap={6} c="dimmed">
            <IconMail size={14} />
            <Text size="xs">
              Boîte de réception
              {state.unread !== null && ` · ${state.unread} non lu${state.unread > 1 ? "s" : ""}`}
            </Text>
          </Group>
        )}
        {state.messages.length === 0 ? (
          <Text size="sm" c="dimmed">
            {unreadOnly ? "Aucun e-mail non lu" : "Aucun e-mail"}
          </Text>
        ) : (
          <ScrollArea.Autosize mah={height} onBottomReached={loadMore} type="hover" offsetScrollbars="y">
            <Table
              highlightOnHover
              stickyHeader
              verticalSpacing={4}
              horizontalSpacing="xs"
              fz="sm"
              style={{ "--table-hover-color": NEUTRAL_HOVER, tableLayout: "fixed" } as CSSProperties}
            >
              <Table.Thead>
                <Table.Tr>
                  {columns.map((c) => (
                    <Table.Th
                      key={c}
                      fz="xs"
                      c="dimmed"
                      fw={500}
                      w={c === "date" ? 72 : c === "pieces" ? 28 : c === "expediteur" ? "30%" : undefined}
                      ta={c === "date" ? "right" : undefined}
                    >
                      {c === "pieces" ? <IconPaperclip size={12} /> : PROPOSED_COLUMNS.find((p) => p.value === c)?.label}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {state.messages.map((m) => (
                  <Table.Tr key={m.id} onClick={() => setOpened(m)} style={{ cursor: "pointer" }}>
                    {columns.map((c) => {
                      const weight = m.is_read ? 400 : 600;
                      if (c === "expediteur") {
                        return (
                          <Table.Td key={c}>
                            <Text size="sm" fw={weight} truncate title={m.from.email}>
                              {nameOf(m.from)}
                            </Text>
                          </Table.Td>
                        );
                      }
                      if (c === "objet") {
                        return (
                          <Table.Td key={c}>
                            <Text size="sm" fw={weight} truncate c={m.importance === "high" ? "red" : undefined}>
                              {m.subject || "Sans objet"}
                            </Text>
                          </Table.Td>
                        );
                      }
                      if (c === "apercu") {
                        return (
                          <Table.Td key={c}>
                            <Text size="sm" c="dimmed" truncate>
                              {m.preview}
                            </Text>
                          </Table.Td>
                        );
                      }
                      if (c === "date") {
                        return (
                          <Table.Td key={c} ta="right">
                            <Text size="xs" c="dimmed" fw={weight} style={{ whiteSpace: "nowrap" }}>
                              {whenLabel(m.received_at)}
                            </Text>
                          </Table.Td>
                        );
                      }
                      return (
                        <Table.Td key={c} c="dimmed">
                          {m.has_attachments && <IconPaperclip size={12} />}
                        </Table.Td>
                      );
                    })}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {/* Le bas de la grille demande la page suivante ; quand la grille
                ne défile pas encore, le bouton fait de même. */}
            {state.more && (
              <Group justify="center" py={6}>
                {more ? (
                  <Loader size="xs" color="gray" />
                ) : (
                  <Button size="compact-xs" variant="subtle" color="gray" onClick={loadMore}>
                    Charger les suivants
                  </Button>
                )}
              </Group>
            )}
          </ScrollArea.Autosize>
        )}
        <Reader blockId={blockId} header={isOpen} onClose={() => setOpened(null)} />
      </Stack>
    );
  })();

  if (!isChecked(config, FRAMED, false)) return content;
  return (
    <Box className={classes.encart} style={{ border: "none" }}>
      {content}
    </Box>
  );
}

export const mailWidget: AccessWidget = {
  type: "mail",
  kind: "m365",
  label: "Mail",
  icon: IconMail,
  defaultConfig: {
    [QUANTITY]: QUANTITY_DEFAULT,
    [HEIGHT]: DEFAULT_HEIGHT,
    [COLUMNS]: DEFAULT_COLUMNS,
    [UNREAD]: false,
    [HEADER]: true,
    [FRAMED]: false,
  },
  // Chaque ligne ouvre son e-mail.
  ownClicks: true,

  Display: Mail,

  margins: () => ({ top: 0, bottom: 15 }),

  // Il dessine lui-même son cadre, réglé dans le bloc « Apparence » du tiroir.
  ownFrame: true,

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <Text size="sm" c="dimmed">
        Chacun voit sa propre boîte de réception, lue dans Entra (permission Mail.Read).
      </Text>
      <Group align="flex-start">
        {/* Un champ vidé le temps d'une saisie range la valeur par défaut. */}
        <NumberInput
          label="E-mails par chargement"
          value={count(config, QUANTITY, QUANTITY_DEFAULT)}
          onChange={(v) => onChange(withField(config, QUANTITY, v === "" ? QUANTITY_DEFAULT : Number(v)))}
          min={QUANTITY_MIN}
          max={QUANTITY_MAX}
          allowNegative={false}
          allowDecimal={false}
          w={170}
        />
        <NumberInput
          label="Hauteur de la grille"
          value={count(config, HEIGHT, DEFAULT_HEIGHT)}
          onChange={(v) => onChange(withField(config, HEIGHT, v === "" ? DEFAULT_HEIGHT : Number(v)))}
          min={HEIGHT_MIN}
          max={HEIGHT_MAX}
          suffix=" px"
          allowNegative={false}
          allowDecimal={false}
          w={150}
        />
      </Group>
      <Checkbox.Group
        label="Colonnes"
        value={columnsOf(config)}
        onChange={(values) => values.length && onChange(withField(config, COLUMNS, values))}
      >
        <Stack gap="xs" mt={6}>
          {PROPOSED_COLUMNS.map((c) => (
            <Checkbox key={c.value} value={c.value} label={c.label} color="teal" />
          ))}
        </Stack>
      </Checkbox.Group>
      <Stack gap="sm">
        <Checkbox
          label="Non lus uniquement"
          checked={isChecked(config, UNREAD, false)}
          onChange={(e) => onChange(withField(config, UNREAD, e.currentTarget.checked))}
          color="teal"
        />
        <Checkbox
          label="Afficher le nombre de non lus"
          checked={isChecked(config, HEADER, true)}
          onChange={(e) => onChange(withField(config, HEADER, e.currentTarget.checked))}
          color="teal"
        />
      </Stack>
    </Stack>
  ),

};
