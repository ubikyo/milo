// The Tickets widget a request names — its automatic and predefined replies,
// its e-mail templates are its own (repositories/lists.ts).

import type { Request } from "express";
import type { Right } from "@milo/shared";
import { require } from "./rights.js";
import { openBoard } from "../repositories/boards.js";
import { listInBoard } from "../repositories/lists.js";
import type { ListScope } from "../repositories/lists.js";

/** The Tickets widget named, once the access to Support is checked for this right. */
export const supportScope = (req: Request, board: unknown, list: unknown, right: Right): ListScope => {
  require(req, "support", right);
  return listInBoard(openBoard(board, req.user).id, "support.list", list);
};
