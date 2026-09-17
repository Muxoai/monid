import { defineEndpoint, UsageModelKind } from "@shared/core";
import { zInvestorSearchQueryParams } from "./schema/inputs.ts";

/** GET /investor/search — the cheap fuzzy resolver, flat per call. */
export default defineEndpoint({
    meta: {
        displayName: "Look Up Investor",
        summary: "Search for an investor by name, domain, LinkedIn, or " +
            "Crunchbase.",
        description: "Resolve a VC firm or institutional investor from a " +
            "fuzzy name, a domain, a LinkedIn URL, or a Crunchbase URL " +
            "(exactly one) into Fundable identity fields. Returns " +
            "candidates with id, name, guru_permalink, description, " +
            "domain, website, LinkedIn and Crunchbase links, and a " +
            "relevance_score (1 for identifier matches). Flat price per " +
            "call, charged on zero results too. Suited as the cheap first " +
            "step before the investor profile, investor deals, or " +
            "investor-id filters that need a UUID.",
        docsUrl: "https://docs.tryfundable.ai/api-reference/investors/search",
        categories: ["funding-data"],
    },
    request: { method: "GET", path: "/investor/search" },
    input: { schema: { queryParams: zInvestorSearchQueryParams } },
    usage: {
        /** One SEARCH CALL per request, charged on zero results — the
         *  partner invoices searches at a flat $0.01/call (v1
         *  USD_PER_SEARCH, contract), which the vendor's own 0.1-credit
         *  stamp cannot express at the $0.06/credit row rate — so the
         *  draw comes from the provider's `search` pool (reconcile
         *  2026-09-16) and the stamp is stripped without claiming. */
        model: {
            kind: UsageModelKind.PER_CALL,
            label: "search",
            consumes: { credit: "search", amount: 1 },
        },
        /** Overrides the provider claim: the vendor's `meta.credits_used`
         *  stamp (0.1) meters the CREDIT pool, not the flat search
         *  contract line this doc bills — claiming it into `search`
         *  would be a lie and into `default` an undeclared pool. Strip
         *  it (and the account-level fields) exactly like the provider
         *  fn, claim nothing, and let the derived fold (1 search call)
         *  settle. */
        consolidate: ({ data, utils }) => {
            const { rest } = utils.json.pluck(
                data.output,
                "$.meta.credits_used",
            );
            return {
                credits: {},
                output: utils.json.omit(rest, [
                    "credit_source",
                    "monthly_credits_remaining",
                    "purchased_credits_remaining",
                ]),
            };
        },
    },
});
