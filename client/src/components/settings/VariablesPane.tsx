import { Accordion, Box, ScrollArea, Table, Title, UnstyledButton } from "@mantine/core";
import { useState } from "react";
import classes from "../../assets/styles/SupportReplyModal.module.css";
import { STRONG_TEXT } from "../../themes/colors";
import { FIELD_BG } from "../ui/RichText";
import { SCROLLBAR_SIZE } from "./MailPreview";

// The variables pane of the template windows — e-mail templates
// (MailTemplateModal), automatic replies and default contents
// (SupportReplyModal): one accordion per source, all closed, a row per
// variable — its label, then its chip. A click on a chip drops the variable
// into the template, where the cursor was: the click does not take the focus
// away from it.

/** A variable: what the row says, the chip shows, and the click inserts. */
export interface PaneVariable {
  group: string;
  label: string;
  token: string;
  inserted: string;
}

interface VariablesPaneProps {
  variables: PaneVariable[];
  onInsert: (text: string) => void;
  canEdit: boolean;
  /** Changes on each opening: the accordions close again. */
  opened: unknown;
}

// The variables' padding inside their frame, on each side.
const FRAME_INSET = 20;

// As in an asset's form: the air under the title of an expanded source, and
// under the source before the next one's title.
const SPACE_BELOW_TITLE = 10;
const SPACE_BELOW_SECTION = 30;
const SPACE_ABOVE_SECTION = 30;

// The label column, the same in each accordion: the variables line up from
// one group to the next.
const LABEL_WIDTH = 120;

export default function VariablesPane({ variables, onInsert, canEdit, opened }: VariablesPaneProps) {
  // The sources in the order the variables come.
  const groups = [...new Set(variables.map((v) => v.group))];
  const [openItems, setOpenedItems] = useState<string[]>([]);
  // Closed again at each opening — adjusted during the render that sees it.
  const [seen, setSeen] = useState(opened);
  if (opened !== seen) {
    setSeen(opened);
    setOpenedItems([]);
  }

  return (
    // The editor's background, over the pane's full height; the variables
    // scroll beyond it.
    <Box h="100%" style={{ position: "relative", backgroundColor: FIELD_BG, overflow: "hidden" }}>
      {/* The padding lives in the scrolling area, not on its frame: placed on
          the frame, it added to a 100% high area, which overflowed by that
          much at the bottom. */}
      {/* Down only: a pane narrower than its chips clips them, rather than
          showing a horizontal bar along its bottom. */}
      <ScrollArea pos="absolute" inset={0} type="auto" scrollbars="y" scrollbarSize={SCROLLBAR_SIZE}>
        <Box p={FRAME_INSET}>
          <Accordion
            multiple
            value={openItems}
            onChange={setOpenedItems}
            chevronPosition="right"
            classNames={{ item: classes.section, control: classes.control }}
            styles={{
              item: { border: "none" },
              control: { paddingInline: 0 },
              label: { paddingBlock: 0 },
              content: { paddingInline: 0, paddingTop: SPACE_BELOW_TITLE, paddingBottom: 0 },
            }}
          >
            {groups.map((group, rank) => {
              const open = openItems.includes(group);
              return (
                <Accordion.Item
                  key={group}
                  value={group}
                  // An open source stands apart from the one before as from
                  // the one after; the first stays against the pane's top.
                  mt={open && rank > 0 ? SPACE_ABOVE_SECTION : 0}
                  mb={open ? SPACE_BELOW_SECTION : 0}
                >
                  <Accordion.Control>
                    <Title
                      order={3}
                      size={open ? 18 : "sm"}
                      c={open ? STRONG_TEXT : "dimmed"}
                      fw={open ? undefined : 400}
                    >
                      {group}
                    </Title>
                  </Accordion.Control>
                  <Accordion.Panel>
                    {/* Fixed widths: without them, each table distributes the
                        remaining space its own way, and a group's variables do
                        not line up with those of the next. */}
                    <Table verticalSpacing={1} fz="sm" layout="fixed" withRowBorders={false}>
                      <Table.Tbody>
                        {variables
                          .filter((v) => v.group === group)
                          .map((v) => (
                            <Table.Tr key={v.token}>
                              <Table.Td pl={0} w={LABEL_WIDTH} style={{ whiteSpace: "nowrap", border: 0 }}>
                                {v.label}
                              </Table.Td>
                              <Table.Td style={{ border: 0 }}>
                                <UnstyledButton
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => onInsert(v.inserted)}
                                  disabled={!canEdit}
                                  className={classes.variable}
                                  aria-label={`Insérer ${group.toLowerCase()} : ${v.label.toLowerCase()}`}
                                >
                                  {v.token}
                                </UnstyledButton>
                              </Table.Td>
                            </Table.Tr>
                          ))}
                      </Table.Tbody>
                    </Table>
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion>
        </Box>
      </ScrollArea>
    </Box>
  );
}
