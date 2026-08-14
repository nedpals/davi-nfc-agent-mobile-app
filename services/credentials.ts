import * as SecureStore from "expo-secure-store";
import type { AgentCredential } from "@/types/protocol";

// The credential lives in the keychain / keystore rather than beside the rest
// of the app's state: it is a bearer token, and the agent cannot reissue it —
// losing it means pairing again, and leaking it means someone else can be this
// device until it is revoked from the tray.
const CREDENTIAL_KEY = "davi.nfc.agent.credential";

export async function loadCredential(): Promise<AgentCredential | null> {
  try {
    const raw = await SecureStore.getItemAsync(CREDENTIAL_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as AgentCredential;
    return parsed.deviceToken ? parsed : null;
  } catch (error) {
    console.error("[Credentials] Failed to read stored credential:", error);
    return null;
  }
}

export async function saveCredential(credential: AgentCredential): Promise<void> {
  await SecureStore.setItemAsync(CREDENTIAL_KEY, JSON.stringify(credential));
}

export async function clearCredential(): Promise<void> {
  await SecureStore.deleteItemAsync(CREDENTIAL_KEY);
}
