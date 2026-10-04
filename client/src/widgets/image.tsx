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
import { api } from "../api";
import { withField, count, text } from "./types";
import type { AccessWidget, WidgetConfigProps } from "./types";

// Une image, ou plusieurs qui se relaient : un logo, un plan d'étage, les
// visuels d'une campagne. Seule, l'image est posée telle quelle ; à plusieurs,
// elles défilent d'elles-mêmes, en fondu, à l'intervalle que l'élément règle —
// le survol suspend le défilement, et les points sous l'image mènent à l'une
// ou l'autre.
//
// Les images se déposent dans le tiroir et vivent avec les autres médias
// (server/src/lib/media.ts) : c'est la configuration qui cite leur adresse,
// et le ménage des médias ne touche pas à ce qu'elle cite. Une adresse
// d'ailleurs se colle aussi.

const IMAGES = "images";
const INTERVAL = "interval";
const HEIGHT = "height";
const ADJUSTMENT = "fit";

/** Le temps passé sur chaque image, en secondes. */
const DEFAULT_INTERVAL = 8;
const INTERVAL_MIN = 2;
const INTERVAL_MAX = 3600;

/** La hauteur de l'image, en pixels ; « 0 » : celle que sa largeur lui donne. */
const DEFAULT_HEIGHT = 0;
const HEIGHT_MAX = 1200;

/** La durée du fondu entre deux images. */
const FADE = 600;

/** Le côté d'une vignette du tiroir. */
const THUMBNAIL = 72;

const ADJUSTMENTS = [
  { value: "cover", label: "Remplir (recadrer)" },
  { value: "contain", label: "Contenir (entière)" },
];

/** Les adresses rangées, sans ce qui n'en est pas une. */
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

  // Une image retirée dans le tiroir ne laisse pas le rang pointer dans le vide.
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

  // Seule, l'image prend sa place naturelle quand aucune hauteur n'est dite.
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

  // À plusieurs, elles se superposent : la première tient la hauteur du
  // cadre quand aucune n'est dite, les autres se posent dessus en fondu.
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
      {/* Un champ vidé le temps d'une saisie range l'intervalle par défaut
          plutôt qu'un zéro, qui ferait tourner les images sans repos. */}
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
  // Les points qui mènent d'une image à l'autre prennent leurs clics.
  ownClicks: true,
  drawerSize: 480,

  Display: Slideshow,

  margins: () => ({ top: 0, bottom: 15 }),

  Config: Fields,
};
