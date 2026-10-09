import {
  Alert,
  Anchor,
  Box,
  Button,
  Center,
  CopyButton,
  Group,
  Loader,
  Paper,
  PasswordInput,
  PinInput,
  Stack,
  Stepper,
  Text,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
// The title's font, served with the application: latin, semi-bold only.
import "@fontsource/google-sans/latin-600.css";
import { IconAlertCircle, IconCheck, IconCopy, IconX } from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ENTRA_CHECKS } from "@milo/shared";
import type { EntraCheck } from "@milo/shared";
import type { CSSProperties, ReactNode } from "react";
import { api } from "../api";
import windowClasses from "../assets/styles/SettingsModal.module.css";
import classes from "../assets/styles/FirstSetup.module.css";
import Logo from "../components/ui/Logo";
import Footer from "../components/ui/Footer";
import SettingsIntro from "../components/settings/SettingsIntro";
import { errorMessage, notifyError } from "../lib/errors";
import { THEME_SCOPE_ATTRIBUTE } from "../lib/themeWindow";
import { GREEN, NEUTRAL_HOVER, RED } from "../themes/colors";

// The "admin" account's first setup, as long as the Entra application or the
// sending address is missing: Milo's address, the application — checked
// with each permission it needs —, then the sending address, confirmed with
// a code sent to its mailbox. Validated, the Settings take over
// (App: SettingsModal on the Administration tab).

/** The path the server receives Microsoft's sign-ins on (EntraTab). */
const REDIRECT_PATH = "/api/auth/entra/callback";

/** The container's width, in px, and its padding. */
const WIDTH = 740;
const PADDING = 50;

/** The slide from one step to the next, in ms. */
const SLIDE = 350;

/** How long the check stays in view, all granted, before the next step slides in. */
const GRANTED_PAUSE = 800;

/** How long Milo's address has to answer, in ms. */
const URL_TIMEOUT = 5000;

/** The dark gray box around a step's text and fields. */
const STEP_BOX: CSSProperties = {
  backgroundColor: "light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-6))",
  borderRadius: 10,
  padding: 30,
};

/**
 * The fields take the page's background, against the gray box; their
 * labels, the descriptions' color (swapped with INTRO_COLOR).
 */
const FIELD_STYLES = {
  // A slightly tighter radius than Mantine's 4 px.
  input: { backgroundColor: "var(--mantine-color-body)", borderRadius: 3 },
  label: { color: "var(--milo-settings-description-text)" },
};

/**
 * The code's boxes: twice Mantine's 36 px. Set through its own variable,
 * which sizes each box and not only the field inside; Mantine writes it from
 * `size`, so only `vars` overrides it.
 */
const PIN_VARS = () => ({ root: { "--pin-input-size": "72px" } });

/** The code's digits, at their size, in fields filling their box rounded as the step's box. */
const PIN_STYLES = {
  input: {
    ...FIELD_STYLES.input,
    width: "100%",
    height: "100%",
    minHeight: 0,
    fontSize: 32,
    borderRadius: 10,
  },
};

/** The descriptions take the fields' labels' color. */
const INTRO_COLOR = "var(--mantine-color-text)";

const STEPS = ["Domaine", "Application Entra", "Messagerie", "Résumé"];

/** True for an http(s) address. */
/**
 * A well-formed http(s) address: a domain name (or localhost, or an IPv4
 * address), an optional port, an optional path.
 */
const URL_FORMAT =
  /^https?:\/\/(localhost|([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}|\d{1,3}(\.\d{1,3}){3})(:\d{1,5})?(\/[^\s]*)?$/i;

/** True for a well-formed http(s) address. */
const isHttpUrl = (url: string): boolean => URL_FORMAT.test(url);

/** A well-formed e-mail address: a local part, then a domain name. */
const EMAIL_FORMAT =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

const isEmail = (email: string): boolean => EMAIL_FORMAT.test(email);

/**
 * A step of the check not reached yet, running, answered (EntraTab), or
 * skipped: Microsoft refused the application, it could not be checked.
 */
type StepState = "pending" | "running" | "skipped" | EntraCheck;

/**
 * Does Milo answer at this address? Its public setup state, read from the
 * browser: the address the people will use is the one being typed.
 */
async function answersAsMilo(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/auth/setup`, {
      signal: AbortSignal.timeout(URL_TIMEOUT),
    });
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null && "needs_setup" in body;
  } catch {
    return false;
  }
}

/**
 * Microsoft's message without what follows it for its support — "Trace ID",
 * "Correlation ID", "Timestamp": only the error's text remains.
 */
const withoutTrace = (error: string): string =>
  error.replace(/\s*(Trace ID|Correlation ID|Timestamp)\s*:[\s\S]*$/i, "").trim() || error;

interface FirstSetupProps {
  /** Validated: the Settings open on the Administration tab. */
  onDone: () => void;
  onLogout: () => void;
}

export default function FirstSetup({ onDone, onLogout }: FirstSetupProps) {
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);

  // Step 1: Milo's address, without its trailing slashes.
  const [typedUrl, setTypedUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const url = typedUrl.trim().replace(/\/+$/, "");
  // "Suivant" only for a well-formed address.
  const urlValid = isHttpUrl(url);

  // Step 2: the application. The secret never comes back from the server:
  // left empty, the saved one stays.
  const [clientId, setClientId] = useState("");
  const [tenant, setTenant] = useState("");
  const [secret, setSecret] = useState("");
  const [hasSecret, setHasSecret] = useState(false);
  const [checks, setChecks] = useState<Record<string, StepState> | null>(null);
  // The check takes the fields' place, at the height they had: the window
  // keeps its size.
  const applicationBox = useRef<HTMLDivElement>(null);
  const [lockedHeight, setLockedHeight] = useState<number | undefined>(undefined);

  // Step 3: the sending address, then the code its mailbox received.
  const [sender, setSender] = useState("");
  const [codeSentTo, setCodeSentTo] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  // The code takes the address's place, at the height it had (as the
  // application's check).
  const mailBox = useRef<HTMLDivElement>(null);
  const [mailHeight, setMailHeight] = useState<number | undefined>(undefined);

  // What is already saved, from a setup left halfway: the fields start from it.
  useEffect(() => {
    api.getEntraSettings().then(
      (entra) => {
        setClientId(entra.client_id);
        setTenant(entra.tenant);
        setHasSecret(entra.has_secret);
        setSender(entra.mail_sender);
      },
      (e) => notifyError(errorMessage(e)),
    );
  }, []);

  /** Step 1: a valid address, where Milo answers, saved. */
  const checkUrl = async () => {
    if (!isHttpUrl(url)) return;
    setBusy(true);
    setUrlError(null);
    try {
      if (!(await answersAsMilo(url))) {
        setUrlError("Milo ne répond pas à cette adresse");
        return;
      }
      await api.updateMiloSettings({ url });
      setTypedUrl(url);
      setActive(1);
    } catch (e) {
      setUrlError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const applicationComplete =
    Boolean(clientId.trim() && tenant.trim()) && (hasSecret || Boolean(secret));

  /**
   * Step 2: saves the application, then runs the steps one by one, as
   * EntraTab does. Microsoft refusing the application itself stops there.
   * All granted, Milo is connected and the next step comes.
   */
  const checkApplication = async () => {
    setBusy(true);
    try {
      const saved = await api.updateEntraSettings({
        client_id: clientId.trim(),
        tenant: tenant.trim(),
        ...(secret ? { secret } : {}),
      });
      setHasSecret(saved.has_secret);
      setSecret("");
      setLockedHeight(applicationBox.current?.offsetHeight);
      const steps: Record<string, StepState> = Object.fromEntries(
        ENTRA_CHECKS.map((c) => [c.value, "pending" as StepState]),
      );
      setChecks({ ...steps });
      for (const { value } of ENTRA_CHECKS) {
        steps[value] = "running";
        setChecks({ ...steps });
        let result: EntraCheck;
        try {
          result = await api.checkEntra(value);
        } catch (e) {
          result = { ok: false, error: errorMessage(e) };
        }
        steps[value] = result;
        setChecks({ ...steps });
        if (value === "token" && !result.ok) break;
      }
      // Microsoft refused the application: nothing else could be checked,
      // every other step gets a gray cross.
      for (const { value } of ENTRA_CHECKS) {
        if (steps[value] === "pending") steps[value] = "skipped";
      }
      setChecks({ ...steps });
      const granted = ENTRA_CHECKS.every((c) => {
        const step = steps[c.value];
        return typeof step === "object" && step.ok;
      });
      if (!granted) return;
      await api.connectEntra();
      // All green for a moment, then the next step; the form comes back
      // once out of sight.
      await new Promise((r) => setTimeout(r, GRANTED_PAUSE));
      setActive(2);
      setTimeout(leaveCheck, SLIDE);
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** Back to the application's fields, to correct them. */
  const leaveCheck = () => {
    setChecks(null);
    setLockedHeight(undefined);
  };

  /** Step 3: a code sent from the address to itself. */
  const sendCode = async () => {
    const email = sender.trim();
    setBusy(true);
    try {
      await api.sendSenderCode(email);
      setMailHeight(mailBox.current?.offsetHeight);
      setCodeSentTo(email);
      setCode("");
      setCodeError(false);
      notifications.show({ color: "teal", message: `Code envoyé à ${email}.` });
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** Back to the sending address, to correct it or have a new code sent. */
  const leaveCode = () => {
    setCodeSentTo("");
    setCode("");
    setCodeError(false);
    setMailHeight(undefined);
  };

  /** The code received: right, the address becomes the sending address. */
  const confirmCode = async (value = code) => {
    setBusy(true);
    try {
      await api.confirmSender(codeSentTo, value);
      setActive(3);
      // The address comes back once out of sight.
      setTimeout(leaveCode, SLIDE);
    } catch (e) {
      setCodeError(true);
      notifyError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // The sending address changed after the code was sent: a new one is needed.
  const codePending = Boolean(codeSentTo) && sender.trim() === codeSentTo;
  const canSend = isEmail(sender.trim()) && !busy;

  // The slider's height follows the step shown, whatever the others hold.
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const [height, setHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const panel = panels.current[active];
    if (!panel) return undefined;
    const measure = () => setHeight(panel.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [active]);

  const redirection = isHttpUrl(url) ? `${url}${REDIRECT_PATH}` : "";

  /** The check, under the application's fields: each step as it is answered. */
  // What Microsoft refused, step by step, for the alert under the check.
  const refusals = checks
    ? ENTRA_CHECKS.flatMap(({ value, label }) => {
        const step = checks[value];
        return typeof step === "object" && !step.ok && step.error
          ? [{ label, error: withoutTrace(step.error) }]
          : [];
      })
    : [];
  const checkRunning = Object.values(checks ?? {}).some((s) => s === "pending" || s === "running");
  const checkFailed = Boolean(checks) && !checkRunning && ENTRA_CHECKS.some((c) => {
    const step = checks?.[c.value];
    return step === "skipped" || (typeof step === "object" && !step.ok);
  });

  const checkList = checks && (
    <Stack gap={4}>
      {ENTRA_CHECKS.filter((c) => checks[c.value] !== "pending").map(({ value, label }) => {
        const step = checks[value];
        const done = typeof step === "object";
        return (
          <Group key={value} gap="sm" wrap="nowrap" align="flex-start">
            <div style={{ width: 18, display: "flex", justifyContent: "center", paddingTop: 2 }}>
              {step === "running" ? (
                <Loader size={14} color="gray" />
              ) : step === "skipped" ? (
                <IconX size={16} color="var(--mantine-color-dimmed)" />
              ) : done ? (
                step.ok ? (
                  <IconCheck size={16} color={GREEN} />
                ) : (
                  <IconX size={16} color={RED} />
                )
              ) : null}
            </div>
            <Text
              size="sm"
              c={step === "skipped" ? "dimmed" : done ? (step.ok ? GREEN : RED) : undefined}
              fw={done ? 500 : undefined}
            >
              {label}
            </Text>
          </Group>
        );
      })}
    </Stack>
  );

  /** The check, in the fields' place: the steps, and the refusals at the bottom. */
  const checkView = checks && (
    <Stack gap="md" style={{ flex: 1 }}>
      <Text size="sm" c={INTRO_COLOR}>
        {checkRunning ? "Vérification en cours…" : "Vérification terminée."}
      </Text>
      {checkList}
      {refusals.length > 0 && (
        // The themes' information alert ("Info bulle"), which imposes its own
        // top margin: the wrapper holds it at the bottom.
        <Box mt="auto">
          <Alert
            variant="default"
            color="red"
            icon={<IconAlertCircle size={18} />}
            title={refusals.length > 1 ? "Erreurs" : "Erreur"}
          >
            <Stack gap={4}>
              {refusals.map(({ label, error }) => (
                <Text key={label} size="sm" style={{ overflowWrap: "anywhere" }}>
                  {refusals.length > 1 || label !== "Connexion à Microsoft" ? `${label} : ${error}` : error}
                </Text>
              ))}
            </Stack>
          </Alert>
        </Box>
      )}
    </Stack>
  );

  const steps: ReactNode[] = [
    <Stack gap="md" key="domain" style={STEP_BOX}>
      <SettingsIntro c={INTRO_COLOR}>
        Saisir l'adresse du site Internet de Milo, telle qu'elle apparaît dans le navigateur.
        Pour obtenir dynamiquement les changements depuis Entra, une adresse https est requise
        par Microsoft.
      </SettingsIntro>
      <TextInput
        aria-label="Adresse du site Internet"
        styles={FIELD_STYLES}
        type="url"
        placeholder="https://milo.contoso.com"
        value={typedUrl}
        onChange={(e) => {
          setTypedUrl(e.currentTarget.value);
          setUrlError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !busy && urlValid) void checkUrl();
        }}
        error={urlError}
        disabled={busy}
      />
    </Stack>,

    <Stack
      gap="md"
      key="application"
      ref={applicationBox}
      style={{ ...STEP_BOX, minHeight: lockedHeight }}
    >
      {checkView || (
        <>
          <SettingsIntro c={INTRO_COLOR}>
            Inscrire dans Entra une application avec les droits nécessaires pour Milo. Utiliser
            l'adresse de redirection indiquée ci-dessous et reporter les paramètres nécessaires comme
            précisé en détail dans la documentation.
          </SettingsIntro>
          <TextInput
            label="URL de redirection"
            value={redirection}
            readOnly
            styles={FIELD_STYLES}
            rightSection={
              <CopyButton value={redirection}>
                {({ copied, copy }) => (
                  <Button
                    variant="subtle"
                    color="gray"
                    size="compact-sm"
                    onClick={copy}
                    aria-label="Copier l'URL de redirection"
                    style={{ "--button-hover": NEUTRAL_HOVER } as CSSProperties}
                  >
                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  </Button>
                )}
              </CopyButton>
            }
          />
          <TextInput
            label="ID d'application"
            value={clientId}
            onChange={(e) => setClientId(e.currentTarget.value)}
            disabled={busy}
            styles={FIELD_STYLES}
          />
          <TextInput
            label="ID de locataire"
            value={tenant}
            onChange={(e) => setTenant(e.currentTarget.value)}
            disabled={busy}
            styles={FIELD_STYLES}
          />
          <PasswordInput
            label="Secret"
            placeholder={hasSecret ? "Enregistré — laisser vide pour le conserver" : undefined}
            value={secret}
            onChange={(e) => setSecret(e.currentTarget.value)}
            disabled={busy}
            styles={FIELD_STYLES}
          />
        </>
      )}
    </Stack>,

    <Stack
      gap="md"
      key="mail"
      ref={mailBox}
      style={{ ...STEP_BOX, minHeight: mailHeight }}
    >
      {codePending ? (
        // Only the code, in the address's place, in the middle of the box —
        // raised by 15 px.
        <Stack
          gap="md"
          align="center"
          justify="center"
          style={{ flex: 1, position: "relative", top: -15 }}
        >
          <Text size="sm" c={INTRO_COLOR} ta="center">
            Confirmation du code
          </Text>
          <PinInput
            length={4}
            type="number"
            oneTimeCode
            value={code}
            error={codeError}
            disabled={busy}
            vars={PIN_VARS}
            styles={PIN_STYLES}
            // One box per digit, 15 px apart.
            gap={15}
            onChange={(value) => {
              setCode(value);
              setCodeError(false);
            }}
            onComplete={(value) => void confirmCode(value)}
          />
        </Stack>
      ) : (
        <>
          <SettingsIntro c={INTRO_COLOR}>
            Indiquer l’adresse e-mail à utiliser pour l’envoi des messages de Milo. Un code de
            vérification sera envoyé à cette adresse afin de valider son fonctionnement et
            autoriser son utilisation.
          </SettingsIntro>
          <TextInput
            label="Adresse d'envoi"
            type="email"
            placeholder="milo@…"
            value={sender}
            onChange={(e) => setSender(e.currentTarget.value)}
            styles={FIELD_STYLES}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSend) void sendCode();
            }}
            disabled={busy}
          />
        </>
      )}
    </Stack>,

    // A green check in a circle, then the text, centered against it.
    <Group key="summary" gap={0} wrap="nowrap" align="center" style={STEP_BOX}>
      <ThemeIcon color={GREEN} size={64} radius="xl" mr={30} style={{ flexShrink: 0 }}>
        <IconCheck size={36} />
      </ThemeIcon>
      <Text size="sm" c={INTRO_COLOR}>
        Milo est correctement configuré et connecté à Microsoft Entra. Pour terminer la
        configuration, définissez les utilisateurs ou groupes d’utilisateurs autorisés à
        administrer l’application.
      </Text>
    </Group>,
  ];

  /** The green button of each step. */
  const actions: { label: string; onClick: () => void; disabled: boolean }[] = [
    { label: "Suivant", onClick: () => void checkUrl(), disabled: !urlValid },
    checkFailed
      ? { label: "Réessayer", onClick: () => void checkApplication(), disabled: false }
      : { label: "Suivant", onClick: () => void checkApplication(), disabled: !applicationComplete },
    // "Suivant" sends the code to a well-formed address, then, the code
    // asked for, checks it.
    codePending
      ? { label: "Suivant", onClick: () => void confirmCode(), disabled: code.length < 4 }
      : { label: "Suivant", onClick: () => void sendCode(), disabled: !canSend },
    { label: "Terminer", onClick: onDone, disabled: false },
  ];
  const action = actions[active] ?? actions[0]!;

  return (
    <Center mih="100vh" p="md">
      {/* The Settings window's look, its themes' variables included. */}
      <Paper
        className={windowClasses.window}
        {...{ [THEME_SCOPE_ATTRIBUTE]: "settings" }}
        withBorder
        shadow="md"
        radius="md"
        p={PADDING}
        w={WIDTH}
        maw="100%"
      >
        {/* Milo's logo, and the page's title to its right. */}
        <Group gap="md" wrap="nowrap">
          <Logo h={50} />
          <Text fz={36} fw={600} lh={1} ff="'Google Sans', sans-serif" c="white" pos="relative" top={10}>
            Configuration
          </Text>
        </Group>

        <Stepper
          active={active}
          onStepClick={(step) => {
            if (step < active && !busy) setActive(step);
          }}
          allowNextStepsSelect={false}
          color="teal"
          size="sm"
          mt={50}
          mb={50}
        >
          {STEPS.map((label, i) => (
            <Stepper.Step key={label} label={`Étape ${i + 1}`} description={label} />
          ))}
        </Stepper>

        {/* The steps side by side, the one shown slid into view. */}
        <Box
          style={{
            overflow: "hidden",
            height,
            transition: `height ${SLIDE}ms ease`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              transform: `translateX(-${active * 100}%)`,
              transition: `transform ${SLIDE}ms ease`,
            }}
          >
            {steps.map((content, i) => (
              <div
                key={i}
                ref={(el) => {
                  panels.current[i] = el;
                }}
                // The others stay out of reach of the keyboard.
                inert={i !== active}
                style={{ flex: "0 0 100%", minWidth: 0, padding: 2 }}
              >
                {content}
              </div>
            ))}
          </div>
        </Box>

        <Footer>
          {active === 3 ? null : active === 0 ? (
            // A plain text, gray on hover: no background, no padding.
            <Anchor
              component="button"
              type="button"
              onClick={onLogout}
              size="sm"
              underline="never"
              className={classes.link}
              mr="auto"
            >
              Se déconnecter
            </Anchor>
          ) : (
            // Same plain text as "Se déconnecter". From a check, back to
            // the application's fields.
            <Anchor
              component="button"
              type="button"
              onClick={() => {
                if (active === 1 && checks) leaveCheck();
                else if (active === 2 && codePending) leaveCode();
                else setActive(active - 1);
              }}
              disabled={busy}
              size="sm"
              underline="never"
              className={classes.link}
              mr="auto"
            >
              Précédent
            </Anchor>
          )}
          <Button color="teal" onClick={action.onClick} disabled={action.disabled} loading={busy}>
            {action.label}
          </Button>
        </Footer>
      </Paper>
    </Center>
  );
}
