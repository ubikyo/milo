// Talking to a Zebra printer, over the network: everything goes through its
// raw port, 9100. The ZPL is written as is on a TCP connection, which the
// printer reads to its end; the port answers, the printer is online.
//
// What a printer is — its model, its head's resolution — it says itself: "~HI"
// answers "ZD421-203dpi,V84.20.11Z,8,8192KB", the third field in dots per
// millimeter.

import net from "node:net";
import zlib from "node:zlib";
import { PRINTER_DPIS } from "@milo/shared";
import type { Printer, PrinterDpi, PrinterInfo } from "@milo/shared";
import { HttpError, fail } from "./http.js";

/** The port that takes the ZPL raw. */
const PRINTER_PORT = 9100;

/** How long a printer has to answer, connecting or printing. */
const CONNECT_TIMEOUT = 2_000;
const PRINT_TIMEOUT = 10_000;

/** The largest job accepted: a label with an image or two. */
export const MAX_ZPL_LENGTH = 512 * 1024;

/** "« arm-zebra-01 » (10.11.54.21:9100)": in the messages. */
const where = (printer: Printer): string => `« ${printer.name} » (${printer.host}:${PRINTER_PORT})`;

/** True if the printer accepts a TCP connection on its port in time. */
const isOnline = (printer: Pick<Printer, "host">): Promise<boolean> =>
  new Promise((resolve) => {
    if (!printer.host) return resolve(false);
    const socket = net.connect({ host: printer.host, port: PRINTER_PORT });
    const done = (online: boolean) => {
      socket.destroy();
      resolve(online);
    };
    socket.setTimeout(CONNECT_TIMEOUT, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });

/**
 * The ZPL written on the raw port; resolves once the printer has it all and
 * the connection is closed. Destroyed right after writing, the connection
 * could be reset before the printer had read the job.
 */
const sendRaw = (printer: Printer, zpl: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const socket = net.connect({ host: printer.host, port: PRINTER_PORT });
    let sent = false;
    socket.setTimeout(PRINT_TIMEOUT, () => {
      socket.destroy();
      // Written, the job is the printer's: one that keeps the connection
      // open has it all the same.
      if (sent) resolve();
      else reject(new Error("délai dépassé"));
    });
    socket.once("error", reject);
    socket.once("connect", () => socket.end(zpl, "utf8", () => (sent = true)));
    // Whatever the printer answers is read, so the connection closes cleanly.
    socket.on("data", () => undefined);
    socket.once("close", (failed) => {
      if (!failed) resolve();
    });
  });

/**
 * Sends a ZPL job to the printer. A printer out of reach, or refusing the
 * job, makes a 502: the request was right, the printer did not follow.
 */
export const printZpl = async (printer: Printer, zpl: string): Promise<void> => {
  if (!printer.host) fail(400, `L'imprimante « ${printer.name} » n'a pas d'adresse IP`);
  try {
    await sendRaw(printer, zpl);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    fail(502, `Impression impossible sur ${where(printer)} : ${reason}`);
  }
};

/**
 * A text of a ZPL field, whatever it holds: "^FH" lets "_" introduce a byte
 * in hexadecimal, so the ZPL's own characters — "^", "~", and "_" itself —
 * cannot end the field or start a command.
 */
export const zplField = (text: string): string =>
  `^FH_^FD${text.replace(/[_^~]/g, (c) => `_${c.charCodeAt(0).toString(16).toUpperCase()}`)}^FS`;

/** Dots per millimeter, as "~HI" gives them, to dots per inch. */
const DPI_BY_DPM: Record<number, PrinterDpi> = { 6: 152, 8: 203, 12: 300, 24: 600 };

/** "ZD421-203dpi": the resolution its name carries, if it is one of ours. */
const dpiOfModel = (model: string): PrinterDpi | null => {
  const dpi = Number(/-(\d{3})dpi/i.exec(model)?.[1]);
  return (PRINTER_DPIS as readonly number[]).includes(dpi) ? (dpi as PrinterDpi) : null;
};

/**
 * "~HI": its answer, framed by STX and ETX, or null if the printer does not
 * give one in time.
 */
const askHostIdentification = (host: string): Promise<PrinterInfo | null> =>
  new Promise((resolve) => {
    const socket = net.connect({ host, port: PRINTER_PORT });
    let answer = "";
    const done = (info: PrinterInfo | null) => {
      socket.destroy();
      resolve(info);
    };
    socket.setTimeout(CONNECT_TIMEOUT, () => done(null));
    socket.once("error", () => done(null));
    socket.once("connect", () => socket.write("~HI\r\n"));
    socket.on("data", (chunk) => {
      answer += chunk.toString("latin1");
      const end = answer.indexOf("\x03");
      if (end < 0) return;
      const fields = answer.slice(answer.indexOf("\x02") + 1, end).split(",");
      const model = fields[0]?.trim() ?? "";
      done({ model, dpi: DPI_BY_DPM[Number(fields[2])] ?? dpiOfModel(model) });
    });
  });

/**
 * What the printer says of itself, or null when its port does not answer.
 * Answering but saying nothing, its model stays empty.
 */
export const printerInfo = async (printer: Printer): Promise<PrinterInfo | null> => {
  if (!(await isOnline(printer))) return null;
  return (await askHostIdentification(printer.host)) ?? { model: "", dpi: null };
};

// --- The label as the printer draws it --------------------------------------
//
// A Zebra renders the label itself: "^IS" at the end of a format saves it as
// an image instead of printing it, "^HY" uploads that image back — as a "~DY"
// command whose data is Z64: base64 of zlib —, "^ID" deletes it. The image is
// a GRF, one bit per dot, 1 black; it becomes a PNG here.

/** The image the label is saved as, on the printer's RAM drive. */
const PREVIEW_IMAGE = "R:MILOPREV.GRF";

/** Once the printer has started answering, this much silence ends its answer. */
const ANSWER_IDLE = 1_500;

/** "^XA … ^XZ": the first label of the format, saved rather than printed. */
const savedLabel = (zpl: string): string => {
  const end = zpl.search(/\^XZ/i);
  if (end < 0) fail(400, "Le modèle doit se terminer par ^XZ");
  return `${zpl.slice(0, end)}^IS${PREVIEW_IMAGE},N^XZ`;
};

/** The bytes of "~DG"/"~DY" data: Z64, B64, or hexadecimal — compressed or not. */
const decodeData = (data: string, bytesPerRow: number): Buffer | null => {
  const encoded = /^:(Z64|B64):([A-Za-z0-9+/=\s]+):/.exec(data);
  if (encoded) {
    const raw = Buffer.from(encoded[2]!.replace(/\s/g, ""), "base64");
    if (encoded[1] === "B64") return raw;
    try {
      return zlib.inflateSync(raw);
    } catch {
      return zlib.inflateRawSync(raw);
    }
  }
  return bytesPerRow > 0 ? decodeHex(data, bytesPerRow) : null;
};

/**
 * ZPL's compressed hexadecimal: "G" to "Y" repeat the next digit 1 to 19
 * times, "g" to "z" 20 to 400 times, "," fills the row with 0, "!" with 1,
 * ":" repeats the previous row.
 */
const decodeHex = (data: string, bytesPerRow: number): Buffer => {
  const digitsPerRow = bytesPerRow * 2;
  const rows: string[] = [];
  let row = "";
  let count = 0;
  const push = (digits: string) => {
    row += digits;
    while (row.length >= digitsPerRow) {
      rows.push(row.slice(0, digitsPerRow));
      row = row.slice(digitsPerRow);
    }
  };
  for (const c of data) {
    if (c >= "G" && c <= "Y") count += c.charCodeAt(0) - 70;
    else if (c >= "g" && c <= "z") count += (c.charCodeAt(0) - 102) * 20;
    else if (/[0-9A-Fa-f]/.test(c)) {
      push(c.repeat(Math.max(count, 1)));
      count = 0;
    } else if (c === "," || c === "!") {
      push((c === "," ? "0" : "F").repeat(digitsPerRow - row.length || digitsPerRow));
    } else if (c === ":") {
      push(rows[rows.length - 1] ?? "0".repeat(digitsPerRow));
    }
  }
  return Buffer.from(rows.join(""), "hex");
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes: Buffer): number => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Buffer): Buffer => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
};

/** A GRF as a one-bit grayscale PNG: its 1 are black, a PNG's 0 is. */
const grfToPng = (grf: Buffer, bytesPerRow: number): Buffer => {
  const height = Math.floor(grf.length / bytesPerRow);
  if (height === 0) fail(502, "L'imprimante a renvoyé une image vide");
  const header = Buffer.alloc(13);
  header.writeUInt32BE(bytesPerRow * 8, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(1, 8); // bit depth
  header.writeUInt8(0, 9); // grayscale
  const scanlines = Buffer.alloc(height * (bytesPerRow + 1));
  for (let y = 0; y < height; y++) {
    // Each row starts with its filter: none.
    for (let x = 0; x < bytesPerRow; x++) {
      scanlines[y * (bytesPerRow + 1) + 1 + x] = ~grf[y * bytesPerRow + x]! & 0xff;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

/**
 * The image in the printer's answer, as a PNG, or null while it is not whole:
 * "~DYd:f,b,x,t,w,data" — x "P" a PNG, "G" a GRF of w bytes per row — or the
 * older "~DGd:f,t,w,data".
 */
const imageOf = (answer: string): Buffer | null => {
  const dy = /~DY[^,]*,[^,]*,([^,]*),(\d+),(\d*),([\s\S]*)/.exec(answer);
  const dg = dy ? null : /~DG[^,]*,(\d+),(\d+),([\s\S]*)/.exec(answer);
  if (!dy && !dg) return null;
  const extension = dy ? dy[1]!.trim().toUpperCase() : "G";
  const total = Number(dy ? dy[2] : dg![1]);
  const data = (dy ? dy[4] : dg![3])!;
  // A GRF's row is given, or follows from its total and the label's width.
  const bytesPerRow = Number(dy ? dy[3] : dg![2]) || 0;
  // Z64 and B64 end with their CRC: until it arrives, the data is not whole.
  if (/^:(Z64|B64):/.test(data) && !/^:(Z64|B64):[A-Za-z0-9+/=\s]+:[0-9A-Fa-f]{4}/.test(data)) {
    return null;
  }
  const bytes = decodeData(data, bytesPerRow);
  if (!bytes || bytes.length < total) return null;
  if (extension === "P") return bytes;
  if (bytesPerRow <= 0) fail(502, "L'imprimante n'a pas donné la largeur de l'image");
  return grfToPng(bytes.subarray(0, total), bytesPerRow);
};

/**
 * The label the ZPL makes, drawn by the printer itself, as a PNG: nothing
 * comes out of it. A printer out of reach, or that does not answer, makes a
 * 502.
 */
export const renderZpl = (printer: Printer, zpl: string): Promise<Buffer> => {
  if (!printer.host) fail(400, `L'imprimante « ${printer.name} » n'a pas d'adresse IP`);
  const job =
    `${savedLabel(zpl)}\r\n` +
    `^XA^HY${PREVIEW_IMAGE}^XZ\r\n` +
    `^XA^ID${PREVIEW_IMAGE}^XZ\r\n`;
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: printer.host, port: PRINTER_PORT });
    let answer = "";
    let idle: NodeJS.Timeout | undefined;
    let settled = false;
    const finish = (error: string | null, image?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(idle);
      clearTimeout(connecting);
      clearTimeout(overall);
      socket.destroy();
      if (image) resolve(image);
      else reject(new HttpError(502, `Aperçu impossible sur ${where(printer)} : ${error}`));
    };
    const tryImage = (last: boolean) => {
      try {
        const image = imageOf(answer);
        if (image) return finish(null, image);
        if (last) finish(answer ? "réponse illisible" : "aucune réponse");
      } catch (e) {
        finish(e instanceof Error ? e.message : String(e));
      }
    };
    // Unreachable, it says so quickly; reached, it has the time to draw.
    const connecting = setTimeout(() => finish("délai dépassé"), CONNECT_TIMEOUT);
    const overall = setTimeout(() => tryImage(true), PRINT_TIMEOUT);
    socket.once("error", (e) => finish(e.message));
    socket.once("connect", () => {
      clearTimeout(connecting);
      socket.write(job, "utf8");
    });
    socket.on("data", (chunk) => {
      answer += chunk.toString("latin1");
      clearTimeout(idle);
      idle = setTimeout(() => tryImage(true), ANSWER_IDLE);
      tryImage(false);
    });
    socket.once("end", () => tryImage(true));
  });
};
