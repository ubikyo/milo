import {
  ActionIcon,
  Box,
  Button,
  FileButton,
  Group,
  Image,
  Input,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconChevronLeft, IconChevronRight, IconPhoto, IconTrash, IconUpload } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { withField, count, text } from "../types";
import type { AccessWidget, WidgetConfigProps } from "../types";

// An image, or several that take turns: a logo, a floor plan, a campaign's
// visuals. Alone, the image is placed as is; with several, they scroll by
// themselves, with a fade, at the interval the element sets — hovering pauses
// the scrolling, and the dots below the image lead to one or another.
//
// Images are dropped into the drawer and live with the other media
// (server/src/lib/media.ts): it is the configuration that cites their address,
// and the media cleanup does not touch what it cites. An external address can
// also be pasted.

const IMAGES = "images";
const INTERVAL = "interval";
const HEIGHT = "height";
const ADJUSTMENT = "fit";

/** The time spent on each image, in seconds. */
const DEFAULT_INTERVAL = 8;
const INTERVAL_MIN = 2;
const INTERVAL_MAX = 3600;

/** The image's height, in pixels; "0": the one its width gives it. */
const DEFAULT_HEIGHT = 0;
const HEIGHT_MAX = 1200;

/** The duration of the fade between two images. */
const FADE = 600;

/** The side of a drawer thumbnail. */
const THUMBNAIL = 72;

const ADJUSTMENTS = [
  { value: "cover", label: "Remplir (recadrer)" },
  { value: "contain", label: "Contenir (entière)" },
];

/** The stored addresses, without whatever is not one. */
const imagesOf = (config: unknown): string[] => {
  const value = (config as Record<string, unknown> | null)?.[IMAGES];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v !== "") : [];
};

const intervalOf = (config: unknown): number =>
  Math.min(
    INTERVAL_MAX,
    Math.max(INTERVAL_MIN, count(config, INTERVAL, DEFAULT_INTERVAL)),
  );

function Slideshow({ config }: { config: unknown }) {
  const images = imagesOf(config);
  const height = count(config, HEIGHT, DEFAULT_HEIGHT);
  const adjustment = text(config, ADJUSTMENT, "cover") === "contain" ? "contain" : "cover";
  const interval = intervalOf(config);
  const [rank, setRank] = useState(0);
  const [pause, setPaused] = useState(false);

  // An image removed in the drawer does not leave the index pointing at nothing.
  const current = images.length ? rank % images.length : 0;

  useEffect(() => {
    if (images.length < 2 || pause) return;
    const heartbeat = setInterval(() => setRank((r) => (r + 1) % images.length), interval * 1000);
    return () => clearInterval(heartbeat);
  }, [images.length, interval, pause]);

  if (!images.length) {
    return (
      <Group gap={6} c="dimmed">
        <IconPhoto size={16} />
        <Text size="sm">Image</Text>
      </Group>
    );
  }

  // Alone, the image takes its natural place when no height is given.
  if (images.length === 1) {
    return (
      <Image
        src={images[0]}
        alt=""
        radius="md"
        h={height || "auto"}
        fit={adjustment}
      />
    );
  }

  // With several, they overlap: the first one holds the frame's height when
  // none is given, the others are laid on top of it with a fade.
  return (
    <Stack gap={6} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <Box pos="relative" style={{ borderRadius: "var(--mantine-radius-md)", overflow: "hidden" }}>
        {images.map((src, i) => (
          <Image
            key={`${src}-${i}`}
            src={src}
            alt=""
            h={height || "auto"}
            fit={adjustment}
            style={{
              position: i === 0 ? "relative" : "absolute",
              inset: i === 0 ? undefined : 0,
              width: "100%",
              height: height ? height : i === 0 ? "auto" : "100%",
              opacity: i === current ? 1 : 0,
              transition: `opacity ${FADE}ms ease`,
            }}
          />
        ))}
      </Box>
      <Group gap={6} justify="center">
        {images.map((src, i) => (
          <UnstyledButton
            key={`${src}-${i}`}
            aria-label={`Image ${i + 1}`}
            onClick={() => setRank(i)}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor:
                i === current ? "var(--mantine-color-text)" : "var(--mantine-color-dimmed)",
              opacity: i === current ? 1 : 0.5,
            }}
          />
        ))}
      </Group>
    </Stack>
  );
}

function Fields({ config, onChange }: WidgetConfigProps) {
  const images = imagesOf(config);
  const [address, setAddress] = useState("");
  const [sending, setSending] = useState(false);

  const store = (nextItems: string[]) => onChange(withField(config, IMAGES, nextItems));

  const drop = async (files: File[]) => {
    if (!files.length) return;
    setSending(true);
    const added: string[] = [];
    try {
      for (const file of files) {
        const { url } = await api.uploadWidgetImage(file);
        added.push(url);
      }
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    } finally {
      setSending(false);
      if (added.length) store([...images, ...added]);
    }
  };

  const addAddress = () => {
    const url = address.trim();
    if (!/^(https?:\/\/|\/api\/medias?\/)/.test(url)) return;
    store([...images, url]);
    setAddress("");
  };

  const move = (de: number, to: number) => {
    const nextItems = [...images];
    const [image] = nextItems.splice(de, 1);
    nextItems.splice(to, 0, image!);
    store(nextItems);
  };

  return (
    <Stack gap="xl">
      <Input.Wrapper label="Images" description="Plusieurs images défilent d'elles-mêmes">
        <Stack gap="sm" mt={6}>
          {images.length > 0 && (
            <Group gap="xs">
              {images.map((src, i) => (
                <Stack key={`${src}-${i}`} gap={2} align="center">
                  <Image src={src} alt="" w={THUMBNAIL} h={THUMBNAIL} radius="sm" fit="cover" />
                  <Group gap={0}>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      disabled={i === 0}
                      onClick={() => move(i, i - 1)}
                      aria-label="Avancer"
                    >
                      <IconChevronLeft size={14} />
                    </ActionIcon>
                    <Tooltip label="Retirer">
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        onClick={() => store(images.filter((_, j) => j !== i))}
                        aria-label="Retirer"
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      disabled={i === images.length - 1}
                      onClick={() => move(i, i + 1)}
                      aria-label="Reculer"
                    >
                      <IconChevronRight size={14} />
                    </ActionIcon>
                  </Group>
                </Stack>
              ))}
            </Group>
          )}
          <FileButton onChange={drop} accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp" multiple>
            {(props) => (
              <Button
                {...props}
                variant="default"
                leftSection={<IconUpload size={16} />}
                loading={sending}
                w="fit-content"
              >
                Déposer des images
              </Button>
            )}
          </FileButton>
          <TextInput
            placeholder="… ou coller une adresse https://"
            value={address}
            onChange={(e) => setAddress(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && addAddress()}
            onBlur={addAddress}
          />
        </Stack>
      </Input.Wrapper>
      <Group align="flex-start">
        <NumberInput
          label="Hauteur"
          description="0 : automatique"
          value={count(config, HEIGHT, DEFAULT_HEIGHT)}
          onChange={(v) => onChange(withField(config, HEIGHT, v === "" ? DEFAULT_HEIGHT : Number(v)))}
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
      {/* A field emptied while typing stores the default interval rather
          than a zero, which would make the images spin without rest. */}
      <NumberInput
        label="Intervalle de rotation"
        placeholder={String(DEFAULT_INTERVAL)}
        value={count(config, INTERVAL, DEFAULT_INTERVAL)}
        onChange={(v) =>
          onChange(withField(config, INTERVAL, v === "" ? DEFAULT_INTERVAL : Number(v)))
        }
        min={INTERVAL_MIN}
        max={INTERVAL_MAX}
        suffix=" s"
        allowNegative={false}
        allowDecimal={false}
        disabled={images.length < 2}
        w={140}
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

  margins: () => ({ top: 0, bottom: 15 }),

  Config: Fields,
};
