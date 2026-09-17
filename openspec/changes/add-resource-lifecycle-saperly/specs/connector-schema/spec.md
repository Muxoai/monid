# connector-schema (delta)

## ADDED Requirements

### Requirement: Resource definitions are first-class
The schema SHALL provide `defineResource` → `zResourceDef`, authored at
`connectors/<provider>/resources/<name>/resource.ts` with the id
`<provider>/<name>` inferred from the folder and never authored. The def
SHALL declare `meta` (zBaseMeta), a `data` row schema (live zod, compiled to
JSON Schema), optional `inputs` schemas for create/update/release, the
REQUIRED `usage` rate card (+ `reconcileUsage`), `lifecycle` (`verify`
required, `release` required, `refresh` optional), optional `views`, and
optional `webhooks`.

#### Scenario: Instance typing flows from `data`
- **WHEN** a resource declares a `data` schema
- **THEN** op ctxs (`data.resource`), refresh patches, and provision seeds
  are typed by that schema at author time and validated by the engine at
  run time

### Requirement: Compiled resource docs are sealed units
The compiler SHALL emit `zResourceDoc` mirroring `zEndpointDoc`:
`{specVersion, id, provider, minEngineVersion, meta, dataSchema, inputs?,
billing?, ops, externals?, webhooks?, auth, request: {url}, hash}` with every
fn as a `$fn` ref in the shared fnTable. The bundle SHALL gain a `resources`
map with both-direction fn closure.

#### Scenario: A resource runs as a sealed unit
- **WHEN** a host seals `saperly/phone-number` with its fn entries
- **THEN** `engine.loadResource(unit)` links and gates it exactly like an
  endpoint sealed unit (BAD_DOC → UNSUPPORTED_DOC → UNKNOWN_FN →
  LINK_INTEGRITY → UNSUPPORTED_FN_ABI)

### Requirement: Resource billing declares rent and variable streams
`zResourceBilling` SHALL declare `period {unit, count, anchor:
CREATION|CALENDAR (default CREATION)}`, optional prepaid `rent {consumes
(amount ≥ 0), chargeLeadMs, releaseLeadMs}`, and optional `variable {price
(display card), holdCadenceMs ≥ 3_600_000, buffer: zConsumes,
getActualCost}`. `getActualCost` SHALL be cumulative from the usage-period
start and return `{consumes, vendorConsumes?}`.

#### Scenario: Variable without a clock or a teardown is rejected
- **WHEN** a def declares `variable` without `rent` or without `ops.release`
- **THEN** compilation fails (the rent schedule is the settlement clock and
  the unpaid-release policy depends on the release op)

#### Scenario: A $0 rent is a lawful schedule
- **WHEN** a def declares rent with `amount: 0`
- **THEN** it compiles — the host silent-advances the period (sfs-class)

### Requirement: Endpoint↔resource interaction is one derived binding
The endpoint def SHALL gain `resource?: {id, interaction:
CREATES|USES|UPDATES|RELEASES|READS, key?, seed?, ensure?}`. `key` is a
JSONPath into the validated input, required for UPDATES/RELEASES. `seed` is
CREATES-only and pure; `ensure` is effectful with `data.scope.key` (an
opaque host namespace token) and `utils.{http, request, resources}`.

#### Scenario: Ownership is derived, not authored
- **WHEN** an endpoint declares `interaction: "USES", key:
  "$.body.fromNumberId"`
- **THEN** no `requires` fn exists anywhere; the engine derives the
  ownership pre-gate from the binding

#### Scenario: Resource-owned input contracts
- **WHEN** an endpoint binds CREATES/UPDATES/RELEASES
- **THEN** the compiler verifies the endpoint's input schema accepts a
  superset of the resource's corresponding `inputs` schema

### Requirement: Views are named always-live reads
`zResourceDef.views` SHALL be a record of `{label?, read}`. Reads are
effectful, never persisted, and served host-side via
`RunnableResource.view(kind, instance, args?)` — one reader per kind, no
second implementation to drift.

#### Scenario: One reader per kind
- **WHEN** a host renders a view and a meter needs the same upstream fact
- **THEN** both go through the doc's ONE compiled `views.<kind>.read`

### Requirement: Metered runs declare an estimate cadence
`usage.updateEstimateEveryMs` SHALL be declarable (endpoint ?? provider);
the ESTIMATE fn re-runs with `elapsedMs` set as the mid-run accrual
(`zEstimateData.elapsedMs?`). Declaring it SHALL require a resolvable
`lifecycle.poll` and a metered model.

#### Scenario: A cadence on a sync endpoint is dead config
- **WHEN** an endpoint declares `usage.updateEstimateEveryMs` and no poll
  resolves
- **THEN** compilation fails

### Requirement: Lifecycle ctx gains run identity and sleep; stop reports
Lifecycle ctx data SHALL gain `run: {runId}`; `LifecycleUtils` SHALL gain
`sleep(ms)`; `LifecycleStopFn` SHALL be allowed to return `void |
LifecycleCompleted | {kind: "UNRESOLVED"}`; `HttpResult` and
`TransportResponse` SHALL gain optional lower-cased `headers`.

#### Scenario: Deterministic idempotency keys
- **WHEN** a start fn sends `Idempotency-Key: data.run.runId + ":purchase"`
  and its activity is retried with the same runId
- **THEN** the upstream receives the identical key and dedupes the mutation

### Requirement: Webhooks are declared on docs
The provider def SHALL gain `webhooks.account: Record<slug, {verify
(declarative hmac-sha256 descriptor), correlate, dispatch, subscribe?,
unsubscribe?}>`; the resource def SHALL gain the per-resource scope with
`subscribe` required. Dispatch SHALL be the closed vocabulary `run
{endpoint, input, runKey?, controlPolicy?: bill-only|admit-overdraft}` |
`signal-run {runKey}` | `refresh {target}` | `ignore`.

#### Scenario: A resource event starts a run
- **WHEN** correlate resolves a delivery to an owned resource and dispatch
  returns `{action: "run", endpoint, input}`
- **THEN** the host starts that endpoint's run in the owning workspace,
  keyed by `runKey ?? deliveryId`, billed like any user-started run
