import { defineProvider, presets, UsageModelKind } from "@shared/core";

/**
 * Airtable (airtable.com) — read records from a base, ported as a native
 * connector so an agent can ground answers in the spreadsheet-database many
 * startups already run their operations on. Two synchronous JSON endpoints on
 * ONE wire surface, `https://api.airtable.com/v0/<baseId>/<tableId>`, Bearer
 * auth (a personal access token). Records come back inline; nothing polls.
 *
 * BILLING (design D25/D27): Airtable bills by workspace plan and record
 * count, not per API call — a call has no per-request vendor fee, so the
 * model is FREE and the compiler synthesizes the one lawful empty quantities
 * fn. A future metered surface (e.g. a paid integration) is a MODEL change,
 * not a rate-card surprise.
 *
 * No `output.fromResponse`: the vendor's JSON is the contract. No
 * `output.fromError`: Airtable's error envelope (`{error: {type, message}}`)
 * already reads as a message and relays verbatim (design D7).
 */
export default defineProvider({
    name: "airtable",
    meta: {
        displayName: "Airtable",
        summary: "Read records from Airtable bases.",
        description: "Airtable — read records from a base so an agent can " +
            "ground its answers in the operations data a team already keeps " +
            "there: list a table's records (optionally filtered, sorted, or " +
            "scoped to a view) and fetch a single record by id.",
        homepageUrl: "https://airtable.com",
        docsUrl: "https://airtable.com/developers/web/api/introduction",
        categories: ["databases"],
        notes: [
            "The personal access token must carry the `data.records:read` " +
            "scope, and the token's access must include the base.",
            "Airtable rate-limits at 5 requests/second per base; a 429 " +
            "carries retry-after in seconds.",
        ],
    },
    auth: { inject: presets.auth.bearer() },
    request: { baseUrl: "https://api.airtable.com" },
    timeouts: { requestMs: 30_000, runMs: 30_000 },
    usage: {
        // Airtable bills by plan/records, not per call — no per-request vendor
        // fee. FREE (design D25/D27): the model alone suffices and the
        // quantities fns are compiler-synthesized.
        model: { kind: UsageModelKind.FREE },
    },
});