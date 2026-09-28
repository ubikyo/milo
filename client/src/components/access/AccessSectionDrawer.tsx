import {
  Button,
  Drawer,
  Group,
  Input,
  NumberInput,
  SegmentedControl,
  Stack,
  Tabs,
} from "@mantine/core";
import { IconSettings, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { RED } from "../../themes/colors";
import { tabStyle } from "../../themes/tabs";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import ErrorAlert from "../ui/ErrorAlert";
import { messageErreur } from "../../lib/errors";
import type { AccessSection, SectionWidthUnit } from "@milo/shared";

// Une section est une colonne de la catégorie ouverte. Elle n'a pas de nom :
// sa largeur la définit entièrement — laissée à la rangée (« Automatique »),
// ou fixée en pour-cent de la largeur disponible, ou en pixels. Les deux
// dernières demandent un nombre, la première n'en veut pas : le champ
// n'apparaît donc qu'avec elles.
interface AccessSectionDrawerProps {
  opened: boolean;
  /**
   * « null » à la création, la section visée sinon. Le tiroir n'a pas de
   * « onClose » : sans nom à saisir, il n'y a plus de refermeture qui
   * n'enregistre rien — c'est « onSaved » qui le referme.
   */
  section: AccessSection | null;
  /** La catégorie qui accueille la section créée. */
  categoryId: string | null;
  onSaved: (section: AccessSection) => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
}

const UNITES = [
  { value: "auto", label: "Automatique" },
  { value: "percent", label: "%" },
  { value: "px", label: "px" },
];

export default function AccessSectionDrawer({
  opened,
  section,
  categoryId,
  onSaved,
  onDeleted,
}: AccessSectionDrawerProps) {
  const [unite, setUnite] = useState<SectionWidthUnit>("auto");
  // Vide tant que rien n'est saisi : « 0 » serait une largeur, pas une absence.
  const [valeur, setValeur] = useState<number | string>("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setUnite(section ? section.width_unit : "auto");
    setValeur(section?.width_value ?? "");
    setError(null);
  }, [opened, section]);

  // Le tiroir n'a ni « Fermer » ni « Enregistrer » : on le referme en cliquant
  // au dehors, et c'est à ce moment que la section part au serveur. Sans nom à
  // renseigner, il n'y a plus de saisie vide qui retienne la création : une
  // largeur suffit, et « Automatique » en est une. Si le serveur refuse — une
  // largeur manquante, un pour-cent au-dessus de 100 —, le tiroir reste ouvert
  // avec le message plutôt que d'emporter la saisie.
  const fermer = async () => {
    setError(null);

    const largeur = unite === "auto" ? null : Number(valeur);
    try {
      const enregistree = section
        ? await api.updateAccessSection(section.id, {
            width_unit: unite,
            width_value: largeur,
          })
        : await api.createAccessSection({
            category_id: Number(categoryId),
            width_unit: unite,
            width_value: largeur,
          });
      await onSaved(enregistree);
    } catch (e) {
      setError(messageErreur(e));
    }
  };

  const remove = async () => {
    setConfirmDeleteOpened(false);
    if (!section) return;
    try {
      await api.deleteAccessSection(section.id);
      await onDeleted();
    } catch (e) {
      setError(messageErreur(e));
    }
  };

  return (
    <>
      <Drawer
        opened={opened}
        onClose={fermer}
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
                <Stack gap="sm" mt={8}>
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
                      onKeyDown={(e) => {
                        if (e.key === "Enter") fermer();
                      }}
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

        {/* Ne reste en bas que la suppression : le reste s'enregistre en
            refermant. */}
        {section && (
          <Stack gap="sm" mt="auto" pt={40}>
            <Group wrap="nowrap">
              <Button
                color={RED}
                variant="subtle"
                leftSection={<IconTrash size={16} />}
                onClick={() => setConfirmDeleteOpened(true)}
              >
                Supprimer
              </Button>
            </Group>
          </Stack>
        )}
      </Drawer>

      <DeleteConfirmModal
        opened={confirmDeleteOpened}
        onClose={() => setConfirmDeleteOpened(false)}
        onConfirm={remove}
        title="Supprimer la section"
        message={
          <>
            Voulez-vous vraiment supprimer cette section ? Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
