import { Button, FileButton, Group, Stack, Text, Title } from "@mantine/core";
import { IconDownload, IconUpload } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import { backupFileName } from "@milo/shared";
import { api } from "../../api";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import SuccessAlert from "../ui/SuccessAlert";
import { errorMessage, notifyError } from "../../lib/errors";
import type { BackupInfo, RestoreResult } from "@milo/shared";

// Même colonne de libellés que les autres onglets des réglages.
const LABEL_WIDTH = 170;

/** Une taille en octets, dite comme on la lit : « 14,6 Mo ». */
const weight = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} o`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} Ko`;
  return `${(kb / 1024).toFixed(1).replace(".", ",")} Mo`;
};

const row = (label: string, value: string) => (
  <Group gap="md" wrap="nowrap" align="baseline">
    <Text size="sm" fw={500} c="dimmed" w={LABEL_WIDTH} style={{ flexShrink: 0 }}>
      {label}
    </Text>
    <Text size="sm">{value}</Text>
  </Group>
);

/**
 * La sauvegarde : une archive unique qui emporte la base et les fichiers
 * déposés sur les cartes.
 *
 * La restauration remplace tout, jusqu'aux comptes et aux sessions ouvertes :
 * elle passe donc par une confirmation, et la session en cours peut ne plus
 * valoir ensuite — c'est ce que dit le compte rendu.
 */
export default function BackupTab() {
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [toRestore, setToRestore] = useState<File | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);
  // Laquelle des deux opérations est en cours : chacune a son bouton, et
  // aucune des deux ne doit laisser croire que l'autre travaille.
  const [ongoing, setInProgress] = useState<
    "download" | "restore" | null
  >(null);

  const reload = useCallback(async () => {
    try {
      setInfo(await api.getBackupInfo());
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const download = async () => {
    setInProgress("download");
    try {
      const archive = await api.downloadBackup();
      // Le navigateur n'enregistre un fichier que si un lien est cliqué : on
      // en fabrique un le temps du clic, et l'adresse est rendue ensuite.
      const url = URL.createObjectURL(archive);
      const link = document.createElement("a");
      link.href = url;
      link.download = backupFileName();
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setInProgress(null);
    }
  };

  const restore = async () => {
    if (!toRestore) return;
    const archive = toRestore;
    setToRestore(null);
    setResult(null);
    setInProgress("restore");
    try {
      setResult(await api.restoreBackup(archive));
      await reload();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setInProgress(null);
    }
  };

  return (
    <Stack gap="lg">

      <Stack gap="xs">
        {info && (
          <>
            {row("Base de données", weight(info.database_size))}
            {row(
              "Fichiers déposés",
              `${info.media_count} fichier${info.media_count > 1 ? "s" : ""} — ${weight(info.media_size)}`,
            )}
            {row(
              "Dernière restauration",
              info.last_restore
                ? dayjs(info.last_restore).format("DD/MM/YYYY HH:mm")
                : "Aucune",
            )}
          </>
        )}

        <Group mt="xs">
          <Button
            color="teal"
            leftSection={<IconDownload size={16} />}
            onClick={download}
            loading={ongoing === "download"}
            disabled={ongoing === "restore"}
          >
            Télécharger la sauvegarde
          </Button>
        </Group>
      </Stack>

      <Stack gap="xs">
        {/* Même titre que celui du panneau (« Sauvegarde », SettingsModal) :
            la restauration est une section à part entière. */}
        <Title order={4} pt={30}>
          Restaurer
        </Title>

        <Group mt="xs">
          <FileButton onChange={setToRestore} accept=".gz,application/gzip">
            {(props) => (
              <Button
                {...props}
                variant="default"
                leftSection={<IconUpload size={16} />}
                loading={ongoing === "restore"}
                disabled={ongoing === "download"}
              >
                {ongoing === "restore"
                  ? "Restauration en cours…"
                  : "Choisir une sauvegarde…"}
              </Button>
            )}
          </FileButton>
        </Group>

        {result && (
          <SuccessAlert mt="xs">
            <Text size="sm">
              Restauration effectuée : {result.tables} tables, {result.rows}{" "}
              lignes et {result.media} fichier
              {result.media > 1 ? "s" : ""} remis en place.
            </Text>
            <Button size="xs" mt="sm" onClick={() => window.location.reload()}>
              Recharger Milo
            </Button>
          </SuccessAlert>
        )}
      </Stack>

      <DeleteConfirmModal
        opened={toRestore !== null}
        onClose={() => setToRestore(null)}
        onConfirm={restore}
        title="Restaurer la sauvegarde"
        message={
          <>
            « {toRestore?.name} » va remplacer l'intégralité du contenu de
            Milo. Tout ce qui a été créé ou modifié depuis cette sauvegarde sera
            perdu, pour vous comme pour les autres personnes connectées. Cette
            action est irréversible.
          </>
        }
        confirmLabel="Restaurer"
      />
    </Stack>
  );
}
