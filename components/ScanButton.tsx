import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  Animated,
} from "react-native";
import { useEffect, useRef } from "react";
import Svg, { Circle, Path, G, Defs, LinearGradient, Stop } from "react-native-svg";

interface ScanButtonProps {
  onPress: () => void;
  processingEnabled: boolean;
  disabled?: boolean;
}

// ACR122U-inspired NFC icon component
function NFCIcon({ color = "#00A4E4", size = 80 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="nfcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={color} />
          <Stop offset="100%" stopColor="#0077B3" />
        </LinearGradient>
      </Defs>
      {/* NFC Text */}
      <Text
        x="50"
        y="58"
        fontSize="28"
        fontWeight="bold"
        fill="url(#nfcGrad)"
        textAnchor="middle"
      >
        NFC
      </Text>
      {/* Concentric signal waves (right side) */}
      <G transform="translate(75, 50)">
        <Path
          d="M 0 -12 A 12 12 0 0 1 0 12"
          stroke={color}
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d="M 0 -20 A 20 20 0 0 1 0 20"
          stroke={color}
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          opacity="0.7"
        />
        <Path
          d="M 0 -28 A 28 28 0 0 1 0 28"
          stroke={color}
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          opacity="0.4"
        />
      </G>
    </Svg>
  );
}

export function ScanButton({ onPress, processingEnabled, disabled }: ScanButtonProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (processingEnabled && !disabled) {
      // Pulse animation when scanning
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [processingEnabled, disabled]);

  const getRingColor = () => {
    if (disabled) return "#D1D5DB";
    if (processingEnabled) return "#1F4E5F";
    return "#374151";
  };

  const getAccentColor = () => {
    if (disabled) return "#9CA3AF";
    if (processingEnabled) return "#00A4E4";
    return "#6B7280";
  };

  const getStatusText = () => {
    if (disabled) return "NFC Unavailable";
    if (!processingEnabled) return "Paused";
    return "Scanning";
  };

  const getSubText = () => {
    if (disabled) return "Enable NFC to scan";
    if (!processingEnabled) return "Tap to resume";
    return "Tap to pause";
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.9}
      style={styles.touchable}
    >
      <Animated.View
        style={[
          styles.outerRing,
          { borderColor: getRingColor() },
          { transform: [{ scale: pulseAnim }] },
        ]}
      >
        {/* Progress arc segments - ACR122U style */}
        <View style={styles.arcContainer}>
          <View style={[styles.arcSegment, styles.arcTop, { borderColor: processingEnabled ? "#00A4E4" : "#9CA3AF" }]} />
          <View style={[styles.arcSegment, styles.arcRight, { borderColor: processingEnabled ? "#4B5563" : "#D1D5DB" }]} />
          <View style={[styles.arcSegment, styles.arcBottom, { borderColor: processingEnabled ? "#6B7280" : "#E5E7EB" }]} />
          <View style={[styles.arcSegment, styles.arcLeft, { borderColor: processingEnabled ? "#1F4E5F" : "#9CA3AF" }]} />
        </View>

        <View style={styles.innerCircle}>
          {/* NFC Logo */}
          <View style={styles.nfcContainer}>
            <Text style={[styles.nfcText, { color: getAccentColor() }]}>NFC</Text>
            {/* Signal waves */}
            <Svg width={40} height={50} viewBox="0 0 40 50" style={styles.waves}>
              <G transform="translate(5, 25)">
                <Path
                  d="M 0 -8 A 8 8 0 0 1 0 8"
                  stroke={getAccentColor()}
                  strokeWidth="2.5"
                  fill="none"
                  strokeLinecap="round"
                />
                <Path
                  d="M 0 -15 A 15 15 0 0 1 0 15"
                  stroke={getAccentColor()}
                  strokeWidth="2.5"
                  fill="none"
                  strokeLinecap="round"
                  opacity={processingEnabled ? 0.7 : 0.5}
                />
                <Path
                  d="M 0 -22 A 22 22 0 0 1 0 22"
                  stroke={getAccentColor()}
                  strokeWidth="2.5"
                  fill="none"
                  strokeLinecap="round"
                  opacity={processingEnabled ? 0.4 : 0.3}
                />
              </G>
            </Svg>
          </View>
        </View>
      </Animated.View>

      {/* Status text below */}
      <View style={styles.statusContainer}>
        <Text style={[styles.statusText, { color: getAccentColor() }]}>
          {getStatusText()}
        </Text>
        <Text style={styles.subText}>{getSubText()}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchable: {
    alignItems: "center",
  },
  outerRing: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 12,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  arcContainer: {
    position: "absolute",
    width: 220,
    height: 220,
  },
  arcSegment: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 8,
    borderColor: "transparent",
  },
  arcTop: {
    borderTopColor: "inherit",
    transform: [{ rotate: "-45deg" }],
  },
  arcRight: {
    borderRightColor: "inherit",
    transform: [{ rotate: "-45deg" }],
  },
  arcBottom: {
    borderBottomColor: "inherit",
    transform: [{ rotate: "-45deg" }],
  },
  arcLeft: {
    borderLeftColor: "inherit",
    transform: [{ rotate: "-45deg" }],
  },
  innerCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#1F4E5F",
  },
  nfcContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  nfcText: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 1,
  },
  waves: {
    marginLeft: -5,
  },
  statusContainer: {
    marginTop: 20,
    alignItems: "center",
  },
  statusText: {
    fontSize: 18,
    fontWeight: "700",
  },
  subText: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 4,
  },
});
