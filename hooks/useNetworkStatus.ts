import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

/**
 * Whether the phone is on a network at all.
 *
 * The agent lives on the LAN, so this cannot say the agent is reachable — but
 * it can say for certain when nothing is, which is worth showing rather than
 * letting the app read as a failed agent.
 */
export function useNetworkStatus(): { isOnline: boolean } {
  // Assume online until told otherwise, so a slow first reading never shows a
  // false alarm.
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected !== false);
    });
  }, []);

  return { isOnline };
}
