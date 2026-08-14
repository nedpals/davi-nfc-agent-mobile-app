const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require("expo/config-plugins");

const RESOURCE_NAME = "network_security_config";

// The agent serves wss:// with a CA it generates itself, and hands that CA to
// the phone through its bootstrap page. Android does not extend trust to
// user-installed CAs unless an app opts in, so without this the install flow
// completes and the connection still fails.
//
// Cleartext stays permitted for agents started with -auto-tls=false. Declaring
// it here rather than through android:usesCleartextTraffic keeps one file
// answering for the app's network trust.
const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

const withConfigResource = (config) =>
  withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const dir = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app/src/main/res/xml"
      );
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(
        path.join(dir, `${RESOURCE_NAME}.xml`),
        NETWORK_SECURITY_CONFIG,
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
    return modConfig;
  });

module.exports = (config) => withManifestReference(withConfigResource(config));
