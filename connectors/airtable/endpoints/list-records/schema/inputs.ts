import { z } from "zod";

/** GET /v0/{baseId}/{tableId} path params — the vendor mirror
 *  (airtable.com/developers/web/api/list-records). */
export const zListRecordsPathParams = z.object({
    baseId: z.string().min(1).describe(
        "Airtable base id (starts with 'app').",
    ),
    tableId: z.string().min(1).describe(
        "Table id (starts with 'tbl') or the table's name.",
    ),
}).strict();

/** GET /v0/{baseId}/{tableId} query params — scalar filters and paging. */
export const zListRecordsQueryParams = z.object({
    maxRecords: z.number().int().min(1).optional().describe(
        "Maximum total records to return across pages.",
    ),
    pageSize: z.number().int().min(1).max(100).optional().describe(
        "Records per page (1-100; Airtable's default is 100).",
    ),
    view: z.string().min(1).optional().describe(
        "Return only the records visible in this view.",
    ),
    filterByFormula: z.string().min(1).optional().describe(
        "An Airtable formula; only records where it is true are returned. " +
            "Example: '{Status}=\"Live\"'.",
    ),
    offset: z.string().min(1).optional().describe(
        "Pagination cursor returned as `offset` by a previous call.",
    ),
}).strict();