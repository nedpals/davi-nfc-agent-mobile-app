import { act, renderWithProviders as render, screen, waitFor } from "@/test-utils/render";
import * as SecureStore from "expo-secure-store";
import { useAppStore } from "@/stores";
import type { DiscoveredServer } from "@/types/protocol";

import HistoryScreen from "@/app/(modals)/history";
import ScannerScreen from "@/app/index";
import ServerListScreen from "@/app/(modals)/server-list";
import SettingsScreen from "@/app/settings";

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
}));

// Discovery is driven through the store here; browsing for real would clear the
// servers each test puts there.
jest.mock("@/services/discovery", () => ({
  discoveryService: {
    startDiscovery: jest.fn(() => Promise.resolve()),
    stopDiscovery: jest.fn(),
    restartDiscovery: jest.fn(() => Promise.resolve()),
    buildWebSocketUrl: jest.fn(() => "wss://192.168.1.5:9470/ws?mode=device"),
  },
  preferredAddress: (server: DiscoveredServer) => server.addresses[0] ?? server.host,
}));

const update = (change: () => void) => act(() => { change(); });

beforeEach(() => {
  useAppStore.getState().reset();
  jest.clearAllMocks();
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
});

describe("scanner screen", () => {
  it("renders the reader and the connection card", async () => {
    render(<ScannerScreen />);

    expect(screen.getByText("DAVI NFC")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Scanning")).toBeTruthy());
  });

  it("explains itself when the device has no NFC at all", async () => {
    render(<ScannerScreen />);
    update(() => useAppStore.getState().setNFCSupported(false));

    await waitFor(() =>
      expect(screen.getByText("This device has no NFC reader, so it cannot scan tags.")).toBeTruthy()
    );
  });

  it("offers the NFC settings when the adapter is switched off", async () => {
    render(<ScannerScreen />);
    update(() => {
      useAppStore.getState().setNFCSupported(true);
      useAppStore.getState().setNFCEnabled(false);
    });

    await waitFor(() =>
      expect(screen.getByText("NFC is switched off in system settings.")).toBeTruthy()
    );
  });

  it("warns that scans are local while the agent has not registered the device", async () => {
    render(<ScannerScreen />);

    await waitFor(() => expect(screen.getByText("Scanning")).toBeTruthy());
    update(() => useAppStore.getState().setConnectionStatus("connected"));

    await waitFor(() =>
      expect(screen.getByText("Not registered yet — scans are kept on this device.")).toBeTruthy()
    );
  });

  it("names the agent it is registered with", async () => {
    render(<ScannerScreen />);
    update(() => {
      useAppStore.getState().setDeviceName("Kiosk phone");
      useAppStore.getState().setConnectionStatus("registered");
    });

    await waitFor(() => expect(screen.getByText("Registered as Kiosk phone")).toBeTruthy());
  });
});

describe("history screen", () => {
  it("says there is nothing yet", () => {
    render(<HistoryScreen />);
    expect(screen.getByText("No scans yet")).toBeTruthy();
  });

  it("lists what has been scanned", () => {
    useAppStore.getState().addScannedTag({
      uid: "04:A2:0B:00",
      technology: "ISO14443A",
      type: "NTAG",
      scannedAt: new Date(),
      sentToServer: true,
    });

    render(<HistoryScreen />);

    expect(screen.getByText("04:A2:0B:00")).toBeTruthy();
    expect(screen.getByText("Sent")).toBeTruthy();
  });
});

describe("server list screen", () => {
  it("reports an empty network rather than an empty screen", async () => {
    render(<ServerListScreen />);

    await waitFor(() => expect(screen.getByText("No agents found")).toBeTruthy());
  });

  it("lists an agent that answered", async () => {
    render(<ServerListScreen />);

    update(() =>
      useAppStore.getState().addDiscoveredServer({
        name: "davi-agent",
        host: "kiosk.local",
        port: 9470,
        addresses: ["192.168.1.5"],
        txtRecords: { version: "1.0.4", tls: "true" },
      })
    );

    await waitFor(() => expect(screen.getByText("davi-agent")).toBeTruthy());
    expect(screen.getByText("192.168.1.5:9470")).toBeTruthy();
    expect(screen.getByText("v1.0.4")).toBeTruthy();
  });
});

describe("settings screen", () => {
  it("shows the pairing form until the device holds a credential", async () => {
    render(<SettingsScreen />);

    await waitFor(() => expect(screen.getByText("Pair with agent")).toBeTruthy());
    expect(screen.getByPlaceholderText("Six-digit PIN")).toBeTruthy();
    expect(screen.getByPlaceholderText("Shared API secret")).toBeTruthy();
  });

  it("describes the credential the keychain is holding", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
      JSON.stringify({
        host: "192.168.1.5",
        agentPort: 9470,
        deviceID: "device-1",
        deviceToken: "secret-token",
        publicKeyPin: "sha256/abcdef",
      })
    );

    render(<SettingsScreen />);

    await waitFor(() => expect(screen.getByText("Unpair")).toBeTruthy());
    expect(screen.getByText("192.168.1.5")).toBeTruthy();
    // The shared secret is the fallback for an unpaired device, so it stops
    // being offered once there is a credential of this device's own.
    expect(screen.queryByPlaceholderText("Shared API secret")).toBeNull();
    // And the token itself never reaches the screen.
    expect(screen.queryByText(/secret-token/)).toBeNull();
  });
});
