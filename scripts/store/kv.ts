import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import type { Json, OwnedResource, ResourceQuery } from "@shared/core";
import type { IResourceStore } from "@monid/connector-engine";
import { OUTPUT_DIR } from "../lib.ts";

/**
 * The DEFAULT local resource store (design D47) — Deno KV at
 * `.output/local.db`. This is the OSS host loop's persistence: what the
 * hosted platform keeps in Postgres (owned rows, release tombstones),
 * the local loop keeps in one gitignored KV file, so `engine:run`
 * provisions SURVIVE the process and later runs serve a real ownership
 * window ("provision a number, then place a call from it" works across
 * two invocations).
 *
 * SCRIPTS-ONLY by design: the engine stays persistence-free (it takes a
 * ResourceReader port); this adaptor is the CLI's implementation of the
 * wider IResourceStore host port.
 *
 * Layout:
 *   ["resources", <resourceId>, <externalId>] → OwnedResource
 *   ["released",  <resourceId>, <externalId>] → { releasedAt }
 * Release DELETES the owned row (it leaves the ownership window — the
 * uniform 404 follows naturally) and leaves a tombstone for audit.
 */
export class KvResourceStore implements IResourceStore {
    private constructor(private readonly kv: Deno.Kv) {}

    static async open(path?: string): Promise<KvResourceStore> {
        const dbPath = path ?? join(OUTPUT_DIR, "local.db");
        await ensureDir(join(dbPath, ".."));
        return new KvResourceStore(await Deno.openKv(dbPath));
    }

    async provision(resource: OwnedResource): Promise<void> {
        await this.kv.set(
            ["resources", resource.resource, resource.externalId],
            resource,
        );
        // a re-provision resurrects: drop any stale tombstone
        await this.kv.delete(
            ["released", resource.resource, resource.externalId],
        );
    }

    async refresh(id: string, externalId: string, data: Json): Promise<void> {
        const row = await this.get(id, externalId);
        if (row === undefined) {
            throw new Error(
                `cannot refresh ${id} "${externalId}" — not owned`,
            );
        }
        await this.kv.set(["resources", id, externalId], {
            ...row,
            data,
            syncedAt: new Date().toISOString(),
        });
    }

    async release(id: string, externalId: string): Promise<void> {
        await this.kv.delete(["resources", id, externalId]);
        await this.kv.set(["released", id, externalId], {
            releasedAt: new Date().toISOString(),
        });
    }

    async get(
        id: string,
        externalId: string,
    ): Promise<OwnedResource | undefined> {
        const entry = await this.kv.get<OwnedResource>(
            ["resources", id, externalId],
        );
        return entry.value ?? undefined;
    }

    async list(): Promise<OwnedResource[]> {
        const rows: OwnedResource[] = [];
        for await (
            const entry of this.kv.list<OwnedResource>({
                prefix: ["resources"],
            })
        ) {
            rows.push(entry.value);
        }
        return rows;
    }

    /** The ResourceReader port — what the engine's ownership window sees. */
    async owned(query: ResourceQuery): Promise<OwnedResource[]> {
        if (query.externalId !== undefined) {
            const row = await this.get(query.resource, query.externalId);
            return row === undefined ? [] : [row];
        }
        const rows: OwnedResource[] = [];
        for await (
            const entry of this.kv.list<OwnedResource>({
                prefix: ["resources", query.resource],
            })
        ) {
            rows.push(entry.value);
        }
        return rows;
    }

    close(): void {
        this.kv.close();
    }
}
