const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require("expo/config-plugins");

const RESOURCE_NAME = "network_security_config";

// Trust anchors are deliberately absent. The agent serves wss:// with a
// self-signed certificate and hands the device its public key pin at pairing,
// so a device recognizes the agent by that pin rather than by chain of trust.
// Installing a CA would work, and is worse: a CA in the store can sign for any
// name, not just this agent.
//
// What is left here is the cleartext declaration, which Android requires for
// the ws:// path an agent started with -auto-tls=false serves.
//
// Cleartext is scoped to named hosts when the app config supplies them:
//
//   { "expo": { "extra": { "agentHosts": ["nfc-agent.local", "10.0.1.7"] } } }
//
// Without that list it is permitted broadly, because the agent is reached at
// whatever LAN address it happens to have and Android's config expresses
// hostnames rather than ranges. Naming the hosts is the tighter setting and is
// worth doing wherever the addresses are known.
function buildConfig(agentHosts) {
  if (!agentHosts.length) {
    return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;
  }

  const domains = agentHosts
    .map((host) => `      <domain includeSubdomains="true">${host}</domain>`)
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
${domains}
  </domain-config>
</network-security-config>
`;
}

const withConfigResource = (config) =>
  withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const agentHosts = modConfig.extra?.agentHosts ?? [];
      const dir = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app/src/main/res/xml"
      );
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(
        path.join(dir, `${RESOURCE_NAME}.xml`),
        buildConfig(agentHosts),
        "utf8"
      );
      return modConfig;
    },
  ]);

const withManifestReference = (config) =>
  withAndroidManifest(config, (modConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      modConfig.modResults
    );
    application.$["android:networkSecurityConfig"] = `@xml/${RESOURCE_NAME}`;
    // The manifest flag is the blunt instrument this config replaces; leaving
    // both would let the flag answer for traffic the config means to refuse.
    delete application.$["android:usesCleartextTraffic"];
    return modConfig;
  });

module.exports = (config) => withManifestReference(withConfigResource(config));
