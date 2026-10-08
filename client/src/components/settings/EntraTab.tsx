import {
  Badge,
  Button,
  CopyButton,
  Group,
  Loader,
  Menu,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconPlugConnected,
  IconPlugConnectedX,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import SenderField from "./SenderField";
import { notifications } from "@mantine/notifications";
import { emptyEntraSettings, ENTRA_CHECKS } from "@milo/shared";
import { api } from "../../api";
import { GREEN, NEUTRAL_HOVER, RED } from "../../themes/colors";
import { ACTIONS_BUTTON_STYLE } from "../../themes/menus";
import { errorMessage, notifyError } from "../../lib/errors";
import type {
  EntraCheck,
  EntraSettings,
  EntraSettingsInput,
  EntraStatus,
} from "@milo/shared";
import type { CSSProperties } from "react";
import SettingsIntro from "./SettingsIntro";

/** What the connection status shows, depending on what the server says about it. */
const STATES: Record<
  EntraStatus["state"],
  { label: string; color: string }
> = {
  connected: { label: "Connecté", color: "green" },
  error: { label: "Refusé", color: "red" },
  disconnected: { label: "Déconnecté", color: "gray" },
  unconfigured: { label: "Non configuré", color: "gray" },
};

/**
 * What a saved secret's field shows: the server never sends it back,
 * so its presence is simulated with dots.
 */
const MASK = "********";

/** The path the server receives Microsoft's sign-ins on. */
const REDIRECT_PATH = "/api/auth/entra/callback";

/** The gap, in px, between the typed address and the redirect path. */
const SUFFIX_GAP = 2;

/** A canvas to measure text with, created on first use. */
let measuring: CanvasRenderingContext2D | null = null;

/**
 * Where the redirect path goes over the address field, in px from the
 * field's container: right after the typed text, measured in the input's
 * own font, and up to the right section (copy button).
 */
function suffixPlace(input: HTMLInputElement): { left: number; width: number } {
  const cs = getComputedStyle(input);
  measuring ??= document.createElement("canvas").getContext("2d");
  let text = 0;
  if (measuring) {
    measuring.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    text = measuring.measureText(input.value).width;
  }
  const start = input.offsetLeft + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
  const end = input.offsetLeft + input.offsetWidth - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
  const left = start + text - input.scrollLeft + SUFFIX_GAP;
  return { left, width: Math.max(0, end - left) };
}

/**
 * Input in a field that still shows the mask: only what the person
 * typed is kept. The field selects the mask on focus, so typing
 * usually replaces it; if the cursor landed inside it, the mask's
 * dots left around the typed text are removed, and erasing empties it.
 */
function unmasked(value: string): string {
  if (/^\**$/.test(value) && value.length < MASK.length) return "";
  if (value.length <= MASK.length) return value;
  let rest = MASK.length;
  let typed = "";
  for (const c of value) {
    if (c === "*" && rest > 0) rest -= 1;
    else typed += c;
  }
  return rest === 0 ? typed : value;
}

/**
 * Where the connection check stands: the form, the steps running, then
 * their outcome — a required permission missing, or all of them granted.
 */
export type EntraCheckPhase = "form" | "checking" | "failed" | "passed";

/** What the window's buttons do with the check (SettingsModal). */
export interface EntraCheckControls {
  /** Saves what is typed, then runs the check. */
  connect: () => void;
  /** Everything is granted: reconnects Milo, back to the form. */
  next: () => void;
  /** Back to the form, to correct it. */
  back: () => void;
}

/** A step not reached yet, running, or answered. */
type StepState = "pending" | "running" | EntraCheck;

interface EntraTabProps {
  /**
   * Where the tab deposits its save function, called by the window's
   * "Enregistrer" button (SettingsModal). It returns false if the server
   * refused: the message is then shown in the tab.
   */
  saveRef?: { current: (() => Promise<boolean>) | null };
  /**
   * The slot reserved to the right of the "Entra" title, in the panel's
   * header (SettingsModal): the "Actions" menu is rendered there.
   */
  actionsTarget?: HTMLElement | null;
  /**
   * Milo's connection to Entra, on each check (null while checking): the
   * window only shows the administration and the backup once connected.
   */
  onStatus?: (status: EntraStatus | null) => void;
  /** The saved sending address, once connected: the window requires it to save. */
  onSender?: (address: string) => void;
  /** Where the tab deposits the check's controls, for the window's buttons. */
  checkRef?: { current: EntraCheckControls | null };
  /** Where the check stands: the window's buttons follow it. */
  onPhase?: (phase: EntraCheckPhase) => void;
}

/**
 * The Entra application Milo relies on: everyone's sign-in, directory
 * reading, mail.
 *
 * The secret never comes back down from the server: the field shows a mask of
 * dots when it is saved. It is only sent if it is touched, which
 * `secretTouched` tracks: without it, saving the client ID would erase the
 * secret.
 */
export default function EntraTab({
  saveRef,
  actionsTarget,
  onStatus,
  onSender,
  checkRef,
  onPhase,
}: EntraTabProps) {
  const [settings, setSettings] = useState<EntraSettings>(emptyEntraSettings());
  const [secret, setSecret] = useState("");
  const [secretTouched, setSecretTouched] = useState(false);
  // Nothing has changed: "Enregistrer" then has nothing to send.
  const [modified, setModified] = useState(false);
  // Until the server has responded, the tab shows nothing: displayed
  // with its default values, it would show empty fields that would
  // fill in all at once.
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  // The state of Milo's connection to Entra: null until it is known.
  const [state, setState] = useState<EntraStatus | null>(null);

  const readState = useCallback(() => {
    setState(null);
    api
      .getEntraStatus()
      .then(setState)
      .catch((e) => notifyError(errorMessage(e)));
  }, []);

  useEffect(() => {
    readState();
  }, [readState]);

  useEffect(() => {
    onStatus?.(state);
  }, [onStatus, state]);

  const reload = useCallback(async () => {
    try {
      const readItems = await api.getEntraSettings();
      setSettings(readItems);
      setModified(false);
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      // Even if the read failed: the message is better than an empty tab.
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const updateStatement = (fields: Partial<EntraSettings>) => {
    setSettings((r) => ({ ...r, ...fields }));
    setModified(true);
  };

  /** What goes to the server: the settings, and the secret only if it was touched. */
  const toSend = (): EntraSettingsInput => ({
    client_id: settings.client_id,
    tenant: settings.tenant,
    ...(secretTouched ? { secret } : {}),
  });

  /** Saves and returns true if it went through: the actions that follow depend on it. */
  const save = async (): Promise<boolean> => {
    if (!modified) return true;

    setBusy(true);
    try {
      const saved = await api.updateEntraSettings(toSend());
      setSettings(saved);
      setSecretTouched(false);
      setSecret("");
      setModified(false);
      // New credentials change Microsoft's response.
      readState();
      return true;
    } catch (e) {
      notifyError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Without a dependency array: `save` closes over the form's state and
  // therefore changes on every render. The window must call the
  // latest one, not that of the first display.
  useEffect(() => {
    if (!saveRef) return undefined;
    saveRef.current = save;
    return () => {
      saveRef.current = null;
    };
  });

  // The checks apply to what the server has in the database: the display
  // goes with it.
  /** Reconnect with what is typed, or disconnect. */
  const changeConnection = async (connect: boolean) => {
    if (connect && !(await save())) return;
    setBusy(true);
    setState(null);
    try {
      setState(await (connect ? api.connectEntra() : api.disconnectEntra()));
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // The connection check: null shows the form, otherwise each step's state.
  const [checks, setChecks] = useState<Record<string, StepState> | null>(null);
  const [phase, setPhase] = useState<EntraCheckPhase>("form");
  useEffect(() => {
    onPhase?.(phase);
  }, [onPhase, phase]);

  /**
   * Runs the steps one by one, as the server answers them. Microsoft
   * refusing the application itself (wrong IDs or secret) stops there:
   * nothing else can be checked.
   */
  const runCheck = async () => {
    if (!(await save())) return;
    const steps: Record<string, StepState> = Object.fromEntries(
      ENTRA_CHECKS.map((c) => [c.value, "pending" as StepState]),
    );
    setChecks({ ...steps });
    setPhase("checking");
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
      if (value === "token" && !result.ok) {
        notifyError(result.error, "Connexion à Entra refusée");
        break;
      }
    }
    const granted = ENTRA_CHECKS.every(
      (c) => typeof steps[c.value] === "object" && (steps[c.value] as EntraCheck).ok,
    );
    setPhase(granted ? "passed" : "failed");
  };

  const leaveCheck = () => {
    setChecks(null);
    setPhase("form");
  };

  // Same principle as `saveRef`: the latest functions, on every render.
  useEffect(() => {
    if (!checkRef) return undefined;
    checkRef.current = {
      connect: () => void runCheck(),
      next: () => void changeConnection(true).then(leaveCheck),
      back: leaveCheck,
    };
    return () => {
      checkRef.current = null;
    };
  });

  // Milo's own address: the root of the links the e-mails carry, the
  // templates' {{milo.url}}, and of the sign-in redirect. Saved when its
  // field is left, as the sending address (NotificationsTab); empty, the
  // server's (MILO_PUBLIC_URL) applies.
  const [savedUrl, setSavedUrl] = useState("");
  const [typedUrl, setTypedUrl] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);

  useEffect(() => {
    api.getMiloSettings().then(
      (s) => {
        setSavedUrl(s.url);
        setTypedUrl(s.url);
      },
      (e) => notifyError(errorMessage(e)),
    );
  }, []);

  const saveUrl = async () => {
    const url = typedUrl.trim();
    if (url === savedUrl) return setTypedUrl(url);
    setSavingUrl(true);
    try {
      const s = await api.updateMiloSettings({ url });
      setSavedUrl(s.url);
      setTypedUrl(s.url);
      notifications.show({ color: "teal", message: "Adresse de redirection enregistrée." });
    } catch (e) {
      // Refused, the field goes back to the saved address.
      notifyError(errorMessage(e));
      setTypedUrl(savedUrl);
    } finally {
      setSavingUrl(false);
    }
  };

  /**
   * The sign-in redirect address, to register in Azure: Milo's address
   * followed by the path the server listens on (same rule as the server's).
   * Only once the address typed is a valid http(s) one.
   */
  const url = typedUrl.trim().replace(/\/+$/, "");
  const validUrl = /^https?:\/\/[^\s/]+/.test(url) && URL.canParse(url);
  const redirection = validUrl ? `${url}${REDIRECT_PATH}` : "";

  // The redirect path's place, measured after each keystroke and when the
  // field scrolls or changes width.
  const urlInput = useRef<HTMLInputElement>(null);
  const [suffix, setSuffix] = useState<{ left: number; width: number } | null>(null);
  const placeSuffix = useCallback(() => {
    if (urlInput.current) setSuffix(suffixPlace(urlInput.current));
  }, []);
  useLayoutEffect(() => {
    if (validUrl) placeSuffix();
  }, [validUrl, typedUrl, loaded, checks, placeSuffix]);
  useEffect(() => {
    const input = urlInput.current;
    if (!input || !validUrl) return undefined;
    const observer = new ResizeObserver(placeSuffix);
    observer.observe(input);
    return () => observer.disconnect();
  }, [validUrl, loaded, checks, placeSuffix]);

  /**
   * What can be done from here. Same menu as the board tabs'
   * (BoardTabs): nothing justifies two ways of opening a menu in the same
   * application.
   */
  const menuActions = (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <Button
          variant="subtle"
          color="gray"
          rightSection={<IconChevronDown size={14} />}
          disabled={busy || phase === "checking"}
          style={ACTIONS_BUTTON_STYLE}
        >
          Actions
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconPlugConnected size={16} />}
          onClick={() => void runCheck()}
        >
          Se reconnecter
        </Menu.Item>
        <Menu.Item
          leftSection={<IconPlugConnectedX size={16} />}
          onClick={() => void changeConnection(false)}
          disabled={
            !state ||
            state.state === "disconnected" ||
            state.state === "unconfigured"
          }
        >
          Déconnecter
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  /**
   * The connection status, to the left of the "Actions" menu: Microsoft's
   * refusal can be read on hover.
   */
  const statusBadge = state ? (
    <Tooltip
      label={state.error}
      disabled={!state.error}
      multiline
      maw={360}
      withinPortal
    >
      <Badge
        color={STATES[state.state].color}
        variant="filled"
        size="sm"
        radius="sm"
        tt="none"
        fw={600}
      >
        {STATES[state.state].label}
      </Badge>
    </Tooltip>
  ) : (
    <Text size="sm" c="dimmed">
      Vérification…
    </Text>
  );

  /**
   * The secret field. Until it is touched, it shows the mask if
   * a secret is saved — without the eye, which would only show
   * asterisks. Focus selects the mask: typing replaces it.
   */
  const masked = settings.has_secret && !secretTouched;
  const secretField = (
    <PasswordInput
      label="Secret"
      // A quarter of the row: Milo's address takes the rest.
      w="calc((100% - var(--mantine-spacing-md)) / 4)"
      style={{ flexShrink: 0 }}
      value={masked ? MASK : secret}
      visibilityToggleButtonProps={
        masked ? { style: { display: "none" } } : undefined
      }
      onFocus={(e) => {
        if (masked) e.currentTarget.select();
      }}
      onChange={(e) => {
        const input = e.currentTarget.value;
        setSecret(masked ? unmasked(input) : input);
        setSecretTouched(true);
        setModified(true);
      }}
    />
  );

  if (!loaded) return null;

  /**
   * The check, in place of the form: each step in green with a check once
   * granted, in red with a cross when missing.
   */
  const checkView = checks && (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {phase === "checking" ? "Vérification en cours…" : "Vérification terminée."}
      </Text>
      <Stack gap={0}>
      {/* Each step appears when its turn comes. */}
      {ENTRA_CHECKS.filter((c) => checks[c.value] !== "pending").map(({ value, label }) => {
        const step = checks[value];
        const done = typeof step === "object";
        const color = done ? (step.ok ? GREEN : RED) : undefined;
        return (
          <Group key={value} gap="sm" wrap="nowrap" align="flex-start">
            <div style={{ width: 18, display: "flex", justifyContent: "center", paddingTop: 2 }}>
              {step === "running" ? (
                <Loader size={14} color="gray" />
              ) : done ? (
                step.ok ? (
                  <IconCheck size={16} color={GREEN} />
                ) : (
                  <IconX size={16} color={RED} />
                )
              ) : null}
            </div>
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Text size="sm" c={color} fw={done ? 500 : undefined}>
                {label}
              </Text>
            </Stack>
          </Group>
        );
      })}
      </Stack>
    </Stack>
  );

  return (
    <>
      {checkView || (
      <Stack gap="lg">
        <Stack gap="sm">
          <SettingsIntro parentGap="var(--mantine-spacing-sm)">
            Paramètres de connexion à Entra, veuillez lire l'aide relative à
            l'installation de Milo pour déterminer les valeurs à préciser dans
            les éléments ci-dessous.
          </SettingsIntro>

          {/* The two Azure portal labels, word for word: that is where
              the values are looked up, so better not rename them along
              the way. The labels above the fields, as in the card
              details, with the same gaps. */}
          <Stack gap="xl">
            {/* The two IDs, one per line, across the whole width. */}
            <TextInput
              label="ID d'application"
              value={settings.client_id}
              onChange={(e) =>
                updateStatement({ client_id: e.currentTarget.value })
              }
            />
            <TextInput
              label="ID de l'annuaire"
              value={settings.tenant}
              onChange={(e) =>
                updateStatement({ tenant: e.currentTarget.value })
              }
            />
            <Group gap="md" wrap="nowrap" align="flex-start">
              {secretField}
              {/* Milo's address; once valid, the redirect path follows
                  it, glued to the typed text, and the whole address to
                  register in Azure is copied with a click. It takes the
                  rest of the row. */}
              <TextInput
                label="Adresse de redirection"
                ref={urlInput}
                onScroll={placeSuffix}
                style={{ flex: 1, minWidth: 0 }}
                type="url"
                placeholder="https://milo.contoso.com"
                value={typedUrl}
                onChange={(e) => setTypedUrl(e.currentTarget.value)}
                onBlur={() => void saveUrl()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setTypedUrl(savedUrl);
                }}
                disabled={savingUrl}
                inputContainer={(children) => (
                  <div style={{ position: "relative" }}>
                    {children}
                    {validUrl && suffix && (
                      // Lets clicks through to the input.
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          bottom: 0,
                          left: suffix.left,
                          width: suffix.width,
                          display: "flex",
                          alignItems: "center",
                          overflow: "hidden",
                          whiteSpace: "pre",
                          pointerEvents: "none",
                          fontSize: "var(--mantine-font-size-sm)",
                          color: "var(--mantine-color-dimmed)",
                        }}
                      >
                        {REDIRECT_PATH}
                      </div>
                    )}
                  </div>
                )}
                rightSection={
                  <CopyButton value={redirection}>
                    {({ copied, copy }) => (
                      <Button
                        variant="subtle"
                        color="gray"
                        size="compact-sm"
                        onClick={copy}
                        disabled={!validUrl}
                        aria-label="Copier l'adresse de redirection"
                        style={
                          { "--button-hover": NEUTRAL_HOVER } as CSSProperties
                        }
                      >
                        {copied ? (
                          <IconCheck size={14} />
                        ) : (
                          <IconCopy size={14} />
                        )}
                      </Button>
                    )}
                  </CopyButton>
                }
              />
            </Group>
            {/* Once connected: Milo can then send from it. */}
            {state?.state === "connected" && <SenderField onSaved={onSender} />}
          </Stack>
        </Stack>
      </Stack>
      )}

      {actionsTarget &&
        createPortal(
          <Group gap="sm" wrap="nowrap">
            {statusBadge}
            {/* Not connected, the window's "Se connecter" is the only way. */}
            {state?.state === "connected" && menuActions}
          </Group>,
          actionsTarget,
        )}
    </>
  );
}
