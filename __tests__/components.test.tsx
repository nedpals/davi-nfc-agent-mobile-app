import { act, fireEvent, renderWithProviders as render, screen, waitFor } from "@/test-utils/render";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { Notice } from "@/components/Notice";
import { ScanButton } from "@/components/ScanButton";
import { TagCard } from "@/components/TagCard";
import { TagDrawer } from "@/components/TagDrawer";
import { OPERATION_SUCCESS_LINGER } from "@/utils/operations";
import type { ScannedTag, TagOperation } from "@/types/protocol";

const operation = (overrides: Partial<TagOperation> = {}): TagOperation => ({
  kind: "write",
  tagUID: "04:A2:0B:00",
  status: "running",
  startedAt: new Date(),
  ...overrides,
});

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

  it("offers a way back when the connection has given up", () => {
    const onRetry = jest.fn();
    render(<ConnectionStatus status="error" error="Could not reach the agent" onRetry={onRetry} />);

    fireEvent.press(screen.getByLabelText("Try connecting again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
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
    fireEvent.press(screen.getByText("Hold a tag to the back of the phone"));
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

describe("TagDrawer during an agent operation", () => {
  it("asks the person to hold the tag still while the agent writes", () => {
    render(<TagDrawer tag={tag} operation={operation()} onClear={jest.fn()} />);

    expect(screen.getByText("Writing to the tag — hold it still")).toBeTruthy();
  });

  // Dismissing would withdraw the tag the write is targeting, since the service
  // reads the current tag straight off the last scan.
  it("refuses to be dismissed while an operation is running", () => {
    const onClear = jest.fn();
    render(<TagDrawer tag={tag} operation={operation()} onClear={onClear} />);

    fireEvent.press(screen.getByLabelText("Dismiss tag"));
    expect(onClear).not.toHaveBeenCalled();
  });

  it("can be dismissed again once the operation is over", () => {
    const onClear = jest.fn();
    render(
      <TagDrawer
        tag={tag}
        operation={operation({ status: "succeeded" })}
        onClear={onClear}
        onOperationDone={jest.fn()}
      />
    );

    fireEvent.press(screen.getByLabelText("Dismiss tag"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("reports a written tag", () => {
    render(
      <TagDrawer
        tag={tag}
        operation={operation({ status: "succeeded" })}
        onClear={jest.fn()}
        onOperationDone={jest.fn()}
      />
    );

    expect(screen.getByText("The agent wrote this tag")).toBeTruthy();
    expect(screen.getByText("Written")).toBeTruthy();
  });

  it("asks for the tag again when it was taken away", () => {
    render(
      <TagDrawer
        tag={tag}
        operation={operation({ status: "failed", errorCode: "TAG_REMOVED" })}
        onClear={jest.fn()}
        onOperationDone={jest.fn()}
      />
    );

    expect(screen.getByText("Present the tag again to finish")).toBeTruthy();
  });

  // The agent can ask for a write when nothing is on the reader, and that
  // request is the only reason the person would know to present one.
  it("shows a request that arrived with no tag present", () => {
    render(
      <TagDrawer
        tag={null}
        operation={operation({ tagUID: null, status: "failed", errorCode: "TAG_NOT_CONNECTED" })}
        onClear={jest.fn()}
        onOperationDone={jest.fn()}
      />
    );

    expect(screen.getByText("No tag present")).toBeTruthy();
    expect(screen.getByText("Present the tag again to finish")).toBeTruthy();
  });

  it("gets out of the way once the outcome has been read", () => {
    jest.useFakeTimers();
    const onOperationDone = jest.fn();

    try {
      render(
        <TagDrawer
          tag={tag}
          operation={operation({ status: "succeeded" })}
          onClear={jest.fn()}
          onOperationDone={onOperationDone}
        />
      );

      expect(onOperationDone).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(OPERATION_SUCCESS_LINGER + 10);
      });
      expect(onOperationDone).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("stays put while the operation is still running", () => {
    jest.useFakeTimers();
    const onOperationDone = jest.fn();

    try {
      render(
        <TagDrawer tag={tag} operation={operation()} onClear={jest.fn()} onOperationDone={onOperationDone} />
      );

      act(() => {
        jest.advanceTimersByTime(60_000);
      });
      expect(onOperationDone).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("TagCard", () => {
  it("keeps the list scannable by summarising records until asked", () => {
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
        onToggle={jest.fn()}
      />
    );

    expect(screen.getByText("1 NDEF record")).toBeTruthy();
    expect(screen.queryByText("Hello tag")).toBeNull();
  });

  it("shows decoded NDEF content once expanded", () => {
    render(
      <TagCard
        expanded
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

  it("copies the UID, which is what gets pasted elsewhere", async () => {
     
    const Clipboard = require("expo-clipboard");
    render(<TagCard expanded tag={tag} />);

    fireEvent.press(screen.getByText("Copy UID"));

    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith("04:A2:0B:00"));
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy());
  });

  it("expands and collapses on a tap", () => {
    const onToggle = jest.fn();
    render(<TagCard tag={tag} onToggle={onToggle} />);

    fireEvent.press(screen.getByLabelText("Tag 04:A2:0B:00"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("keeps what the agent did to the tag", () => {
    render(
      <TagCard
        tag={{
          ...tag,
          operations: [
            { kind: "write", succeeded: true, at: new Date() },
            { kind: "transceive", succeeded: false, at: new Date() },
          ],
        }}
      />
    );

    expect(screen.getByText("Written")).toBeTruthy();
    expect(screen.getByText("Exchange failed")).toBeTruthy();
  });

  it("describes a record it could not decode instead of showing nothing", () => {
    render(
      <TagCard
        expanded
        tag={{ ...tag, ndefMessage: { records: [{ tnf: 2, type: "AQ==", payload: "AQI=" }] } }}
      />
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
