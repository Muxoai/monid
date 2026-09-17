import { assertEquals } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { loadFixture, runEndpoint, testSealedUnit } from "@shared/testing";

const fixturesDir = fromFileUrl(new URL("./fixtures/", import.meta.url));

Deno.test("fundable#company/search empty (synthetic): zero candidates still bill the 0.1-credit search (v1 drill)", async () => {
    const unit = await testSealedUnit("fundable#company/search");
    const fixture = await loadFixture(`${fixturesDir}synthetic-empty.json`);
    const result = await runEndpoint({
        unit,
        input: { queryParams: { name: "zzzz-no-such-company" } },
        mode: "replay",
        fixture,
    });
    assertEquals(result.httpStatus, 200);
    assertEquals(result.isProviderError, false);
    // one SEARCH-pool call settles from the derived fold (reconcile
    // 2026-09-16): searches are invoiced at a flat $0.01/call contract
    // line the vendor's 0.1-credit stamp cannot express, so the doc's
    // consolidate strips the stamp without claiming it
    assertEquals(result.usage, {
        credits: { search: 1 },
        evidence: { CALL: 1 },
    });
    const output = result.output as Record<string, Record<string, unknown>>;
    assertEquals(output.meta, { total_count: 0 });
});
