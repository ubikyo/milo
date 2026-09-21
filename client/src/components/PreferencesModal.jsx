import { Alert, Button, Divider, Group, Modal, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "../api";
import { passwordIsValid } from "../passwordRules";
import ErrorAlert from "./ErrorAlert.jsx";
import PasswordRules from "./PasswordRules.jsx";

export default function PreferencesModal({ opened, onClose, user, onUpdated }) {
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "" });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Les champs sont (re)chargés à chaque ouverture.
  useEffect(() => {
    if (!opened || !user) return;
    setForm({ first_name: user.first_name || "", last_name: user.last_name || "", email: user.email || "" });
    setPassword("");
    setConfirmation("");
    setError(null);
  }, [opened, user]);

  const set = (field) => (event) => {
    const { value } = event.currentTarget;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
      };
      if (password) {
        payload.password = password;
        payload.password_confirm = confirmation;
      }
      onUpdated(await api.updateMe(payload));
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const incomplete =
    !form.first_name.trim() ||
    !form.last_name.trim() ||
    !form.email.trim() ||
    // Si un mot de passe est saisi, il doit respecter les règles et être confirmé.
    (Boolean(password) && (!passwordIsValid(password) || password !== confirmation));

  return (
    <Modal opened={opened} onClose={onClose} title="Préférences" size="md" padding={40} centered>
      <Stack gap="md">
        {error && <ErrorAlert>{error}</ErrorAlert>}

        <TextInput label="Prénom" value={form.first_name} onChange={set("first_name")} required />
        <TextInput label="Nom" value={form.last_name} onChange={set("last_name")} required />
        <TextInput label="E-mail" type="email" value={form.email} onChange={set("email")} required />

        <Divider />

        <div>
          <Text size="sm" fw={500}>
            Mot de passe
          </Text>
          <Text size="xs" c="dimmed">
            Laissez vide pour conserver le mot de passe actuel.
          </Text>
        </div>
        <PasswordInput
          label="Nouveau mot de passe"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
        />
        <PasswordInput
          label="Vérification du mot de passe"
          value={confirmation}
          onChange={(e) => setConfirmation(e.currentTarget.value)}
          disabled={!password}
          error={
            confirmation && password !== confirmation ? "Les deux mots de passe ne correspondent pas" : null
          }
        />
        {password && <PasswordRules password={password} />}

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Annuler
          </Button>
          <Button color="teal" onClick={save} loading={busy} disabled={incomplete}>
            Enregistrer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
