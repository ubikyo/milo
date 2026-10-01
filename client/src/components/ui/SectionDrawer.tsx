import { Drawer, Input, NumberInput, SegmentedControl, Stack, Tabs } from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { tabStyle } from "../../themes/tabs";
import DeleteConfirmModal from "./DeleteConfirmModal";
import DrawerFooter from "./DrawerFooter";
import ErrorAlert from "./ErrorAlert";
import { messageErreur } from "../../lib/errors";
import type { BoardSection } from "./SectionsBoard";
import type { SectionWidthUnit } from "@milo/shared";

// Le tiroir d'une section — une colonne du mode Accès ou d'un panneau des
// statistiques (SectionsBoard). Elle n'a pas de nom : sa largeur la définit
// entièrement — laissée à la rangée (« Automatique »), ou fixée en pour-cent
// de la largeur disponible, ou en pixels. Les deux dernières demandent un
// nombre, la première n'en veut pas : le champ n'apparaît donc qu'avec elles.
//
// Le tiroir ne sait pas où la section se range : « onSave » et « onDelete »
// écrivent, et leur refus s'affiche ici.

/** La largeur que le tiroir enregistre. */
export interface LargeurSection {
  width_unit: SectionWidthUnit;
  width_value: number | null;
}

interface SectionDrawerProps {
  opened: boolean;
  /** Referme sans rien écrire : c'est « Sauvegarder » qui enregistre. */
  onClose: () => void;
  /** « null » à la création, la section visée sinon. */
  section: BoardSection | null;
  /** Crée ou modifie la section ; le tiroir reste ouvert si l'écriture échoue. */
  onSave: (largeur: LargeurSection) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}

const UNITES = [
  { value: "auto", label: "Automatique" },
  { value: "percent", label: "%" },
  { value: "px", label: "px" },
];

export default function SectionDrawer({
  opened,
  onClose,
  section,
  onSave,
  onDelete,
}: SectionDrawerProps) {
  const [unite, setUnite] = useState<SectionWidthUnit>("auto");
  // Vide tant que rien n'est saisi : « 0 » serait une largeur, pas une absence.
  const [valeur, setValeur] = useState<number | string>("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setUnite(section ? section.width_unit : "auto");
    setValeur(section?.width_value ?? "");
    setError(null);
    setSaving(false);
  }, [opened, section]);

  // « Sauvegarder » : le seul geste qui écrit. Si le serveur refuse — une
  // largeur manquante, un pour-cent au-dessus de 100 —, le tiroir reste ouvert
  // avec le message plutôt que d'emporter la saisie.
  const sauvegarder = async () => {
    setError(null);
    setSaving(true);

    const largeur = unite === "auto" ? null : Number(valeur);
    try {
      await onSave({ width_unit: unite, width_value: largeur });
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmDeleteOpened(false);
    if (!section) return;
    try {
      await onDelete();
    } catch (e) {
      setError(messageErreur(e));
    }
  };

  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size={560}
        padding={40}
        withCloseButton={false}
        styles={{
          content: { display: "flex", flexDirection: "column" },
          body: {
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          },
        }}
      >
        {/* Un seul volet, mais la même rangée d'onglets que les autres
            tiroirs : le tiroir se présente pareil. */}
        <Tabs
          defaultValue="settings"
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
          styles={{ panel: { paddingTop: 20 } }}
        >
          <Tabs.List mb="md">
            <Tabs.Tab
              value="settings"
              leftSection={<IconSettings size={16} />}
              style={tabStyle(true)}
            >
              Paramètres
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="settings">
            {/* Le même air entre les champs que dans les autres tiroirs. */}
            <Stack gap="xl">
              {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}

              <Input.Wrapper label="Largeur">
                <Stack gap="sm">
                  <SegmentedControl
                    data={UNITES}
                    value={unite}
                    onChange={(value) => setUnite(value as SectionWidthUnit)}
                    color="teal"
                    fullWidth
                  />

                  {/* Le nombre n'a de sens qu'avec une unité qui en demande
                      un : automatique, la colonne se règle sur la rangée. */}
                  {unite !== "auto" && (
                    <NumberInput
                      aria-label={unite === "percent" ? "Largeur en %" : "Largeur en pixels"}
                      placeholder={unite === "percent" ? "50" : "300"}
                      value={valeur}
                      onChange={setValeur}
                      min={1}
                      autoFocus
                      max={unite === "percent" ? 100 : undefined}
                      suffix={unite === "percent" ? " %" : " px"}
                      allowNegative={false}
                      allowDecimal={false}
                    />
                  )}
                </Stack>
              </Input.Wrapper>
            </Stack>
          </Tabs.Panel>
        </Tabs>

        <DrawerFooter
          onSave={sauvegarder}
          onClose={onClose}
          onDelete={section ? () => setConfirmDeleteOpened(true) : undefined}
          saving={saving}
        />
      </Drawer>

      <DeleteConfirmModal
        opened={confirmDeleteOpened}
        onClose={() => setConfirmDeleteOpened(false)}
        onConfirm={remove}
        title="Supprimer la section"
        message={<>Voulez-vous vraiment supprimer cette section ? Cette action est irréversible.</>}
      />
    </>
  );
}
