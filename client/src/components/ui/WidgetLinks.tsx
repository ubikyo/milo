// The "Widgets associés" field of a widget that reads others — an indicator,
// the Commandes widget's suppliers, products and warehouses — and the screen
// it opens: a board where the widget sits with its inputs on its left, the
// widgets one sees listed on the side, by view and board. A widget dragged
// onto the board shows its output on its right; a cable drawn from an output
// to an input associates them. The cables hang, swing and bounce: each is a
// rope (verlet) pinned to its two connectors.
//
// The screen edits a draft: "Enregistrer" hands the drawer the widgets
// associated with each input, and where each widget sits; the drawer's
// "Sauvegarder" writes them, as its other fields.

import { Badge, Button, Center, Group, Input, Loader, Modal, ScrollArea, Stack, Switch, Text, Title, UnstyledButton } from "@mantine/core";
import { IconApps, IconGripVertical, IconPlugConnected, IconX } from "@tabler/icons-react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { CSSProperties, DragEvent, PointerEvent as ReactPointerEvent } from "react";
import { sourcesOf } from "@milo/shared";
import type { Id, SourceWidget } from "@milo/shared";
import { TYPE_LABELS, useSourceWidgetsOf } from "../../lib/sources";
import { GREEN } from "../../themes/colors";
import classes from "../../assets/styles/WidgetLinks.module.css";
import inset from "../../assets/styles/AccessNumber.module.css";
import drawerStyles from "../../assets/styles/WidgetDrawer.module.css";
import windowClasses from "../../assets/styles/SettingsModal.module.css";
import { themeWindow } from "../../lib/themeWindow";
import { H2_GAP } from "../../widgets/common/h2";
import CloseButton from "./CloseButton";
import { DRAWER_PADDING } from "./DrawerScroll";
import { DrawerWidgetContext } from "../../lib/drawer-widget";
import type { DrawerWidget } from "../../lib/drawer-widget";

/** The space above a view's title, when others precede it: the widgets drawer's. */
const GROUPS_GAP = 40;


/** An input of the widget: the widgets of these types it reads, under "field". */
export interface WidgetLinkInput {
  field: string;
  label: string;
  types: string[];
  /** True when the widgets it reads must all be of one type: an indicator's. */
  sameType?: boolean;
}

/** The widgets associated with each input, by field. */
export type WidgetLinks = Record<string, string[]>;

/** Where the screen places each widget: the configuration keeps it. */
export const LINKS_LAYOUT = "links_layout";

type Point = { x: number; y: number };
interface Layout {
  self: Point;
  nodes: Record<string, Point>;
}

/** The side of a widget, in pixels; the grid's step, which it spans 4 times. */
const NODE = 100;
const GRID = 25;

const GRID_STORAGE = "milo:widget-links:grid";

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

const typeOf = (byKey: Map<string, SourceWidget>, key: string) => byKey.get(key)?.type;

/**
 * The widgets each input reads, as the configuration names them: those one
 * sees, of its types — of the type of the first, for an input of one type.
 * Before the widgets are read, the configuration's keys.
 */
const linksOf = (
  inputs: WidgetLinkInput[],
  config: unknown,
  byKey: Map<string, SourceWidget> | null,
): WidgetLinks =>
  Object.fromEntries(
    inputs.map((input) => {
      const keys = sourcesOf(config, input.field);
      if (!byKey) return [input.field, keys];
      const known = keys.filter((k) => input.types.includes(typeOf(byKey, k) ?? ""));
      const first = typeOf(byKey, known[0] ?? "");
      return [input.field, input.sameType ? known.filter((k) => typeOf(byKey, k) === first) : known];
    }),
  );

const layoutOf = (config: unknown): Partial<Layout> => {
  const raw = (config as Record<string, unknown> | null)?.[LINKS_LAYOUT] as
    | { self?: [number, number]; nodes?: Record<string, [number, number]> }
    | undefined;
  const point = (p: unknown): Point | undefined =>
    Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number" ? { x: p[0], y: p[1] } : undefined;
  const nodes: Record<string, Point> = {};
  for (const [key, p] of Object.entries(raw?.nodes ?? {})) {
    const at = point(p);
    if (at) nodes[key] = at;
  }
  return { self: point(raw?.self), nodes };
};

const savedLayout = (layout: Layout) => ({
  self: [layout.self.x, layout.self.y],
  nodes: Object.fromEntries(Object.entries(layout.nodes).map(([k, p]) => [k, [p.x, p.y]])),
});

// --- The field ---------------------------------------------------------------

/**
 * The drawer's field: a prompt to associate widgets, saying in green how many
 * are; a click opens the screen. "apply" writes the widgets associated into
 * the configuration, when it does more than name them under each field — an
 * indicator follows their kind.
 */
export function WidgetLinksField({
  inputs,
  config,
  onChange,
  apply,
  label = "Widgets associés",
}: {
  inputs: WidgetLinkInput[];
  config: unknown;
  onChange: (config: Record<string, unknown>) => void;
  apply?: (
    config: Record<string, unknown>,
    links: WidgetLinks,
    byKey: Map<string, SourceWidget>,
  ) => Record<string, unknown>;
  label?: string;
}) {
  const [opened, setOpened] = useState(false);
  const types = [...new Set(inputs.flatMap((i) => i.types))];
  const widgets = useSourceWidgetsOf(types);
  const byKey = useMemo(() => (widgets ? new Map(widgets.map((w) => [w.key, w])) : null), [widgets]);
  const links = linksOf(inputs, config, byKey);
  const count = new Set(Object.values(links).flat()).size;

  const save = (next: WidgetLinks, layout: Layout) => {
    const base = (config ?? {}) as Record<string, unknown>;
    const written = apply
      ? apply(base, next, byKey ?? new Map())
      : { ...base, ...Object.fromEntries(inputs.map((i) => [i.field, next[i.field] ?? []])) };
    onChange({ ...written, [LINKS_LAYOUT]: savedLayout(layout) });
    setOpened(false);
  };

  return (
    <>
      <Input.Wrapper label={label}>
        {/* Once associated, only how many, in green. */}
        <UnstyledButton
          className={classes.prompt}
          data-linked={count > 0 || undefined}
          style={{ "--milo-links-green": GREEN } as CSSProperties}
          onClick={() => setOpened(true)}
        >
          <IconPlugConnected size={28} stroke={1.5} />
          <Text size="sm" c={count > 0 ? "inherit" : "dimmed"} fw={count > 0 ? 600 : undefined}>
            {count > 0
              ? `${plural(count, "widget")} ${count > 1 ? "connectés" : "connecté"}`
              : "Associer un widget"}
          </Text>
        </UnstyledButton>
      </Input.Wrapper>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        fullScreen
        withCloseButton={false}
        padding={0}
        transitionProps={{ transition: "fade", duration: 150 }}
        // Against the screen's edges: none of the windows' padding.
        classNames={{ body: classes.modalBody }}
        styles={{ content: { display: "flex", flexDirection: "column" } }}
      >
        {/* Once the widgets are read: before, those associated would be lost. */}
        {opened && widgets === null && (
          <Center h="100%">
            <Loader color="teal" />
          </Center>
        )}
        {opened && widgets !== null && (
          <LinksBoard
            inputs={inputs}
            widgets={widgets}
            links={links}
            layout={layoutOf(config)}
            onClose={() => setOpened(false)}
            onSave={save}
          />
        )}
      </Modal>
    </>
  );
}

// --- The ropes ---------------------------------------------------------------

const POINTS = 18;
const GRAVITY = 0.5;
// Strongly damped, its speed capped: a cable moved a little settles at once
// instead of whipping about.
const DAMPING = 0.9;
const MAX_SPEED = 3;
const ITERATIONS = 14;
// 90 steps a second: the cables move half again as fast as at 60.
const STEP = 1000 / 90;

interface Rope {
  /** Steps left free of MAX_SPEED: those of a tap. */
  free?: number;
  x: Float64Array;
  y: Float64Array;
  px: Float64Array;
  py: Float64Array;
}

/** A rope stretched from a to b. */
const ropeOf = (a: Point, b: Point): Rope => {
  const x = new Float64Array(POINTS);
  const y = new Float64Array(POINTS);
  for (let i = 0; i < POINTS; i++) {
    const t = i / (POINTS - 1);
    x[i] = a.x + (b.x - a.x) * t;
    y[i] = a.y + (b.y - a.y) * t;
  }
  return { x, y, px: x.slice(), py: y.slice() };
};

/** The same rope, from its other end: a cable held by its other connector. */
const reversed = (r: Rope): Rope => ({
  x: r.x.slice().reverse(),
  y: r.y.slice().reverse(),
  px: r.px.slice().reverse(),
  py: r.py.slice().reverse(),
});

/** The rope's length between ends this far apart: always some slack, to hang. */
const lengthFor = (distance: number) => distance * 1.08 + 60;

/** One step: the rope falls, its ends held, its length kept. */
const stepRope = (r: Rope, a: Point, b: Point) => {
  const last = POINTS - 1;
  for (let i = 1; i < last; i++) {
    let vx = (r.x[i]! - r.px[i]!) * DAMPING;
    let vy = (r.y[i]! - r.py[i]!) * DAMPING;
    const speed = Math.hypot(vx, vy);
    if (!r.free && speed > MAX_SPEED) {
      vx *= MAX_SPEED / speed;
      vy *= MAX_SPEED / speed;
    }
    r.px[i] = r.x[i]!;
    r.py[i] = r.y[i]!;
    r.x[i] = r.x[i]! + vx;
    r.y[i] = r.y[i]! + vy + GRAVITY;
  }
  r.x[0] = r.px[0] = a.x;
  r.y[0] = r.py[0] = a.y;
  r.x[last] = r.px[last] = b.x;
  r.y[last] = r.py[last] = b.y;
  if (r.free) r.free--;
  const segment = lengthFor(Math.hypot(b.x - a.x, b.y - a.y)) / last;
  for (let k = 0; k < ITERATIONS; k++) {
    for (let i = 0; i < last; i++) {
      const dx = r.x[i + 1]! - r.x[i]!;
      const dy = r.y[i + 1]! - r.y[i]!;
      const d = Math.hypot(dx, dy);
      // A rope pulls, never pushes: only a stretched segment is corrected.
      if (d <= segment) continue;
      const over = (d - segment) / d;
      const first = i === 0 ? 0 : i + 1 === last ? 1 : 0.5;
      r.x[i] = r.x[i]! + dx * over * first;
      r.y[i] = r.y[i]! + dy * over * first;
      r.x[i + 1] = r.x[i + 1]! - dx * over * (1 - first);
      r.y[i + 1] = r.y[i + 1]! - dy * over * (1 - first);
    }
  }
};

/**
 * A tap on the board's right: each cable sets off to the left, faster in its
 * middle, then swings back — free of MAX_SPEED for as long.
 */
const tap = (r: Rope) => {
  const speed = 2 + Math.random() * 0.8;
  for (let i = 1; i < POINTS - 1; i++) {
    const bulge = Math.sin((Math.PI * i) / (POINTS - 1));
    r.px[i] = r.x[i]! + speed * bulge;
    r.py[i] = r.y[i]!;
  }
  r.free = 30;
};

/** The rope as a smooth path through its points. */
const pathOf = (r: Rope) => {
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(r.x[0]!)},${f(r.y[0]!)}`;
  for (let i = 1; i < POINTS - 1; i++) {
    const mx = (r.x[i]! + r.x[i + 1]!) / 2;
    const my = (r.y[i]! + r.y[i + 1]!) / 2;
    d += ` Q${f(r.x[i]!)},${f(r.y[i]!)} ${f(mx)},${f(my)}`;
  }
  return `${d} L${f(r.x[POINTS - 1]!)},${f(r.y[POINTS - 1]!)}`;
};

// --- The board ---------------------------------------------------------------

/** A connector: an input of the widget, or the output of a widget it reads. */
type End = { side: "in"; field: string } | { side: "out"; key: string };

interface Link {
  key: string;
  field: string;
}

const linkId = (l: Link) => `${l.key}\n${l.field}`;
const DRAG = "drag";

interface Drag {
  /** The end the cable still holds. */
  fixed: End;
  /** The connector under the free end, which it would plug into. */
  target: End | null;
  /** True once released without moving: the cable follows until the next click. */
  carried: boolean;
}

const sameEnd = (a: End | null, b: End | null) =>
  !!a && !!b && (a.side === "in" ? b.side === "in" && a.field === b.field : b.side === "out" && a.key === b.key);

const readGrid = () => {
  try {
    return localStorage.getItem(GRID_STORAGE) === "1";
  } catch {
    return false;
  }
};

const writeGrid = (on: boolean) => {
  try {
    localStorage.setItem(GRID_STORAGE, on ? "1" : "0");
  } catch {
    // Not remembered: the switch still works.
  }
};

const snap = (p: Point, grid: boolean): Point =>
  grid ? { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID } : p;

/** A widget read as the board draws it, still: the ghost of one dragged from the list. */
function NodeFace({ widget, looks }: { widget: SourceWidget; looks: { label: string; icon: DrawerWidget["icon"] } }) {
  return (
    <div className={classes.node} data-referenced>
      <looks.icon size={28} stroke={1.5} />
      <Text size="xs" fw={600} ta="center" lineClamp={2}>
        {looks.label}
      </Text>
      <div className={classes.port} data-side="out" style={{ top: NODE / 2 }}>
        <span className={classes.connector} />
        <span className={classes.portLabel}>{TYPE_LABELS[widget.type] ?? looks.label}</span>
      </div>
      <div className={classes.caption}>
        <div className={classes.reference}>{widget.reference}</div>
        <Text size="xs" c="dimmed" truncate maw="100%">
          {widget.board}
        </Text>
      </div>
    </div>
  );
}

function LinksBoard({
  inputs,
  widgets,
  links: initialLinks,
  layout: initialLayout,
  onClose,
  onSave,
}: {
  inputs: WidgetLinkInput[];
  widgets: SourceWidget[];
  links: WidgetLinks;
  layout: Partial<Layout>;
  onClose: () => void;
  onSave: (links: WidgetLinks, layout: Layout) => void;
}) {
  const self = useContext(DrawerWidgetContext);
  const byKey = useMemo(() => new Map(widgets.map((w) => [w.key, w])), [widgets]);
  const types = useMemo(() => new Set(inputs.flatMap((i) => i.types)), [inputs]);
  const offered = useMemo(() => widgets.filter((w) => types.has(w.type)), [widgets, types]);

  const [grid, setGrid] = useState(readGrid);
  const [links, setLinks] = useState<Link[]>(() =>
    inputs.flatMap((i) => (initialLinks[i.field] ?? []).filter((k) => byKey.has(k)).map((key) => ({ key, field: i.field }))),
  );
  const [layout, setLayout] = useState<Layout>(() => {
    const nodes: Record<string, Point> = {};
    for (const [key, p] of Object.entries(initialLayout.nodes ?? {})) if (byKey.has(key)) nodes[key] = p;
    // The widgets associated without a place yet: in a column, left of the widget.
    const unplaced = [...new Set(links.map((l) => l.key))].filter((k) => !nodes[k]);
    unplaced.forEach((key, i) => {
      nodes[key] = { x: -NODE / 2 - 250, y: -NODE / 2 + (i - (unplaced.length - 1) / 2) * 150 };
    });
    return { self: initialLayout.self ?? { x: -NODE / 2, y: -NODE / 2 }, nodes };
  });
  const [drag, setDrag] = useState<Drag | null>(null);
  /** The widget dragged from the list: its ghost, drawn as it will land. */
  const [ghost, setGhost] = useState<SourceWidget | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  /** Where the widget dragged from the list would land: a frame shows it. */
  const [dropAt, setDropAt] = useState<Point | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const canvas = useRef<HTMLDivElement>(null);
  // The latest of each, for the animation and the window's listeners.
  const linksRef = useRef(links);
  const layoutRef = useRef(layout);
  const dragRef = useRef(drag);
  const pointer = useRef<Point>({ x: 0, y: 0 });
  const pressedAt = useRef<Point>({ x: 0, y: 0 });
  const ropes = useRef(new Map<string, Rope>());
  const paths = useRef(new Map<string, SVGPathElement[]>());
  linksRef.current = links;
  layoutRef.current = layout;
  dragRef.current = drag;

  // The board's origin: its middle, on the grid.
  const origin = {
    x: Math.round(size.width / 2 / GRID) * GRID,
    y: Math.round(size.height / 2 / GRID) * GRID,
  };
  const originRef = useRef(origin);
  originRef.current = origin;

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry!.contentRect.width, height: entry!.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** Where a connector is, on the board. */
  const endPoint = (end: End): Point | null => {
    const o = originRef.current;
    const { self: at, nodes } = layoutRef.current;
    if (end.side === "in") {
      const index = inputs.findIndex((i) => i.field === end.field);
      if (index < 0) return null;
      return { x: o.x + at.x, y: o.y + at.y + (NODE * (index + 1)) / (inputs.length + 1) };
    }
    const node = nodes[end.key];
    return node ? { x: o.x + node.x + NODE, y: o.y + node.y + NODE / 2 } : null;
  };

  /** True when a widget's output can plug into an input, beside the cables there. */
  const fits = (key: string, field: string, others: Link[]) => {
    const input = inputs.find((i) => i.field === field);
    const type = typeOf(byKey, key);
    if (!input || !type || !input.types.includes(type)) return false;
    const there = others.filter((l) => l.field === field);
    if (there.some((l) => l.key === key)) return false;
    return !input.sameType || there.every((l) => typeOf(byKey, l.key) === type);
  };

  /** True when the free end of the cable held can plug into this connector. */
  const accepts = (held: End, end: End) =>
    held.side === "out"
      ? end.side === "in" && fits(held.key, end.field, linksRef.current)
      : end.side === "out" && fits(end.key, held.field, linksRef.current);

  /** The connectors on the board. */
  const ends = (): End[] => [
    ...inputs.map((i): End => ({ side: "in", field: i.field })),
    ...Object.keys(layoutRef.current.nodes).map((key): End => ({ side: "out", key })),
  ];

  // The animation: each cable follows its connectors, at 90 steps a second.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let pending = 0;
    let settled = false;
    const run = (now: number) => {
      frame = requestAnimationFrame(run);
      // Not before the board has its size: the connectors would be elsewhere.
      if (originRef.current.x === 0) return;
      const live = new Map<string, [Point, Point]>();
      for (const l of linksRef.current) {
        const a = endPoint({ side: "out", key: l.key });
        const b = endPoint({ side: "in", field: l.field });
        if (a && b) live.set(linkId(l), [a, b]);
      }
      const held = dragRef.current;
      if (held) {
        const a = endPoint(held.fixed);
        const b = (held.target && endPoint(held.target)) ?? pointer.current;
        if (a) live.set(DRAG, [a, b]);
      }
      for (const id of ropes.current.keys()) if (!live.has(id)) ropes.current.delete(id);
      for (const [id, [a, b]] of live) {
        if (ropes.current.has(id)) continue;
        const rope = ropeOf(a, b);
        // The cables there on opening already hang, and swing at once: the
        // board was tapped.
        if (!settled) {
          for (let k = 0; k < 120; k++) stepRope(rope, a, b);
          tap(rope);
        }
        ropes.current.set(id, rope);
      }
      settled = true;
      pending = Math.min(pending + now - last, STEP * 4);
      last = now;
      while (pending >= STEP) {
        pending -= STEP;
        for (const [id, [a, b]] of live) stepRope(ropes.current.get(id)!, a, b);
      }
      for (const [id, rope] of ropes.current) {
        const d = pathOf(rope);
        for (const path of paths.current.get(id) ?? []) path.setAttribute("d", d);
      }
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const boardPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // --- The cables ---

  /**
   * A press on a connector: a cable comes out of it, or — when it holds some —
   * the last one comes off it, held by its other end.
   */
  const grab = (end: End, e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (dragRef.current) return;
    pointer.current = pressedAt.current = boardPoint(e);
    const attached = links.filter((l) => (end.side === "in" ? l.field === end.field : l.key === end.key));
    const link = attached[attached.length - 1];
    if (!link) {
      ropes.current.delete(DRAG);
      setDrag({ fixed: end, target: null, carried: false });
      return;
    }
    const fixed: End = end.side === "in" ? { side: "out", key: link.key } : { side: "in", field: link.field };
    const rope = ropes.current.get(linkId(link));
    ropes.current.delete(linkId(link));
    // A link's rope runs from the output to the input; the held one, from its fixed end.
    if (rope) ropes.current.set(DRAG, fixed.side === "out" ? rope : reversed(rope));
    setLinks(links.filter((l) => l !== link));
    setDrag({ fixed, target: null, carried: false });
  };

  const holding = drag !== null;
  useEffect(() => {
    if (!holding) return;
    const move = (e: PointerEvent) => {
      if (!canvas.current) return;
      pointer.current = boardPoint(e);
      const held = dragRef.current;
      if (!held) return;
      const target =
        ends().find((end) => {
          if (!accepts(held.fixed, end)) return false;
          const at = endPoint(end);
          return !!at && Math.hypot(at.x - pointer.current.x, at.y - pointer.current.y) < 22;
        }) ?? null;
      if (!sameEnd(target, held.target) && (target || held.target)) setDrag({ ...held, target });
    };
    const release = (e: PointerEvent) => {
      const held = dragRef.current;
      if (!held || !canvas.current) return;
      pointer.current = boardPoint(e);
      const moved = Math.hypot(pointer.current.x - pressedAt.current.x, pointer.current.y - pressedAt.current.y) > 4;
      if (!held.target) {
        // Released where it was taken: it follows until the next click.
        if (!moved && !held.carried) return setDrag({ ...held, carried: true });
        ropes.current.delete(DRAG);
        return setDrag(null);
      }
      const link: Link =
        held.fixed.side === "out"
          ? { key: held.fixed.key, field: (held.target as { field: string }).field }
          : { key: (held.target as { key: string }).key, field: held.fixed.field };
      const rope = ropes.current.get(DRAG);
      ropes.current.delete(DRAG);
      if (rope) ropes.current.set(linkId(link), held.fixed.side === "out" ? rope : reversed(rope));
      setLinks((before) => [...before, link]);
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding]);

  // --- The widgets ---

  /** A widget moved by hand, on the grid when it shows. */
  const moveNode = (key: string | null, e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current || e.button !== 0) return;
    e.preventDefault();
    const element = e.currentTarget;
    element.setPointerCapture(e.pointerId);
    const start = key === null ? layout.self : layout.nodes[key]!;
    const from = boardPoint(e);
    const follow = (ev: PointerEvent) => {
      const at = boardPoint(ev);
      const next = snap({ x: start.x + at.x - from.x, y: start.y + at.y - from.y }, grid);
      setLayout((before) =>
        key === null ? { ...before, self: next } : { ...before, nodes: { ...before.nodes, [key]: next } },
      );
    };
    const stop = () => {
      element.removeEventListener("pointermove", follow);
      element.removeEventListener("pointerup", stop);
      element.removeEventListener("pointercancel", stop);
    };
    element.addEventListener("pointermove", follow);
    element.addEventListener("pointerup", stop);
    element.addEventListener("pointercancel", stop);
  };

  const removeNode = (key: string) => {
    setLinks(links.filter((l) => l.key !== key));
    setLayout(({ self: at, nodes: { [key]: _gone, ...nodes } }) => ({ self: at, nodes }));
  };

  const MIME = "application/x-milo-widget";
  /** Where a widget dropped here would land: centered on the pointer, on the grid when it shows. */
  const landing = (e: DragEvent) => {
    const at = boardPoint(e);
    return snap({ x: at.x - origin.x - NODE / 2, y: at.y - origin.y - NODE / 2 }, grid);
  };
  const dragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const place = landing(e);
    setDropAt((before) => (before && before.x === place.x && before.y === place.y ? before : place));
  };
  const dragLeave = (e: DragEvent) => {
    if (!canvas.current?.contains(e.relatedTarget as Node | null)) setDropAt(null);
  };
  const drop = (e: DragEvent) => {
    setDropAt(null);
    const key = e.dataTransfer.getData(MIME);
    if (!key || !byKey.has(key) || layout.nodes[key]) return;
    e.preventDefault();
    const place = landing(e);
    setLayout((before) => ({ ...before, nodes: { ...before.nodes, [key]: place } }));
  };

  // The list: the widgets one may associate, by view, then board.
  const groups = useMemo(() => {
    const views = new Map<Id, { label: string; boards: Map<Id, { label: string; widgets: SourceWidget[] }> }>();
    for (const w of offered) {
      const view = views.get(w.view_id) ?? { label: w.view, boards: new Map() };
      views.set(w.view_id, view);
      const board = view.boards.get(w.board_id) ?? { label: w.board, widgets: [] };
      view.boards.set(w.board_id, board);
      board.widgets.push(w);
    }
    return [...views.values()];
  }, [offered]);

  const looksOf = (type: string) => {
    const found = self?.widgetOf(type);
    return { label: found?.label ?? TYPE_LABELS[type] ?? type, icon: found?.icon ?? IconApps };
  };

  /** The state a connector shows, while a cable is held. */
  const connectorState = (end: End) => {
    if (!drag) return {};
    if (sameEnd(end, drag.target)) return { "data-target": true };
    if (sameEnd(end, drag.fixed)) return {};
    return accepts(drag.fixed, end) ? { "data-candidate": true } : { "data-muted": true };
  };

  const placed = Object.entries(layout.nodes);
  /** True when a connector holds a cable — the one held included. */
  const linked = (end: End) =>
    links.some((l) => (end.side === "in" ? l.field === end.field : l.key === end.key)) ||
    (drag !== null && sameEnd(drag.fixed, end));
  const save = () =>
    onSave(
      Object.fromEntries(inputs.map((i) => [i.field, links.filter((l) => l.field === i.field).map((l) => l.key)])),
      layout,
    );

  const SelfIcon = self?.icon ?? IconApps;
  const cableIds = [...links.map(linkId), ...(drag ? [DRAG] : [])];

  return (
    <div className={classes.screen} style={{ "--milo-links-green": GREEN } as CSSProperties}>
      {/* The ghost of a widget dragged from the list, behind everything: the
          browser draws it under the pointer (setDragImage). */}
      {ghost && (
        <div ref={ghostRef} className={classes.ghost}>
          <NodeFace widget={ghost} looks={looksOf(ghost.type)} />
        </div>
      )}
      {/* The widgets one may associate: the widgets drawer's panel, its width,
          its window look, its rows. */}
      <div className={classes.list} {...themeWindow("widgets-drawer").content}>
        <ScrollArea
          type="auto"
          scrollbars="y"
          scrollbarSize="var(--milo-settings-scrollbar-width)"
          h="100%"
          styles={{ thumb: { backgroundColor: "var(--milo-settings-scrollbar)" } }}
          classNames={{ scrollbar: windowClasses.scrollbar }}
        >
          <div style={{ padding: 50 }}>
            <Title
              order={1}
              size="var(--milo-settings-title-size)"
              fw="var(--milo-settings-title-weight)"
              c="var(--milo-settings-title-text)"
              mb="var(--milo-settings-title-margin-bottom)"
            >
              Widgets associés
            </Title>
            {groups.length === 0 && (
              <Text size="sm" c="dimmed">
                Aucun widget à associer
              </Text>
            )}
            {groups.map((view, rank) => (
              <div key={view.label}>
                {/* A view as the drawer's kinds: an "H2" title. */}
                <Title
                  order={2}
                  size="var(--milo-widgets-drawer-group-size)"
                  fw="var(--milo-widgets-drawer-group-weight)"
                  c="var(--milo-widgets-drawer-group)"
                  mb={H2_GAP}
                  pt={rank > 0 ? GROUPS_GAP : 0}
                >
                  {view.label}
                </Title>
                <Stack gap={0}>
                  {/* 30 px above a board, unless right under its view. */}
                  {[...view.boards.values()].map((board, index) => (
                    <Stack key={board.label} gap={4} pt={index > 0 ? 30 : 0}>
                      <Text size="xs" c="dimmed" fw={600}>
                        {board.label}
                      </Text>
                      {board.widgets.map((w) => {
                        const looks = looksOf(w.type);
                        const isPlaced = !!layout.nodes[w.key];
                        return (
                          <Group
                            key={w.key}
                            className={`${inset.inset} ${classes.row}`}
                            data-placed={isPlaced || undefined}
                            draggable={!isPlaced}
                            onDragStart={(e) => {
                              e.dataTransfer.setData(MIME, w.key);
                              e.dataTransfer.effectAllowed = "copy";
                              // The ghost drawn at once, held by its middle.
                              flushSync(() => setGhost(w));
                              if (ghostRef.current) e.dataTransfer.setDragImage(ghostRef.current, NODE / 2, NODE / 2);
                            }}
                            onDragEnd={() => {
                              setGhost(null);
                              setDropAt(null);
                            }}
                            gap="sm"
                            wrap="nowrap"
                          >
                            <Text c="var(--milo-widgets-drawer-grip)" component="span" style={{ display: "flex" }}>
                              <IconGripVertical size={16} />
                            </Text>
                            <span className={drawerStyles.icon}>
                              <looks.icon size={20} />
                            </span>
                            <Text
                              truncate
                              c="var(--milo-widgets-drawer-item-text)"
                              fw="var(--milo-widgets-drawer-item-weight)"
                              style={{ flex: 1, fontSize: "var(--milo-widgets-drawer-item-size)" }}
                            >
                              {looks.label}
                            </Text>
                            <Badge variant="filled" color={GREEN} radius={4} tt="none">
                              {w.reference}
                            </Badge>
                          </Group>
                        );
                      })}
                    </Stack>
                  ))}
                </Stack>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

        <div
          ref={canvas}
          className={classes.canvas}
          data-grid={grid || undefined}
          data-holding={drag ? true : undefined}
          onDragOver={dragOver}
          onDragLeave={dragLeave}
          onDrop={drop}
        >
          {dropAt && (
            <div className={classes.dropFrame} style={{ left: origin.x + dropAt.x, top: origin.y + dropAt.y }} />
          )}
          <Switch
            className={classes.gridSwitch}
            label="Grille"
            checked={grid}
            color="teal"
            onChange={(e) => {
              setGrid(e.currentTarget.checked);
              writeGrid(e.currentTarget.checked);
            }}
          />

          <svg className={classes.cables}>
            {cableIds.map((id) => (
              <g
                key={id}
                data-held={id === DRAG || undefined}
                ref={(el) => {
                  if (!el) return;
                  paths.current.set(id, [...el.querySelectorAll("path")]);
                  return () => void paths.current.delete(id);
                }}
              >
                <path className={classes.cableShadow} />
                <path className={classes.cable} />
              </g>
            ))}
          </svg>

          {/* The widget being set, its inputs on its left. */}
          <div
            className={classes.node}
            data-referenced
            style={{ left: origin.x + layout.self.x, top: origin.y + layout.self.y }}
            onPointerDown={(e) => moveNode(null, e)}
          >
            <SelfIcon size={28} stroke={1.5} />
            <Text size="xs" fw={600} ta="center" lineClamp={2}>
              {self?.label ?? "Widget"}
            </Text>
            {inputs.map((input, index) => {
              const end: End = { side: "in", field: input.field };
              return (
                <div
                  key={input.field}
                  className={classes.port}
                  data-side="in"
                  style={{ top: (NODE * (index + 1)) / (inputs.length + 1) }}
                >
                  <span className={classes.portLabel}>{input.label}</span>
                  <span
                    className={classes.connector}
                    data-linked={linked(end) || undefined}
                    {...connectorState(end)}
                    onPointerDown={(e) => grab(end, e)}
                  />
                </div>
              );
            })}
            {/* Its reference — "Ce widget" for one that owns none: an indicator. */}
            <div className={classes.caption}>
              <div className={classes.reference}>{self?.reference || "Ce widget"}</div>
            </div>
          </div>

          {/* The widgets read, their output on their right. */}
          {placed.map(([key, at]) => {
            const w = byKey.get(key);
            if (!w) return null;
            const looks = looksOf(w.type);
            const end: End = { side: "out", key };
            return (
              <div
                key={key}
                className={classes.node}
                data-referenced
                style={{ left: origin.x + at.x, top: origin.y + at.y }}
                onPointerDown={(e) => moveNode(key, e)}
              >
                <looks.icon size={28} stroke={1.5} />
                <Text size="xs" fw={600} ta="center" lineClamp={2}>
                  {looks.label}
                </Text>
                <UnstyledButton
                  className={classes.remove}
                  aria-label="Retirer le widget"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => removeNode(key)}
                >
                  <IconX size={12} />
                </UnstyledButton>
                <div className={classes.port} data-side="out" style={{ top: NODE / 2 }}>
                  <span
                    className={classes.connector}
                    data-linked={linked(end) || undefined}
                    {...connectorState(end)}
                    onPointerDown={(e) => grab(end, e)}
                  />
                  <span className={classes.portLabel}>{TYPE_LABELS[w.type] ?? looks.label}</span>
                </div>
                {/* Its reference right under its frame, the whole width; its board under it. */}
                <div className={classes.caption}>
                  <div className={classes.reference}>{w.reference}</div>
                  <Text size="xs" c="dimmed" truncate maw="100%">
                    {w.board}
                  </Text>
                </div>
              </div>
            );
          })}

          {placed.length === 0 && (
            <Text className={classes.hint} size="sm" c="dimmed">
              Glissez un widget de la liste pour l'ajouter, puis reliez sa sortie à une entrée.
            </Text>
          )}

          {/* Where a drawer has its own: its padding from the corner (DrawerFooter). */}
          <Group
            className={classes.footer}
            gap="var(--milo-settings-hstack-gap)"
            wrap="nowrap"
            style={{ right: DRAWER_PADDING, bottom: DRAWER_PADDING }}
          >
            <CloseButton onClick={onClose} />
            <Button color="teal" onClick={save}>
              Enregistrer
            </Button>
          </Group>
        </div>
    </div>
  );
}
