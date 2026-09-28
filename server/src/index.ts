// Le démarrage : rien d'autre que mettre l'application à l'écoute, et le
// ménage périodique — les sessions expirées, les fichiers que plus rien ne
// cite.

import { createApp } from "./app.js";
import { env } from "./env.js";
import { menageDesMedias } from "./repositories/attachments.js";
import { sessions } from "./repositories/users.js";

const app = createApp();

// Les sessions expirées ne servent plus à rien, et les fichiers que plus
// aucune pièce jointe ni aucune description ne cite non plus : les deux
// partent au démarrage, puis une fois par jour. `unref` laisse le processus se
// terminer.
const purger = () => {
  sessions.purgeExpired.run(new Date().toISOString());
  // Le ménage lit le disque : une panne de ce côté ne doit pas empêcher le
  // serveur de démarrer.
  try {
    menageDesMedias();
  } catch (erreur) {
    console.error("Ménage des médias :", erreur);
  }
};
purger();
setInterval(purger, 24 * 60 * 60 * 1000).unref();

const server = app.listen(env.port, () => {
  console.log(`API Milo disponible sur http://localhost:${env.port}`);
});

// Une extinction propre ferme les connexions en cours plutôt que de les
// couper net : c'est ce que systemd demande avant de tuer le processus.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
