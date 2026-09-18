import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { useState } from "react";
import { api } from "../api";
import Logo from "./Logo.jsx";

export default function LoginPage({ needsSetup, onAuthenticated }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = needsSetup
        ? await api.setup({ name: name.trim(), email: email.trim(), password })
        : await api.login(email.trim(), password);
      onAuthenticated(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const incomplete = needsSetup ? !name.trim() || !email.trim() || !password : !email.trim() || !password;

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder radius="md" p={40} w="100%" maw={420}>
        <form onSubmit={submit}>
          <Stack gap="md">
            <Stack align="center" gap="md" pt={35} pb={40}>
              <Logo variant={1} h={176} />
              {needsSetup && (
                <Text size="sm" c="dimmed">
                  Créez le premier compte pour commencer.
                </Text>
              )}
            </Stack>

            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}

            {needsSetup && (
              <TextInput
                label="Nom"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                required
                autoFocus
              />
            )}
            <TextInput
              label="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              required
              autoFocus={!needsSetup}
            />
            <PasswordInput
              label="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />

            <Button type="submit" color="teal" loading={busy} disabled={incomplete} fullWidth mt="md">
              {needsSetup ? "Créer le compte" : "Se connecter"}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
