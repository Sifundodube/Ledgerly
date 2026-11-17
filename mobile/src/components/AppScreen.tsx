import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthProvider";

export const colors = {
  canvas: "#f6f7f4", paper: "#ffffff", ink: "#17231f", muted: "#77817a",
  line: "#e6eae5", green: "#276b52", greenWash: "#e8f1eb", red: "#b8564d",
};

const tabs = [
  { path: "/dashboard", label: "Overview", icon: "grid" as const },
  { path: "/transactions", label: "Activity", icon: "list" as const },
  { path: "/upload", label: "Import", icon: "upload" as const },
  { path: "/settings", label: "Settings", icon: "settings" as const },
];

export function AppScreen({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.brandLine}>
            <View style={styles.mark}><Text style={styles.markText}>L</Text></View>
            <Text style={styles.brandName}>Ledgerly</Text>
            <View style={styles.headerSpacer} />
            <View style={styles.profileDot}><Text style={styles.profileText}>{user?.email.slice(0, 1).toUpperCase() ?? "L"}</Text></View>
          </View>
          <View style={styles.pageHeading}>
            <View>
              {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
              <Text style={styles.title}>{title}</Text>
            </View>
            <Text style={styles.pageBrand}>YOUR MONEY, CLEARLY CATEGORIZED.</Text>
          </View>
        </View>
        <View style={styles.content}>{children}</View>
        <View style={styles.nav}>
          {tabs.map((tab) => {
            const active = pathname === tab.path || (tab.path === "/dashboard" && pathname === "/");
            return (
              <Pressable key={tab.path} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => router.push(tab.path as "/dashboard")} style={styles.navItem}>
                <Feather name={tab.icon} size={18} color={active ? colors.green : "#9aa39c"} />
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

export function DataState({ title, detail, kind = "empty" }: { title: string; detail: string; kind?: "empty" | "error" | "loading" }) {
  const icon = kind === "error" ? "alert-circle" : kind === "loading" ? "loader" : "inbox";
  return (
    <View style={styles.state}>
      <View style={[styles.stateIcon, kind === "error" && styles.stateIconError]}><Feather name={icon} size={19} color={kind === "error" ? colors.red : colors.green} /></View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateDetail}>{detail}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  container: { flex: 1, alignSelf: "center", width: "100%", maxWidth: 1100 },
  header: { paddingHorizontal: 21, paddingTop: 8, paddingBottom: 17, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.canvas },
  brandLine: { flexDirection: "row", alignItems: "center", gap: 9 },
  mark: { width: 29, height: 29, borderRadius: 9, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  markText: { color: "white", fontSize: 17, lineHeight: 20, fontWeight: "800" },
  brandName: { color: colors.ink, fontSize: 17, fontWeight: "700", letterSpacing: -0.4 },
  headerSpacer: { flex: 1 }, profileDot: { width: 31, height: 31, borderRadius: 16, backgroundColor: colors.greenWash, alignItems: "center", justifyContent: "center" },
  profileText: { color: colors.green, fontSize: 12, fontWeight: "700" },
  pageHeading: { marginTop: 19, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  eyebrow: { color: colors.green, fontSize: 9, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 5 },
  title: { color: colors.ink, fontSize: 25, fontWeight: "700", letterSpacing: -0.8 },
  pageBrand: { color: "#a0aaa2", fontSize: 8, fontWeight: "700", letterSpacing: 0.7, marginBottom: 4 },
  content: { flex: 1, minHeight: 0 },
  nav: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper, paddingTop: 9, paddingBottom: 7 },
  navItem: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", gap: 3 },
  navLabel: { color: "#929d95", fontSize: 9, fontWeight: "600" }, navLabelActive: { color: colors.green },
  state: { minHeight: 190, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  stateIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.greenWash, alignItems: "center", justifyContent: "center", marginBottom: 11 },
  stateIconError: { backgroundColor: "#faece9" }, stateTitle: { color: colors.ink, fontSize: 15, fontWeight: "700", textAlign: "center" },
  stateDetail: { maxWidth: 300, marginTop: 6, color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center" },
});

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(value);
}
