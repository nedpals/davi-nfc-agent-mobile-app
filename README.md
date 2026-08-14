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

## Connecting to an agent

The agent serves devices and clients on **one port** (default 9470), telling
them apart by a `mode=device` query parameter rather than by the port. The app
appends that itself; a host and port are all you need to supply.

**Discovery.** The agent advertises `_nfc-device._tcp` on the local network. The
app browses for it and auto-connects when exactly one agent is found, taking the
port and path from the advertisement. Whether the agent is serving TLS is not
advertised — the app assumes it is, and pairing reports it for certain.

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

> **Not yet implemented.** React Native's WebSocket exposes no hook for
> certificate verification, so the pin is stored but not yet checked, and a
> `wss://` connection to a self-signed agent will fail. Until native trust
> evaluation lands on both platforms, run the agent with `-auto-tls=false` and
> connect over `ws://`. See [Verifying the pin](#verifying-the-pin).

## Verifying the pin

Closing this needs a native module per platform, because RN's WebSocket does not
surface the server trust decision to JavaScript. The agent's
[device setup guide](https://github.com/dotside-studios/davi-nfc-agent/blob/master/docs/device-setup.md)
carries working implementations and both traps worth knowing:

- **Android** — supply a custom `X509TrustManager`. OkHttp's `CertificatePinner`
  does not work here: it runs after chain validation, so a self-signed
  certificate is rejected before the pin is consulted.
- **iOS** — handle the server-trust challenge in `URLSessionDelegate`.
  `SecKeyCopyExternalRepresentation` returns the raw key rather than SPKI DER, so
  it needs the ASN.1 header prepended before hashing or it can never match.

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

Capabilities are declared per platform and honestly: read only, no transceive,
no lock, and MIFARE Classic on Android only, since CoreNFC cannot reach it.

Device identity is per-connection: the agent mints a fresh `deviceID` on each
registration and drops it when the socket closes, so a reconnect is a new
device. Tags scanned while disconnected are kept in local history but are not
replayed to the agent.

## Layout

| Path | What it is |
|---|---|
| `services/websocket.ts` | The agent connection — registration, heartbeat, reconnection |
| `services/agent-url.ts` | Builds the device URL: scheme, path, discriminator, secret |
| `services/discovery.ts` | mDNS browsing and the URL built from a resolved service |
| `services/nfc.ts` | Tag reading, NDEF parsing, UID and technology normalization |
| `stores/index.ts` | Zustand store; what persists is set by `partialize` |
| `types/protocol.ts` | Wire types for every message in both directions |
| `plugins/` | Config plugins applied at prebuild |
