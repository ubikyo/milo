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
import { avec, nombre, texte } from "./types";
import type { AccessWidget, WidgetConfigProps } from "./types";

// Une image, ou plusieurs qui se relaient : un logo, un plan d'étage, les
// visuels d'une campagne. Seule, l'image est posée telle quelle ; à plusieurs,
// elles défilent d'elles-mêmes, en fondu, à l'intervalle que l'élément règle —
// le survol suspend le défilement, et les points sous l'image mènent à l'une
// ou l'autre.
//
// Les images se déposent dans le tiroir et vivent avec les autres médias
// (server/src/lib/medias.ts) : c'est la configuration qui cite leur adresse,
// et le ménage des médias ne touche pas à ce qu'elle cite. Une adresse
// d'ailleurs se colle aussi.

const IMAGES = "images";
const INTERVALLE = "intervalle";
const HAUTEUR = "hauteur";
const AJUSTEMENT = "ajustement";

/** Le temps passé sur chaque image, en secondes. */
const INTERVALLE_PAR_DEFAUT = 8;
const INTERVALLE_MIN = 2;
const INTERVALLE_MAX = 3600;

/** La hauteur de l'image, en pixels ; « 0 » : celle que sa largeur lui donne. */
const HAUTEUR_PAR_DEFAUT = 0;
const HAUTEUR_MAX = 1200;

/** La durée du fondu entre deux images. */
const FONDU = 600;

/** Le côté d'une vignette du tiroir. */
const VIGNETTE = 72;

const AJUSTEMENTS = [
  { value: "cover", label: "Remplir (recadrer)" },
  { value: "contain", label: "Contenir (entière)" },
];

/** Les adresses rangées, sans ce qui n'en est pas une. */
const imagesDe = (config: unknown): string[] => {
  const valeur = (config as Record<string, unknown> | null)?.[IMAGES];
  return Array.isArray(valeur) ? valeur.filter((v): v is string => typeof v === "string" && v !== "") : [];
};

const intervalleDe = (config: unknown): number =>
  Math.min(
    INTERVALLE_MAX,
    Math.max(INTERVALLE_MIN, nombre(config, INTERVALLE, INTERVALLE_PAR_DEFAUT)),
  );

function Diaporama({ config }: { config: unknown }) {
  const images = imagesDe(config);
  const hauteur = nombre(config, HAUTEUR, HAUTEUR_PAR_DEFAUT);
  const ajustement = texte(config, AJUSTEMENT, "cover") === "contain" ? "contain" : "cover";
  const intervalle = intervalleDe(config);
  const [rang, setRang] = useState(0);
  const [pause, setPause] = useState(false);

  // Une image retirée dans le tiroir ne laisse pas le rang pointer dans le vide.
  const courant = images.length ? rang % images.length : 0;

  useEffect(() => {
    if (images.length < 2 || pause) return;
    const battement = setInterval(() => setRang((r) => (r + 1) % images.length), intervalle * 1000);
    return () => clearInterval(battement);
  }, [images.length, intervalle, pause]);

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
        h={hauteur || "auto"}
        fit={ajustement}
      />
    );
  }

  // À plusieurs, elles se superposent : la première tient la hauteur du
  // cadre quand aucune n'est dite, les autres se posent dessus en fondu.
  return (
    <Stack gap={6} onMouseEnter={() => setPause(true)} onMouseLeave={() => setPause(false)}>
      <Box pos="relative" style={{ borderRadius: "var(--mantine-radius-md)", overflow: "hidden" }}>
        {images.map((src, i) => (
          <Image
            key={`${src}-${i}`}
            src={src}
            alt=""
            h={hauteur || "auto"}
            fit={ajustement}
            style={{
              position: i === 0 ? "relative" : "absolute",
              inset: i === 0 ? undefined : 0,
              width: "100%",
              height: hauteur ? hauteur : i === 0 ? "auto" : "100%",
              opacity: i === courant ? 1 : 0,
              transition: `opacity ${FONDU}ms ease`,
            }}
          />
        ))}
      </Box>
      <Group gap={6} justify="center">
        {images.map((src, i) => (
          <UnstyledButton
            key={`${src}-${i}`}
            aria-label={`Image ${i + 1}`}
            onClick={() => setRang(i)}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor:
                i === courant ? "var(--mantine-color-text)" : "var(--mantine-color-dimmed)",
              opacity: i === courant ? 1 : 0.5,
            }}
          />
        ))}
      </Group>
    </Stack>
  );
}

function Champs({ config, onChange }: WidgetConfigProps) {
  const images = imagesDe(config);
  const [adresse, setAdresse] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const ranger = (suivantes: string[]) => onChange(avec(config, IMAGES, suivantes));

  const deposer = async (fichiers: File[]) => {
    if (!fichiers.length) return;
    setEnvoi(true);
    const ajoutees: string[] = [];
    try {
      for (const fichier of fichiers) {
        const { url } = await api.uploadWidgetImage(fichier);
        ajoutees.push(url);
      }
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    } finally {
      setEnvoi(false);
      if (ajoutees.length) ranger([...images, ...ajoutees]);
    }
  };

  const ajouterAdresse = () => {
    const url = adresse.trim();
    if (!/^(https?:\/\/|\/api\/medias\/)/.test(url)) return;
    ranger([...images, url]);
    setAdresse("");
  };

  const deplacer = (de: number, vers: number) => {
    const suivantes = [...images];
    const [image] = suivantes.splice(de, 1);
    suivantes.splice(vers, 0, image!);
    ranger(suivantes);
  };

  return (
    <Stack gap="xl">
      <Input.Wrapper label="Images" description="Plusieurs images défilent d'elles-mêmes">
        <Stack gap="sm" mt={6}>
          {images.length > 0 && (
            <Group gap="xs">
              {images.map((src, i) => (
                <Stack key={`${src}-${i}`} gap={2} align="center">
                  <Image src={src} alt="" w={VIGNETTE} h={VIGNETTE} radius="sm" fit="cover" />
                  <Group gap={0}>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      disabled={i === 0}
                      onClick={() => deplacer(i, i - 1)}
                      aria-label="Avancer"
                    >
                      <IconChevronLeft size={14} />
                    </ActionIcon>
                    <Tooltip label="Retirer">
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        onClick={() => ranger(images.filter((_, j) => j !== i))}
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
                      onClick={() => deplacer(i, i + 1)}
                      aria-label="Reculer"
                    >
                      <IconChevronRight size={14} />
                    </ActionIcon>
                  </Group>
                </Stack>
              ))}
            </Group>
          )}
          <FileButton onChange={deposer} accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp" multiple>
            {(props) => (
              <Button
                {...props}
                variant="default"
                leftSection={<IconUpload size={16} />}
                loading={envoi}
                w="fit-content"
              >
                Déposer des images
              </Button>
            )}
          </FileButton>
          <TextInput
            placeholder="… ou coller une adresse https://"
            value={adresse}
            onChange={(e) => setAdresse(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && ajouterAdresse()}
            onBlur={ajouterAdresse}
          />
        </Stack>
      </Input.Wrapper>
      <Group align="flex-start">
        <NumberInput
          label="Hauteur"
          description="0 : automatique"
          value={nombre(config, HAUTEUR, HAUTEUR_PAR_DEFAUT)}
          onChange={(v) => onChange(avec(config, HAUTEUR, v === "" ? HAUTEUR_PAR_DEFAUT : Number(v)))}
          min={0}
          max={HAUTEUR_MAX}
          suffix=" px"
          allowNegative={false}
          allowDecimal={false}
          w={140}
        />
        <Select
          label="Ajustement"
          description="Quand la hauteur est fixée"
          data={AJUSTEMENTS}
          value={texte(config, AJUSTEMENT, "cover")}
          onChange={(v) => v && onChange(avec(config, AJUSTEMENT, v))}
          allowDeselect={false}
          w={180}
        />
      </Group>
      {/* Un champ vidé le temps d'une saisie range l'intervalle par défaut
          plutôt qu'un zéro, qui ferait tourner les images sans repos. */}
      <NumberInput
        label="Intervalle de rotation"
        placeholder={String(INTERVALLE_PAR_DEFAUT)}
        value={nombre(config, INTERVALLE, INTERVALLE_PAR_DEFAUT)}
        onChange={(v) =>
          onChange(avec(config, INTERVALLE, v === "" ? INTERVALLE_PAR_DEFAUT : Number(v)))
        }
        min={INTERVALLE_MIN}
        max={INTERVALLE_MAX}
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
    [INTERVALLE]: INTERVALLE_PAR_DEFAUT,
    [HAUTEUR]: HAUTEUR_PAR_DEFAUT,
    [AJUSTEMENT]: "cover",
  },
  // Les points qui mènent d'une image à l'autre prennent leurs clics.
  ownClicks: true,
  drawerSize: 480,

  Display: Diaporama,

  marges: () => ({ haute: 0, basse: 15 }),

  Config: Champs,
};
