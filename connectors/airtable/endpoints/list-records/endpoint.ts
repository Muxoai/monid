import { defineEndpoint } from "@shared/core";
import {
    zListRecordsPathParams,
    zListRecordsQueryParams,
} from "./schema/inputs.ts";

export default defineEndpoint({
    meta: {
        displayName: "Airtable List Records",
        summary: "List records in an Airtable table.",
        description: "List the records in one Airtable table, newest page " +
            "first. Narrow with 'view' to the records a saved view shows, " +
            "'filterByFormula' to an Airtable formula, and page with " +
            "'pageSize' plus the 'offset' cursor a previous response " +
            "returned. Each record carries its id, createdTime, and fields " +
            "object. Use Airtable Get Record when you already have a record " +
            "id.",
        docsUrl: "https://airtable.com/developers/web/api/list-records",
        categories: ["databases"],
    },
    /** PUBLIC identity (design D1): the native path carries `{baseId}` /
     *  `{tableId}` placeholders, which an endpoint identity cannot — pinned
     *  to a stable name; `request.path` carries the native path. */
    endpoint: "/list-records",
    request: { method: "GET", path: "/v0/{baseId}/{tableId}" },
    input: {
        schema: {
            pathParams: zListRecordsPathParams,
            queryParams: zListRecordsQueryParams,
        },
    },
});