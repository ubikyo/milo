import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconCopy } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { widgetDeTableau } from "../../board-widgets";
import { useAccesWidget } from "../../lib/droits";
import {
  apercu,
  decoder,
  dispositionDe,
  encoder,
  type ApercuImport,
} from "../../lib/disposition";
import { messageErreur, notifierErreur } from "../../lib/errors";
import { RED } from "../../themes/colors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import BoutonFermer from "./BoutonFermer";
import type {
  BoardWidget,
  DispositionExportee,
  IndicatorSection,
} from "@milo/shared";

interface DispositionModalProps {
  /** « export » montre le texte à transmettre, « import » attend celui qu'on a reçu. */
  mode: "export" | "import" | null;
  onClose: () => void;
  /** La structure regardée : ce qui s'exporte, ce que l'import remplace. */
  sections: IndicatorSection[];
  widgets: BoardWidget[];
  onImport: (disposition: DispositionExportee) => Promise<void>;
}

/** L'export et l'import de la disposition du tableau ouvert. */
export default function DispositionModal({
  mode,
  onClose,
  sections,
  widgets,
  onImport,
}: DispositionModalProps) {
  return (
    <Modal
      opened={mode !== null}
      onClose={onClose}
      title={
        mode === "import"
          ? "Importer la disposition"
          : "Exporter la disposition"
      }
      centered
      size="lg"
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      {mode === "export" && (
        <Export sections={sections} widgets={widgets} onClose={onClose} />
      )}
      {mode === "import" && (
        <Import widgets={widgets} onImport={onImport} onClose={onClose} />
      )}
    </Modal>
  );
}

function Export({
  sections,
  widgets,
  onClose,
}: {
  sections: IndicatorSection[];
  widgets: BoardWidget[];
  onClose: () => void;
}) {
  const [texte, setTexte] = useState("");
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    let actif = true;
    void encoder(dispositionDe(sections, widgets)).then(
      (t) => actif && setTexte(t),
    );
    return () => {
      actif = false;
    };
  }, [sections, widgets]);

  const copier = async () => {
    await navigator.clipboard.writeText(texte);
    setCopie(true);
  };

  return (
    <>
      <Stack gap="md">
        <Text size="sm">
          Le code suivant contient la disposition du tableau courant, composée
          de {sections.length} section{sections.length > 1 ? "s" : ""} et{" "}
          {widgets.length} widget
          {widgets.length > 1 ? "s" : ""}.
        </Text>
        <Textarea
          value={texte}
          readOnly
          // La même hauteur à l'export et à l'import : la fenêtre ne change pas
          // de taille d'un geste à l'autre.
          rows={10}
          styles={{
            input: {
              fontFamily: "var(--mantine-font-family-monospace)",
              fontSize: 12,
            },
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
      </Stack>
      {/* Le même écart avant les boutons que dans les autres fenêtres. */}
      <Group justify="flex-end" mt={MODAL_PADDING}>
        <BoutonFermer onClick={onClose} />
        <Button
          color="teal"
          leftSection={copie ? <IconCheck size={16} /> : <IconCopy size={16} />}
          onClick={() => void copier()}
          disabled={!texte}
        >
          {copie ? "Copié" : "Copier"}
        </Button>
      </Group>
    </>
  );
}

function Import({
  widgets,
  onImport,
  onClose,
}: {
  widgets: BoardWidget[];
  onImport: (disposition: DispositionExportee) => Promise<void>;
  onClose: () => void;
}) {
  const acces = useAccesWidget();
  const [texte, setTexte] = useState("");
  const [lu, setLu] = useState<
    { apercu: ApercuImport } | { erreur: string } | null
  >(null);
  const [envoi, setEnvoi] = useState(false);

  // Le texte collé se lit aussitôt : ce que l'import fera se dit avant.
  useEffect(() => {
    if (!texte.trim()) return setLu(null);
    let actif = true;
    decoder(texte)
      .then((d) => {
        if (actif) {
          setLu({
            apercu: apercu(
              d,
              widgets,
              widgetDeTableau,
              (w) => acces(w.kind) === "update",
            ),
          });
        }
      })
      .catch((e: unknown) => actif && setLu({ erreur: messageErreur(e) }));
    return () => {
      actif = false;
    };
    // « acces » change à chaque rendu ; les droits, eux, ne bougent pas ici.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texte, widgets]);

  const resultat = lu && "apercu" in lu ? lu.apercu : null;

  const importer = async () => {
    if (!resultat) return;
    setEnvoi(true);
    try {
      await onImport(resultat.disposition);
      onClose();
    } catch (e) {
      notifierErreur(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <Stack gap="md">
        <Text size="sm">
          Coller le code de la disposition à importer. Les sections et widgets
          seront remplacés par cette nouvelle configuration.
        </Text>
        <Textarea
          value={texte}
          onChange={(e) => setTexte(e.currentTarget.value)}
          // La même hauteur à l'export et à l'import : la fenêtre ne change pas
          // de taille d'un geste à l'autre.
          rows={10}
          placeholder="Disposition exportée"
          data-autofocus
          styles={{
            input: {
              fontFamily: "var(--mantine-font-family-monospace)",
              fontSize: 12,
            },
          }}
          error={lu && "erreur" in lu ? lu.erreur : undefined}
        />
        {resultat && (
          <Text size="sm">
            {resultat.sections} section{resultat.sections > 1 ? "s" : ""} et{" "}
            {resultat.widgets} widget{resultat.widgets > 1 ? "s" : ""} seront
            posés.
            {resultat.ecartes > 0 &&
              ` ${resultat.ecartes} widget${resultat.ecartes > 1 ? "s" : ""} de la disposition ne ${
                resultat.ecartes > 1 ? "seront" : "sera"
              } pas repris : inconnu${resultat.ecartes > 1 ? "s" : ""} de cette version, ou hors de vos droits.`}
          </Text>
        )}
        {resultat && resultat.listesPerdues.length > 0 && (
          <Alert color={RED} icon={<IconAlertTriangle size={18} />} p="sm">
            <Text size="sm">
              {resultat.listesPerdues.length} liste
              {resultat.listesPerdues.length > 1 ? "s" : ""} de ce tableau (
              {[
                ...new Set(
                  resultat.listesPerdues.map(
                    (w) => widgetDeTableau(w.type)?.label,
                  ),
                ),
              ]
                .filter(Boolean)
                .join(", ")}
              ) disparaîtr{resultat.listesPerdues.length > 1 ? "ont" : "a"} :
              les éléments qu'
              {resultat.listesPerdues.length > 1
                ? "elles montrent"
                : "elle montre"}{" "}
              seront supprimés s'ils ne paraissent dans aucune autre structure
              de ce tableau. Cette action est irréversible.
            </Text>
          </Alert>
        )}
      </Stack>
      {/* Le même écart avant les boutons que dans les autres fenêtres. */}
      <Group justify="flex-end" mt={MODAL_PADDING}>
        <BoutonFermer onClick={onClose}>Annuler</BoutonFermer>
        <Button
          color={resultat?.listesPerdues.length ? RED : "teal"}
          onClick={() => void importer()}
          disabled={!resultat}
          loading={envoi}
        >
          Importer
        </Button>
      </Group>
    </>
  );
}
