import { z } from "zod";
import { contractConfig } from "../../config.ts";
import { zDocHash, zProviderName, zSemverString } from "../common/ids.ts";
import { zBaseMeta } from "../meta/base.ts";
import { zJsonSchemaDoc } from "../endpoint/json-schema-doc.ts";
import { zFnRef } from "../fn-table/ref.ts";
import { zWebhookSlug } from "../sections/webhooks.ts";
import { zWebhookVerify } from "../hooks/webhooks.ts";
import { zResourceId } from "./ids.ts";
import {
    RECONCILE_EVERY_FLOOR_MS,
    zLineName,
    zResourceUsage,
} from "./usage.ts";

/**
 * zResourceDoc — the COMPILED resource artifact (design D30, refined
 * D39–D42): pure, flat, strict JSON beside the endpoint docs in the
 * bundle. Fn-bearing slots hold `$fn` refs; auth + origin + timeout are
 * FUSED from the provider at compile (a resource doc executes as its own
 * sealed unit, no provider lookup at run time — the endpoint-doc rule).
 */

export const zReconcileUsageDoc = z.record(
    zLineName,
    z.strictObject({
        everyMs: z.number().int().min(RECONCILE_EVERY_FLOOR_MS),
        get: zFnRef,
    }),
);
export type ReconcileUsageDoc = z.infer<typeof zReconcileUsageDoc>;

export const zResourceWebhookDoc = z.strictObject({
    verify: zWebhookVerify,
    route: zFnRef,
    subscribe: zFnRef,
    unsubscribe: zFnRef.optional(),
});
export type ResourceWebhookDoc = z.infer<typeof zResourceWebhookDoc>;

export const zResourceDoc = z.strictObject({
    specVersion: z.literal(contractConfig.schema.specVersion),
    /** "<provider>/<slug>". */
    id: zResourceId,
    provider: zProviderName,
    /** Compiler-derived: semverMax(resources_since, api of every $fn). */
    minEngineVersion: zSemverString,
    meta: zBaseMeta,
    data: z.strictObject({ schema: zJsonSchemaDoc }),
    inputs: z.strictObject({
        create: zJsonSchemaDoc.optional(),
        update: zJsonSchemaDoc.optional(),
        release: zJsonSchemaDoc.optional(),
    }).optional(),
    /** The RATE CARD — inline data, priceable without executing
     *  anything (design D39). */
    usage: zResourceUsage,
    /** Per estimated line: the sync cadence + the meter fn ref. */
    reconcileUsage: zReconcileUsageDoc.optional(),
    lifecycle: z.strictObject({
        verify: zFnRef,
        release: zFnRef,
        refresh: zFnRef.optional(),
    }),
    views: z.record(
        z.string().min(1),
        z.strictObject({
            label: z.string().min(1).optional(),
            read: zFnRef,
        }),
    ).optional(),
    webhooks: z.record(zWebhookSlug, zResourceWebhookDoc).optional(),
    /** Fused from the provider (same injector + credential shape as the
     *  provider's endpoints). */
    auth: z.strictObject({
        inject: zFnRef,
        credentials: zJsonSchemaDoc,
    }),
    /** The provider ORIGIN ops resolve `path` against (no method — a
     *  resource has no one compiled request). */
    request: z.strictObject({ url: z.string().min(1) }),
    timeouts: z.strictObject({
        requestMs: z.number().int().positive(),
    }),
    hash: zDocHash,
});
export type ResourceDoc = z.infer<typeof zResourceDoc>;

/** Collect every $fn id a resource doc references. */
export function resourceFnKeysOf(doc: ResourceDoc): string[] {
    const keys: string[] = [doc.auth.inject.$fn.key];
    keys.push(doc.lifecycle.verify.$fn.key, doc.lifecycle.release.$fn.key);
    if (doc.lifecycle.refresh) keys.push(doc.lifecycle.refresh.$fn.key);
    for (const entry of Object.values(doc.reconcileUsage ?? {})) {
        keys.push(entry.get.$fn.key);
    }
    for (const view of Object.values(doc.views ?? {})) {
        keys.push(view.read.$fn.key);
    }
    for (const hook of Object.values(doc.webhooks ?? {})) {
        keys.push(hook.route.$fn.key);
        keys.push(hook.subscribe.$fn.key);
        if (hook.unsubscribe) keys.push(hook.unsubscribe.$fn.key);
    }
    return [...new Set(keys)];
}
