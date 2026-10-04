import { Stack } from "@mantine/core";
import { categoryWidget } from "./common/category";
import { clockWidget } from "./common/clock";
import { linkWidget } from "./common/link";
import { marginsOf } from "./margins";
import { numberWidget } from "./common/number";
import { subcategoryWidget } from "./common/subcategory";
import type { IndicatorConfigProps } from "./support/types";
import type { AccessWidget, Margins } from "./types";
import type { ComponentType } from "react";
import type { AccessBlockType } from "@milo/shared";

// Access mode widgets, ready to be placed in the sections of the other
// modes — Support, Assets, Project, Task: the titles, the link, the attributes
// and the clock. They are the same ones: same display, same fields, and the
// space they leave between them. Only what the section passes them changes —
// neither an access element, nor a drawer to open by themselves: theirs opens
// on right click, without the adjustable margins, which belong only to the
// Access mode.

/** What the sections of the other modes pass to an access widget. */
export interface AccessDisplay {
  config: unknown;
  onChange?: (config: Record<string, unknown>) => void | Promise<void>;
  locked?: boolean;
}

/** An Access mode widget, as a widget of another mode's sections. */
export interface SectionWidget<Type extends string, P extends AccessDisplay> {
  type: Type;
  kind: AccessWidget["kind"];
  label: string;
  icon: AccessWidget["icon"];
  defaultConfig: Record<string, unknown>;
  /** "P": what the mode's section passes to its widgets; the widget reads only its part. */
  Display: ComponentType<P>;
  Config: ComponentType<IndicatorConfigProps>;
  /**
   * Always true: each one is placed without the indicators card. The link
   * keeps its click, the titles their double-click, and the attributes and
   * the clock already have their inset.
   */
  ownClicks: true;
  inlineEdit?: true;
  margins: (config: unknown, previousType: string | null, nextType: string | null) => Margins;
  hidden?: (config: unknown, locked: boolean) => boolean;
}

/** The access drawer's fields, the bottom ones included: a link's switch. */
const fieldsOf = (widget: AccessWidget): ComponentType<IndicatorConfigProps> => {
  const { Config, ConfigEnd } = widget;
  if (!ConfigEnd) return Config;
  return function Fields(props: IndicatorConfigProps) {
    return (
      <Stack gap="xl">
        <Config {...props} />
        <ConfigEnd {...props} />
      </Stack>
    );
  };
};

const inSection = <Type extends string, P extends AccessDisplay>(
  widget: AccessWidget,
): SectionWidget<Type, P> => ({
  type: widget.type as Type,
  kind: widget.kind,
  label: widget.label,
  icon: widget.icon,
  defaultConfig: widget.defaultConfig,
  Config: fieldsOf(widget),
  ownClicks: true,
  ...(widget.inlineEdit ? { inlineEdit: true as const } : {}),
  // The types of the other modes are not those of access, but the titles
  // and the attributes bear the same name there: the spacing is decided alike.
  margins: (config, previousType, nextType) =>
    marginsOf(widget, config, {
      previousType: previousType as AccessBlockType | null,
      nextType: nextType as AccessBlockType | null,
    }),
  ...(widget.hidden ? { hidden: widget.hidden } : {}),
  Display: ({ config, onChange, locked = false }: P) => (
    <widget.Display
      blockId={0}
      config={config}
      onChange={onChange ?? (() => {})}
      onEdit={() => {}}
      locked={locked}
    />
  ),
});

/** In the widget drawer's order: the titles, the link, the attributes, the clock. */
export const accessWidgets = <Type extends string, P extends AccessDisplay>(): SectionWidget<
  Type,
  P
>[] =>
  [categoryWidget, subcategoryWidget, linkWidget, numberWidget, clockWidget].map((w) =>
    inSection<Type, P>(w),
  );
