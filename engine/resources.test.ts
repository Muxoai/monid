import { assert, assertEquals, assertRejects } from "@std/assert";
import { z } from "zod";
import type { ConnectorSource, Json, OwnedResource } from "@shared/core";
import {
    defineEndpoint,
    defineProvider,
    defineResource,
    presets,
    sealResourceUnit,
    sealUnit,
} from "@shared/core";
import { compileBundle, CompileError } from "@shared/compiler";
import {
    directTransport,
    Engine,
    ENGINE_VERSION,
    EngineError,
    EngineErrorCode,
    type ResourceReader,
    type Transport,
} from "./mod.ts";

/**
 * The RESOURCE machinery through a tiny synthetic connector (the
 * engine.test.ts pattern): reader gating, the structural capability
 * stub, ensure, seed failure taxonomy, sleep bounds, and the compiler's
 * binding coherence — everything saperly exercises implicitly, pinned
 * here explicitly against the codes.
 */

const COMPILE_OPTS = {
    compilerVersion: "0.1.0",
    builtWithEngineVersion: ENGINE_VERSION,
    catalogVersion: "0.0.0-test",
    generatedAt: "1970-01-01T00:00:00.000Z",
    leafCategories: [{ id: "demo-search", displayName: "Demo Search" }],
} as const;

function resourceConnector(): ConnectorSource[] {
    return [{
        provider: defineProvider({
            name: "resdemo",
            meta: { displayName: "Res Demo", summary: "Resource demo." },
            auth: { inject: presets.auth.header("x-demo-key") },
            request: { baseUrl: "https://api.resdemo.test" },
            // FREE default — a provider pool would demand a draining
            // endpoint (D6b), and these demo endpoints are all free
            usage: { model: { kind: "FREE" } },
        }),
        resources: [{
            name: "widget",
            def: defineResource({
                slug: "widget",
                meta: {
                    displayName: "Widget",
                    summary: "A demo widget.",
                },
                data: z.strictObject({ color: z.string() }),
                usage: {
                    period: {
                        unit: "MONTH",
                        count: 1,
                        anchor: "CREATION_TIME",
                    },
                    lines: {
                        rent: { consumes: { credit: "default", amount: 1 } },
                    },
                },
                lifecycle: {
                    verify: async ({ utils }) => {
                        const res = await utils.http({
                            method: "GET",
                            path: "/widgets",
                        });
                        return { active: res.status === 200 };
                    },
                    release: async ({ utils }) => {
                        await utils.http({
                            method: "DELETE",
                            path: "/widgets",
                        });
                        return { released: true };
                    },
                    refresh: async ({ utils }) => {
                        const res = await utils.http({
                            method: "GET",
                            path: "/widgets",
                        });
                        // deliberately NOT the data schema when the vendor
                        // says so — the patch-discipline test flips this
                        const patch: import("@shared/core").Json =
                            res.status === 200
                                ? { color: "blue" }
                                : { wrong: true };
                        return { active: true, patch };
                    },
                },
            }),
        }],
        endpoints: [
            {
                name: "make",
                def: defineEndpoint({
                    meta: {
                        displayName: "Make",
                        summary: "Makes a widget.",
                        categories: ["demo-search"],
                    },
                    request: { method: "POST", path: "/widgets" },
                    input: {
                        schema: {
                            body: z.object({ color: z.string() }),
                        },
                    },
                    resources: {
                        provisions: [{
                            id: "resdemo/widget",
                            seed: ({ data, utils }) => {
                                const id = utils.json.optionalStr(
                                    data.output,
                                    "$.id",
                                );
                                if (id === undefined) {
                                    throw new Error("no readable widget id");
                                }
                                return {
                                    resource: "resdemo/widget",
                                    externalId: id,
                                    data: { color: "red" },
                                };
                            },
                        }],
                    },
                }),
            },
            {
                name: "use",
                def: defineEndpoint({
                    meta: {
                        displayName: "Use",
                        summary: "Uses a widget.",
                        categories: ["demo-search"],
                    },
                    request: { method: "POST", path: "/widgets/use" },
                    input: {
                        schema: { body: z.object({ id: z.string() }) },
                    },
                    resources: {
                        uses: [{ id: "resdemo/widget", key: "$.body.id" }],
                    },
                }),
            },
            {
                name: "read",
                def: defineEndpoint({
                    meta: {
                        displayName: "Read",
                        summary: "Reads widgets.",
                        categories: ["demo-search"],
                    },
                    /** PINNED: the derived `?? request.path` id would
                     *  collide with make's POST /widgets (design D22). */
                    endpoint: "/widgets/read",
                    request: { method: "GET", path: "/widgets" },
                    resources: {
                        reads: [{
                            id: "resdemo/widget",
                            ensure: async ({ data, utils }) => {
                                const owned = await utils.resources.owned({
                                    resource: "resdemo/widget",
                                });
                                if (owned.length > 0) return [];
                                return [{
                                    resource: "resdemo/widget",
                                    externalId: data.scope.key + ":default",
                                    data: { color: "white" },
                                }];
                            },
                        }],
                    },
                }),
            },
        ],
    }];
}

function scripted(
    responses: Array<{ status: number; body: unknown }>,
): Transport {
    let index = 0;
    return directTransport({
        params: () => Promise.resolve({ apiKey: "k" }),
        fetch: () => {
            const next = responses[index++];
            if (!next) return Promise.reject(new Error("script exhausted"));
            return Promise.resolve(
                new Response(JSON.stringify(next.body), {
                    status: next.status,
                }),
            );
        },
    });
}

const reader = (rows: OwnedResource[]): ResourceReader => ({
    owned: (query) =>
        Promise.resolve(rows.filter((row) =>
            row.resource === query.resource &&
            (query.externalId === undefined ||
                row.externalId === query.externalId)
        )),
});

const OWNED: OwnedResource[] = [{
    resource: "resdemo/widget",
    externalId: "w-1",
    data: { color: "red" },
}];

async function bundleOf(mutate?: (c: ConnectorSource[]) => void) {
    const connectors = resourceConnector();
    mutate?.(connectors);
    return await compileBundle(connectors, COMPILE_OPTS);
}

Deno.test("resources: a bound doc without a ResourceReader fails load — NO_RESOURCE_READER", async () => {
    const bundle = await bundleOf();
    const engine = new Engine({
        transport: scripted([{ status: 200, body: {} }]),
    });
    const error = await assertRejects(
        () => engine.load(sealUnit(bundle, "resdemo#widgets/use")),
        EngineError,
    );
    assertEquals(error.code, EngineErrorCode.NO_RESOURCE_READER);
});

Deno.test("resources: utils.resources on an UNBOUND doc throws RESOURCES_UNDECLARED", async () => {
    const bundle = await bundleOf((connectors) => {
        // an unbound lifecycle endpoint whose fn touches the window
        connectors[0].endpoints.push({
            name: "sneaky",
            def: defineEndpoint({
                meta: {
                    displayName: "Sneaky",
                    summary: "Touches the reader undeclared.",
                    categories: ["demo-search"],
                },
                request: { method: "GET", path: "/sneaky" },
                lifecycle: {
                    start: async ({ utils }) => {
                        await utils.resources.owned({
                            resource: "resdemo/widget",
                        });
                        return {
                            kind: "COMPLETED",
                            httpStatus: 200,
                            output: null,
                        };
                    },
                },
            }),
        });
    });
    const engine = new Engine({
        transport: scripted([{ status: 200, body: {} }]),
        resources: reader(OWNED),
    });
    const loaded = await engine.load(sealUnit(bundle, "resdemo#sneaky"));
    const error = await assertRejects(() => loaded.run({}), EngineError);
    // capability follows declaration — surfaced as the fn's own fault
    assert(String(error).includes("RESOURCES_UNDECLARED"));
});

Deno.test("resources: ownership gate — foreign is the uniform 404; owned proceeds; CREATES seeds", async () => {
    const bundle = await bundleOf();
    const engine = new Engine({
        transport: scripted([{ status: 200, body: { ok: true } }]),
        resources: reader(OWNED),
    });
    const use = await engine.load(sealUnit(bundle, "resdemo#widgets/use"));
    const miss = await use.run({ body: { id: "w-FOREIGN" } });
    assertEquals(miss.httpStatus, 404);
    assertEquals(miss.isProviderError, true);
    assertEquals(miss.usage.credits, {});
    const hit = await use.run({ body: { id: "w-1" } });
    assertEquals(hit.httpStatus, 200);
    assertEquals(hit.resources?.reconciles, [{
        resource: "resdemo/widget",
        externalId: "w-1",
    }]);

    const make = await (new Engine({
        transport: scripted([{ status: 200, body: { id: "w-2" } }]),
        resources: reader(OWNED),
    })).load(sealUnit(bundle, "resdemo#widgets"));
    const made = await make.run({ body: { color: "red" } });
    assertEquals(made.resources?.provisions, [{
        resource: "resdemo/widget",
        externalId: "w-2",
        data: { color: "red" },
    }]);
});

Deno.test("resources: gated instances ride into lifecycle fns as data.resources[alias]", async () => {
    const bundle = await bundleOf((connectors) => {
        connectors[0].endpoints.push({
            name: "echo",
            def: defineEndpoint({
                meta: {
                    displayName: "Echo",
                    summary: "Echoes the gated instance.",
                    categories: ["demo-search"],
                },
                request: { method: "POST", path: "/widgets/echo" },
                input: {
                    schema: { body: z.object({ id: z.string() }) },
                },
                resources: {
                    uses: [{
                        id: "resdemo/widget",
                        key: "$.body.id",
                        as: "widget",
                    }],
                },
                lifecycle: {
                    // deno-lint-ignore require-await
                    start: async ({ data }) => ({
                        kind: "COMPLETED",
                        httpStatus: 200,
                        output: data.resources?.widget ?? null,
                    }),
                },
            }),
        });
    });
    const engine = new Engine({
        transport: scripted([]),
        resources: reader(OWNED),
    });
    const loaded = await engine.load(sealUnit(bundle, "resdemo#widgets/echo"));
    const done = await loaded.run({ body: { id: "w-1" } });
    // the alias comes from `as`; the instance is the reader's row
    assertEquals(done.output, OWNED[0] as unknown as Json);
    // and the keyed uses binding still lands its settle mark
    assertEquals(done.resources?.reconciles, [{
        resource: "resdemo/widget",
        externalId: "w-1",
    }]);
});

Deno.test("resources: a seed that cannot construct is PROVISION_CONSTRUCT", async () => {
    const bundle = await bundleOf();
    const engine = new Engine({
        // success body WITHOUT an id — the seed throws
        transport: scripted([{ status: 200, body: { nope: true } }]),
        resources: reader([]),
    });
    const make = await engine.load(sealUnit(bundle, "resdemo#widgets"));
    const error = await assertRejects(
        () => make.run({ body: { color: "red" } }),
        EngineError,
    );
    assertEquals(error.code, EngineErrorCode.PROVISION_CONSTRUCT);
});

Deno.test("resources: ensure seeds surface BEFORE the run (v1 ordering)", async () => {
    const bundle = await bundleOf();
    const seeded = new Engine({
        transport: scripted([{ status: 200, body: [] }]),
        resources: reader([]),
        scopeKey: "ws-42",
    });
    const read = await seeded.load(
        sealUnit(bundle, "resdemo#widgets/read"),
    );
    const seeds = await read.ensure({});
    assertEquals(seeds, [{
        resource: "resdemo/widget",
        externalId: "ws-42:default",
        data: { color: "white" },
    }]);
    // already owned ⇒ nothing to provision
    const owned = new Engine({
        transport: scripted([{ status: 200, body: [] }]),
        resources: reader(OWNED),
    });
    const again = await owned.load(
        sealUnit(bundle, "resdemo#widgets/read"),
    );
    assertEquals(await again.ensure({}), []);
});

Deno.test("resources: utils.sleep is bounded — a per-call breach is FN_CONTRACT", async () => {
    const bundle = await bundleOf((connectors) => {
        connectors[0].endpoints.push({
            name: "sleepy",
            def: defineEndpoint({
                meta: {
                    displayName: "Sleepy",
                    summary: "Sleeps too long.",
                    categories: ["demo-search"],
                },
                request: { method: "GET", path: "/sleepy" },
                lifecycle: {
                    start: async ({ utils }) => {
                        // one ms past SLEEP_MAX_MS_PER_CALL (a fn is a
                        // closed term — the constant cannot be captured)
                        await utils.sleep(30_001);
                        return {
                            kind: "COMPLETED",
                            httpStatus: 200,
                            output: null,
                        };
                    },
                },
            }),
        });
    });
    const engine = new Engine({
        transport: scripted([]),
        sleep: () => Promise.resolve(),
    });
    const loaded = await engine.load(sealUnit(bundle, "resdemo#sleepy"));
    const error = await assertRejects(() => loaded.run({}), EngineError);
    assertEquals(error.code, EngineErrorCode.FN_CONTRACT);
});

Deno.test("resources: refresh patch is validated against the doc's data schema", async () => {
    const bundle = await bundleOf();
    const unit = sealResourceUnit(bundle, "resdemo/widget");
    const owned: OwnedResource = OWNED[0];
    const good = await (new Engine({
        transport: scripted([{ status: 200, body: {} }]),
    })).loadResource(unit);
    assertEquals(await good.refresh(owned), {
        active: true,
        patch: { color: "blue" },
    });
    const bad = await (new Engine({
        // non-200 flips the op into emitting the OFF-SCHEMA patch
        transport: scripted([{ status: 201, body: {} }]),
    })).loadResource(unit);
    const error = await assertRejects(() => bad.refresh(owned), EngineError);
    assertEquals(error.code, EngineErrorCode.FN_CONTRACT);
});

// ---------------------------------------------------------------------------
// compiler coherence (the binding lint ladder)
// ---------------------------------------------------------------------------

Deno.test("resources compiler: unknown binding id and dead keys are compile errors", async () => {
    await assertRejects(
        () =>
            bundleOf((connectors) => {
                connectors[0].endpoints[1].def.resources!.uses![0].id =
                    "resdemo/nonexistent";
            }),
        CompileError,
        "matches no resources",
    );
    await assertRejects(
        () =>
            bundleOf((connectors) => {
                connectors[0].endpoints[1].def.resources!.uses![0].key =
                    "$.body.notAnInput";
            }),
        CompileError,
        "DEAD binding",
    );
});

Deno.test("resources compiler: updateEstimateEveryMs demands a pollable metered run", async () => {
    await assertRejects(
        () =>
            bundleOf((connectors) => {
                connectors[0].endpoints[1].def.usage = {
                    model: {
                        kind: "PER_UNIT",
                        unit: "SECOND",
                        every: 1,
                        consumes: { credit: "default", amount: 0.1 },
                    },
                    credits: { default: { label: "demo credits" } },
                    estimate: () => ({ counts: { SECOND: 1 } }),
                    evidence: () => ({ counts: { SECOND: 1 } }),
                    updateEstimateEveryMs: 30_000,
                };
            }),
        CompileError,
        "usage.updateEstimateEveryMs is dead config",
    );
});
