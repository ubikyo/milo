// The reference an e-mail sent from Milo carries, which traces a reply back
// to what it answers — an order's exchanges, a support request: in a line the
// color of the background, at the message's end. A reply quotes the message,
// the line with it; the headers alone do not survive every mail client.

/** The message, its reference under it, out of sight: white, 1 px. */
export const withReference = (html: string, reference: string): string =>
  `${html}<div style="color:#ffffff;font-size:1px;line-height:1px;max-height:0;overflow:hidden;opacity:0">[${reference}]</div>`;

/** A support request's reference: its ticket's — "milo-ticket-HLP-12". */
export const ticketReference = (ticket: string): string => `milo-ticket-${ticket}`;
