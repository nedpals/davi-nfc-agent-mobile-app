import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { nfcService } from "@/services/nfc";

export default function RootLayout() {
  // Initialize NFC service on app start
  useEffect(() => {
    nfcService.init().catch(console.error);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#FFFFFF" },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" />
        <Stack.Screen
          name="(modals)"
          options={{
            presentation: "modal",
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
