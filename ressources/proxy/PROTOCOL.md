# Milo Proxy — protocole, version 1

Contrat entre Milo (`server/src/lib/proxy-hub.ts`) et Milo Proxy (dépôt
`milo-proxy`). Toute évolution incompatible change `PROXY_PROTOCOL`
(`shared/src/proxies.ts`) et la version annoncée par le proxy.

## Connexion

- Le proxy ouvre **un** WebSocket vers `wss://<server>/api/proxy/socket`.
  Milo n'ouvre jamais de connexion vers le proxy.
- Le token est envoyé dans l'en-tête `Authorization: Bearer mpx_…`, jamais
  dans l'URL.
- Réponses HTTP avant l'upgrade : `401` token inconnu (ne pas réessayer en
  boucle rapide), `429` trop d'échecs depuis cette adresse, `404` mauvais
  chemin.
- Une nouvelle connexion du même proxy remplace l'ancienne.
- Milo envoie un ping WebSocket toutes les 15 s ; sans pong avant le suivant,
  la connexion est coupée. Le proxy fait de même de son côté.
- Un message JSON par trame texte ; toute trame binaire ou illisible ferme la
  connexion (code 4000). Taille maximale d'une trame : 8 Mio.

## Codes de fermeture

| Code | Sens | Attitude du proxy |
| --- | --- | --- |
| 1001 | Arrêt de Milo | reconnexion |
| 4000 | Message illisible | reconnexion, journaliser |
| 4001 | Remplacée par une nouvelle connexion | reconnexion lente (un autre proxy utilise peut-être le même token) |
| 4002 | Protocole non pris en charge | arrêt des tentatives rapides |
| 4003 | Token régénéré ou proxy supprimé | arrêt des tentatives rapides |
| 4004 | Pas de `hello` dans les 10 s | reconnexion |

## Messages

### proxy → Milo : `hello` (premier message, sous 10 s)

```json
{ "type": "hello", "protocol": 1, "version": "1.0.0", "hostname": "srv-print-01",
  "capabilities": ["raw-print"] }
```

### Milo → proxy : `welcome`, puis `devices` à chaque changement

```json
{ "type": "welcome", "proxy": { "id": 3, "name": "Site Lyon" },
  "devices": [ { "id": "printer:12", "name": "arm-zebra-01", "host": "10.11.54.21",
                 "services": ["raw-print"] } ] }
{ "type": "devices", "devices": [ … ] }
```

La liste reçue **remplace** la précédente. C'est la seule source des
adresses : une requête ne contient jamais d'adresse, seulement l'`id` d'un
périphérique.

### Milo → proxy : `request`

```json
{ "type": "request", "id": "42", "device": "printer:12", "service": "raw-print",
  "op": "send", "data": "<base64>", "timeout_ms": 10000, "connect_timeout_ms": 2000 }

{ "type": "request", "id": "43", "device": "printer:12", "service": "raw-print",
  "op": "exchange", "data": "<base64>", "timeout_ms": 2000, "connect_timeout_ms": 2000,
  "idle_ms": 1500, "until": "<base64, facultatif>", "max_bytes": 4194304 }
```

- `send` : connexion, écriture de `data`, fermeture d'écriture, attente de la
  fermeture par le périphérique (ou `timeout_ms` une fois les données écrites,
  considéré comme un succès).
- `exchange` : connexion, écriture de `data`, lecture de la réponse jusqu'à la
  première de ces conditions : `until` reçu, `idle_ms` de silence après le
  premier octet, fin de connexion, `timeout_ms` écoulé, `max_bytes` atteint.
  La réponse (éventuellement vide) est un succès ; l'échec de connexion est
  une erreur.

### proxy → Milo : `response`

```json
{ "type": "response", "id": "43", "ok": true, "data": "<base64>" }
{ "type": "response", "id": "42", "ok": false, "error": "connexion refusée" }
```

Le message d'erreur est affiché tel quel à l'utilisateur : en français, court.

### Milo → proxy : `error`

```json
{ "type": "error", "message": "Protocole 2 non pris en charge : …" }
```

Envoyé juste avant une fermeture, pour le journal du proxy.

## Règles imposées par le proxy (non négociables par Milo)

- Chaque service a son protocole et son port **dans le code du proxy** :
  `raw-print` = TCP 9100. Aucune requête ne peut choisir un port.
- Le périphérique doit figurer dans la dernière liste reçue **et** offrir le
  service demandé ; sinon `ok: false`, `"périphérique inconnu"` ou
  `"service non disponible"`.
- Un service que le proxy ne connaît pas est refusé.
- Aucune autre opération que `send` et `exchange`.
