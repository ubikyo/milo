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
import { avec, nombre } from "./types";
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

const QUANTITE = "quantite";
const HAUTEUR = "hauteur";
const COLONNES = "colonnes";
const NON_LUS = "nonLus";
const ENTETE = "entete";
const ENCADRE = "encadre";

/** Les e-mails d'une page : ceux que la grille demande d'un coup. */
const QUANTITE_PAR_DEFAUT = 15;
const QUANTITE_MIN = 5;
const QUANTITE_MAX = 100;

/** La hauteur de la grille, au-delà de laquelle elle défile. */
const HAUTEUR_PAR_DEFAUT = 360;
const HAUTEUR_MIN = 120;
const HAUTEUR_MAX = 1600;

/** La page relit la boîte à ce rythme : les nouveaux e-mails se posent en tête. */
const RELECTURE = 2 * 60_000;

const COLONNES_PROPOSEES = [
  { value: "expediteur", label: "Expéditeur" },
  { value: "objet", label: "Objet" },
  { value: "apercu", label: "Aperçu" },
  { value: "date", label: "Reçu le" },
  { value: "pieces", label: "Pièces jointes" },
];

const COLONNES_PAR_DEFAUT = ["expediteur", "objet", "date"];

const coche = (config: unknown, cle: string, defaut: boolean): boolean => {
  const valeur = (config as Record<string, unknown> | null)?.[cle];
  return valeur === undefined ? defaut : Boolean(valeur);
};

/** Les colonnes rangées, dans l'ordre de la grille, sans ce qui n'en est pas une. */
const colonnesDe = (config: unknown): string[] => {
  const valeur = (config as Record<string, unknown> | null)?.[COLONNES];
  if (!Array.isArray(valeur)) return COLONNES_PAR_DEFAUT;
  return COLONNES_PROPOSEES.map((c) => c.value).filter((c) => valeur.includes(c));
};

const borne = (valeur: number, min: number, max: number) => Math.min(max, Math.max(min, valeur));

/** Aujourd'hui, l'heure ; cette année, le jour ; avant, la date entière. */
const quand = (iso: string): string => {
  const date = dayjs(iso);
  if (date.isSame(dayjs(), "day")) return date.format("HH:mm");
  if (date.isSame(dayjs(), "year")) return date.format("D MMM");
  return date.format("DD/MM/YYYY");
};

const nomDe = (a: MailAddress) => a.name || a.email || "Inconnu";

const taille = (octets: number): string => {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
};

/** Les e-mails ouverts, pour la durée de la page : les rouvrir ne redemande rien. */
const dejaOuverts = new Map<string, AccessMailDetail>();

function Lecture({
  blockId,
  entete,
  onClose,
}: {
  blockId: Id;
  entete: AccessMail | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<AccessMailDetail | null>(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (!entete) return;
    const connu = dejaOuverts.get(entete.id);
    setDetail(connu ?? null);
    setErreur("");
    if (connu) return;
    let actif = true;
    api
      .getAccessMail(blockId, entete.id)
      .then((d) => {
        dejaOuverts.set(d.id, d);
        if (actif) setDetail(d);
      })
      .catch((e: Error) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [blockId, entete]);

  const telecharger = async (pieceId: string, nom: string) => {
    if (!entete) return;
    try {
      const fichier = await api.downloadAccessMailAttachment(blockId, entete.id, pieceId);
      const url = URL.createObjectURL(fichier);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = nom;
      lien.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const adresses = (liste: MailAddress[]) =>
    liste.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(", ");

  return (
    <Drawer
      opened={entete !== null}
      onClose={onClose}
      position="right"
      size={760}
      // Dans un portail, mais sous le widget pour React : rien n'y fait glisser le widget.
      data-no-widget-drag
      title={
        <Title order={4} lineClamp={2}>
          {entete?.subject || "Sans objet"}
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
        {entete && (
          <Stack gap={2}>
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Text size="sm" fw={600}>
                {nomDe(entete.from)}{" "}
                {entete.from.name && (
                  <Text span size="sm" c="dimmed" fw={400}>
                    &lt;{entete.from.email}&gt;
                  </Text>
                )}
              </Text>
              <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                {dayjs(entete.received_at).format("dddd D MMMM YYYY, HH:mm")}
              </Text>
            </Group>
            {detail && detail.to.length > 0 && (
              <Text size="xs" c="dimmed">
                À : {adresses(detail.to)}
              </Text>
            )}
            {detail && detail.cc.length > 0 && (
              <Text size="xs" c="dimmed">
                Cc : {adresses(detail.cc)}
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
                onClick={() => telecharger(p.id, p.name)}
                title="Télécharger"
              >
                {p.name} · {taille(p.size)}
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
        {erreur && (
          <Text size="sm" c="red">
            {erreur}
          </Text>
        )}
        {!detail && !erreur && (
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

type Etat =
  | { phase: "attente" }
  | { phase: "pret"; messages: AccessMail[]; more: boolean; unread: number | null }
  | { phase: "erreur"; message: string };

function Courrier({ blockId, config }: { blockId: Id; config: unknown }) {
  const quantite = borne(nombre(config, QUANTITE, QUANTITE_PAR_DEFAUT), QUANTITE_MIN, QUANTITE_MAX);
  const hauteur = borne(nombre(config, HAUTEUR, HAUTEUR_PAR_DEFAUT), HAUTEUR_MIN, HAUTEUR_MAX);
  const nonLus = coche(config, NON_LUS, false);
  const colonnes = colonnesDe(config);
  const [etat, setEtat] = useState<Etat>({ phase: "attente" });
  const [suite, setSuite] = useState(false);
  const [ouvert, setOuvert] = useState<AccessMail | null>(null);
  // La page suivante ne se demande qu'une fois à la fois, même si le bas de la
  // grille est atteint plusieurs fois pendant qu'elle arrive.
  const enCours = useRef(false);

  // La première page, relue à intervalle : ce qui est arrivé depuis se pose en
  // tête, et les e-mails déjà là reprennent leur état — lu ailleurs, par exemple.
  useEffect(() => {
    if (!blockId) return;
    let actif = true;
    setEtat({ phase: "attente" });
    const lire = (premiere: boolean) =>
      api
        .getAccessMails(blockId, 0, quantite, nonLus)
        .then((page) => {
          if (!actif) return;
          setEtat((avant) => {
            if (premiere || avant.phase !== "pret") {
              return { phase: "pret", messages: page.messages, more: page.more, unread: page.unread ?? null };
            }
            const frais = new Map(page.messages.map((m) => [m.id, m]));
            const connus = new Set(avant.messages.map((m) => m.id));
            return {
              ...avant,
              unread: page.unread ?? avant.unread,
              messages: [
                ...page.messages.filter((m) => !connus.has(m.id)),
                ...avant.messages.map((m) => frais.get(m.id) ?? m),
              ],
            };
          });
        })
        .catch((e: Error) => actif && premiere && setEtat({ phase: "erreur", message: e.message }));
    lire(true);
    const battement = setInterval(() => lire(false), RELECTURE);
    return () => {
      actif = false;
      clearInterval(battement);
    };
  }, [blockId, quantite, nonLus]);

  const chargerLaSuite = useCallback(() => {
    if (etat.phase !== "pret" || !etat.more || enCours.current) return;
    enCours.current = true;
    setSuite(true);
    api
      .getAccessMails(blockId, etat.messages.length, quantite, nonLus)
      .then((page) =>
        setEtat((avant) => {
          if (avant.phase !== "pret") return avant;
          const connus = new Set(avant.messages.map((m) => m.id));
          return {
            ...avant,
            more: page.more,
            messages: [...avant.messages, ...page.messages.filter((m) => !connus.has(m.id))],
          };
        }),
      )
      .catch((e: Error) => notifications.show({ color: "red", message: e.message }))
      .finally(() => {
        enCours.current = false;
        setSuite(false);
      });
  }, [etat, blockId, quantite, nonLus]);

  const contenu = (() => {
    if (etat.phase === "attente") {
      return (
        <Group gap="xs" c="dimmed">
          <Loader size="xs" color="gray" />
          <Text size="sm">Chargement de la boîte de réception…</Text>
        </Group>
      );
    }
    if (etat.phase === "erreur") {
      return (
        <Group gap={6} wrap="nowrap" align="flex-start">
          <IconMail size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <Text size="sm" c="red" lineClamp={3}>
            {etat.message}
          </Text>
        </Group>
      );
    }

    return (
      <Stack gap={6}>
        {coche(config, ENTETE, true) && (
          <Group gap={6} c="dimmed">
            <IconMail size={14} />
            <Text size="xs">
              Boîte de réception
              {etat.unread !== null && ` · ${etat.unread} non lu${etat.unread > 1 ? "s" : ""}`}
            </Text>
          </Group>
        )}
        {etat.messages.length === 0 ? (
          <Text size="sm" c="dimmed">
            {nonLus ? "Aucun e-mail non lu" : "Aucun e-mail"}
          </Text>
        ) : (
          <ScrollArea.Autosize mah={hauteur} onBottomReached={chargerLaSuite} type="hover" offsetScrollbars="y">
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
                  {colonnes.map((c) => (
                    <Table.Th
                      key={c}
                      fz="xs"
                      c="dimmed"
                      fw={500}
                      w={c === "date" ? 72 : c === "pieces" ? 28 : c === "expediteur" ? "30%" : undefined}
                      ta={c === "date" ? "right" : undefined}
                    >
                      {c === "pieces" ? <IconPaperclip size={12} /> : COLONNES_PROPOSEES.find((p) => p.value === c)?.label}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {etat.messages.map((m) => (
                  <Table.Tr key={m.id} onClick={() => setOuvert(m)} style={{ cursor: "pointer" }}>
                    {colonnes.map((c) => {
                      const graisse = m.is_read ? 400 : 600;
                      if (c === "expediteur") {
                        return (
                          <Table.Td key={c}>
                            <Text size="sm" fw={graisse} truncate title={m.from.email}>
                              {nomDe(m.from)}
                            </Text>
                          </Table.Td>
                        );
                      }
                      if (c === "objet") {
                        return (
                          <Table.Td key={c}>
                            <Text size="sm" fw={graisse} truncate c={m.importance === "high" ? "red" : undefined}>
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
                            <Text size="xs" c="dimmed" fw={graisse} style={{ whiteSpace: "nowrap" }}>
                              {quand(m.received_at)}
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
            {etat.more && (
              <Group justify="center" py={6}>
                {suite ? (
                  <Loader size="xs" color="gray" />
                ) : (
                  <Button size="compact-xs" variant="subtle" color="gray" onClick={chargerLaSuite}>
                    Charger les suivants
                  </Button>
                )}
              </Group>
            )}
          </ScrollArea.Autosize>
        )}
        <Lecture blockId={blockId} entete={ouvert} onClose={() => setOuvert(null)} />
      </Stack>
    );
  })();

  if (!coche(config, ENCADRE, false)) return contenu;
  return (
    <Box className={classes.encart} style={{ border: "none" }}>
      {contenu}
    </Box>
  );
}

export const mailWidget: AccessWidget = {
  type: "mail",
  kind: "m365",
  label: "Mail",
  icon: IconMail,
  defaultConfig: {
    [QUANTITE]: QUANTITE_PAR_DEFAUT,
    [HAUTEUR]: HAUTEUR_PAR_DEFAUT,
    [COLONNES]: COLONNES_PAR_DEFAUT,
    [NON_LUS]: false,
    [ENTETE]: true,
    [ENCADRE]: false,
  },
  // Chaque ligne ouvre son e-mail.
  ownClicks: true,

  Display: Courrier,

  marges: () => ({ haute: 0, basse: 15 }),

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <Text size="sm" c="dimmed">
        Chacun voit sa propre boîte de réception, lue dans Entra (permission Mail.Read).
      </Text>
      <Group align="flex-start">
        {/* Un champ vidé le temps d'une saisie range la valeur par défaut. */}
        <NumberInput
          label="E-mails par chargement"
          value={nombre(config, QUANTITE, QUANTITE_PAR_DEFAUT)}
          onChange={(v) => onChange(avec(config, QUANTITE, v === "" ? QUANTITE_PAR_DEFAUT : Number(v)))}
          min={QUANTITE_MIN}
          max={QUANTITE_MAX}
          allowNegative={false}
          allowDecimal={false}
          w={170}
        />
        <NumberInput
          label="Hauteur de la grille"
          value={nombre(config, HAUTEUR, HAUTEUR_PAR_DEFAUT)}
          onChange={(v) => onChange(avec(config, HAUTEUR, v === "" ? HAUTEUR_PAR_DEFAUT : Number(v)))}
          min={HAUTEUR_MIN}
          max={HAUTEUR_MAX}
          suffix=" px"
          allowNegative={false}
          allowDecimal={false}
          w={150}
        />
      </Group>
      <Checkbox.Group
        label="Colonnes"
        value={colonnesDe(config)}
        onChange={(valeurs) => valeurs.length && onChange(avec(config, COLONNES, valeurs))}
      >
        <Stack gap="xs" mt={6}>
          {COLONNES_PROPOSEES.map((c) => (
            <Checkbox key={c.value} value={c.value} label={c.label} color="teal" />
          ))}
        </Stack>
      </Checkbox.Group>
      <Stack gap="sm">
        <Checkbox
          label="Non lus uniquement"
          checked={coche(config, NON_LUS, false)}
          onChange={(e) => onChange(avec(config, NON_LUS, e.currentTarget.checked))}
          color="teal"
        />
        <Checkbox
          label="Afficher le nombre de non lus"
          checked={coche(config, ENTETE, true)}
          onChange={(e) => onChange(avec(config, ENTETE, e.currentTarget.checked))}
          color="teal"
        />
      </Stack>
    </Stack>
  ),

  ConfigFin: ({ config, onChange }) => (
    <Checkbox
      label="Encadrer"
      checked={coche(config, ENCADRE, false)}
      onChange={(e) => onChange(avec(config, ENCADRE, e.currentTarget.checked))}
      color="teal"
    />
  ),
};
