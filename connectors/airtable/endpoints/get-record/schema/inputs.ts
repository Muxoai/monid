import { z } from "zod";

/** GET /v0/{baseId}/{tableId}/{recordId} path params — the vendor mirror
 *  (airtable.com/developers/web/api/get-record). */
export const zGetRecordPathParams = z.object({
    baseId: z.string().min(1).describe(
        "Airtable base id (starts with 'app').",
    ),
    tableId: z.string().min(1).describe(
        "Table id (starts with 'tbl') or the table's name.",
    ),
    recordId: z.string().min(1).describe(
        "Record id (starts with 'rec'), from a list call.",
    ),
}).strict();