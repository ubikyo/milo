// Le message d'essai de la messagerie. Les réglages, eux, sont ceux d'Entra
// (entra.ts) : l'envoi passe par Microsoft Graph, au nom de l'application.

/**
 * Le message d'essai : son destinataire, et la société depuis la boîte de
 * support de laquelle il part.
 */
export interface MailTestInput {
  to: string;
  company_id: number;
}

export interface MailTestResult {
  sent_to: string;
}
