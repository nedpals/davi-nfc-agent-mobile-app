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
app browses for it and auto-connects when exactly one agent is found. Its TXT
records carry the port, the path and whether TLS is on.

**TLS.** The agent generates and persists a certificate on first run, so it
serves `wss://` unless started with `-auto-tls=false`. The app assumes TLS
unless the agent's TXT records or an explicit `ws://` prefix say otherwise.

Because that certificate is signed by a CA the agent generates itself, the phone
must trust it before `wss://` will complete. **Settings → Install agent
certificate** opens the agent's bootstrap page (plain HTTP, port 9472), which
serves the CA in the right format per platform. On Android, trusting a
user-installed CA also requires the app to opt in, which it does via
`plugins/with-android-user-ca-trust.js`.

**Authentication.** The agent generates an API secret on first run and checks it
before the WebSocket handshake, exempting only loopback — so a phone always
needs it. Enter it in **Settings → API secret**; a wrong or missing one fails as
an HTTP 401 on the handshake rather than as an error on the socket. It is stored
alongside the server URL, so a paired phone reconnects without re-entry.

## Protocol

The device side of [the agent's API](https://github.com/dotside-studios/davi-nfc-agent/blob/master/docs/api.md#device-api).
The app sends `registerDevice`, then `tagScanned`, `tagRemoved` and a
`deviceHeartbeat` every 10 seconds; the agent replies with
`registerDeviceResponse` and `error`.

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
