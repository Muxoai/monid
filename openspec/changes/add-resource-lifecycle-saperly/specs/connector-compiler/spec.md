# connector-compiler (delta)

## ADDED Requirements

### Requirement: Resources compile like endpoints
The compiler SHALL discover `resources/<name>/resource.ts` per provider,
infer the id `<provider>/<name>`, fuse provider auth/request origin, intern
every fn (ops, externals, getActualCost, webhook fns, binding seed/ensure)
into the shared fnTable with the `schema.resources_since` ABI stamp where
the resource family is the surface, and emit `zResourceDoc` into the
bundle's `resources` map with both-direction closure enforced.

#### Scenario: Determinism holds
- **WHEN** the repo compiles twice with frozen meta
- **THEN** the bundles are byte-identical, resources included

### Requirement: Binding derivation and coherence
The compiler SHALL resolve every endpoint `resource` binding against the
bundle's resources (unknown id → CompileError), verify interaction/key
coherence (UPDATES/RELEASES require `key`; CREATES requires `seed`; `seed`
outside CREATES and `ensure` on CREATES are rejected), verify
input-superset contracts against the resource's `inputs` schemas, and
reject dead bindings (a binding granting nothing any fn or derivation
uses).

#### Scenario: Missing release input contract
- **WHEN** an endpoint binds RELEASES but its input cannot accept the
  resource's `inputs.release` schema
- **THEN** compilation fails naming both schemas

### Requirement: Billing coherence
The compiler SHALL enforce: `variable` ⇒ rent present AND `ops.release`
present; `holdCadenceMs ≥ 3_600_000`; `usage.accrue` ⇒ lifecycle.poll
resolves; accrue counts keys ⊆ the model's metered keys.

#### Scenario: Sub-hour cadence rejected
- **WHEN** a def declares `holdCadenceMs: 60_000`
- **THEN** compilation fails (host workflow-history floor)

### Requirement: Versioning facts
Docs using any new family/field SHALL floor at the new
`doc_format_since`; lifecycle-ABI additions (run identity, sleep, headers,
stop outcome) stamp via `fn_abi_since`; resource-op fns stamp
`schema.resources_since`. `deno task version:check` SHALL gate the
ENGINE_VERSION minor bump.

#### Scenario: Old connectors keep their floor
- **WHEN** a sync connector without bindings recompiles after this change
- **THEN** its docs are byte-identical, `minEngineVersion` unchanged
