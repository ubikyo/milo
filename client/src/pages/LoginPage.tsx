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
import {
  normalizeUsername,
  passwordIssues,
  usernameIssues,
} from "@milo/shared";
import scene from "../assets/styles/LoginScene.module.css";
import logoClasses from "../assets/styles/Logo.module.css";
import classes from "../assets/styles/LoginStars.module.css";
import Logo from "../components/ui/Logo";
import PasswordRules from "../components/ui/PasswordRules";
import UsernameRules from "../components/ui/UsernameRules";
import { errorMessage, notifyError } from "../lib/errors";
import type { AuthResult } from "@milo/shared";
import type { CSSProperties, FormEvent } from "react";

/**
 * "setup": the "admin" account's password, on the very first opening. "microsoft": everyone's login. "admin": that
 * of the "admin" account, which is only used for settings.
 */
type LoginMode = "setup" | "microsoft" | "admin";

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
/** The "Créer le compte" button's entrance once everything is valid, in ms. */
const BUTTON_REVEAL = 300;

/** Shown or hidden with the "Créer le compte" button's animation. */
function reveal(shown: boolean): CSSProperties {
  return {
    opacity: shown ? 1 : 0,
    transform: shown ? "none" : "translateY(8px) scale(0.96)",
    visibility: shown ? "visible" : "hidden",
    transition: `opacity ${BUTTON_REVEAL}ms ease, transform ${BUTTON_REVEAL}ms ease, visibility ${BUTTON_REVEAL}ms`,
  };
}

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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  // The field whose rules are shown at the creation: the last one entered,
  // kept on blur so that the rules do not flicker from one field to the next.
  const [ruleField, setRuleField] = useState<"username" | "password" | null>(
    null,
  );
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
      ? usernameIssues(username).length > 0 ||
        passwordIssues(password).length > 0 ||
        password !== confirmation
      : !username.trim() || !password;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === "microsoft") return;
    setBusy(true);
    try {
      onAuthenticated(
        mode === "setup"
          ? await api.setup({ username: normalizeUsername(username), password })
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
          // The image's layers go under the content with z-index -1.
          isolation: "isolate",
        }}
      >
        <div className={scene.scene}>
          <div className={scene.frame}>
            <img src="/background.png" alt="" className={scene.layer} />
            <DuneFlag />
            <img src="/background-mask.png" alt="" className={scene.layer} />
          </div>
        </div>
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
          href="https://github.com/ubikyo/milo"
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
                    Création du compte administration de Milo
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

              {mode !== "microsoft" && (
                <TextInput
                  label="Identifiant"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.currentTarget.value)}
                  onFocus={() => setRuleField("username")}
                  required
                  data-autofocus
                />
              )}

              {mode !== "microsoft" && (
                <PasswordInput
                  label="Mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  onFocus={() => setRuleField("password")}
                  required
                />
              )}

              {mode === "setup" && (
                <PasswordInput
                  label="Vérification du mot de passe"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.currentTarget.value)}
                  onFocus={() => setRuleField("password")}
                  required
                />
              )}

              {mode === "admin" && (
                <Button
                  type="submit"
                  color="teal"
                  loading={busy}
                  disabled={incomplete}
                  fullWidth
                  mt="md"
                >
                  Se connecter
                </Button>
              )}

              {/* 30px under the last field, the Stack's 16px included. The
                  button keeps its place while hidden, and the rules sit there
                  out of the flow: nothing in the form moves. Once everything
                  is valid, the rules fade out as the button comes in. */}
              {mode === "setup" && (
                <Box pos="relative" mt={14}>
                  <Button
                    type="submit"
                    color="teal"
                    loading={busy}
                    disabled={incomplete}
                    fullWidth
                    aria-hidden={incomplete}
                    tabIndex={incomplete ? -1 : undefined}
                    style={reveal(!incomplete)}
                  >
                    Créer le compte
                  </Button>
                  <Box
                    pos="absolute"
                    top={0}
                    left={0}
                    right={0}
                    style={{ ...reveal(incomplete), pointerEvents: "none" }}
                  >
                    {ruleField === "username" && (
                      <UsernameRules username={username} />
                    )}
                    {ruleField === "password" && (
                      <PasswordRules
                        password={password}
                        confirmation={confirmation}
                      />
                    )}
                  </Box>
                </Box>
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

/**
 * Milo-flag.svg, copied rather than loaded as an image so its canvas can wave
 * like the logo's. The canvas is detached from the pole and overlaps it by a
 * point, so that no gap opens between the two.
 */
function DuneFlag() {
  return (
    <svg
      className={`${logoClasses.animatedLogo} ${scene.flag}`}
      viewBox="0 0 167 247"
      aria-hidden
    >
      <g transform="matrix(0.387515,0,0,0.503321,0,0)">
        <g
          transform="matrix(4.43118,0,0,3.04951,-5495.36,-4437.04)"
          fill="rgb(35,182,151)"
        >
          <path d="M1257,1617.88L1240.16,1617.88L1240.16,1460.79C1240.16,1459.25 1240.7,1457.78 1241.67,1456.7C1242.64,1455.61 1243.96,1455 1245.33,1455L1257,1455Z" />
          <path
            className={logoClasses.flag}
            d="M1256,1455L1337.07,1459L1313.83,1492.92L1337.07,1526.84L1256,1526.84Z"
          />
        </g>
      </g>
    </svg>
  );
}
