import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { Feather } from "@expo/vector-icons";
import { AppScreen, colors } from "../src/components/AppScreen";
import { useAuth } from "../src/auth/AuthProvider";

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const version = Constants.expoConfig?.version ?? "1.0.0";

  const logout = async () => {
    setBusy(true);
    setError("");
    try { await signOut(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Signed out locally. The server session could not be revoked."); }
    finally { setBusy(false); }
  };

  return (
    <AppScreen title="A little peace of mind" eyebrow="Settings">
      <View style={styles.content}>
        <View style={styles.accountCard}>
          <View style={styles.accountAvatar}><Text style={styles.avatarText}>{user?.email.slice(0, 1).toUpperCase() ?? "L"}</Text></View>
          <View style={styles.accountCopy}><Text style={styles.accountTitle}>Your account</Text><Text style={styles.accountEmail} numberOfLines={1}>{user?.email}</Text></View>
          <View style={styles.secureBadge}><Feather name="shield" size={13} color={colors.green} /></View>
        </View>

        <Text style={styles.section}>ACCOUNT</Text>
        <View style={styles.settingsGroup}>
          <SettingRow icon="lock" title="Change password" detail="Password updates are managed securely." disabled />
          <View style={styles.separator} />
          <SettingRow icon="smartphone" title="App version" detail={`Ledgerly ${version}`} />
        </View>

        <View style={styles.privacyNote}><Feather name="check-circle" size={15} color={colors.green} /><Text style={styles.privacyText}>Your financial data is private to your account and protected in transit.</Text></View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void logout()} style={({ pressed }) => [styles.logout, pressed && styles.pressed]}>
          {busy ? <ActivityIndicator size="small" color={colors.red} /> : <Feather name="log-out" size={16} color={colors.red} />}
          <Text style={styles.logoutText}>{busy ? "Signing out…" : "Sign out"}</Text>
        </Pressable>
        <Text style={styles.footer}>Ledgerly · Your money, clearly categorized.</Text>
      </View>
    </AppScreen>
  );
}

function SettingRow({ icon, title, detail, disabled = false }: { icon: "lock" | "smartphone"; title: string; detail: string; disabled?: boolean }) {
  return <View style={[styles.row, disabled && styles.rowDisabled]}><View style={styles.rowIcon}><Feather name={icon} size={15} color={colors.green} /></View><View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowDetail}>{detail}</Text></View>{disabled ? <Text style={styles.soon}>SOON</Text> : null}</View>;
}

const styles = StyleSheet.create({
  content: { padding: 18, gap: 16 }, accountCard: { flexDirection: "row", alignItems: "center", padding: 15, borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.paper, gap: 11 },
  accountAvatar: { width: 43, height: 43, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.greenWash }, avatarText: { color: colors.green, fontSize: 17, fontWeight: "700" },
  accountCopy: { flex: 1 }, accountTitle: { color: colors.ink, fontSize: 12, fontWeight: "700" }, accountEmail: { color: colors.muted, fontSize: 10, marginTop: 4 }, secureBadge: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.greenWash },
  section: { color: "#8d978f", fontSize: 8, fontWeight: "700", letterSpacing: 1.1, marginBottom: -9 }, settingsGroup: { paddingHorizontal: 13, borderWidth: 1, borderColor: colors.line, borderRadius: 15, backgroundColor: colors.paper },
  row: { minHeight: 61, flexDirection: "row", alignItems: "center", gap: 10 }, rowDisabled: { opacity: 0.78 }, rowIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.greenWash },
  rowCopy: { flex: 1 }, rowTitle: { color: colors.ink, fontSize: 11, fontWeight: "600" }, rowDetail: { color: colors.muted, fontSize: 9, marginTop: 3 }, soon: { color: "#9aa39c", fontSize: 7, fontWeight: "700", letterSpacing: 0.7 }, separator: { height: 1, backgroundColor: colors.line },
  privacyNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.greenWash }, privacyText: { flex: 1, color: colors.green, fontSize: 9, lineHeight: 14 },
  logout: { height: 45, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "#efd8d5", borderRadius: 11, backgroundColor: "#fffafa" }, logoutText: { color: colors.red, fontSize: 11, fontWeight: "700" }, pressed: { opacity: 0.82 },
  error: { color: colors.red, fontSize: 10, textAlign: "center" }, footer: { color: "#9ca59e", fontSize: 9, textAlign: "center", marginTop: 8 },
});
