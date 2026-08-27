# Davi NFC Scanner

An Expo app that turns a phone into a remote NFC reader for the
[Davi NFC Agent](https://github.com/dotside-studios/davi-nfc-agent). It scans
tags and streams them to the agent, which broadcasts them to the agent's own
clients.

On Android the agent can also drive it: writing a tag, locking one, and
exchanging raw commands with it. On iOS the phone stays a read-only sensor,
because CoreNFC has no held tag for the agent to act on — see
[Writing tags](#writing-tags).

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
recent are held for the session and the newest twenty survive a restart. A row
opens for the full record: when it was read, what its NDEF records hold, and a
**Copy UID**, since a UID is what gets pasted into whatever the tag is being
registered with. Dismissing the tag in the drawer tells the agent it is gone.

## Connecting to an agent

The agent serves devices and clients on **one port** (default 9470), telling
them apart by a `mode=device` query parameter rather than by the port. The app
appends that itself; a host and port are all you need to supply.

**Discovery.** The agent advertises `_nfc-device._tcp` on the local network. The
app browses for it and auto-connects when exactly one agent is found, taking the
port and path from the advertisement. Whether the agent is serving TLS is not
advertised — the app assumes it is, and pairing reports it for certain.

**When mDNS does not carry.** Plenty of networks drop multicast, and on one of
those the app would sit looking for an agent whose address it is already
holding. Discovery gets first refusal — it is the only way to notice an agent
that has moved — and if nothing answers within a few seconds the remembered
address is dialled once. Once, deliberately: an address that has gone stale
must not spend the reconnect budget that belongs to an agent still findable, so
a single attempt that fails leaves the app searching rather than camped on it.
**Agents nearby** also takes an address typed in by hand, so an agent that
cannot be discovered can still be reached from the screen that failed to find
it.

Browsing runs only while there is nothing to talk to, and starts again by
itself once the socket layer has spent its reconnect budget — except after
**Disconnect**, which is taken as meaning it. An agent that refuses a
connection is left alone for fifteen seconds rather than dialled in a loop, and
more than one agent on the network is a choice the app leaves to you.

**Settings → What this device offers** shows the capability declaration this
device sends the agent — read, write, raw exchange, lock, and how long it can
hold a tag — read from the same function that builds the declaration, so the
screen cannot promise something the agent will not be told.

**Pairing.** Pairing exchanges the six-digit PIN the agent shows on the kiosk
for this device's own credential. It runs over TLS on the agent's own port
(`https://<host>:9470/pair`), pinned to the key the agent's QR carries. Five
wrong PINs lock pairing until the agent restarts.

**Read the QR.** The agent prints one at startup beside its PIN, encoding
`davi-pair://<host>:9470/?spki=…&code=…&name=…`. `spki` is the agent's public
key pin, and it is the one value a device cannot obtain safely over the network:
everything else the app could ask the network for, but a key the network hands
over is a key an attacker can substitute. Three ways in, all landing on the same
screen: **scan it in the app** (Pair → *Scan the agent's QR*), **read it with
the phone's own camera**, which opens the link straight into the pair screen, or
**paste the link** into the box on that screen.

**Pairing without the QR still works, and says that it did.** Typing a bare PIN
pairs trust-on-first-use: the PIN authorizes the exchange, but nothing proves
the agent answering is the one that printed it, so the credential is stored with
`pinVerified: false` and the screen says so before it is used. Read the QR where
you can.

> Agent 1.2.0 moved this. Pairing used to be a plain HTTP POST to the bootstrap
> listener on 9472, which handed the token and the key pin to anyone watching
> the network and let an active attacker substitute a pin of their own. That
> listener keeps its port and stays cleartext — it hands out the certificate
> authority to a device that does not trust the agent's certificate yet — but it
> no longer routes `/pair`, so this app does not pair with agents older than
> 1.2.0.

What comes back is a `deviceToken`, presented on every later connection, and the
agent's `publicKeyPin`, which repeats the `spki` the QR carried and is checked
against it. Both go to the keychain / keystore — the token is shown once, since
the agent keeps only its hash. Each device's credential is revocable on its own
from the agent's tray, which is what the shared API secret cannot do: rotating
that logs out everything at once. The secret still works and remains in Settings
as the fallback for an agent nobody has paired with.

**A revoked credential now ends the session it is on.** The agent used to check
a credential once, at the upgrade, so a device revoked while connected kept
streaming scans until it reconnected — which for a heartbeating device is never.
Agent 1.2.0 closes the session with a policy violation (1008) instead. The app
reads the close code, says the credential was revoked, and stops reconnecting:
it is refused just as fast on the next attempt.

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

## When a connection fails

The platform's own text is what a failure arrives as, and on Android that is a
Java exception. An unpaired device dialling an agent that serves its own
certificate gets `java.security.cert.CertPathValidatorException: Trust anchor
for certification path not found.`, which is accurate and tells nobody what to
do about it.

Failures are translated into what to do instead. The untrusted-certificate case
points at pairing, because that is the fix: pairing hands over the key the device
recognizes the agent by, which is what replaces a certificate authority here.

A **pin mismatch** is deliberately a different message from an **untrusted
certificate**, since the remedies differ — the first means re-pair, the second
means pair for the first time.

An unrecognised failure is shown verbatim. Flattening it into something generic
would hide the only evidence of what went wrong.

**A failure that cannot come out differently is not retried.** An untrusted
certificate, a mismatched pin and a revoked credential all need someone to pair;
retrying them spends
the reconnect budget to arrive at the same place, and the agent's log fills with
one handshake rejection per attempt. Those stop the loop and report. An agent
that merely did not answer stays retryable — it may be starting, or the network
may come back.

Note that not every agent needs pairing to connect: one given a real certificate
with `-cert`/`-key` validates normally, which is why an untrusted certificate is
reported rather than refused up front.

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

**Pairing needs the same check on an ordinary HTTPS request**, and that is a
third path again: it is the request that *hands over* the pin, so there is
nothing stored for `setPin` to arm, and RN's `fetch` offers no per-request trust
hook. `postPinned` builds a client for that one request and throws it away — an
`OkHttpClient` carrying the same trust manager on Android, an ephemeral
`URLSession` whose delegate runs the same comparison on iOS. Passing a null pin
is the deliberate trust-on-first-use pairing, and it is still refused where the
module is absent: a build that cannot pin cannot tell a verified pairing from an
unverified one afterwards either.

Since RN offers no injection point on iOS, the module swizzles
`-[SRWebSocket initWithURLRequest:protocols:]` onto the `securityPolicy:`
variant. That avoids forking React Native or replacing its WebSocket module, at
the cost of depending on an initializer signature RN could change.

**When it cannot be enforced, the connection is refused.** A pin that is not
checked is worth nothing, and an unverified socket is indistinguishable from a
verified one once it is open — a warning nobody reads is not a control. So a
held pin that cannot be honoured fails the connect rather than downgrading it:

- **No native module** — Expo Go, or a build predating it. Nothing else works
  there either, since discovery and scanning are native too, so this costs no
  working setup.
- **A cleartext URL for an agent paired over TLS.** The pin cannot apply to
  `ws://`, and reporting the connection as pinned would be a lie. If the agent
  genuinely runs with `-auto-tls=false` now, its identity basis changed —
  unpair and pair again.

Settings reports which of the two it is. `describePinning` answers the same
question without dialling anything, so the screen can say whether a pin is
enforceable before a connection is attempted; only `applyPinning` refuses.

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

`BUSY` and `MULTIPLE_TAGS` joined that taxonomy in agent 1.2.0 — work the agent
could not start because earlier work is still draining, and more than one tag in
the field where the operation needs exactly one. The first is retryable after a
pause; the second needs the tags separated first. `TAG_SEND_FAILED` is now what
a scan the agent could not publish comes back as, rather than a success it
quietly dropped.

**Frames are capped at 256 KB.** The agent's device endpoint set no read limit
before 1.2.0 and now drops the session of a device that exceeds one, without
answering. A tag whose contents would reach that is refused here instead, where
the cause is known — otherwise it would take the connection down and read as a
network fault.

An error frame is recorded without being treated as a lost connection: the
socket is still open and still registered, and one refused tag is not a reason
to tear it down. An error the agent marks non-retryable — a registration it
refuses — stops the reconnect loop instead of spending its ten attempts on an
answer that will not change.

Capabilities are declared per platform and honestly: MIFARE Classic on Android
only since CoreNFC cannot reach it, and writing and transceive on Android only —
see below.

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

**The person holding the phone is part of the operation.** A write only lands
while the tag stays in the field, so it is published to the store before it
starts rather than reported only to the agent afterwards: the tag drawer says
*"Writing to the tag — hold it still"* while it runs, then reports what
happened, and vibrates either way because the phone is against a tag and out of
sight at the time. What the agent did is kept on the scan, so the history shows
which tags were written.

Two consequences are worth knowing. Dismissing the drawer **withdraws the tag**
— `currentTagUid` is the last scan, so clearing it makes the next write fail
with `TAG_NOT_CONNECTED` — which is why the drawer cannot be dismissed or swiped
away while an operation is running. And a write that arrives when nothing is
present is shown rather than silently refused: that refusal is the only thing
that would tell someone a tag is wanted, so it asks for one.

## How long a tag stays available

The agent already delimits a hold with `tagScanned` and `tagRemoved`; what it
could not tell was how long one lasts. `maxHoldMs` in the declared capabilities
answers that.

Android omits it. Reader mode keeps a tag available for as long as it sits in
the field, so the hold is open-ended — the same thing a bench reader offers, and
what every device implied before the field existed.

iOS declares `18000`. CoreNFC connects a tag for roughly twenty seconds and
[cannot renew it](https://community.st.com/t5/st25-nfc-rfid-tags-and-readers/ios-nfc-restartpolling/td-p/734726)
— `restartPolling` stopped extending sessions from iPhone 15 onward. The
declared figure sits under the measured limit so the agent's margin is not the
only one.

It is declared once at registration rather than repeated on every scan, because
it describes the device and not the tag: CoreNFC's limit is the same whichever
tag is present. The deadline for a given tag is the arrival of its `tagScanned`
plus this, and the agent treats that as advice about what is worth attempting —
never as a gate, since a device that declares nothing is open-ended.

**This does not yet make iOS able to write.** It tells the agent what an iOS
device could offer once the CoreNFC hold flow exists; `canWrite` stays `false`
until it does.

`ndefBytes` is written in preference to the record form. It is the message the
agent already encoded and the one it calls authoritative, so nothing is lost in
translation; the record form is the fallback for agents that send only records.

`idempotencyKey` is honoured: the same key reports the first outcome instead of
writing again, because a repeated request means a lost response rather than a
second write.

**A write the tag cannot accept is refused before it is attempted.**
`getNdefStatus` reports whether the tag is locked, whether it speaks NDEF, and
how much it holds — so `READ_ONLY`, `NOT_SUPPORTED` and `CAPACITY_EXCEEDED` are
answers rather than inferences. Those are exactly the codes the agent treats as
final, and guessing one wrong is what makes it retry something that can never
work. A tag too old to report its status is written anyway and reports whatever
happens.

Everything else is mapped from three sources, in descending order of certainty:
the typed errors the library raises from iOS's numeric `NFCError` codes, its own
literal error strings, and the Java exception class names Android passes through
as text — Android hands back `ex.toString()`, so `android.nfc.TagLostException`
is a steadier thing to match than the message after it. An unrecognised failure
stays `WRITE_FAILED`, which is retryable: the agent may try again rather than
being told something is impossible on a guess.

## Transceive

`deviceTransceiveRequest` exchanges raw bytes with the tag and hands back its
reply, on the same Android-only terms as writing and over the same reused
session. `raw` picks framing-level exchange (`NfcA`) over APDU-level
(`IsoDep`) — a different technology, and a tag that answers one may not answer
the other.

**There is no idempotency key here, and that is right.** An exchange is a
question to the tag, and only the agent knows whether asking twice is safe. So
every request reaches the tag, and deciding whether to repeat one stays with the
caller.

`timeoutMs` is honoured on this side. The agent allows itself a second more than
it asks for, so a device that keeps its own deadline reports a real error
instead of both ends racing to time out — and the session is closed either way,
rather than left open holding the tag.

Worth knowing before reaching for it: each command is one network round trip.
That is fine for DESFire or ISO-DEP work, and the wrong tool for bulk reading.

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
