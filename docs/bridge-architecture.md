# Bridge Architecture & Capability Contract

**Status:** Design draft / spike — not yet implemented
**Scope:** `davi-nfc-agent-mobile-app` (the bridge) + `davi-nfc-agent` (the host)
**Audience:** maintainers of both repos, and third parties who want to ship their
own reader UI on top of the bridge.

---

## 1. The idea in one paragraph

The mobile app stops being a product and becomes **infrastructure**: a thin,
white-label NFC **bridge** whose only jobs are the two things a browser can't do
on a phone — talk to the NFC radio and discover/connect to an agent. Everything a
user *sees* is a web UI **served by whichever `davi-nfc-agent` deployment the
bridge is pointed at**. A third party stands up a customized agent, and the reader
experience changes on the fly — no app rebuild, no store submission, no forking
the native code. This is the payment-terminal / thin-client model (cf. Stripe
Terminal): the terminal is dumb and stable; the host owns the experience.

The load-bearing consequence: **the product is not the UI, it's the contract**
between the native shell and the server-hosted UI. If that contract is stable and
versioned, any agent can ship any UI against it for years. This document specifies
that contract.

---

## 2. Why a webview at all — the hard constraint

NFC cannot leave native. **WebNFC exists only in Chrome on Android**; there is no
iOS Safari support and, critically, **`WKWebView` does not expose WebNFC either**,
so wrapping a page in an iOS shell buys nothing. The app's iPhone support depends
entirely on native Core NFC via `react-native-nfc-manager` (see
`services/nfc.ts`).

Therefore "embedded webview with NFC" can **never** mean "the webview reads the
tag." It means: the native shell owns the radio, and the web UI reaches NFC only
through a bridge the shell exposes. The webview is the *view*; the shell is the
*driver*. On iOS especially, any design that assumes the page can touch NFC will
strand every iPhone user.

App Store note: Guideline 4.2 ("minimum functionality") is hostile to apps that
are just a wrapper around a remote site. What clears it here is exactly the native
NFC + mDNS discovery layer — real device functionality. Lead with that in the
listing, not with the webview.

---

## 3. What already exists (so we build the minimum)

The agent already speaks two WebSocket protocols on its single port
(default `9470`). Neither is new work.

### 3a. Device API — `/ws?mode=device` (the shell already uses this)

The phone registers as an **input device** and pushes scans up. Implemented today
in `services/websocket.ts` and `protocol/device.go`:

| Message (device → agent) | Purpose |
|---|---|
| `registerDevice` | announce name/platform/capabilities, get a `deviceID` |
| `tagScanned` | a tag entered the field (UID, tech, type, NDEF) |
| `tagRemoved` | the tag left the field |
| `deviceHeartbeat` | liveness |

| Message (agent → device) | Purpose |
|---|---|
| `registerDeviceResponse` | `{ deviceID, sessionToken, serverInfo }` |
| `deviceWriteRequest` | **defined in `protocol/device.go`, NOT routed by the server yet** |

### 3b. Client API — `/ws` (a mature UI-facing protocol the shell does NOT use yet)

This is what a *consumer UI* connects to. It is already rich (see `docs/api.md`):

| Message | Direction | Purpose |
|---|---|---|
| `tagData` | agent → client | tag present, **including a `capabilities` object** (canWrite, canLock, maxNdefSize, tagFamily, …) |
| `deviceStatus` | agent → client | reader connected / card present |
| `writeRequest` | client → agent | overwrite the tag; agent verifies (read-after-write, retry, capacity check) |
| `writeResponse` | agent → client | `{ success, uid, tagType, bytesWritten, verified, attempts, locked }` |
| `capabilitiesRequest` / `capabilitiesResponse` | client ↔ agent | query present-tag capabilities on demand |
| lock / erase | client → agent | make read-only (irreversible) / blank the tag |

**Key realization:** a server-hosted reader UI is *already a client*. Most of what
it needs is the existing client API, spoken over its own `/ws` connection — not a
bespoke native bridge. The native bridge only has to cover the gap: the handful of
things a webview genuinely cannot do or reach.

---

## 4. Two connections, one agent

The bridge holds **two** relationships to the same agent simultaneously:

```
                       ┌───────────────────────── phone (bridge app) ─────────────────────────┐
                       │                                                                        │
   NFC radio  ◄──────► │  native shell  ── device conn (/ws?mode=device) ──►  ┐                 │
  (Core NFC /          │  (nfc-manager,                                       │                 │
   Android reader)     │   discovery,      ◄── postMessage bridge ──►  webview (server UI)      │
                       │   pairing)                                           │                 │
                       │                    client conn (/ws) ◄──────────────┘                 │
                       └────────────────────────────────────────────────────────────────────────┘
                                                        │
                                                        ▼
                                           davi-nfc-agent (host, serves the UI)
```

- **Native shell → device connection:** unchanged. Reads tags, feeds `tagScanned`
  up. This is the frozen, stable protocol third parties never touch.
- **Webview → client connection:** the server UI opens its **own** `/ws` client
  connection and consumes `tagData`/`writeResponse` directly. Nothing proxies
  through native for the read path.
- **postMessage bridge:** only for what the webview can't get from the client WS —
  native NFC control, native-performed writes (see §6), device info, haptics,
  keep-awake, and server switching.

This split is the whole trick: **reads need no custom bridge at all** (Option A
below), and the bridge surface stays tiny.

---

## 5. Rollout in two options

### Option A — MVP: read-only reader, zero custom bridge

Ship value with almost nothing new on the app side:

1. Agent gains an embedded web frontend (`go:embed` + a static route on the
   existing port — the agent serves **no HTML today**, this is the one net-new
   agent capability the MVP needs).
2. The bridge keeps its native device connection (scans flow up unchanged) and
   adds a **webview pointed at the agent's served UI**.
3. That UI is a normal client: it opens `/ws`, renders `tagData`, shows history.

No JS↔native NFC bridge is required for a pure reader. Third parties swap the
served frontend freely. This is the fastest path to proving the thesis.

### Option B — full bridge: UI-initiated writes, native control, haptics

Add the `postMessage` contract in §6 when the UI needs to *do* things the client
WS can't express on a phone-only deployment — most importantly **writes** (§6.4).

Recommendation: build A first as a spike, feel the latency/UX, then layer B.

---

## 6. The bridge contract (native shell ⇄ server UI)

### 6.1 Transport

React Native WebView, standard channel:

- **UI → native:** `window.ReactNativeWebView.postMessage(JSON.stringify(msg))`
- **native → UI:** shell injects `window.dispatchEvent(new MessageEvent('davi:message', { data }))`;
  a tiny client shim (shipped by the UI, or injected by the shell) wraps this into
  a promise/event API.

### 6.2 Envelope — mirror the existing WS envelope

Reuse the codebase's existing shape (`{ id, type, payload }` / `{ id, type,
success, payload, error }`) so there's one mental model across device WS, client
WS, and bridge.

**Request (UI → native):**
```json
{ "id": "b_1", "type": "nfc.write", "payload": { "records": [ ... ] } }
```
**Response (native → UI):**
```json
{ "id": "b_1", "type": "nfc.write", "success": true, "payload": { ... }, "error": null }
```
**Event (native → UI, no id):**
```json
{ "type": "nfc.tag", "payload": { "uid": "04:A1:…", "capabilities": { … } } }
```

All method names are namespaced (`bridge.*`, `nfc.*`, `device.*`, `server.*`,
`ui.*`) and **versioned** via the handshake so a UI can feature-detect and degrade
instead of assuming.

### 6.3 Handshake & discovery — `bridge.hello`

The first call every UI makes. Establishes the contract version and what this
particular shell can actually do (an old shell + new UI must degrade gracefully).

```jsonc
// UI → native
{ "id": "b_0", "type": "bridge.hello", "payload": { "uiName": "acme-reader", "uiVersion": "2.3.0" } }

// native → UI
{
  "id": "b_0", "type": "bridge.hello", "success": true,
  "payload": {
    "bridgeVersion": "1.0.0",              // semver of THIS contract
    "platform": "ios",                      // "ios" | "android"
    "device": { "model": "iPhone14,3", "osVersion": "17.5", "appVersion": "1.2.0" },
    "methods": ["nfc.getState","nfc.startReading","nfc.write","nfc.lock","haptics.trigger", …],
    "grants": ["nfc.read"],                 // permissions already granted to this origin (see §7)
    "agent": { "url": "wss://…:9470", "connected": true }
  }
}
```

Rule: **the UI must feature-detect against `methods`/`bridgeVersion`, never assume.**
Adding a method is a minor bump; changing/removing one is a major bump.

### 6.4 Methods

Read/observe (low-risk):

| Method | Params | Returns | Notes |
|---|---|---|---|
| `nfc.getState` | — | `{ supported, enabled, active }` | mirrors `NfcManager.isSupported/isEnabled` |
| `nfc.startReading` | `{ }` | `{ active: true }` | enable foreground dispatch / reader mode |
| `nfc.stopReading` | `{ }` | `{ active: false }` | |
| `nfc.getCapabilities` | — | `{ capabilities }` | present-tag caps; same shape as client-API `capabilities` |
| `device.getInfo` | — | `{ platform, model, osVersion, appVersion, bridgeVersion }` | |

Mutating (high-risk — gated, see §7):

| Method | Params | Returns | Notes |
|---|---|---|---|
| `nfc.write` | `{ records: WriteRecord[] }` | `{ success, uid, tagType, bytesWritten, verified, attempts }` | **params & result mirror the client-API `writeRequest`/`writeResponse` exactly** |
| `nfc.lock` | `{ }` | `{ success, locked }` | irreversible |
| `nfc.erase` | `{ }` | `{ success }` | blanks NDEF (reversible) |

UX helpers:

| Method | Params | Returns |
|---|---|---|
| `haptics.trigger` | `{ style: "light"\|"medium"\|"success"\|"error" }` | `{ ok }` — wraps `expo-haptics` |
| `ui.setKeepAwake` | `{ enabled: bool }` | `{ ok }` |

Server/pairing (native shell owns server selection; expose control so the UI can offer it):

| Method | Params | Returns | Notes |
|---|---|---|---|
| `server.current` | — | `{ url, name, connected }` | which agent is loaded |
| `server.rescan` | — | `{ servers: DiscoveredServer[] }` | trigger mDNS scan (`services/discovery.ts`) |
| `server.switch` | `{ url }` | `{ ok }` | tear down + reload the shell against another agent (returns the UI to the new host) |

### 6.5 Events (native → UI)

| Event | Payload | When |
|---|---|---|
| `nfc.tag` | `{ uid, technology, type, ndefMessage?, capabilities? }` | tag entered field |
| `nfc.tagRemoved` | `{ uid }` | tag left field |
| `nfc.stateChanged` | `{ supported, enabled, active }` | NFC toggled / app foreground-background |
| `agent.connectionChanged` | `{ connected, status }` | device WS up/down (reuses store connection states) |

Note the redundancy with the client WS: a UI *can* get tag data either from its
own `/ws` client connection **or** from `nfc.tag` bridge events. Preferred split:
use the **client WS** for tag/capability/write data (it's the agent's verified,
authoritative view), and use **bridge events** only for things the agent doesn't
know — local NFC hardware state, foreground/background, permission changes. Keep
one source of truth per concern.

### 6.6 The write-path decision (important open question)

A phone-only deployment has a problem: the client UI sends `writeRequest` to the
agent, but the agent has **no writer** — the phone registered `canWrite: false`
and `deviceWriteRequest` is not routed server-side. Two ways to close it:

- **B1 — native bridge write (recommended first):** UI calls `nfc.write` over the
  bridge; the native shell performs the Core NFC / Android write directly and
  returns the result. Simple, no agent changes, works offline-ish. Downside: the
  agent's hard-won verification/retry logic (`docs/api.md` write semantics) lives
  server-side and would have to be *re-implemented or skipped* on device.
- **B2 — route `deviceWriteRequest` through the agent:** implement the server
  routing (already typed in `protocol/device.go`), register the phone with
  `canWrite: true`, and have the UI use the ordinary client `writeRequest`. The
  agent stays the single writer-of-record and keeps verification centralized.
  Downside: real work in the agent; a round trip.

Recommendation: **B2 is the architecturally correct end state** (keeps the agent
the authority, one write protocol for hardware readers and phones alike), but
**B1 is the faster spike**. Decide before building writes — this is the single
biggest fork in the contract.

---

## 7. Trust & permission model (do not skip)

The bridge lets a **remote, third-party-controlled server** drive the NFC radio on
someone's phone and render arbitrary UI. That is a real attack surface and the
contract is incomplete without a policy.

1. **Which servers may load a UI into the webview.** Options, roughly in order of
   safety: explicit user pairing (QR / mDNS pick, as the shell already does) →
   allow-list persisted per install → TOFU with a visible server identity. The
   agent already ships auto-TLS (WSS) + a CA bootstrap and an optional
   `-api-secret`; build pairing/attestation on that rather than "type an IP and
   trust it." Cleartext (`usesCleartextTraffic: true` in `app.json`) should be
   dev-only.
2. **Per-origin capability grants.** The loaded origin gets a grant set. Read verbs
   (`nfc.getState`, `nfc.tag` events, `getCapabilities`) are low-risk and can be
   granted on pair. **Destructive verbs (`nfc.write`, `nfc.lock`, `nfc.erase`)
   require explicit user consent** — `lock` is irreversible and deserves a
   distinct, scary confirmation. `bridge.hello` returns the current `grants` so
   the UI can render only what it's allowed to invoke.
3. **The shell is the enforcement point, not the UI.** Every mutating method
   re-checks the grant natively; never trust the page to self-limit.
4. **One origin at a time.** Switching servers (`server.switch`) drops all grants
   and re-pairs. No ambient authority carried across hosts.

---

## 8. API stability posture (as of agent 1.0.3 + `[Unreleased]`)

The whole thesis assumes "point the bridge at any agent and it works." That only
holds if the agent's API is stable. **It is not yet — it's a fast-moving,
pre-stable API wearing a `1.0.x` version number** — but it's *well-disciplined*
churn, and the volatility is distributed in a way that happens to favor this
architecture. Verdict: build against it **defensively**, don't treat it as frozen.

### 8.1 Evidence the surface is still moving

- **A breaking change sits in `[Unreleased]` today.** The single-port
  consolidation (device 9470 / client 9471 → one listener, `?mode=device` vs
  `/ws`) **removed the `-client-port` flag** and changed the connection model.
  These are the two most recent commits on the agent. The "how do I reach the
  agent" contract just moved, and was handled as routine rather than as a major
  version bump.
- **No git tags exist.** Releases live only as `CHANGELOG` entries and
  `chore(release): cut 1.0.3` commits. There is **nothing for a third party to
  pin to** — a practical blocker for an ecosystem, not just a smell.
- **The entire write / capability / lock / erase surface is new in 1.0.3**, and
  large parts are explicitly provisional: password protection *"planned… subject
  to change until enabled"*; destructive NTAG writes *"intentionally gated off
  pending validation on real hardware"*; Type 4A *"experimental"*; DESFire frame
  sizing *"wants a hardware cross-check."*
- **The routed-write path this doc's Option B2 needs is unbuilt** —
  `deviceWriteRequest` / `deviceWriteResponse` are still *"future feature"* in
  `protocol/device.go` and are **not routed by the server**.
- **The importable contract is already out of sync with the wire.**
  `protocol/websocket.go` is explicitly *"designed to be importable without
  pulling in server dependencies"* (i.e. the artifact external tools code
  against), yet the real `tagData` is assembled from a `map[string]any` in
  `clientserver/server.go` (`"capabilities": data.Card.Capabilities()`) and the
  `protocol.TagDataPayload` struct **has no `capabilities` field at all.**
- **They already fight version skew in their own repo:** `fix(test-client):
  degrade write-result panel gracefully on older agents`.

### 8.2 Evidence it's disciplined, not chaotic

- Keep-a-Changelog + stated SemVer intent, actively maintained; docs kept aligned.
- A versioned REST namespace already exists (`/api/v1/health`).
- **A real negotiation seam exists:** device registration returns
  `serverInfo.version` + `supportedNFC`, and the client API supports
  `capabilitiesRequest` — so a client can *feature-detect* instead of assuming.
- Strong test culture (fuzzing, emulator harness, `-race`, tiered suites).

### 8.3 Why the churn lines up with the thin-client model

Volatility is **unevenly distributed**, and the split is favorable:

- **The device/read path is the oldest, most stable part**
  (`registerDevice` / `tagScanned` / `tagRemoved` / `heartbeat`). That is exactly
  what the native shell depends on (§4). The safe layer is the load-bearing layer.
- **The client/UI path is where all the churn is** — but that path **ships from
  the same agent that defines it.** A server-hosted UI and the server protocol
  version *in lockstep, always mutually compatible.* This is a genuine argument
  *for* the webview model: it dissolves version skew for the UI, because the UI is
  never older or newer than its agent. Skew only bites the layers that **don't**
  ship from the agent — the native bridge contract and device registration — which
  is precisely what §8.4 freezes.

### 8.4 Rules that follow from this

- **Don't build against the importable `protocol` Go package** — it's stale (§8.1).
  Build against the live wire + `docs/api.md`, and gate behavior on
  `serverInfo.version` + `capabilitiesRequest`, **never on assumptions.**
- **Near term, prefer B1 (native write) over B2 (routed `deviceWriteRequest`)** —
  B2's server path does not exist yet (§6.6). B2 is an upstream contribution to
  make, not a dependency to take today.
- **Treat "how to reach the agent" as configuration, not a constant.** The
  unreleased single-port change helps the bridge (one URL) but proves the
  connection model itself is still in motion; keep it in `services/discovery.ts` /
  config, not hardcoded.
- **`bridgeVersion` is semver.** **Add** a method/field → minor. **Change/remove**
  semantics → major. UIs pin a **minimum** bridge version and feature-detect the
  rest from `bridge.hello.methods`.
- **Freeze the device WS protocol and the bridge contract** — the two layers that
  don't ship from the agent. They're what let an old bridge keep working with a new
  agent. Evolve capability through the client API (which rides along with the UI),
  not by mutating the device handshake.

### 8.5 The open question that isn't code

The single biggest gap for a third-party ecosystem is not technical: **the
maintainer needs to commit to tagged releases and an explicit API-stability
statement.** Today "point your bridge at any agent" has no version to pin against.
Resolve this — intended freeze point, tagging cadence, what counts as a breaking
change — before onboarding external partners. It's a people/governance decision,
not an implementation one.

---

## 9. Single binary vs. per-partner build (product decision)

Both are viable on this architecture; the code is ~identical.

- **One published binary**, runtime server selection (what the `server-list` modal
  already does). Best for an open ecosystem; leans hardest on §7 trust.
- **Per-partner build**: same code, build-time config (server URL + icon + name +
  pinned host). Each partner gets a branded store listing and a locked host, which
  sidesteps most of §7 and reads better to app-store review. `eas.json` +
  `app.json` already make this a config flip.

This choice changes pairing UX and store strategy but not the contract. Worth
settling early.

---

## 10. What to build first (spike checklist)

1. **Agent:** add a `go:embed` static route serving a minimal client web app on
   the existing port. (Net-new; agent serves no HTML today.)
2. **Bridge:** add a webview screen that loads the current agent's served UI; keep
   the native device connection feeding scans. → **Option A working.**
3. Prototype the `postMessage` shim + `bridge.hello` + `nfc.getState`/`nfc.tag`
   events. → contract skeleton.
4. Decide **B1 vs B2** for writes (§6.6); implement the chosen write path.
5. Draft the pairing/grant flow (§7) before exposing any mutating verb.

Steps 1–2 prove the thesis with minimal risk; 3–5 harden it into the real product.
