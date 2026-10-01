import { Group, Progress, Stack, Table, Text } from "@mantine/core";
import { IconNetwork, IconWifi } from "@tabler/icons-react";
import { OsLogo } from "./AssetLogos";
import { VIDE, taille } from "./InventoryTables";
import type { ReactNode } from "react";
import type { AssetDetail } from "@milo/shared";

// L'onglet « Résumé » de la fiche d'un poste : ce qu'on cherche d'abord en
// l'ouvrant, sur une ligne chacun. Le détail reste dans les autres onglets.

/** Une ligne : le libellé à gauche, la valeur à droite. */
function Ligne({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <Table.Tr>
      <Table.Td style={{ width: 220, verticalAlign: "top" }}>
        <Text size="sm" c="dimmed">
          {libelle}
        </Text>
      </Table.Td>
      <Table.Td style={{ verticalAlign: "top" }}>{children}</Table.Td>
    </Table.Tr>
  );
}

/** Un texte, ou le tiret quand l'agent ne l'a pas donné. */
const valeur = (texte: string | null | undefined) => (
  <Text size="sm" c={texte ? undefined : "dimmed"} style={{ wordBreak: "break-word" }}>
    {texte || VIDE}
  </Text>
);

export default function AssetSummaryPanel({ detail }: { detail: AssetDetail }) {
  const { summary, os, system_disk: disque } = detail;
  const occupe = disque ? ((disque.total - disque.free) / disque.total) * 100 : null;
  const couleur = occupe == null ? "blue" : occupe >= 90 ? "red" : occupe >= 75 ? "orange" : "blue";

  // « 1 × Intel Core i7 — 4 cœurs, 8 threads » : le nombre ne se dit que
  // s'il y a plus d'un processeur.
  const processeur = summary.cpu
    ? [
        `${summary.cpu.count > 1 ? `${summary.cpu.count} × ` : ""}${summary.cpu.name}`,
        [
          summary.cpu.cores && `${summary.cpu.cores} cœurs`,
          summary.cpu.threads && `${summary.cpu.threads} threads`,
        ]
          .filter(Boolean)
          .join(", "),
      ]
        .filter(Boolean)
        .join(" — ")
    : "";

  const fabricant = [summary.manufacturer, summary.model].filter(Boolean).join(" ");

  return (
    <Table withRowBorders={false} verticalSpacing={6} horizontalSpacing={0}>
      <Table.Tbody>
        <Ligne libelle="Nom de l'asset">{valeur(detail.name)}</Ligne>

        <Ligne libelle="Système et version">
          {os ? (
            <Group gap={6} wrap="nowrap">
              <OsLogo os={os} />
              {valeur([os.name, os.version && !os.name.includes(os.version) ? os.version : ""]
                .filter(Boolean)
                .join(" "))}
            </Group>
          ) : (
            valeur(null)
          )}
        </Ligne>

        {/* Une ligne par carte : un portable en a souvent deux, la filaire
            et le Wi-Fi, et c'est l'adresse de celle qui sert qu'on cherche. */}
        <Ligne libelle="Adresses IP">
          {summary.networks.length === 0 ? (
            valeur(null)
          ) : (
            <Stack gap={4}>
              {summary.networks.map((carte, rang) => (
                <Group key={rang} gap={6} wrap="nowrap" align="flex-start">
                  <Text c="dimmed" style={{ display: "inline-flex", paddingTop: 2 }}>
                    {carte.kind === "wifi" ? <IconWifi size={16} /> : <IconNetwork size={16} />}
                  </Text>
                  <Text size="sm">
                    {carte.ips.join(", ")}{" "}
                    <Text span size="sm" c="dimmed">
                      ({carte.kind === "wifi" ? "Wi-Fi" : "Ethernet"}
                      {carte.description ? ` — ${carte.description}` : ""})
                    </Text>
                  </Text>
                </Group>
              ))}
            </Stack>
          )}
        </Ligne>

        <Ligne libelle="Numéro de série">
          {valeur(summary.serial)}
          {fabricant && (
            <Text size="xs" c="dimmed">
              {fabricant}
            </Text>
          )}
        </Ligne>

        <Ligne libelle="Processeur">{valeur(processeur)}</Ligne>

        <Ligne libelle="Mémoire">{valeur(summary.memory ? taille(summary.memory) : null)}</Ligne>

        {/* Le volume système, comme dans la liste : l'occupé en barre, le
            libre et le total en clair. */}
        <Ligne libelle="Espace disque libre / total">
          {disque && occupe != null ? (
            <Stack gap={4} maw={320}>
              <Progress value={occupe} color={couleur} size="sm" />
              <Text size="sm">
                {taille(disque.free)} / {taille(disque.total)}
              </Text>
            </Stack>
          ) : (
            valeur(null)
          )}
        </Ligne>
      </Table.Tbody>
    </Table>
  );
}
