import { assert, assertEquals } from "@std/assert";
import { fromFileUrl } from "@std/path";
import {
    liveSkip,
    loadFixture,
    runEndpoint,
    testSealedUnit,
} from "@shared/testing";

const fixturesDir = fromFileUrl(new URL("./fixtures/", import.meta.url));

Deno.test("airtable#list-records happy (synthetic): free — zero usage", async () => {
    const unit = await testSealedUnit("airtable#list-records");
    const fixture = await loadFixture(
        `${fixturesDir}synthetic-happy.json`,
    );
    const result = await runEndpoint({
        unit,
        input: { pathParams: { baseId: "appBase", tableId: "tblTable" } },
        mode: "replay",
        fixture,
    });
    assertEquals(result.httpStatus, 200);
    assertEquals(result.isProviderError, false);
    // FREE model (D25/D26): nothing folds, nothing is evidenced.
    assertEquals(result.usage, { credits: {}, evidence: {} });
    const output = result.output as Record<string, unknown>;
    assertEquals((output.records as unknown[]).length, 2);
    // no output projection on this doc: the recorded body IS the contract.
    assertEquals(result.output, fixture.calls[0].res.body);
});

Deno.test({
    name: "airtable#list-records live (gated on AIRTABLE_API_KEY)",
    ignore: liveSkip("airtable"),
    fn: async () => {
        const unit = await testSealedUnit("airtable#list-records");
        const result = await runEndpoint({
            unit,
            input: { pathParams: { baseId: "appBase", tableId: "tblTable" } },
            mode: "live",
        });
        assert(
            result.httpStatus === 200 || result.isProviderError,
            JSON.stringify(result.output),
        );
    },
});