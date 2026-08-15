import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Chip } from "./Chip";
import { TagStatusBadge } from "./TagStatusBadge";
import { colors, fontFamily, radius, shadows, spacing, typography } from "@/constants/theme";
import { formatClockTime } from "@/utils/format";
import {
  OPERATION_FAILURE_LINGER,
  OPERATION_SUCCESS_LINGER,
  describeOperation,
} from "@/utils/operations";
import type { ScannedTag, TagOperation } from "@/types/protocol";

interface TagDrawerProps {
  tag: ScannedTag | null;
  onClear: () => void;
  onPress?: () => void;
  // Work the agent is doing on this tag, which the person has to hold still for.
  operation?: TagOperation | null;
  onOperationDone?: () => void;
}

// Exported so a screen can keep its own content clear of the drawer instead of
// guessing at a gap.
export const TAG_DRAWER_HEIGHT = 64;

const SWIPE_THRESHOLD = 80;

function CloseIcon({ size = 20, color = colors.textFaint }: { size?: number; color?: string }) {
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

export function TagDrawer({
  tag,
  onClear,
  onPress,
  operation = null,
  onOperationDone,
}: TagDrawerProps) {
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, spacing.lg) + spacing.sm;
  const hiddenOffset = TAG_DRAWER_HEIGHT + bottomOffset + 50;

  // The tag is kept after the prop clears so the exit animation has something
  // to play; unmounting on the spot is what made it disappear instantly.
  const [shownTag, setShownTag] = useState<ScannedTag | null>(tag);
  const translateY = useRef(new Animated.Value(hiddenOffset)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const swipedAway = useRef(false);

  const running = operation?.status === "running";
  // An operation without a tag is still worth showing: it is how the agent
  // asks for one.
  const visible = Boolean(tag || operation);

  useEffect(() => {
    if (tag) {
      setShownTag(tag);
    }
  }, [tag]);

  useEffect(() => {
    if (visible) {
      swipedAway.current = false;
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
  }, [visible, hiddenOffset, translateX, translateY]);

  // An outcome is shown for a moment and then gets out of the way; a running
  // operation stays until it finishes.
  useEffect(() => {
    if (!operation || operation.status === "running" || !onOperationDone) {
      return;
    }

    const linger =
      operation.status === "succeeded" ? OPERATION_SUCCESS_LINGER : OPERATION_FAILURE_LINGER;
    const timer = setTimeout(onOperationDone, linger);

    return () => clearTimeout(timer);
  }, [operation, onOperationDone]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Claiming the gesture on touch-down would swallow taps meant for the
        // dismiss button and the card itself.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          // Swiping the tag away mid-operation would withdraw the very tag the
          // agent is working on, so the gesture is refused while it runs.
          !running &&
          Math.abs(gesture.dx) > 8 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
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
    [onClear, running, translateX]
  );

  if (!shownTag && !operation) {
    return null;
  }

  const copy = operation ? describeOperation(operation) : null;
  const headline = shownTag?.uid ?? "No tag present";

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
        disabled={!onPress || !shownTag}
        activeOpacity={0.8}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={
          copy ? `${headline}. ${copy.message}` : `Last tag ${headline}`
        }
      >
        <View style={styles.info}>
          <Text style={[styles.uid, !shownTag && styles.uidAbsent]} numberOfLines={1}>
            {headline}
          </Text>

          {copy ? (
            <Text style={[styles.operation, copy.needsTagAgain && styles.operationUrgent]} numberOfLines={2}>
              {copy.message}
            </Text>
          ) : (
            shownTag && (
              <View style={styles.meta}>
                <Text style={styles.detail}>{shownTag.type}</Text>
                <Text style={styles.separator}>·</Text>
                <Text style={styles.detail}>{shownTag.technology}</Text>
                <Text style={styles.separator}>·</Text>
                <Text style={styles.detail}>{formatClockTime(shownTag.scannedAt)}</Text>
              </View>
            )
          )}
        </View>

        <View style={styles.badge}>
          {running ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : copy ? (
            <Chip label={copy.chip} tone={copy.tone} />
          ) : (
            shownTag && <TagStatusBadge sent={shownTag.sentToServer} />
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.close}
        onPress={onClear}
        // Dismissing withdraws the tag the agent is working on: `currentTagUid`
        // is this very tag, so clearing it would refuse the write in flight.
        disabled={running}
        accessibilityRole="button"
        accessibilityLabel="Dismiss tag"
        accessibilityState={{ disabled: running }}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <CloseIcon color={running ? colors.borderSubtle : colors.textFaint} />
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
  uidAbsent: {
    fontFamily: undefined,
    color: colors.textMuted,
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
  operation: {
    ...typography.caption,
    color: colors.textMuted,
  },
  operationUrgent: {
    color: colors.warningText,
    fontWeight: "600",
  },
  badge: {
    marginLeft: spacing.sm,
  },
  close: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
});
