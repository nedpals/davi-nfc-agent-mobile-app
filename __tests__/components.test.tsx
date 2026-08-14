import { fireEvent, renderWithProviders as render, screen } from "@/test-utils/render";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { Notice } from "@/components/Notice";
import { ScanButton } from "@/components/ScanButton";
import { TagCard } from "@/components/TagCard";
import { TagDrawer } from "@/components/TagDrawer";
import type { ScannedTag } from "@/types/protocol";

const tag: ScannedTag = {
  uid: "04:A2:0B:00",
  technology: "ISO14443A",
  type: "NTAG",
  scannedAt: new Date(),
  sentToServer: false,
};

describe("ConnectionStatus", () => {
  it("names the device once it is registered", () => {
    render(<ConnectionStatus status="registered" deviceName="Kiosk phone" />);
    expect(screen.getByText("Registered as Kiosk phone")).toBeTruthy();
  });

  it("says how far along a reconnect is", () => {
    render(<ConnectionStatus status="reconnecting" reconnectAttempt={3} />);
    expect(screen.getByText("Reconnecting (3/10)")).toBeTruthy();
  });

  it("shows the failure rather than a bare error label", () => {
    render(<ConnectionStatus status="error" error="Could not reach the agent" />);
    expect(screen.getByText("Not connected")).toBeTruthy();
    expect(screen.getByText("Could not reach the agent")).toBeTruthy();
  });

  it("puts the network first when there is no network at all", () => {
    render(<ConnectionStatus status="error" isOnline={false} error="Could not reach the agent" />);
    expect(screen.getByText("No network")).toBeTruthy();
  });

  it("is only pressable when it has somewhere to go", () => {
    const onPress = jest.fn();
    render(<ConnectionStatus status="disconnected" onPress={onPress} />);

    fireEvent.press(screen.getByLabelText(/Connection:/));
    expect(onPress).toHaveBeenCalled();
  });
});

describe("ScanButton", () => {
  it("offers to pause while scanning", () => {
    const onPress = jest.fn();
    render(<ScanButton onPress={onPress} processingEnabled />);

    expect(screen.getByText("Scanning")).toBeTruthy();
    fireEvent.press(screen.getByText("Tap to pause"));
    expect(onPress).toHaveBeenCalled();
  });

  it("offers to resume when paused", () => {
    render(<ScanButton onPress={jest.fn()} processingEnabled={false} />);
    expect(screen.getByText("Paused")).toBeTruthy();
    expect(screen.getByText("Tap to resume")).toBeTruthy();
  });

  it("explains why it cannot be used", () => {
    const onPress = jest.fn();
    render(
      <ScanButton
        onPress={onPress}
        processingEnabled
        disabled
        disabledReason="This device has no NFC reader"
      />
    );

    expect(screen.getByText("NFC unavailable")).toBeTruthy();
    expect(screen.getByText("This device has no NFC reader")).toBeTruthy();

    fireEvent.press(screen.getByText("NFC unavailable"));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("TagDrawer", () => {
  it("shows what was scanned and whether the agent got it", () => {
    render(<TagDrawer tag={tag} onClear={jest.fn()} />);

    expect(screen.getByText("04:A2:0B:00")).toBeTruthy();
    expect(screen.getByText("Local")).toBeTruthy();
  });

  it("marks a delivered scan as sent", () => {
    render(<TagDrawer tag={{ ...tag, sentToServer: true }} onClear={jest.fn()} />);
    expect(screen.getByText("Sent")).toBeTruthy();
  });

  // The pan responder used to claim every touch, which left the dismiss button
  // and the card itself unable to respond to a tap.
  it("lets the dismiss button be tapped", () => {
    const onClear = jest.fn();
    render(<TagDrawer tag={tag} onClear={onClear} />);

    fireEvent.press(screen.getByLabelText("Dismiss tag"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("lets the card be tapped when it leads somewhere", () => {
    const onPress = jest.fn();
    render(<TagDrawer tag={tag} onClear={jest.fn()} onPress={onPress} />);

    fireEvent.press(screen.getByLabelText(/Last tag/));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when there has never been a tag", () => {
    render(<TagDrawer tag={null} onClear={jest.fn()} />);
    expect(screen.queryByText("Local")).toBeNull();
  });
});

describe("TagCard", () => {
  it("shows decoded NDEF content", () => {
    render(
      <TagCard
        tag={{
          ...tag,
          ndefMessage: {
            records: [
              { tnf: 1, type: "VA==", payload: "aGk=", recordType: "text", content: "Hello tag" },
            ],
          },
        }}
      />
    );

    expect(screen.getByText("Hello tag")).toBeTruthy();
  });

  it("describes a record it could not decode instead of showing nothing", () => {
    render(
      <TagCard tag={{ ...tag, ndefMessage: { records: [{ tnf: 2, type: "AQ==", payload: "AQI=" }] } }} />
    );

    expect(screen.getByText(/TNF 2/)).toBeTruthy();
  });
});

describe("Notice", () => {
  it("runs the action it offers", () => {
    const onAction = jest.fn();
    render(
      <Notice
        tone="warning"
        message="NFC is switched off in system settings."
        actionLabel="Open settings"
        onAction={onAction}
      />
    );

    fireEvent.press(screen.getByText("Open settings"));
    expect(onAction).toHaveBeenCalled();
  });
});
