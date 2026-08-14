import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "@/constants/theme";
import { nfcService } from "@/services/nfc";

export default function RootLayout() {
  // Starting the reader here gets the adapter ready before the scanner screen
  // mounts; the service shares one initialisation between callers.
  useEffect(() => {
    nfcService.init().catch(console.error);
  }, []);

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
