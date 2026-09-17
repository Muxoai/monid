/**
 * deno task engine:run <provider>#<endpoint> [--body '<json>']
 *                      [--query-params '<json>'] [--path-params '<json>']
 *
 * JIT: compile (or reuse the .output/ cache), pick the endpoint from the
 * bundle (sealUnit), execute it through Engine.load with directTransport
 * (credentials from env <NAME>_API_KEY), print the result including usage.
 *
 * ONE encoding: the flags ARE zRunInput's fields in CLI kebab-case
 * (cliffy maps --query-params → options.queryParams etc. — verbatim field
 * match, no escape hatch, no precedence rules).
 */
import { Command } from "@cliffy/command";
import { z } from "zod";
import {
    type Json,
    type OwnedResource,
    parseSchema,
    type RunInput,
    sealUnit,
    zOwnedResource,
} from "@shared/core";
import { directTransport, Engine } from "@monid/connector-engine";
import { compileToOutput } from "./lib.ts";
import { KvResourceStore } from "./store/kv.ts";

function parseJson(flag: string, raw: string): Json {
    try {
        return JSON.parse(raw) as Json;
    } catch (error) {
        throw new Error(`${flag} is not valid JSON: ${error}`);
    }
}

const { options, args } = await new Command()
    .name("engine:run")
    .description(
        "Compile (cached) and execute one endpoint with env credentials.",
    )
    .arguments("<endpoint:string>")
    .option("--body <json:string>", "RunInput.body (JSON).")
    .option(
        "--query-params <json:string>",
        "RunInput.queryParams (JSON object).",
    )
    .option("--path-params <json:string>", "RunInput.pathParams (JSON object).")
    .option(
        "--resources <file:string>",
        "Owned-resource rows (a JSON file of OwnedResource[]) served to " +
            "the ownership window INSTEAD of the local store — a fixture " +
            "window, nothing persisted. Default: the Deno KV store at " +
            ".output/local.db (provisions survive across runs).",
    )
    .option(
        "--scope-key <key:string>",
        "The opaque scope token ensure fns see (default: local).",
    )
    .parse(Deno.args);

const endpointId = args[0];

const input: RunInput = {
    ...(options.body !== undefined
        ? { body: parseJson("--body", options.body) }
        : {}),
    ...(options.queryParams !== undefined
        ? {
            queryParams: parseJson(
                "--query-params",
                options.queryParams,
            ) as RunInput["queryParams"],
        }
        : {}),
    ...(options.pathParams !== undefined
        ? {
            pathParams: parseJson(
                "--path-params",
                options.pathParams,
            ) as RunInput["pathParams"],
        }
        : {}),
};

const { bundle, cacheHit } = await compileToOutput();
console.error(
    `[engine:run] ${
        cacheHit ? "cache hit" : "compiled"
    } — loading ${endpointId}`,
);

// the CLI's ownership window (design D47): the Deno KV store at
// .output/local.db by DEFAULT — the local host loop's persistence, so a
// provision made by one run is owned in the next. --resources swaps in a
// fixture window (rows from a file, NOTHING persisted).
const store = options.resources === undefined
    ? await KvResourceStore.open()
    : undefined;
const fixtureRows: OwnedResource[] = options.resources !== undefined
    ? parseSchema(
        z.array(zOwnedResource),
        JSON.parse(await Deno.readTextFile(options.resources)),
        `--resources ${options.resources}`,
    )
    : [];

const unit = sealUnit(bundle, endpointId);
const engine = new Engine({
    transport: directTransport(),
    resources: store ?? {
        owned: (query) =>
            Promise.resolve(
                fixtureRows.filter((row) =>
                    row.resource === query.resource &&
                    (query.externalId === undefined ||
                        row.externalId === query.externalId)
                ),
            ),
    },
    scopeKey: options.scopeKey ?? "local",
});
const loaded = await engine.load(unit);

// HOST ORDERING (v1): run ensure() as its own pre-start step and PERSIST
// its seeds BEFORE the run — a mid-run crash never orphans an upstream
// resource. run()'s own inline ensure then sees the persisted rows and
// converges to [] (ensure fns are idempotent against the window).
if (store) {
    const seeds = await loaded.ensure(input);
    for (const seed of seeds) {
        await store.provision({
            resource: seed.resource,
            externalId: seed.externalId,
            data: seed.data,
        });
        console.error(
            `[engine:run] ensure provisioned ${seed.resource} ` +
                `"${seed.identifier ?? seed.externalId}" — persisted`,
        );
    }
}
const result = await loaded.run(input);

// settle EFFECTS → the store (the host's persistence work-orders)
if (store && result.resources) {
    for (const seed of result.resources.provisions ?? []) {
        await store.provision({
            resource: seed.resource,
            externalId: seed.externalId,
            data: seed.data,
        });
        console.error(
            `[engine:run] provisioned ${seed.resource} ` +
                `"${seed.identifier ?? seed.externalId}" — persisted` +
                (seed.observedUsage !== undefined
                    ? ` (observed usage: ${JSON.stringify(seed.observedUsage)})`
                    : ""),
        );
    }
    for (const target of result.resources.releases ?? []) {
        await store.release(target.resource, target.externalId);
        console.error(
            `[engine:run] released ${target.resource} ` +
                `"${target.externalId}" — left the ownership window`,
        );
    }
    for (const target of result.resources.refreshes ?? []) {
        console.error(
            `[engine:run] refresh marked for ${target.resource} ` +
                `"${target.externalId}" — a host loop runs the resource ` +
                `doc's lifecycle.refresh (or: deno task webhook simulate)`,
        );
    }
    for (const target of result.resources.reconciles ?? []) {
        console.error(
            `[engine:run] usage reconcile marked for ${target.resource} ` +
                `"${target.externalId}"`,
        );
    }
}
store?.close();

console.log(JSON.stringify(result, null, 2));
if (result.isProviderError) Deno.exit(1);
