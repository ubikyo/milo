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
   * What the template is being set for — a default reply, a default
   * content; "null" closes the modal.
   */
  reply: { name: string; html: string } | null;
  onClose: () => void;
  onSave: (template: { html: string }) => Promise<unknown>;
  canEdit: boolean;
  /** The variable sources offered: all, by default. */
  groups?: readonly SupportVariableGroup[];
}

// The lines the editor shows, whether empty or full: a template is
// re-read in full more often than a comment.
const ROWS = 20;

// The editor and, to its right, the variables: enough room for its toolbar
// on one line, and each variable — label and key — on its own.
const WINDOW_WIDTH = 1180;
const VARIABLES_WIDTH = 450;

// The gap between the message and the variables.
const COLUMNS_GAP = 30;

// The variables' padding inside their frame, on each side.
const FRAME_INSET = 20;

// As in an asset's form: the air under the title of an expanded
// source, and under the source before the next one's title.
const SPACE_BELOW_TITLE = 10;
const SPACE_BELOW_SECTION = 30;

// The label column, the same in each accordion: the variables line up
// from one group to the next. Wide enough to read "Téléphone professionnel".
const LABEL_WIDTH = 175;

/**
 * The template of a default reply or content, opened from its row's
 * menu ("Modèle"): HTML, entered in the application's editor.
 * The event that uses it is chosen on its row.
 *
 * A template cites variables: "{{demande.numero}}" becomes "HLP-12"
 * in the message. The table on the right lists them by source — who writes,
 * the sender, the request — and scrolls within the editor's height; a click
 * on one drops it into the template, where the cursor was.
 */
export default function SupportReplyModal({
  reply,
  onClose,
  onSave,
  canEdit,
  groups = SUPPORT_VARIABLE_GROUPS,
}: SupportReplyModalProps) {
  // In Settings order, whatever the order received.
  const displayedGroups = SUPPORT_VARIABLE_GROUPS.filter((g) =>
    groups.includes(g),
  );
  const editor = useRichEditor({ placeholder: "Le modèle de la réponse" });
  const [saving, setSaving] = useState(false);
  // The expanded sources: none on opening.
  const [openItems, setOpenedItems] = useState<string[]>([]);

  // Each opening starts again from the saved template.
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

        {/* The variables do not weigh on the height: absolutely positioned in
            their column, they take the editor's height and scroll
            beyond it. One source per accordion, all closed. */}
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
            {/* The editor's background, over its full height, without its border line. */}
            <Box
              style={{
                flex: 1,
                position: "relative",
                borderRadius: "var(--mantine-radius-default)",
                backgroundColor: FIELD_BG,
                overflow: "hidden",
              }}
            >
              {/* The padding lives in the scrolling area, not on its frame:
                  placed on the frame, it added to a 100% high area,
                  which overflowed by that much at the bottom. */}
              <ScrollArea
                pos="absolute"
                inset={0}
                type="auto"
                scrollbarSize={4}
              >
                <Box p={FRAME_INSET}>
                  {/* As the sections of an asset's form (AssetDrawer):
                    no border or hover, the title gray while the section
                    is collapsed, and an open section is spaced from the
                    next. */}
                  <Accordion
                    multiple
                    value={openItems}
                    onChange={setOpenedItems}
                    chevronPosition="right"
                    classNames={{
                      item: classes.section,
                      control: classes.control,
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
                            // Fixed widths: without them, each table
                            // distributes the remaining space its own way, and a
                            // group's variables do not line up with those
                            // of the next.
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
                                      // The click does not take focus away from
                                      // the editor: the variable is dropped where
                                      // the cursor was.
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
