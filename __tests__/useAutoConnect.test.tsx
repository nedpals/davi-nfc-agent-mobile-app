import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useAppStore } from "@/stores";
import type { DiscoveredServer } from "@/types/protocol";

jest.mock("@/services/discovery", () => ({
  discoveryService: {
    startDiscovery: jest.fn(() => Promise.resolve()),
    stopDiscovery: jest.fn(),
    restartDiscovery: jest.fn(() => Promise.resolve()),
    buildWebSocketUrl: jest.fn((server: DiscoveredServer) => `wss://${server.host}:${server.port}/ws?mode=device`),
  },
}));

jest.mock("@/services/websocket", () => ({
  websocketService: { connectAndRegister: jest.fn(() => Promise.resolve()) },
}));

 
const { useAutoConnect } = require("@/hooks/useAutoConnect");
 
const { discoveryService } = require("@/services/discovery");
 
const { websocketService } = require("@/services/websocket");

const server = (name: string): DiscoveredServer => ({
  name,
  host: `${name}.local`,
  port: 9470,
  addresses: ["192.168.1.5"],
  txtRecords: {},
});

beforeEach(() => {
  useAppStore.getState().reset();
  jest.clearAllMocks();
});

describe("discovery lifecycle", () => {
  it("browses while there is nothing to talk to", () => {
    renderHook(() => useAutoConnect());
    expect(discoveryService.startDiscovery).toHaveBeenCalledTimes(1);
  });

  it("stops browsing once a connection is established", () => {
    const { rerender } = renderHook(() => useAutoConnect());

    act(() => {
      useAppStore.getState().setConnectionStatus("registered");
    });
    rerender({});

    expect(discoveryService.stopDiscovery).toHaveBeenCalledTimes(1);
  });

  it("browses again when the socket layer has spent its retries", () => {
    const { rerender } = renderHook(() => useAutoConnect());

    act(() => {
      useAppStore.getState().setConnectionStatus("registered");
    });
    rerender({});
    act(() => {
      useAppStore.getState().failConnection("Could not reach the agent");
    });
    rerender({});

    expect(discoveryService.startDiscovery).toHaveBeenCalledTimes(2);
  });

  it("leaves an agent alone after the user disconnects on purpose", () => {
    const { rerender } = renderHook(() => useAutoConnect());
    jest.clearAllMocks();

    act(() => {
      useAppStore.getState().disconnect();
    });
    rerender({});

    expect(discoveryService.startDiscovery).not.toHaveBeenCalled();
    expect(websocketService.connectAndRegister).not.toHaveBeenCalled();
  });

  it("does not browse while the phone has no network", async () => {
     
    const NetInfo = require("@react-native-community/netinfo").default;
    let emit: ((state: { isConnected: boolean }) => void) | undefined;
    (NetInfo.addEventListener as jest.Mock).mockImplementation((listener) => {
      emit = listener;
      return jest.fn();
    });

    renderHook(() => useAutoConnect());
    act(() => {
      emit?.({ isConnected: false });
    });

    await waitFor(() => expect(discoveryService.stopDiscovery).toHaveBeenCalled());
  });
});

describe("auto-connecting", () => {
  it("connects on its own when exactly one agent answers", async () => {
    renderHook(() => useAutoConnect());

    act(() => {
      useAppStore.getState().addDiscoveredServer(server("agent"));
    });

    await waitFor(() =>
      expect(websocketService.connectAndRegister).toHaveBeenCalledWith(
        "wss://agent.local:9470/ws?mode=device"
      )
    );
  });

  it("leaves the choice to the user when several agents answer", async () => {
    renderHook(() => useAutoConnect());

    act(() => {
      useAppStore.getState().addDiscoveredServer(server("agent-a"));
      useAppStore.getState().addDiscoveredServer(server("agent-b"));
    });

    await waitFor(() => expect(discoveryService.startDiscovery).toHaveBeenCalled());
    expect(websocketService.connectAndRegister).not.toHaveBeenCalled();
  });

  it("does not dial the same failing agent over and over", async () => {
    (websocketService.connectAndRegister as jest.Mock).mockRejectedValue(new Error("refused"));

    const { rerender } = renderHook(() => useAutoConnect());
    act(() => {
      useAppStore.getState().addDiscoveredServer(server("agent"));
    });

    await waitFor(() => expect(websocketService.connectAndRegister).toHaveBeenCalledTimes(1));

    act(() => {
      useAppStore.getState().clearDiscoveredServers();
      useAppStore.getState().addDiscoveredServer(server("agent"));
    });
    rerender({});

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(websocketService.connectAndRegister).toHaveBeenCalledTimes(1);
  });
});
