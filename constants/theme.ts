import { Platform, type TextStyle, type ViewStyle } from "react-native";

export const colors = {
  brand: "#1F4E5F",
  brandMuted: "#37697C",
  accent: "#00A4E4",
  accentDeep: "#0077B3",
  accentSoft: "#E6F4FE",

  background: "#F8FAFB",
  surface: "#FFFFFF",
  surfaceMuted: "#F3F4F6",
  surfaceSunken: "#F9FAFB",

  border: "#E5E7EB",
  borderSubtle: "#F3F4F6",

  text: "#1F2937",
  textMuted: "#6B7280",
  textFaint: "#9CA3AF",
  textInverse: "#FFFFFF",

  success: "#10B981",
  successSoft: "#D1FAE5",
  successText: "#059669",

  warning: "#F59E0B",
  warningSoft: "#FEF3C7",
  warningText: "#D97706",

  danger: "#EF4444",
  dangerSoft: "#FEE2E2",
  dangerText: "#DC2626",

  neutral: "#6B7280",
  disabled: "#D1D5DB",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const fontFamily = {
  mono: Platform.select({ ios: "Menlo", default: "monospace" }),
} as const;

export const typography = {
  screenTitle: { fontSize: 24, fontWeight: "700", letterSpacing: 0.4 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  body: { fontSize: 15, fontWeight: "400" },
  bodyStrong: { fontSize: 15, fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "500" },
  caption: { fontSize: 12, fontWeight: "400" },
} satisfies Record<string, TextStyle>;

export const shadows = {
  card: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  raised: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 8,
  },
} satisfies Record<string, ViewStyle>;

export const theme = { colors, spacing, radius, typography, shadows, fontFamily };
