// Le démarrage : rien d'autre que mettre l'application à l'écoute, le ménage
// périodique — les sessions expirées, les fichiers que plus rien ne cite — et
// la relève des boîtes de support et celle des flux RSS.

import { createApp } from "./app.js";
import { env } from "./env.js";
import { INTERVALLE_RELEVE_FLUX, releverLesFlux } from "./lib/feed.js";
import { INTERVALLE_RELEVE, releverLesBoites } from "./lib/support-mail.js";
import { INTERVALLE_ENTRETIEN, entretenirAbonnements } from "./lib/support-webhooks.js";
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

// Les boîtes de support des sociétés sont relevées au démarrage, puis toutes
// les cinq minutes : chaque e-mail reçu y devient une demande.
const relever = () => {
  releverLesBoites().catch((erreur) => console.error("Relève des boîtes de support :", erreur));
};
relever();
setInterval(relever, INTERVALLE_RELEVE).unref();

// Les flux des éléments RSS sont relevés par le serveur, chacun à l'intervalle
// que ses éléments règlent (30 minutes par défaut) : la relève de fond regarde
// chaque minute lesquels sont arrivés à échéance.
const releverFlux = () => {
  releverLesFlux().catch((erreur) => console.error("Relève des flux RSS :", erreur));
};
releverFlux();
setInterval(releverFlux, INTERVALLE_RELEVE_FLUX).unref();

const server = app.listen(env.port, () => {
  console.log(`API Milo disponible sur http://localhost:${env.port}`);
  // Les abonnements aux boîtes de support se demandent une fois Milo à
  // l'écoute : Graph vérifie l'adresse avant d'accepter.
  entretenir();
});

const entretenir = () => {
  entretenirAbonnements().catch((erreur) =>
    console.error("Abonnements aux boîtes de support :", erreur),
  );
};
setInterval(entretenir, INTERVALLE_ENTRETIEN).unref();

// Une extinction propre ferme les connexions en cours plutôt que de les
// couper net : c'est ce que systemd demande avant de tuer le processus.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    // Les flux d'événements ne se terminent jamais d'eux-mêmes : sans cela,
    // « close » les attendrait sans fin, et le processus ne s'arrêterait pas
    // (ni la relance de « node --watch »).
    server.closeIdleConnections();
    setTimeout(() => server.closeAllConnections(), 2000).unref();
  });
}
