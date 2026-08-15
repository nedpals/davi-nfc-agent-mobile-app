import { act, renderHook, waitFor } from "@testing-library/react-native";
import { STORED_ADDRESS_GRACE } from "@/constants/config";
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

    await waitFor(() => expect(websocketService.connectAndRegister).toHaveBeenCalled());
    expect((websocketService.connectAndRegister as jest.Mock).mock.calls[0][0]).toBe(
      "wss://agent.local:9470/ws?mode=device"
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

// A network that carries no mDNS never answers, and the app would sit looking
// for an agent whose address it is already holding.
describe("falling back to the remembered address", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const remember = (url: string) => {
    act(() => {
      useAppStore.getState().setServerUrl(url);
    });
  };

  it("dials the address it knows when discovery turns up nothing", () => {
    remember("192.168.1.5:9470");
    renderHook(() => useAutoConnect());

    act(() => {
      jest.advanceTimersByTime(STORED_ADDRESS_GRACE + 10);
    });

    // A single attempt: a stale address must not swallow the reconnect budget.
    expect(websocketService.connectAndRegister).toHaveBeenCalledWith("192.168.1.5:9470", {
      retryOnFailure: false,
    });
  });

  it("gives discovery first refusal", () => {
    remember("192.168.1.5:9470");
    renderHook(() => useAutoConnect());

    act(() => {
      jest.advanceTimersByTime(STORED_ADDRESS_GRACE - 100);
    });

    expect(websocketService.connectAndRegister).not.toHaveBeenCalled();
  });

  it("leaves the remembered address alone once an agent answers", () => {
    remember("192.168.1.5:9470");
    renderHook(() => useAutoConnect());

    act(() => {
      useAppStore.getState().addDiscoveredServer(server("agent"));
    });
    act(() => {
      jest.advanceTimersByTime(STORED_ADDRESS_GRACE + 10);
    });

    const dialled = (websocketService.connectAndRegister as jest.Mock).mock.calls.map(
      ([url]) => url
    );
    expect(dialled).not.toContain("192.168.1.5:9470");
  });

  it("stays away after the user disconnected on purpose", () => {
    remember("192.168.1.5:9470");
    renderHook(() => useAutoConnect());

    act(() => {
      useAppStore.getState().disconnect();
    });
    act(() => {
      jest.advanceTimersByTime(STORED_ADDRESS_GRACE + 10);
    });

    expect(websocketService.connectAndRegister).not.toHaveBeenCalled();
  });

  it("does nothing when there is no address to remember", () => {
    renderHook(() => useAutoConnect());

    act(() => {
      jest.advanceTimersByTime(STORED_ADDRESS_GRACE + 10);
    });

    expect(websocketService.connectAndRegister).not.toHaveBeenCalled();
  });
});
