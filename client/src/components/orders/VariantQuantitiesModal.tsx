import { Box, Button, Group, Modal, NumberInput, ScrollArea, Table, Text } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { ORDER_LINES_MAX, ORDER_QUANTITY_MAX } from "@milo/shared";
import type { ProductVariant, ProductVariantValue } from "@milo/shared";
import { themeWindow } from "../../lib/themeWindow";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import CloseButton from "../ui/CloseButton";
import Footer from "../ui/Footer";

// The quantities of a product with variants, crossed: its last attribute in
// columns — "M", "L", "XL" —, the combinations of the others in rows —
// "Noir", "Rouge" —; a single attribute, its values in rows. Each quantity
// given becomes a line of the order (OrderDrawer). A line under the columns'
// values and one beside the rows' set them apart; no other border. The totals,
// in bold, by row on the right — with several columns — and by column below.

const CELL_WIDTH = 64;
/** An "xs" field's height — Mantine's —, and its text's inset. */
const CELL_HEIGHT = 30;
const CELL_INSET = 10;

/** A variant's key: its values, joined. */
export const variantKey = (variant: string[]): string => variant.join("\u0000");

/** The combinations of these attributes' values, the first varying slowest. */
const combinations = (variants: ProductVariant[]): ProductVariantValue[][] =>
  variants.reduce<ProductVariantValue[][]>(
    (rows, v) => rows.flatMap((row) => v.values.map((value) => [...row, value])),
    [[]],
  );

const LINE = "1px solid var(--mantine-color-default-border)";
/** Under the columns' values. */
const UNDER = { borderBottom: LINE };
/** Beside the rows' values, 10 px on each side of it. */
const BESIDE = { borderRight: LINE, paddingRight: 10 };
/** The cells take 5 px on each side: 10 px between two of them. */
const SPACING = 5;
/** Under the line under the columns' values: the first row. */
const BELOW = 10;
/** Right of the line beside the rows' values: the first column. */
const AFTER = 10;


const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 1000) / 1000;

/** A total: a cell as the fields' — their size, their inset —, on the themes' gray for totals — a header row's on light, darker than the fields on dark —; empty at zero. */
function Total({ value }: { value: number }) {
  return (
    <Text
      size="xs"
      fw={700}
      ta="right"
      w={CELL_WIDTH}
      h={CELL_HEIGHT}
      lh={`${CELL_HEIGHT}px`}
      ml="auto"
      px={CELL_INSET}
      truncate
      style={{ backgroundColor: "var(--milo-total-bg)", borderRadius: "var(--mantine-radius-default)" }}
    >
      {value ? value.toLocaleString("fr-FR") : ""}
    </Text>
  );
}

/** A value's name, with its color as a label's. */
function ValueName({ value }: { value: ProductVariantValue }) {
  return (
    <Group gap={6} wrap="nowrap" style={{ display: "inline-flex" }}>
      {value.color && (
        <Box w={10} h={10} style={{ borderRadius: "50%", backgroundColor: value.color, flexShrink: 0 }} />
      )}
      <Text size="sm" span>
        {value.name}
      </Text>
    </Group>
  );
}

interface VariantQuantitiesModalProps {
  opened: boolean;
  onClose: () => void;
  productName: string;
  variants: ProductVariant[];
  /** The quantities already ordered, by variant (variantKey). */
  initial: Map<string, number>;
  /** The variants given a quantity, in the grid's order. */
  onConfirm: (lines: { variant: string[]; quantity: number }[]) => void;
}

export default function VariantQuantitiesModal({
  opened,
  onClose,
  productName,
  variants,
  initial,
  onConfirm,
}: VariantQuantitiesModalProps) {
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (opened) setQuantities(new Map(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  // A single attribute: its values in rows, one column. Otherwise, the last in columns.
  const { rows, columns } = useMemo(() => {
    const single = variants.length <= 1;
    return {
      rows: combinations(single ? variants : variants.slice(0, -1)),
      columns: single ? [null] : variants.at(-1)!.values,
    };
  }, [variants]);
  const tooMany = rows.length * columns.length > ORDER_LINES_MAX;

  const variantOf = (row: ProductVariantValue[], column: ProductVariantValue | null) =>
    [...row, ...(column ? [column] : [])].map((v) => v.name);
  const quantityOf = (row: ProductVariantValue[], column: ProductVariantValue | null) =>
    quantities.get(variantKey(variantOf(row, column))) ?? 0;

  const setQuantity = (row: ProductVariantValue[], column: ProductVariantValue | null, value: number) =>
    setQuantities((q) => {
      const next = new Map(q);
      const key = variantKey(variantOf(row, column));
      if (value > 0) next.set(key, value);
      else next.delete(key);
      return next;
    });

  const confirm = () => {
    const lines = rows.flatMap((row) =>
      columns
        .map((column) => ({ variant: variantOf(row, column), quantity: quantityOf(row, column) }))
        .filter((l) => l.quantity > 0),
    );
    onConfirm(lines);
  };

  // With several columns, a total by row on the right: it is then the last column.
  const rowTotals = columns.length > 1;
  const isLast = (c: number) => !rowTotals && c === columns.length - 1;
  const rowTotal = (row: ProductVariantValue[]) => sum(columns.map((column) => quantityOf(row, column)));
  const columnTotal = (column: ProductVariantValue | null) => sum(rows.map((row) => quantityOf(row, column)));

  const rowLabel = variants.length <= 1 ? variants[0]?.attribute ?? "" : variants.slice(0, -1).map((v) => v.attribute).join(" / ");

  return (
    <Modal
      attributes={themeWindow("order-variants")}
      opened={opened}
      onClose={onClose}
      title={productName}
      centered
      size="auto"
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      {tooMany ? (
        <Text size="sm">
          Ses variantes font plus de {ORDER_LINES_MAX} combinaisons : une commande ne peut pas toutes les
          tenir.
        </Text>
      ) : (
        <ScrollArea.Autosize mah="60vh" type="auto" offsetScrollbars>
          <Table withRowBorders={false} verticalSpacing={SPACING} horizontalSpacing={SPACING}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ ...UNDER, ...BESIDE }}>{rowLabel}</Table.Th>
                {columns.map((column, c) => (
                  <Table.Th
                    key={c}
                    ta="right"
                    style={{
                      ...UNDER,
                      ...(c === 0 && { paddingLeft: AFTER }),
                      ...(isLast(c) && { paddingRight: 0 }),
                    }}
                  >
                    {column ? <ValueName value={column} /> : "Quantité"}
                  </Table.Th>
                ))}
                {rowTotals && (
                  <Table.Th ta="right" style={{ ...UNDER, paddingRight: 0 }}>
                    Total
                  </Table.Th>
                )}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row, r) => (
                <Table.Tr key={r}>
                  <Table.Td style={{ ...BESIDE, ...(r === 0 && { paddingTop: BELOW }) }}>
                    <Group gap="xs" wrap="nowrap">
                      {row.map((value, i) => (
                        <ValueName key={i} value={value} />
                      ))}
                    </Group>
                  </Table.Td>
                  {columns.map((column, c) => (
                    <Table.Td
                      key={c}
                      style={{
                        ...(r === 0 && { paddingTop: BELOW }),
                        ...(c === 0 && { paddingLeft: AFTER }),
                        // The last column ends at the window's inset.
                        ...(isLast(c) && { paddingRight: 0 }),
                      }}
                    >
                      <NumberInput
                        size="xs"
                        hideControls
                        aria-label={variantOf(row, column).join(" / ")}
                        value={quantityOf(row, column) || ""}
                        onChange={(v) => setQuantity(row, column, v === "" ? 0 : Number(v))}
                        min={0}
                        max={ORDER_QUANTITY_MAX}
                        decimalScale={3}
                        decimalSeparator=","
                        autoFocus={r === 0 && c === 0}
                        w={CELL_WIDTH}
                        ml="auto"
                        styles={{ input: { textAlign: "right" } }}
                      />
                    </Table.Td>
                  ))}
                  {rowTotals && (
                    <Table.Td style={{ paddingRight: 0, ...(r === 0 && { paddingTop: BELOW }) }}>
                      <Total value={rowTotal(row)} />
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Th ta="right" style={{ paddingRight: 10 }}>
                  Total
                </Table.Th>
                {columns.map((column, c) => (
                  <Table.Th
                    key={c}
                    style={{
                      ...(c === 0 && { paddingLeft: AFTER }),
                      ...(isLast(c) && { paddingRight: 0 }),
                    }}
                  >
                    <Total value={columnTotal(column)} />
                  </Table.Th>
                ))}
                {rowTotals && (
                  <Table.Th style={{ paddingRight: 0 }}>
                    <Total value={sum(rows.map(rowTotal))} />
                  </Table.Th>
                )}
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </ScrollArea.Autosize>
      )}
      <Footer>
        <CloseButton onClick={onClose} />
        {!tooMany && (
          <Button color="teal" onClick={confirm}>
            Valider
          </Button>
        )}
      </Footer>
    </Modal>
  );
}
