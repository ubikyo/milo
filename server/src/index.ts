// Startup: nothing more than putting the app on listen, the periodic cleanup
// — expired sessions, files nothing cites any more — and polling of the
// support mailboxes and of the RSS feeds.

import { createApp } from "./app.js";
import { env } from "./env.js";
import { FEED_POLL_INTERVAL, pollAllFeeds } from "./lib/feed.js";
import { REMINDERS_INTERVAL, sendReminders } from "./lib/reminders.js";
import { POLL_INTERVAL, pollMailboxes } from "./lib/support-mail.js";
import { MAINTENANCE_INTERVAL, maintainSubscriptions } from "./lib/support-webhooks.js";
import { M365_MAINTENANCE_INTERVAL, maintainM365Subscriptions } from "./lib/m365-webhooks.js";
import { attachProxyHub, closeProxyHub } from "./lib/proxy-hub.js";
import { mediaCleanup } from "./repositories/attachments.js";
import { sessions } from "./repositories/users.js";

const app = createApp();

// Expired sessions are no use any more, nor are files that no attachment or
// description cites any more: both go at startup, then once a day. `unref`
// lets the process terminate.
const purge = () => {
  sessions.purgeExpired.run(new Date().toISOString());
  // Cleanup reads the disk: a failure on that side must not stop the
  // server from starting.
  try {
    mediaCleanup();
  } catch (error) {
    console.error("Media cleanup:", error);
  }
};
purge();
setInterval(purge, 24 * 60 * 60 * 1000).unref();

// Companies' support mailboxes are polled at startup, then every five
// minutes: each e-mail received there becomes a request.
const poll = () => {
  pollMailboxes().catch((error) => console.error("Support mailbox polling:", error));
};
poll();
setInterval(poll, POLL_INTERVAL).unref();

// RSS item feeds are polled by the server, each at the interval its items
// set (30 minutes by default): the background poll checks every minute which
// ones have come due.
const pollFeeds = () => {
  pollAllFeeds().catch((error) => console.error("RSS feed polling:", error));
};
pollFeeds();
setInterval(pollFeeds, FEED_POLL_INTERVAL).unref();

// Due-date reminders go out to the minute.
const remind = () => {
  try {
    sendReminders();
  } catch (error) {
    console.error("Due-date reminders:", error);
  }
};
remind();
setInterval(remind, REMINDERS_INTERVAL).unref();

const server = app.listen(env.port, () => {
  console.log(`Milo API available at http://localhost:${env.port}`);
  // Subscriptions to the support mailboxes are requested once Milo is
  // listening: Graph checks the address before accepting.
  maintain();
});

// The proxies' sockets: upgrades of the same server, on the same port.
attachProxyHub(server);

const maintain = () => {
  maintainSubscriptions().catch((error) =>
    console.error("Support mailbox subscriptions:", error),
  );
};
setInterval(maintain, MAINTENANCE_INTERVAL).unref();

// Mail and Calendar widgets subscribe to what they read as they read it:
// maintenance only extends and drops. Not at startup — nobody has read
// anything yet, everything would go.
setInterval(() => {
  maintainM365Subscriptions().catch((error) => console.error("Mail and Calendar subscriptions:", error));
}, M365_MAINTENANCE_INTERVAL).unref();

// A clean shutdown closes ongoing connections rather than cutting them off
// abruptly: this is what systemd asks for before killing the process.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    // Upgraded, the proxies' sockets are no longer the server's: closed apart.
    closeProxyHub();
    server.close(() => process.exit(0));
    // Event streams never end on their own: without this, "close" would wait
    // for them forever, and the process would not stop (nor would the restart
    // of "node --watch").
    server.closeIdleConnections();
    setTimeout(() => server.closeAllConnections(), 2000).unref();
  });
}
