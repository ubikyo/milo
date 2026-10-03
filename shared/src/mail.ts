// Le message d'essai de la messagerie. Les réglages, eux, sont ceux d'Entra
// (entra.ts) : l'envoi passe par Microsoft Graph, au nom de l'application.

/** Le message d'essai : son destinataire. Il part de l'adresse d'envoi. */
export interface MailTestInput {
  to: string;
}

export interface MailTestResult {
  sent_to: string;
}
