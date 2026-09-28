import { Button, Drawer, Group, Input, Stack, Switch, Tabs, TextInput } from "@mantine/core";
import { IconSettings, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { RED } from "../../themes/colors";
import { tabStyle } from "../../themes/tabs";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import ErrorAlert from "../ui/ErrorAlert";
import { messageErreur } from "../../lib/errors";
import type { AccessCategory } from "@milo/shared";

// Une catégorie du mode Accès porte son nom et « Privé » : fermée, elle ne se
// montre plus qu'à son auteur. Le tiroir reprend celui des tableaux, en plus
// court — une catégorie ne porte encore rien d'autre.
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
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setName(category ? category.name : "");
    setPrive(category ? category.is_private !== 0 : false);
    setError(null);
  }, [opened, category]);

  // Le tiroir n'a ni « Fermer » ni « Enregistrer » : on le referme en cliquant
  // au dehors, et c'est à ce moment que la catégorie part au serveur. Une
  // catégorie qu'on n'a pas nommée n'est pas créée : refermer sans rien saisir
  // ne laisse rien derrière soi. Si le serveur refuse, le tiroir reste ouvert
  // avec le message plutôt que d'emporter la saisie.
  const fermer = async () => {
    const nom = name.trim();
    if (!nom) return onClose();
    setError(null);
    try {
      const enregistree = category
        ? await api.updateAccessCategory(category.id, { name: nom, is_private: prive })
        : await api.createAccessCategory({ name: nom, is_private: prive });
      await onSaved(enregistree);
    } catch (e) {
      setError(messageErreur(e));
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
              <TextInput
                label="Nom de la catégorie"
                placeholder="Nom de la catégorie"
                value={name}
                onChange={(e) => {
                  const { value } = e.currentTarget;
                  setName(value);
                }}
                onKeyDown={(e) => {
                  // Entrée vaut « j'ai fini » : elle referme, donc elle enregistre.
                  if (e.key === "Enter") fermer();
                }}
                required
                autoFocus
              />

              {/* Privée : la catégorie sort de la vue des autres, avec ce
                  qu'elle contiendra. */}
              <Input.Wrapper label="Options">
                <Stack gap="sm" mt={8}>
                  <Switch
                    label="Privé"
                    description="La catégorie n'est visible que par vous."
                    checked={prive}
                    onChange={(e) => setPrive(e.currentTarget.checked)}
                    color="teal"
                  />
                </Stack>
              </Input.Wrapper>
            </Stack>
          </Tabs.Panel>
        </Tabs>

        {/* Ne reste en bas que la suppression : le reste s'enregistre en
            refermant. */}
        {category && (
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
