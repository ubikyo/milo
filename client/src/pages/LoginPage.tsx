import {
  Anchor,
  Box,
  Button,
  Center,
  Flex,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconBrandWindows } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api, entraLoginUrl } from "../api";
import { passwordIssues } from "@milo/shared";
import classes from "../assets/styles/LoginStars.module.css";
import Logo from "../components/ui/Logo";
import PasswordRules from "../components/ui/PasswordRules";
import { errorMessage, notifyError } from "../lib/errors";
import type { AuthResult } from "@milo/shared";
import type { CSSProperties, FormEvent } from "react";

/**
 * "setup": the "admin" account's password, on the very first opening. "microsoft": everyone's login. "admin": that
 * of the "admin" account, which is only used for settings.
 */
type LoginMode = "setup" | "microsoft" | "admin";

const ADMIN = "admin";

/** The height of the Milo logo at 40px wide (435×330). */
const MILO_LOGO_HEIGHT = (40 * 330) / 435;

/** The texts that follow one another over the image, "\n" for a line break. */
const SLIDES = [
  "Organisez vos tâches\net le travail de votre équipe",
  "Partagez vos ressources,\ndocumentez vos procédures",
  "Centralisez vos assets\net vos demandes utilisateurs",
  "Et bien plus encore...",
];
/** The texts' size, in px; the last one, the conclusion, is 30% bigger. */
const SLIDE_SIZE = 30;
const LAST_SLIDE_SIZE = SLIDE_SIZE * 1.3;
/**
 * The shooting stars, to the right of the logo: start (from the top left of
 * the image), length, brightness, delay and duration of each one, fixed so
 * they do not move at each render.
 */
const STARS = [
  { top: -30, left: "16%", length: 80, alpha: 0.9, delay: 0, duration: 10 },
  { top: -10, left: "32%", length: 50, alpha: 0.5, delay: 3.4, duration: 10 },
  { top: -40, left: "24%", length: 110, alpha: 0.7, delay: 6.8, duration: 10 },
];

/** How long each text stays before fading into the next one, in ms. */
const SLIDE_PAUSE = 5000;
/** How far above its place the next text starts, in px. */
const SLIDE_SHIFT = 20;
/** The leaving text's fade, then the next one's entrance, in ms. */
const SLIDE_FADE = 600;
/** The next text comes in when the leaving one has done 95% of its fade. */
const SLIDE_DELAY = SLIDE_FADE * 0.95;

/**
 * A text's position and transition. The leaving one fades out where it is;
 * the next one comes down from above as it appears, once the fade is nearly
 * over. The others wait above, invisible, and get there without a transition.
 */
function slideStyle(index: number, current: number): CSSProperties {
  const previous = (current + SLIDES.length - 1) % SLIDES.length;
  if (index === current)
    return {
      opacity: 1,
      transform: "translateY(0)",
      transition: `opacity ${SLIDE_FADE}ms ease ${SLIDE_DELAY}ms, transform ${SLIDE_FADE}ms ease ${SLIDE_DELAY}ms`,
    };
  if (index === previous)
    return {
      opacity: 0,
      transform: "translateY(0)",
      transition: `opacity ${SLIDE_FADE}ms ease`,
    };
  return { opacity: 0, transform: `translateY(-${SLIDE_SHIFT}px)` };
}

interface LoginPageProps {
  needsSetup: boolean;
  /** The Entra application is configured: Microsoft login is possible. */
  entra: boolean;
  /** What Microsoft or the server answered on return from a login. */
  initialError?: string | null;
  onAuthenticated: (result: AuthResult) => void;
}

export default function LoginPage({
  needsSetup,
  entra,
  initialError,
  onAuthenticated,
}: LoginPageProps) {
  const [mode, setMode] = useState<LoginMode>(
    needsSetup ? "setup" : entra ? "microsoft" : "admin",
  );
  const [username, setUsername] = useState(ADMIN);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [slide, setSlide] = useState(0);

  // After the last text, back to the first one.
  useEffect(() => {
    const timer = setInterval(
      () => setSlide((current) => (current + 1) % SLIDES.length),
      SLIDE_PAUSE,
    );
    return () => clearInterval(timer);
  }, []);

  // The refusal reported on return from Microsoft, carried like any error.
  useEffect(() => {
    if (initialError) notifyError(initialError);
  }, [initialError]);

  const incomplete =
    mode === "setup"
      ? passwordIssues(password).length > 0 || password !== confirmation
      : !username.trim() || !password;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === "microsoft") return;
    setBusy(true);
    try {
      onAuthenticated(
        mode === "setup"
          ? await api.setup({ password })
          : await api.login(username.trim(), password),
      );
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (next: LoginMode) => {
    setMode(next);
    setPassword("");
    setConfirmation("");
  };

  return (
    // The image on the left 60%, the form centred on the right 40%.
    <Flex mih="100vh" bg="#1f1f1f">
      {/* 60% of the page minus its 20px margins on either side. */}
      <Box
        flex="none"
        w="calc(60% - 40px)"
        m={20}
        p={30}
        visibleFrom="sm"
        pos="relative"
        style={{
          borderRadius: 10,
          background: "url(/background.jpg) center / cover no-repeat",
        }}
      >
        <div className={classes.zone}>
          {STARS.map((star, i) => (
            <span
              key={i}
              className={classes.star}
              style={
                {
                  "--top": `${star.top}px`,
                  "--left": star.left,
                  "--length": `${star.length}px`,
                  "--alpha": star.alpha,
                  "--delay": `${star.delay}s`,
                  "--duration": `${star.duration}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>
        <Logo w={40} />
        {/* As high as the Milo logo. */}
        <Anchor
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          pos="absolute"
          top={30}
          right={30}
          aria-label="GitHub"
        >
          <img
            src="/github.svg"
            alt=""
            style={{
              height: MILO_LOGO_HEIGHT,
              display: "block",
            }}
          />
        </Anchor>
        {/* The texts, and under them one bar per text: the current one's
            is wider and opaque. */}
        <Box pos="absolute" bottom={30} left={0} right={0}>
          {/* The texts stacked in the same cell: only the current one is
              visible. */}
          <Box mb={100} style={{ display: "grid" }}>
            {SLIDES.map((text, i) => (
              <Text
                key={text}
                fz={i === SLIDES.length - 1 ? LAST_SLIDE_SIZE : SLIDE_SIZE}
                fw={200}
                lh={1.2}
                c="white"
                ta="center"
                style={{
                  gridArea: "1 / 1",
                  // A one-line text sits at the middle of the two-line ones.
                  alignSelf: "center",
                  whiteSpace: "pre-line",
                  ...slideStyle(i, slide),
                }}
              >
                {text}
              </Text>
            ))}
          </Box>
          <Group gap={5} justify="center">
            {SLIDES.map((text, i) => (
              <Box
                key={text}
                w={i === slide ? 30 : 20}
                h={3}
                bg={i === slide ? "white" : "rgba(255, 255, 255, 0.3)"}
                style={{
                  borderRadius: 3,
                  transition: `width ${SLIDE_FADE}ms ease, background-color ${SLIDE_FADE}ms ease`,
                }}
              />
            ))}
          </Group>
        </Box>
      </Box>
      <Center flex="none" w={{ base: "100%", sm: "40%" }} p="md">
        <Box p={40} w="100%" maw={420}>
          <form onSubmit={submit}>
            <Stack gap="md">
              <Stack
                align="center"
                gap="md"
                pt={35}
                pb={mode === "setup" ? 20 : 40}
              >
                <Logo variant={1} h={176} />
                {mode === "setup" && (
                  <Text size="sm" c="dimmed" ta="center" pt={30}>
                    Saisissez un mot de passe spécifique
                    <br />
                    au compte d'administration de Milo
                  </Text>
                )}
                {mode === "admin" && entra && (
                  <Text size="sm" c="dimmed" ta="center">
                    Compte d'administration, pour le paramétrage.
                  </Text>
                )}
              </Stack>


              {mode === "microsoft" && (
                // A link and not a call: the browser leaves the application
                // for Microsoft's page, and comes back with its session.
                <Button
                  component="a"
                  href={entraLoginUrl}
                  color="teal"
                  leftSection={<IconBrandWindows size={18} />}
                  fullWidth
                >
                  Se connecter avec Microsoft
                </Button>
              )}

              {mode === "admin" && (
                <TextInput
                  label="Identifiant"
                  value={username}
                  onChange={(e) => setUsername(e.currentTarget.value)}
                  required
                />
              )}

              {mode !== "microsoft" && (
                <PasswordInput
                  label="Mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  required
                  data-autofocus
                />
              )}

              {mode === "setup" && (
                <>
                  <PasswordInput
                    label="Vérification du mot de passe"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.currentTarget.value)}
                    required
                  />
                  <PasswordRules password={password} confirmation={confirmation} />
                </>
              )}

              {mode !== "microsoft" && (
                <Button
                  type="submit"
                  color="teal"
                  loading={busy}
                  disabled={incomplete}
                  fullWidth
                  mt="md"
                >
                  {mode === "setup" ? "Créer le compte admin" : "Se connecter"}
                </Button>
              )}

              {mode === "microsoft" && (
                <Anchor
                  component="button"
                  type="button"
                  size="sm"
                  ta="center"
                  c="dimmed"
                  onClick={() => switchTo("admin")}
                >
                  Compte d'administration
                </Anchor>
              )}
              {mode === "admin" && entra && (
                <Anchor
                  component="button"
                  type="button"
                  size="sm"
                  ta="center"
                  onClick={() => switchTo("microsoft")}
                >
                  Retour à la connexion Microsoft
                </Anchor>
              )}
            </Stack>
          </form>
        </Box>
      </Center>
    </Flex>
  );
}
