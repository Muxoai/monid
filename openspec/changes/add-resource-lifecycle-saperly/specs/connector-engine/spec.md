# connector-engine (delta)

## ADDED Requirements

### Requirement: ResourceReader port and structurally-withheld capability
`EngineCtx` SHALL gain `resources?: ResourceReader` with
`owned({resource, externalId?}) → Promise<ResourceRow[]>`. The engine SHALL
bind `utils.resources` into lifecycle/ensure fns ONLY when the doc declares
a resource binding; access without one SHALL throw `RESOURCES_UNDECLARED`.
A doc that declares a binding loaded into an engine without a reader SHALL
fail `NO_RESOURCE_READER` at load. The engine never sees tenancy — the host
binds workspace scope into the reader.

#### Scenario: Undeclared read fails loudly
- **WHEN** a lifecycle fn of a binding-less doc touches `utils.resources`
- **THEN** the run fails `RESOURCES_UNDECLARED` (never silently empty)

### Requirement: Derived ownership gate
For bindings with a `key`, `start` SHALL extract the externalId from the
validated input and check the reader BEFORE any lifecycle/declarative
execution; ANY miss SHALL synthesize `COMPLETED {httpStatus: 404, output:
{message: "not found"}}` with zero usage — uniform, never leaking foreign
existence.

#### Scenario: Foreign number is indistinguishable from missing
- **WHEN** place-calls names a number owned by another workspace
- **THEN** the result is the same 404-as-data as for a number that never
  existed, and nothing was sent upstream

### Requirement: Ensure runs before execution
When the binding declares `ensure`, `start` SHALL run it after input
validation and surface returned seeds on `RunStartResult.ensured` BEFORE
executing the run, so the host can admit them first. `[]` means satisfied;
an ownership-pointer conflict at the host is a lost race and also satisfied.

#### Scenario: Ensure is engine-mechanics, host-money
- **WHEN** ensure returns one seed
- **THEN** the engine performs no admission itself — the seed rides the
  result for the host workflow

### Requirement: Derived post-run resource outputs
On successful settle, the engine SHALL evaluate the binding's derived
outputs once and attach `RunCompleted.resources = {provisions?, releases?,
refreshes?, reconciles?}`. A CREATES `seed` throw on a 2xx SHALL fail
`PROVISION_CONSTRUCT`.

#### Scenario: Provider error produces no resource outputs
- **WHEN** the settled envelope is a vendor non-2xx
- **THEN** `RunCompleted.resources` is absent (nothing provisioned,
  released, refreshed, or reconciled)

### Requirement: loadResource executes resource ops
`engine.loadResource(sealedUnit)` SHALL return `{check, release, refresh,
actualCost, external}` over the compiled ops, each validating its outcome
schema (FN_CONTRACT), with the same error taxonomy as lifecycle fns
(retriable throw → `RESOURCE_OP_FAILED` retriable; `retriable: false` →
FN_CONTRACT). Op fns SHALL receive `utils.external` bound to the same
loaded doc.

#### Scenario: One reader for bill and preview
- **WHEN** `getActualCost` calls `utils.external("storage", {window})`
- **THEN** the doc's own compiled `externals.storage.read` executes — no
  second implementation can drift

### Requirement: Pure accrual arithmetic
The loaded endpoint SHALL expose `accrued(elapsedMs): Usage` beside
`estimate` when the doc declares `usage.accrue` — fn counts plus buffer,
validated against the model, folded through `assembleUsage`. No IO, no
state, no clock.

#### Scenario: Host tops up holds from accrued
- **WHEN** the host calls `accrued(90_000)` on place-calls
- **THEN** it receives `{credits, evidence}` for `max(90, 60) + 60` seconds
  and prices its hold target from it

### Requirement: Stop reports an outcome
`stop(runInput, state, run?)` SHALL return `COMPLETED` (the fn's settled
envelope through the ONE settle pipeline), `UNRESOLVED` (the fn could not
confirm settlement — the host bills its elapsed-based last resort), or
`STOPPED_UNSETTLED` (fn returned void — best-effort teardown only).

#### Scenario: Stop-side settle bills carrier truth
- **WHEN** a stop fn re-reads the call until `costCents` exists and returns
  COMPLETED
- **THEN** usage settles from that envelope exactly as a poll settle would

### Requirement: Run identity and bounded in-phase sleep
`start/poll/stop` SHALL accept optional trailing `run?: {runId?}` (the OSS
`run()` and CLI mint a ULID when absent) and expose it as `data.run.runId`.
`utils.sleep(ms)` SHALL be backed by `EngineCtx.sleep`, instant in replay,
and capped per phase.

#### Scenario: Response headers reach fns
- **WHEN** a lifecycle fn issues a request answered 302
- **THEN** `res.headers["location"]` is available (transport never follows
  redirects)
