import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
} from "react-native";
import { useEffect, useRef, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import type { ScannedTag } from "@/types/protocol";

interface TagDrawerProps {
  tag: ScannedTag | null;
  onClear: () => void;
}

const SNACKBAR_HEIGHT = 64;
const SWIPE_THRESHOLD = 80;

function CloseIcon({ size = 20, color = "#9CA3AF" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 6L6 18M6 6l12 12"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function TagDrawer({ tag, onClear }: TagDrawerProps) {
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, 16) + 8;

  const translateY = useRef(new Animated.Value(SNACKBAR_HEIGHT + bottomOffset + 50)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (tag) {
      // Reset horizontal position and animate in
      translateX.setValue(0);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      // Animate out
      Animated.timing(translateY, {
        toValue: SNACKBAR_HEIGHT + bottomOffset + 50,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [tag, bottomOffset]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dx) > 5;
        },
        onPanResponderMove: (_, gestureState) => {
          translateX.setValue(gestureState.dx);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (Math.abs(gestureState.dx) > SWIPE_THRESHOLD || Math.abs(gestureState.vx) > 0.5) {
            // Swipe away
            const direction = gestureState.dx > 0 ? 1 : -1;
            Animated.timing(translateX, {
              toValue: direction * 400,
              duration: 200,
              useNativeDriver: true,
            }).start(() => {
              onClear();
            });
          } else {
            // Snap back
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              tension: 100,
              friction: 10,
            }).start();
          }
        },
      }),
    [onClear]
  );

  if (!tag) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: bottomOffset,
          transform: [{ translateY }, { translateX }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={styles.content}>
        <View style={styles.info}>
          <Text style={styles.uid} numberOfLines={1}>{tag.uid}</Text>
          <View style={styles.row}>
            <Text style={styles.detail}>{tag.type}</Text>
            <Text style={styles.separator}>·</Text>
            <Text style={styles.detail}>{tag.technology}</Text>
          </View>
        </View>
        <View style={[styles.badge, tag.sentToServer ? styles.badgeSent : styles.badgeLocal]}>
          <Text style={[styles.badgeText, tag.sentToServer ? styles.badgeTextSent : styles.badgeTextLocal]}>
            {tag.sentToServer ? "Sent" : "Local"}
          </Text>
        </View>
        <TouchableOpacity style={styles.closeButton} onPress={onClear} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <CloseIcon size={20} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 12,
  },
  info: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  uid: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1F4E5F",
    fontFamily: "monospace",
    marginBottom: 2,
  },
  detail: {
    fontSize: 14,
    color: "#6B7280",
  },
  separator: {
    fontSize: 12,
    color: "#D1D5DB",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  badgeSent: {
    backgroundColor: "#D1FAE5",
  },
  badgeLocal: {
    backgroundColor: "#FEF3C7",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  badgeTextSent: {
    color: "#059669",
  },
  badgeTextLocal: {
    color: "#D97706",
  },
  closeButton: {
    padding: 4,
  },
});
