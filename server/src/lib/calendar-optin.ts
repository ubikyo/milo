// The consent of the people whose calendar a Calendar widget shows
// (lib/widget-optin.ts): until its owner passes on the code, nothing is read
// from that calendar; afterwards, everyone who sees the widget sees its
// appointments.

import { CALENDAR_KEY, CALENDAR_PEOPLE } from "@milo/shared";
import { calendarOptins } from "../repositories/optins.js";
import { widgetOptin } from "./widget-optin.js";

export const CALENDAR_CONFIRMATION_SUBJECT = "Milo — Partage de votre calendrier";

export const calendarOptin = widgetOptin({
  type: "calendar",
  keyField: CALENDAR_KEY,
  peopleField: CALENDAR_PEOPLE,
  table: calendarOptins,
  subject: CALENDAR_CONFIRMATION_SUBJECT,
  title: "Partager votre calendrier",
  intro: (who, board) =>
    `${who} souhaite afficher votre calendrier Outlook dans Milo${board ? `, sur le tableau « ${board} »` : ""}. Les personnes qui voient ce tableau verront vos rendez-vous : horaires, objet et lieu — ceux marqués privés n'affichent que leurs horaires. Si vous êtes d'accord, communiquez ce code à ${who}. Rien n'est lu de votre calendrier avant.`,
  name: "Calendar",
});

export const askForCalendarConfirmations = calendarOptin.askForConfirmations;
export const retryCalendar = calendarOptin.retry;
export const confirmedCalendars = calendarOptin.confirmed;
