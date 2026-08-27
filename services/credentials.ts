import * as SecureStore from "expo-secure-store";
import type { AgentCredential, KeySource } from "@/types/protocol";

// The credential lives in the keychain / keystore rather than beside the rest
// of the app's state: it is a bearer token, and the agent cannot reissue it —
// losing it means pairing again, and leaking it means someone else can be this
// device until it is revoked from the tray.
const CREDENTIAL_KEY = "davi.nfc.agent.credential";

/**
 * Where a stored credential's key came from, for one written before the field
 * existed.
 *
 * Every such pairing went over the cleartext bootstrap listener and took the
 * key from the response, so `response` is what they were rather than a
 * pessimistic guess. An empty key means the agent served no TLS.
 */
function keySourceOf(stored: Partial<AgentCredential>): KeySource {
  if (stored.keySource) {
    return stored.keySource;
  }
  return stored.publicKeyPin ? "response" : "none";
}

export async function loadCredential(): Promise<AgentCredential | null> {
  try {
    const raw = await SecureStore.getItemAsync(CREDENTIAL_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<AgentCredential>;
    if (!parsed.deviceToken) {
      return null;
    }
    // Filled in here so nothing downstream has to know the field is optional on
    // disk but not in the type.
    return { ...(parsed as AgentCredential), keySource: keySourceOf(parsed) };
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
