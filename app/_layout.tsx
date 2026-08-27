import { Stack, useRootNavigationState, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "@/constants/theme";
import { nfcService } from "@/services/nfc";
import { isPairingUri, parsePairingUri } from "@/services/pairing-uri";

/**
 * Open the pair screen when the agent's pairing QR is what launched the app.
 *
 * The QR encodes a `davi-pair://` URL, so the phone's own camera app opens it
 * and this is where it lands. The URL is parsed here rather than mapped to a
 * route: its authority is the agent's address, not a screen name, so nothing
 * expo-router could match it against would mean the right thing.
 */
function usePairingLinks() {
  const router = useRouter();
  const url = Linking.useURL();
  // A cold start replays its launch URL, and re-pushing on every render of the
  // same link would stack the screen.
  const handled = useRef<string | null>(null);
  // Pushing before the navigator exists is dropped silently.
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!url || !navigationState?.key || handled.current === url || !isPairingUri(url)) {
      return;
    }
    handled.current = url;

    try {
      const invitation = parsePairingUri(url);
      router.push({
        pathname: "/(modals)/pair",
        params: {
          host: invitation.host,
          port: String(invitation.port),
          spki: invitation.spki,
          ...(invitation.code ? { code: invitation.code } : {}),
          ...(invitation.name ? { name: invitation.name } : {}),
        },
      });
    } catch (error) {
      // A malformed link is the QR's problem, and there is no screen to report
      // it on that the person did not already choose to leave.
      console.warn("[Linking] Ignoring an unreadable pairing link:", error);
    }
  }, [url, navigationState?.key, router]);
}

export default function RootLayout() {
  // Starting the reader here gets the adapter ready before the scanner screen
  // mounts; the service shares one initialisation between callers.
  useEffect(() => {
    nfcService.init().catch(console.error);
  }, []);

  usePairingLinks();

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="(modals)" options={{ presentation: "modal" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
