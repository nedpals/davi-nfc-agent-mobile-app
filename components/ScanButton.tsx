import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import { colors, shadows, spacing } from "@/constants/theme";

interface ScanButtonProps {
  onPress: () => void;
  processingEnabled: boolean;
  disabled?: boolean;
  // Why the button is unavailable, when the caller knows better than "no NFC".
  disabledReason?: string;
}

const SIZE = 220;
const CENTER = SIZE / 2;
const TRACK_RADIUS = CENTER - 10;
const CIRCUMFERENCE = 2 * Math.PI * TRACK_RADIUS;

function NFCWaves({ color }: { color: string }) {
  return (
    <Svg width={38} height={54} viewBox="0 0 38 54">
      <G transform="translate(4, 27)">
        {[9, 16, 23].map((radius, index) => (
          <Path
            key={radius}
            d={`M 0 -${radius} A ${radius} ${radius} 0 0 1 0 ${radius}`}
            stroke={color}
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            opacity={1 - index * 0.3}
          />
        ))}
      </G>
    </Svg>
  );
}

export function ScanButton({
  onPress,
  processingEnabled,
  disabled,
  disabledReason,
}: ScanButtonProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const isScanning = processingEnabled && !disabled;

  useEffect(() => {
    if (!isScanning) {
      pulse.setValue(0);
      spin.setValue(0);
      return;
    }

    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    // The travelling arc is what separates "armed and listening" from a button
    // that merely looks enabled.
    const sweep = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 2600,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    breathe.start();
    sweep.start();

    return () => {
      breathe.stop();
      sweep.stop();
    };
  }, [isScanning, pulse, spin]);

  const accent = disabled ? colors.disabled : processingEnabled ? colors.accent : colors.neutral;
  const trackColor = disabled ? colors.borderSubtle : colors.accentSoft;

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  const statusText = disabled ? "NFC unavailable" : processingEnabled ? "Scanning" : "Paused";
  const hintText = disabled
    ? (disabledReason ?? "Turn on NFC to scan")
    : processingEnabled
      ? "Tap to pause"
      : "Tap to resume";

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={`${statusText}. ${hintText}`}
      style={styles.touchable}
    >
      <Animated.View style={[styles.ring, { transform: [{ scale }] }]}>
        <Animated.View style={[styles.arc, { transform: [{ rotate }] }]}>
          <Svg width={SIZE} height={SIZE}>
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={TRACK_RADIUS}
              stroke={trackColor}
              strokeWidth={10}
              fill="none"
            />
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={TRACK_RADIUS}
              stroke={accent}
              strokeWidth={10}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE * 0.28} ${CIRCUMFERENCE}`}
              // Start the arc at the top rather than at three o'clock.
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
            />
          </Svg>
        </Animated.View>

        <View style={[styles.core, disabled && styles.coreDisabled]}>
          <Text style={[styles.wordmark, { color: accent }]}>NFC</Text>
          <NFCWaves color={accent} />
        </View>
      </Animated.View>

      <View style={styles.caption}>
        <Text style={[styles.status, { color: accent }]}>{statusText}</Text>
        <Text style={styles.hint}>{hintText}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchable: {
    alignItems: "center",
  },
  ring: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  arc: {
    ...StyleSheet.absoluteFillObject,
  },
  core: {
    width: 158,
    height: 158,
    borderRadius: 79,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    ...shadows.raised,
  },
  coreDisabled: {
    backgroundColor: colors.surfaceMuted,
  },
  wordmark: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 1,
    marginRight: -2,
  },
  caption: {
    marginTop: spacing.xl,
    alignItems: "center",
  },
  status: {
    fontSize: 18,
    fontWeight: "700",
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
