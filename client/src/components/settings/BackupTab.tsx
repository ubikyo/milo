import { Button, FileButton, Group, Stack, Text, Title } from "@mantine/core";
import { IconDownload, IconUpload } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import { backupFileName } from "@milo/shared";
import { api } from "../../api";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import SuccessAlert from "../ui/SuccessAlert";
import { messageErreur, notifierErreur } from "../../lib/errors";
import type { BackupInfo, RestoreResult } from "@milo/shared";

// Même colonne de libellés que les autres onglets des réglages.
const LABEL_WIDTH = 170;

/** Une taille en octets, dite comme on la lit : « 14,6 Mo ». */
const poids = (octets: number): string => {
  if (octets < 1024) return `${octets} o`;
  const ko = octets / 1024;
  if (ko < 1024) return `${ko.toFixed(0)} Ko`;
  return `${(ko / 1024).toFixed(1).replace(".", ",")} Mo`;
};

const ligne = (libelle: string, valeur: string) => (
  <Group gap="md" wrap="nowrap" align="baseline">
    <Text size="sm" fw={500} c="dimmed" w={LABEL_WIDTH} style={{ flexShrink: 0 }}>
      {libelle}
    </Text>
    <Text size="sm">{valeur}</Text>
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
  const [aRestaurer, setARestaurer] = useState<File | null>(null);
  const [resultat, setResultat] = useState<RestoreResult | null>(null);
  // Laquelle des deux opérations est en cours : chacune a son bouton, et
  // aucune des deux ne doit laisser croire que l'autre travaille.
  const [enCours, setEnCours] = useState<
    "telechargement" | "restauration" | null
  >(null);

  const reload = useCallback(async () => {
    try {
      setInfo(await api.getBackupInfo());
    } catch (e) {
      notifierErreur(messageErreur(e));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const telecharger = async () => {
    setEnCours("telechargement");
    try {
      const archive = await api.downloadBackup();
      // Le navigateur n'enregistre un fichier que si un lien est cliqué : on
      // en fabrique un le temps du clic, et l'adresse est rendue ensuite.
      const url = URL.createObjectURL(archive);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = backupFileName();
      lien.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notifierErreur(messageErreur(e));
    } finally {
      setEnCours(null);
    }
  };

  const restaurer = async () => {
    if (!aRestaurer) return;
    const archive = aRestaurer;
    setARestaurer(null);
    setResultat(null);
    setEnCours("restauration");
    try {
      setResultat(await api.restoreBackup(archive));
      await reload();
    } catch (e) {
      notifierErreur(messageErreur(e));
    } finally {
      setEnCours(null);
    }
  };

  return (
    <Stack gap="lg">

      <Stack gap="xs">
        {info && (
          <>
            {ligne("Base de données", poids(info.database_size))}
            {ligne(
              "Fichiers déposés",
              `${info.media_count} fichier${info.media_count > 1 ? "s" : ""} — ${poids(info.media_size)}`,
            )}
            {ligne(
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
            onClick={telecharger}
            loading={enCours === "telechargement"}
            disabled={enCours === "restauration"}
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
          <FileButton onChange={setARestaurer} accept=".gz,application/gzip">
            {(props) => (
              <Button
                {...props}
                variant="default"
                leftSection={<IconUpload size={16} />}
                loading={enCours === "restauration"}
                disabled={enCours === "telechargement"}
              >
                {enCours === "restauration"
                  ? "Restauration en cours…"
                  : "Choisir une sauvegarde…"}
              </Button>
            )}
          </FileButton>
        </Group>

        {resultat && (
          <SuccessAlert mt="xs">
            <Text size="sm">
              Restauration effectuée : {resultat.tables} tables, {resultat.rows}{" "}
              lignes et {resultat.medias} fichier
              {resultat.medias > 1 ? "s" : ""} remis en place.
            </Text>
            <Button size="xs" mt="sm" onClick={() => window.location.reload()}>
              Recharger Milo
            </Button>
          </SuccessAlert>
        )}
      </Stack>

      <DeleteConfirmModal
        opened={aRestaurer !== null}
        onClose={() => setARestaurer(null)}
        onConfirm={restaurer}
        title="Restaurer la sauvegarde"
        message={
          <>
            « {aRestaurer?.name} » va remplacer l'intégralité du contenu de
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
