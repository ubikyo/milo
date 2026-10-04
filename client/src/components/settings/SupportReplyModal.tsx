import {
  Accordion,
  Box,
  Button,
  Group,
  Input,
  Modal,
  ScrollArea,
  Stack,
  Table,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { errorMessage, notifyError } from "../../lib/errors";
import classes from "../../assets/styles/SupportReplyModal.module.css";
import { STRONG_TEXT } from "../../themes/colors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import CloseButton from "../ui/CloseButton";
import RichTextField, { FIELD_BG, useRichEditor } from "../ui/RichText";
import { SUPPORT_REPLY_VARIABLES, SUPPORT_VARIABLE_GROUPS } from "@milo/shared";
import type { SupportVariableGroup } from "@milo/shared";

interface SupportReplyModalProps {
  /**
   * Ce dont on règle le modèle — une réponse par défaut, un contenu par
   * défaut ; « null » ferme la fenêtre.
   */
  reply: { name: string; html: string } | null;
  onClose: () => void;
  onSave: (template: { html: string }) => Promise<unknown>;
  canEdit: boolean;
  /** Les provenances de variables proposées : toutes, par défaut. */
  groups?: readonly SupportVariableGroup[];
}

// Les lignes que montre l'éditeur, qu'il soit vide ou plein : un modèle se
// relit en entier plus souvent qu'un commentaire.
const ROWS = 20;

// L'éditeur et, à sa droite, les variables : de quoi loger sa barre d'outils
// sur une ligne, et chaque variable — libellé et clé — sur la sienne.
const WINDOW_WIDTH = 1180;
const VARIABLES_WIDTH = 450;

// L'écart entre le message et les variables.
const COLUMNS_GAP = 30;

// Le retrait des variables dans leur cadre, de chaque côté.
const FRAME_INSET = 20;

// Comme dans la fiche d'un poste : l'air sous le titre d'une provenance
// dépliée, et sous la provenance avant le titre de la suivante.
const SPACE_BELOW_TITLE = 10;
const SPACE_BELOW_SECTION = 30;

// La colonne des libellés, la même dans chaque accordéon : les variables s'y
// alignent d'un groupe à l'autre. De quoi lire « Téléphone professionnel ».
const LABEL_WIDTH = 175;

/**
 * Le modèle d'une réponse ou d'un contenu par défaut, ouvert depuis le menu
 * de sa ligne (« Modèle ») : du HTML, saisi dans l'éditeur de l'application.
 * L'évènement qui s'en sert se choisit sur sa ligne.
 *
 * Un modèle cite des variables : « {{demande.numero}} » devient « HLP-12 »
 * dans le message. Le tableau à droite les liste par provenance — qui écrit,
 * l'expéditeur, la demande — et défile dans la hauteur de l'éditeur ; un clic
 * sur l'une d'elles la glisse dans le modèle, là où était le curseur.
 */
export default function SupportReplyModal({
  reply,
  onClose,
  onSave,
  canEdit,
  groups = SUPPORT_VARIABLE_GROUPS,
}: SupportReplyModalProps) {
  // Dans l'ordre du Paramétrage, quel que soit celui qu'on reçoit.
  const displayedGroups = SUPPORT_VARIABLE_GROUPS.filter((g) =>
    groups.includes(g),
  );
  const editor = useRichEditor({ placeholder: "Le modèle de la réponse" });
  const [saving, setSaving] = useState(false);
  // Les provenances dépliées : aucune à l'ouverture.
  const [openItems, setOpenedItems] = useState<string[]>([]);

  // Chaque ouverture repart du modèle enregistré.
  useEffect(() => {
    if (!reply) return;
    editor?.commands.setContent(reply.html || "");
    setOpenedItems([]);
  }, [reply, editor]);

  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [editor, canEdit]);

  const insert = (key: string) =>
    editor?.chain().focus().insertContent(`{{${key}}}`).run();

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ html: editor?.getHTML() ?? "" });
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={reply !== null}
      onClose={onClose}
      title={reply ? `Modèle — ${reply.name}` : "Modèle"}
      centered
      size={WINDOW_WIDTH}
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      <Stack gap="md">

        {/* Les variables ne pèsent pas sur la hauteur : posées en absolu dans
            leur colonne, elles prennent celle de l'éditeur et défilent
            au-delà. Une provenance par accordéon, tous fermés. */}
        <Group align="stretch" gap={COLUMNS_GAP} wrap="nowrap">
          <Box style={{ flex: 1, minWidth: 0 }}>
            <RichTextField
              editor={editor}
              label="Message"
              minLines={ROWS}
              maxLines={ROWS}
            />
          </Box>

          <Stack w={VARIABLES_WIDTH} gap={4} style={{ flexShrink: 0 }}>
            <Input.Label>Variables</Input.Label>
            {/* Le fond de l'éditeur, sur toute sa hauteur, sans son filet. */}
            <Box
              style={{
                flex: 1,
                position: "relative",
                borderRadius: "var(--mantine-radius-default)",
                backgroundColor: FIELD_BG,
                overflow: "hidden",
              }}
            >
              {/* Le retrait vit dans la zone qui défile, pas sur son cadre :
                  posé sur le cadre, il s'ajoutait à une zone haute de 100 %,
                  qui débordait d'autant en bas. */}
              <ScrollArea
                pos="absolute"
                inset={0}
                type="auto"
                scrollbarSize={4}
              >
                <Box p={FRAME_INSET}>
                  {/* Comme les sections de la fiche d'un poste (AssetDrawer) :
                    sans filet ni survol, le titre gris tant que la section
                    est repliée, et une section ouverte s'écarte de la
                    suivante. */}
                  <Accordion
                    multiple
                    value={openItems}
                    onChange={setOpenedItems}
                    chevronPosition="right"
                    classNames={{
                      item: classes.section,
                      control: classes.controle,
                    }}
                    styles={{
                      item: { border: "none" },
                      control: { paddingInline: 0 },
                      label: { paddingBlock: 0 },
                      content: {
                        paddingInline: 0,
                        paddingTop: SPACE_BELOW_TITLE,
                        paddingBottom: 0,
                      },
                    }}
                  >
                    {displayedGroups.map((group) => (
                      <Accordion.Item
                        key={group}
                        value={group}
                        mb={openItems.includes(group) ? SPACE_BELOW_SECTION : 0}
                      >
                        <Accordion.Control>
                          <Title
                            order={3}
                            size={openItems.includes(group) ? 18 : "sm"}
                            c={
                              openItems.includes(group) ? STRONG_TEXT : "dimmed"
                            }
                            fw={openItems.includes(group) ? undefined : 400}
                          >
                            {group}
                          </Title>
                        </Accordion.Control>
                        <Accordion.Panel>
                          <Table
                            verticalSpacing={1}
                            fz="sm"
                            // Largeurs fixes : sans elles, chaque tableau
                            // répartit la place qui reste à sa façon, et les
                            // variables d'un groupe ne tombent pas sous celles
                            // du suivant.
                            layout="fixed"
                          >
                            <Table.Tbody>
                              {SUPPORT_REPLY_VARIABLES.filter(
                                (v) => v.group === group,
                              ).map((v) => (
                                <Table.Tr key={v.key}>
                                  <Table.Td
                                    pl={0}
                                    w={LABEL_WIDTH}
                                    style={{ whiteSpace: "nowrap", border: 0 }}
                                  >
                                    {v.label}
                                  </Table.Td>
                                  <Table.Td style={{ border: 0 }}>
                                    <UnstyledButton
                                      // Le clic ne retire pas le focus de
                                      // l'éditeur : la variable se pose là où
                                      // était le curseur.
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => insert(v.key)}
                                      disabled={!canEdit}
                                      className={classes.variable}
                                      aria-label={`Insérer ${group.toLowerCase()} : ${v.label.toLowerCase()}`}
                                    >
                                      {`{{${v.key}}}`}
                                    </UnstyledButton>
                                  </Table.Td>
                                </Table.Tr>
                              ))}
                            </Table.Tbody>
                          </Table>
                        </Accordion.Panel>
                      </Accordion.Item>
                    ))}
                  </Accordion>
                </Box>
              </ScrollArea>
            </Box>
          </Stack>
        </Group>

        <Group justify="flex-end" mt={MODAL_PADDING - 16}>
          <CloseButton onClick={onClose} />
          {canEdit && (
            <Button color="teal" onClick={save} loading={saving}>
              Enregistrer
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
