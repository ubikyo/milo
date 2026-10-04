import { Box, Group, Input, NumberInput, Select, Stack, UnstyledButton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPhoto } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { COVER_ROTATIONS } from "@milo/shared";
import { api } from "../../api";
import { FileRow, useOrderedFiles } from "../../components/board/CardAttachments";
import { SmallChoice } from "../../components/board/CardDueDate";
import DeleteConfirmModal from "../../components/ui/DeleteConfirmModal";
import {
  EmptyList,
  ListFooter,
  ROW_BACKGROUND,
  RowCheckbox,
  useRowSelection,
} from "../../components/ui/DrawerRows";
import ResizedImage from "../../components/ui/ResizedImage";
import { withField, count, text } from "../types";
import type { AccessWidget, WidgetConfigProps } from "../types";

// An image, or several that take turns: a logo, a floor plan, a campaign's
// visuals. The same as a card's cover images (CardCovers, TaskBoard): in the
// drawer, one row per image, a handle to reorder them and a checkbox to
// delete them, the rotation interval next to the label; on the board, the
// images take turns with a fade, hovering pauses them, and the dots laid on
// the image lead to one or another.
//
// The original is kept as uploaded: it is the server that reduces it to the
// width of the section that shows it (ResizedImage), so a large photo does
// not weigh on the board.
//
// Images are dropped into the drawer and live with the other media
// (server/src/lib/media.ts): it is the configuration that cites their address,
// and the media cleanup does not touch what it cites.

const IMAGES = "images";
const INTERVAL = "interval";
const HEIGHT = "height";
const ADJUSTMENT = "fit";

/** The time spent on each image, in seconds; zero, the first one stays. */
const DEFAULT_INTERVAL = 10;

/** The image's height, in pixels; "0": the one its width gives it. */
const DEFAULT_HEIGHT = 0;
const HEIGHT_MAX = 1200;

/** The height of the empty frame, when the element sets none. */
const EMPTY_HEIGHT = 160;

/** The duration of the fade between two images. */
const FADE = 600;

const ACCEPTED = "image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp";

const ROTATIONS = COVER_ROTATIONS.map((r) => ({ value: String(r.value), label: r.label }));

const ADJUSTMENTS = [
  { value: "cover", label: "Remplir (recadrer)" },
  { value: "contain", label: "Contenir (entière)" },
];

/** An image as the configuration keeps it: its address, and what the drawer shows of it. */
interface StoredImage {
  url: string;
  name: string;
  size: number;
  created_at: string;
}

/** An image of the list, numbered by its rank: what the drawer rows reorder. */
type Row = StoredImage & { id: number };

/**
 * The stored images, without whatever is not one. The first ones were kept
 * as bare addresses: they get their file name, and no size or date.
 */
const imagesOf = (config: unknown): StoredImage[] => {
  const value = (config as Record<string, unknown> | null)?.[IMAGES];
  if (!Array.isArray(value)) return [];
  return value.flatMap((v): StoredImage[] => {
    if (typeof v === "string") {
      return v ? [{ url: v, name: v.split("/").pop() || "Image", size: 0, created_at: "" }] : [];
    }
    const image = v as Partial<StoredImage> | null;
    if (!image || typeof image.url !== "string" || !image.url) return [];
    return [
      {
        url: image.url,
        name: typeof image.name === "string" ? image.name : "Image",
        size: typeof image.size === "number" ? image.size : 0,
        created_at: typeof image.created_at === "string" ? image.created_at : "",
      },
    ];
  });
};

/** The interval, brought back to one of the choices: the first ones were free. */
const intervalOf = (config: unknown): number => {
  const asked = count(config, INTERVAL, DEFAULT_INTERVAL);
  if (asked <= 0) return 0;
  return COVER_ROTATIONS.reduce<number>(
    (best, r) => (r.value && Math.abs(r.value - asked) < Math.abs(best - asked) ? r.value : best),
    COVER_ROTATIONS[1].value,
  );
};

function Slideshow({ config }: { config: unknown }) {
  const urls = imagesOf(config).map((i) => i.url);
  const height = count(config, HEIGHT, DEFAULT_HEIGHT);
  const adjustment = text(config, ADJUSTMENT, "cover") === "contain" ? "contain" : "cover";
  const interval = intervalOf(config);
  const [rank, setRank] = useState(0);
  const [pause, setPaused] = useState(false);

  // Only a change of images restarts the rotation from the first.
  const key = urls.join("|");
  const total = urls.length;
  // An image removed in the drawer does not leave the index pointing at nothing.
  const current = total ? rank % total : 0;

  useEffect(() => setRank(0), [key]);

  // Hover suspends scrolling, and a chosen dot restarts for a full interval.
  useEffect(() => {
    if (!interval || total < 2 || pause) return;
    const timeout = window.setTimeout(() => setRank((r) => (r + 1) % total), interval * 1000);
    return () => window.clearTimeout(timeout);
  }, [key, total, interval, pause, rank]);

  // No image yet: the frame it will take, on the drawer rows' neutral gray,
  // with the picture icon in the center.
  if (!total) {
    return (
      <Box
        h={height || EMPTY_HEIGHT}
        c="dimmed"
        aria-label="Aucune image"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "var(--mantine-radius-md)",
          backgroundColor: ROW_BACKGROUND,
        }}
      >
        <IconPhoto size={40} stroke={1.25} />
      </Box>
    );
  }

  // The images overlap: the first one holds the frame's height when none is
  // given, the others are laid on top of it with a fade.
  return (
    <Box
      pos="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{ borderRadius: "var(--mantine-radius-md)", overflow: "hidden" }}
    >
      {urls.map((src, i) => (
        <ResizedImage
          key={`${src}-${i}`}
          src={src}
          fit={adjustment}
          height={height || undefined}
          style={{
            position: i === 0 ? "relative" : "absolute",
            inset: i === 0 ? undefined : 0,
            height: height || (i === 0 ? "auto" : "100%"),
            opacity: i === current ? 1 : 0,
            transition: `opacity ${FADE}ms ease`,
          }}
        />
      ))}
      {/* The cover images' dots, laid on the photo, at the bottom: in white,
          with a shadow, to read on any image. */}
      {total > 1 && (
        <Group
          gap={6}
          justify="center"
          wrap="nowrap"
          style={{ position: "absolute", left: 0, right: 0, bottom: 8 }}
        >
          {urls.map((src, i) => (
            <UnstyledButton
              key={`${src}-${i}`}
              aria-label={`Image ${i + 1}`}
              onClick={() => setRank(i)}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: "var(--mantine-color-white)",
                opacity: i === current ? 1 : 0.5,
                boxShadow: "0 0 2px rgba(0, 0, 0, 0.6)",
              }}
            />
          ))}
        </Group>
      )}
    </Box>
  );
}

function Fields({ config, onChange }: WidgetConfigProps) {
  const images = imagesOf(config);
  const rows: Row[] = images.map((image, id) => ({ ...image, id }));
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /** True while files hover over the block: they will be added. */
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const store = (next: StoredImage[]) => onChange(withField(config, IMAGES, next));

  const { displayed, row } = useOrderedFiles(
    rows,
    (ids) => store(ids.map((id) => images[id]!)),
    true,
  );
  const selection = useRowSelection(rows.map((r) => r.id));
  const toDelete = rows.filter((r) => selection.isChecked(r.id));

  // The original goes as is: the board asks the server for the width it needs.
  const drop = async (files: File[]) => {
    const pictures = files.filter((f) => f.type.startsWith("image/"));
    if (!pictures.length) return;
    setSending(true);
    const added: StoredImage[] = [];
    try {
      for (const file of pictures) {
        const { url } = await api.uploadWidgetImage(file);
        added.push({ url, name: file.name, size: file.size, created_at: new Date().toISOString() });
      }
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    } finally {
      setSending(false);
      if (added.length) store([...images, ...added]);
    }
  };

  // Only files dropped from outside: the rows' handles drag nothing of the kind.
  const carriesFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");

  return (
    <Stack gap="xl">
      <div
        onDragOver={(e) => {
          if (!carriesFiles(e)) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
        }}
        onDrop={(e) => {
          if (!carriesFiles(e)) return;
          e.preventDefault();
          setOver(false);
          void drop([...e.dataTransfer.files]);
        }}
        style={{
          outline: over ? "2px dashed var(--mantine-primary-color-filled)" : undefined,
          outlineOffset: 4,
          borderRadius: "var(--mantine-radius-sm)",
        }}
      >
        <Group justify="space-between" align="flex-end" wrap="nowrap">
          <Input.Label>Images</Input.Label>
          <SmallChoice
            data={ROTATIONS}
            value={String(intervalOf(config))}
            onChange={(v) => onChange(withField(config, INTERVAL, Number(v)))}
            label="Intervalle de rotation"
            disabled={images.length < 2}
          />
        </Group>

        {images.length === 0 ? (
          <EmptyList icon={IconPhoto} message="Aucune image" />
        ) : (
          <Stack gap={2}>
            {displayed.map((image, rank) => (
              <FileRow
                key={`${image.url}-${image.id}`}
                attachment={{ ...image, is_image: true }}
                checkbox={
                  <RowCheckbox
                    label={`Sélectionner ${image.name || "l'image"}`}
                    checked={selection.isChecked(image.id)}
                    onChange={(on) => selection.toggle(image.id, on)}
                    afterHandle
                  />
                }
                {...row(image, rank)}
              />
            ))}
          </Stack>
        )}

        <ListFooter
          addLabel={sending ? "Envoi…" : "Ajouter une image"}
          onAdd={sending ? undefined : () => picker.current?.click()}
          checkedCount={toDelete.length}
          onDeleteChecked={() => setConfirming(true)}
        />
        <input
          ref={picker}
          type="file"
          accept={ACCEPTED}
          multiple
          hidden
          onChange={(e) => {
            void drop([...(e.currentTarget.files ?? [])]);
            e.currentTarget.value = "";
          }}
        />
      </div>

      <Group align="flex-start">
        <NumberInput
          label="Hauteur"
          description="0 : automatique"
          value={count(config, HEIGHT, DEFAULT_HEIGHT)}
          onChange={(v) =>
            onChange(withField(config, HEIGHT, v === "" ? DEFAULT_HEIGHT : Number(v)))
          }
          min={0}
          max={HEIGHT_MAX}
          suffix=" px"
          allowNegative={false}
          allowDecimal={false}
          w={140}
        />
        <Select
          label="Ajustement"
          description="Quand la hauteur est fixée"
          data={ADJUSTMENTS}
          value={text(config, ADJUSTMENT, "cover")}
          onChange={(v) => v && onChange(withField(config, ADJUSTMENT, v))}
          allowDeselect={false}
          w={180}
        />
      </Group>

      <DeleteConfirmModal
        opened={confirming && toDelete.length > 0}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          // Ranks shift once images leave: no box stays checked.
          const gone = new Set(toDelete.map((r) => r.id));
          selection.reset();
          store(images.filter((_, i) => !gone.has(i)));
        }}
        title={toDelete.length > 1 ? `Supprimer ${toDelete.length} images` : "Supprimer l'image"}
        message={
          toDelete.length > 1 ? (
            <>Voulez-vous vraiment supprimer ces {toDelete.length} images ?</>
          ) : (
            <>Voulez-vous vraiment supprimer « {toDelete[0]?.name || "cette image"} » ?</>
          )
        }
      />
    </Stack>
  );
}

export const imageWidget: AccessWidget = {
  type: "image",
  kind: "common",
  label: "Image",
  icon: IconPhoto,
  defaultConfig: {
    [IMAGES]: [],
    [INTERVAL]: DEFAULT_INTERVAL,
    [HEIGHT]: DEFAULT_HEIGHT,
    [ADJUSTMENT]: "cover",
  },
  // The dots leading from one image to another receive their clicks.
  ownClicks: true,
  drawerSize: 480,

  Display: Slideshow,

  // Like the clock: the space that keeps the next element off the image.
  margins: () => ({ top: 0, bottom: 15 }),

  Config: Fields,
};
