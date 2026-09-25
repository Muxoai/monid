import { defineEndpoint } from "@shared/core";
import { zGetRecordPathParams } from "./schema/inputs.ts";

export default defineEndpoint({
    meta: {
        displayName: "Airtable Get Record",
        summary: "Fetch one Airtable record by id.",
        description: "Fetch a single Airtable record by its id (from a list " +
            "call), returning its id, createdTime, and fields object.",
        docsUrl: "https://airtable.com/developers/web/api/get-record",
        categories: ["databases"],
    },
    /** PUBLIC identity (design D1): the native path carries placeholders,
     *  which an endpoint identity cannot — pinned to a stable name. */
    endpoint: "/get-record",
    request: { method: "GET", path: "/v0/{baseId}/{tableId}/{recordId}" },
    input: { schema: { pathParams: zGetRecordPathParams } },
});