# Davi NFC Scanner

An Expo app that turns a phone into a remote NFC reader for the
[Davi NFC Agent](https://github.com/dotside-studios/davi-nfc-agent). It scans
tags and streams them to the agent, which broadcasts them to the agent's own
clients.

The phone is a read-only sensor: it reports tags, and the agent does not drive
it. Writing, locking and erasing are hardware-reader operations.

## Running it

```bash
npm install
npm run android   # or: npm run ios
```

A development build is required — `react-native-zeroconf` and
`react-native-nfc-manager` are native modules, so discovery and scanning do not
work in Expo Go.

```bash
npm test          # jest-expo, no device needed
npm run lint
npx tsc --noEmit
```

The tests cover the parts that are wrong in ways a device would not make
obvious: URL building, the persisted store, tag parsing, the connect and
reconnect state machine, and the auto-connect rules. Native modules are mocked
in `jest.setup.js`, so the suite runs anywhere.

## Scanning

The reader is armed while the app is in the foreground and pauses on the way to
the background. A tag that stays against the phone is re-read continuously by
reader mode; a repeat of the same UID inside two seconds is treated as the same
presentation rather than a new scan, so it is neither recorded twice nor sent
twice.

Every scan is kept locally — **the clock button in the header** shows the
history, whether or not the agent was listening at the time. The fifty most
recent are held for the session and the newest twenty survive a restart.
Dismissing the tag in the drawer tells the agent it is gone.

## Connecting to an agent

The agent serves devices and clients on **one port** (default 9470), telling
them apart by a `mode=device` query parameter rather than by the port. The app
appends that itself; a host and port are all you need to supply.

**Discovery.** The agent advertises `_nfc-device._tcp` on the local network. The
app browses for it and auto-connects when exactly one agent is found, taking the
port and path from the advertisement. Whether the agent is serving TLS is not
advertised — the app assumes it is, and pairing reports it for certain.

Browsing runs only while there is nothing to talk to, and starts again by
itself once the socket layer has spent its reconnect budget — except after
**Disconnect**, which is taken as meaning it. An agent that refuses a
connection is left alone for fifteen seconds rather than dialled in a loop, and
more than one agent on the network is a choice the app leaves to you.

**Pairing.** **Settings → Pairing** exchanges the six-digit PIN the agent shows
on the kiosk for this device's own credential. The exchange runs over plain HTTP
on port 9472, because a device that has not yet learned the agent's key cannot
verify a TLS connection to it; the PIN is what protects it, and five wrong
attempts lock pairing until the agent restarts.

What comes back is a `deviceToken`, presented on every later connection, and the
agent's `publicKeyPin`. Both go to the keychain / keystore — the token is shown
once, since the agent keeps only its hash. Each device's credential is revocable
on its own from the agent's tray, which is what the shared API secret cannot do:
rotating that logs out everything at once. The secret still works and remains in
Settings as the fallback for an agent nobody has paired with.

**TLS.** The agent generates and persists a certificate on first run, so it
serves `wss://` unless started with `-auto-tls=false`. The app assumes TLS
unless an explicit `ws://` prefix says otherwise.

Devices are **not** meant to install a CA any more. The agent serves a
self-signed certificate from a persistent key, and a device is supposed to
recognize it by pinning `publicKeyPin` — which survives certificate reissue, so
the pin outlives the certificate.

> **Written but never built.** The pinning module below has not been compiled or
> run — it was authored in an environment with no Android SDK and no Xcode. Treat
> the first device build as the real test.

## Verifying the pin

`modules/agent-pinning` is a local Expo module that enforces the pin, because
React Native does not surface the server trust decision to JavaScript. Both
platforms need native code, and each has a trap that makes the wrong approach
look plausible.

**Android** — the pin is checked by a custom `X509TrustManager`; OkHttp's
`CertificatePinner` runs after chain validation, so it would reject a
self-signed certificate before the pin was consulted. Installing the trust
manager needs `WebSocketModule.setCustomClientBuilder`, **not**
`OkHttpClientProvider`: the provider covers `fetch` and XHR, while RN's
WebSocket module builds an `OkHttpClient` of its own
([facebook/react-native#18920](https://github.com/facebook/react-native/issues/18920)).
`PublicKey.getEncoded()` is already SPKI DER.

**iOS** — RN's WebSocket is SocketRocket, not `NSURLSession`, so the
`URLSessionDelegate` server-trust challenge never fires and TrustKit-based
libraries cannot see the connection. The reachable hook is
`SRSecurityPolicy.evaluateServerTrust:forDomain:`, and the policy has to be
built with chain validation **off** — `SRSecurityPolicy` applies it to the
stream via `kCFStreamSSLValidatesCertificateChain`, so leaving it on rejects the
self-signed certificate before the pin is consulted, exactly as
`CertificatePinner` does on Android. The key pin replaces the chain as the
identity check. `SecKeyCopyExternalRepresentation` returns the raw key rather
than SPKI DER, so the 26-byte ASN.1 P-256 header is prepended before hashing.

Since RN offers no injection point on iOS, the module swizzles
`-[SRWebSocket initWithURLRequest:protocols:]` onto the `securityPolicy:`
variant. That avoids forking React Native or replacing its WebSocket module, at
the cost of depending on an initializer signature RN could change.

**When it cannot be enforced** — in Expo Go, or any build without the module,
`applyPinning` reports `unavailable`. The connection is still made and is *not*
verified; Settings says so, and the socket layer logs a warning rather than
letting it read as secure.

## Protocol

The device side of [the agent's API](https://github.com/dotside-studios/davi-nfc-agent/blob/master/docs/api.md#device-api).

The app offers the `davi-nfc-device.v1` subprotocol and sends `hello` as its
first frame, which carries the version alongside registration. An agent that
echoes no subprotocol predates versioning, so `registerDevice` is sent instead.
The negotiated version is read from the response rather than assumed — an agent
answers at its own maximum when asked for something newer.

After that: `tagScanned`, `tagRemoved`, a `deviceHeartbeat` every 10 seconds, and
`goodbye` before an intentional disconnect. Errors carry `retryable` alongside
`code`, which is the field worth acting on — except `TAG_REMOVED`, where the
retry is asking the person to present the tag again.

An error frame is recorded without being treated as a lost connection: the
socket is still open and still registered, and one refused tag is not a reason
to tear it down. An error the agent marks non-retryable — a registration it
refuses — stops the reconnect loop instead of spending its ten attempts on an
answer that will not change.

Capabilities are declared per platform and honestly: no transceive, MIFARE
Classic on Android only since CoreNFC cannot reach it, and writing on Android
only — see below.

## Writing tags

The agent can ask this device to write the tag it is holding, via
`deviceWriteRequest`, and waits up to 20 seconds for a `deviceWriteResponse`.

**Android only.** Writing needs a technology session over a tag already in the
field. Reader mode provides that, and `requestTechnology` reuses the
registration the scanner already holds rather than opening its own — so a write
slots into the running scan loop instead of interrupting it, and cancelling
afterwards does not tear the loop down.

**iOS declares `canWrite: false`.** CoreNFC sessions are user-initiated and
modal: there is no held tag to write into, so an agent-driven write would have
to raise a system sheet and wait for someone to present the tag again. Against a
20-second deadline that is a race, and the agent routes around a device that
says it cannot write rather than timing out on one that says it can.

`ndefBytes` is written in preference to the record form. It is the message the
agent already encoded and the one it calls authoritative, so nothing is lost in
translation; the record form is the fallback for agents that send only records.

`idempotencyKey` is honoured: the same key reports the first outcome instead of
writing again, because a repeated request means a lost response rather than a
second write. Failures answer with the agent's own codes — `READ_ONLY`,
`CAPACITY_EXCEEDED`, `TAG_REMOVED` — so it can tell a refusal from a retry, and
a refusal is always answered rather than left to time out.

Device identity is per-connection: the agent mints a fresh `deviceID` on each
registration and drops it when the socket closes, so a reconnect is a new
device. Tags scanned while disconnected are kept in local history but are not
replayed to the agent.

## Layout

| Path | What it is |
|---|---|
| `services/websocket.ts` | The agent connection — registration, heartbeat, reconnection |
| `services/agent-url.ts` | Builds the device URL: scheme, port, path, discriminator, secret |
| `services/discovery.ts` | mDNS browsing and the URL built from a resolved service |
| `services/nfc.ts` | The reader's lifecycle: arming it, dedupe, and what to do with a tag |
| `services/nfc-parsing.ts` | Pure tag parsing — UID, technology, type, NDEF records |
| `stores/index.ts` | Zustand store; `partialize` sets what persists and `merge` how it comes back |
| `hooks/` | What the screens see: connection, pairing, NFC, discovery, network |
| `components/` | `Button`, `Section`, `Notice`, `EmptyState` and the screen-specific parts |
| `constants/theme.ts` | Colours, spacing, radii, type and shadows — the whole palette |
| `types/protocol.ts` | Wire types for every message in both directions |
| `plugins/` | Config plugins applied at prebuild |
| `__tests__/` | The suite described under [Running it](#running-it) |

Two details in `stores/index.ts` are worth knowing before changing them. Zustand
merges persisted state shallowly, so a `partialize` that names three fields of a
slice would replace the whole slice and leave everything it omits `undefined`;
`merge` puts each slice back on top of its defaults instead. And JSON has no
date type, so `scannedAt` and `lastConnected` come back as strings and are
revived there — a `Date` in the types has to be a `Date` at runtime.
