import { Drawer, Input, Stack, Switch, Tabs, TextInput } from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { tabStyle } from "../../themes/tabs";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import DrawerFooter from "../ui/DrawerFooter";
import ErrorAlert from "../ui/ErrorAlert";
import { messageErreur } from "../../lib/errors";
import type { AccessCategory } from "@milo/shared";

// Une catégorie du mode Accès porte son nom, « Privé » — fermée, elle ne se
// montre plus qu'à son auteur — et l'air qu'elle laisse entre ses colonnes. Le
// tiroir reprend celui des tableaux, en plus court.
//
// À la différence d'un tableau, « Privé » se règle dès la création : une
// catégorie qu'on ouvre fermée ne passe jamais par un moment où tout le monde
// la voit.
interface AccessCategoryDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** « null » à la création, la catégorie visée sinon. */
  category: AccessCategory | null;
  onSaved: (category: AccessCategory) => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
}

export default function AccessCategoryDrawer({
  opened,
  onClose,
  category,
  onSaved,
  onDeleted,
}: AccessCategoryDrawerProps) {
  const [name, setName] = useState("");
  const [prive, setPrive] = useState(false);
  // Verrouillée, la catégorie se lit mais ce qu'elle porte ne bouge plus.
  const [verrouille, setVerrouille] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setName(category ? category.name : "");
    setPrive(category ? category.is_private !== 0 : false);
    setVerrouille(category ? category.is_locked !== 0 : false);
    setError(null);
    setSaving(false);
  }, [opened, category]);

  // « Sauvegarder » : le seul geste qui écrit. Une catégorie sans nom n'est
  // pas enregistrée — le message le dit plutôt que de créer une ligne vide. Si
  // le serveur refuse, le tiroir reste ouvert avec le message : la saisie
  // n'est jamais perdue.
  const sauvegarder = async () => {
    const nom = name.trim();
    if (!nom) return setError("Le nom de la catégorie est requis");
    setError(null);
    setSaving(true);
    try {
      const enregistree = category
        ? await api.updateAccessCategory(category.id, {
            name: nom,
            is_private: prive,
            is_locked: verrouille,
          })
        : await api.createAccessCategory({
            name: nom,
            is_private: prive,
            is_locked: verrouille,
          });
      await onSaved(enregistree);
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmDeleteOpened(false);
    if (!category) return;
    try {
      await api.deleteAccessCategory(category.id);
      await onDeleted();
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
              <TextInput
                label="Nom de la catégorie"
                placeholder="Nom de la catégorie"
                value={name}
                onChange={(e) => {
                  const { value } = e.currentTarget;
                  setName(value);
                }}
                required
                autoFocus
              />

              {/* Privée : la catégorie sort de la vue des autres, avec ce
                  qu'elle contiendra. */}
              <Input.Wrapper label="Options">
                <Stack gap="sm">
                  <Switch
                    label="Privé"
                    checked={prive}
                    onChange={(e) => setPrive(e.currentTarget.checked)}
                    color="teal"
                  />
                  {/* Le verrou ne ferme pas la catégorie aux autres : il fige
                      ce qu'elle porte. On la lit, on ne la remanie plus. */}
                  <Switch
                    label="Verrouiller"
                    checked={verrouille}
                    onChange={(e) => setVerrouille(e.currentTarget.checked)}
                    color="teal"
                  />
                </Stack>
              </Input.Wrapper>
            </Stack>
          </Tabs.Panel>
        </Tabs>

        <DrawerFooter
          onSave={sauvegarder}
          onClose={onClose}
          onDelete={category ? () => setConfirmDeleteOpened(true) : undefined}
          saving={saving}
        />
      </Drawer>

      <DeleteConfirmModal
        opened={confirmDeleteOpened}
        onClose={() => setConfirmDeleteOpened(false)}
        onConfirm={remove}
        title="Supprimer la catégorie"
        message={
          <>
            Voulez-vous vraiment supprimer « {category?.name} » ? Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
