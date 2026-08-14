import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { colors, fontFamily, radius, shadows, spacing, typography } from "@/constants/theme";
import { formatClockTime } from "@/utils/format";
import type { ScannedTag } from "@/types/protocol";

interface TagDrawerProps {
  tag: ScannedTag | null;
  onClear: () => void;
  onPress?: () => void;
}

const HEIGHT = 64;
const SWIPE_THRESHOLD = 80;

function CloseIcon({ size = 20, color = colors.textFaint }) {
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

export function TagDrawer({ tag, onClear, onPress }: TagDrawerProps) {
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, spacing.lg) + spacing.sm;
  const hiddenOffset = HEIGHT + bottomOffset + 50;

  // The tag is kept after the prop clears so the exit animation has something
  // to play; unmounting on the spot is what made it disappear instantly.
  const [shownTag, setShownTag] = useState<ScannedTag | null>(tag);
  const translateY = useRef(new Animated.Value(hiddenOffset)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const swipedAway = useRef(false);

  useEffect(() => {
    if (tag) {
      swipedAway.current = false;
      setShownTag(tag);
      translateX.setValue(0);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
      return;
    }

    if (swipedAway.current) {
      // Already off the side of the screen — sliding it down as well would
      // animate something nobody can see.
      translateY.setValue(hiddenOffset);
      setShownTag(null);
      return;
    }

    Animated.timing(translateY, {
      toValue: hiddenOffset,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setShownTag(null);
      }
    });
  }, [tag, hiddenOffset, translateX, translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Claiming the gesture on touch-down would swallow taps meant for the
        // dismiss button and the card itself.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_, gesture) => {
          translateX.setValue(gesture.dx);
        },
        onPanResponderRelease: (_, gesture) => {
          const flung = Math.abs(gesture.dx) > SWIPE_THRESHOLD || Math.abs(gesture.vx) > 0.5;

          if (flung) {
            swipedAway.current = true;
            Animated.timing(translateX, {
              toValue: gesture.dx > 0 ? 400 : -400,
              duration: 200,
              useNativeDriver: true,
            }).start(() => onClear());
            return;
          }

          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
        },
      }),
    [onClear, translateX]
  );

  if (!shownTag) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        { bottom: bottomOffset, transform: [{ translateY }, { translateX }] },
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        style={styles.content}
        onPress={onPress}
        disabled={!onPress}
        activeOpacity={0.8}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={`Last tag ${shownTag.uid}`}
      >
        <View style={styles.info}>
          <Text style={styles.uid} numberOfLines={1}>
            {shownTag.uid}
          </Text>
          <View style={styles.meta}>
            <Text style={styles.detail}>{shownTag.type}</Text>
            <Text style={styles.separator}>·</Text>
            <Text style={styles.detail}>{shownTag.technology}</Text>
            <Text style={styles.separator}>·</Text>
            <Text style={styles.detail}>{formatClockTime(shownTag.scannedAt)}</Text>
          </View>
        </View>

        <View style={[styles.badge, shownTag.sentToServer ? styles.badgeSent : styles.badgeLocal]}>
          <Text
            style={[
              styles.badgeText,
              shownTag.sentToServer ? styles.badgeTextSent : styles.badgeTextLocal,
            ]}
          >
            {shownTag.sentToServer ? "Sent" : "Local"}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.close}
        onPress={onClear}
        accessibilityRole="button"
        accessibilityLabel="Dismiss tag"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <CloseIcon />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadows.raised,
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
  },
  info: {
    flex: 1,
  },
  uid: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.brand,
    fontFamily: fontFamily.mono,
    marginBottom: 2,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  detail: {
    ...typography.caption,
    color: colors.textMuted,
  },
  separator: {
    ...typography.caption,
    color: colors.disabled,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    marginLeft: spacing.sm,
  },
  badgeSent: {
    backgroundColor: colors.successSoft,
  },
  badgeLocal: {
    backgroundColor: colors.warningSoft,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  badgeTextSent: {
    color: colors.successText,
  },
  badgeTextLocal: {
    color: colors.warningText,
  },
  close: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
});
