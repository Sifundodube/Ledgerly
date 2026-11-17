import { useState } from "react";
import { Link, useRouter } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth/AuthProvider";
import { ApiError } from "../src/lib/api";

const colors = {
  canvas: "#f6f7f4",
  paper: "#ffffff",
  ink: "#17231f",
  muted: "#77817a",
  line: "#e6eae5",
  green: "#276b52",
  greenWash: "#e8f1eb",
};

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const login = async (loginEmail: string, loginPassword: string) => {
    setBusy(true);
    setError("");
    try {
      await signIn(loginEmail, loginPassword);
      router.replace("/dashboard");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Unable to sign in. Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topline}>
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>L</Text></View>
            <Text style={styles.wordmark}>Ledgerly</Text>
          </View>

          <View style={styles.hero}>
            <View style={styles.eyebrow}><View style={styles.dot} /><Text style={styles.eyebrowText}>A clearer view of your money</Text></View>
            <Text style={styles.title}>Your finances,{"\n"}<Text style={styles.titleAccent}>in good order.</Text></Text>
            <Text style={styles.subtitle}>Sign in to see where your money goes and what you can do next.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome back</Text>
            <Text style={styles.cardSub}>Sign in to continue to your dashboard.</Text>

            <Text style={styles.label}>Email address</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#a2aaa4"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              style={styles.input}
              accessibilityLabel="Email address"
            />

            <View style={styles.passwordLabel}>
              <Text style={styles.label}>Password</Text>
            </View>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor="#a2aaa4"
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              style={styles.input}
              accessibilityLabel="Password"
            />

            <Pressable
              accessibilityRole="button"
              onPress={() => void login(email.trim(), password)}
              disabled={busy || !email.trim() || !password}
              style={({ pressed }) => [styles.signInButton, pressed && styles.pressed]}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.signInText}>Sign in <Text style={styles.arrow}>→</Text></Text>}
            </Pressable>

            <View style={styles.divider}><View style={styles.rule} /><Text style={styles.orText}>OR</Text><View style={styles.rule} /></View>

            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void login(
              process.env.EXPO_PUBLIC_DEMO_USER_EMAIL ?? "demo@ledgerly.local",
              process.env.EXPO_PUBLIC_DEMO_USER_PASSWORD ?? "LedgerlyDemo123!",
            )} style={({ pressed }) => [styles.demoButton, pressed && styles.pressed]}>
              <Text style={styles.demoIcon}>✦</Text>
              <Text style={styles.demoText}>Try Ledgerly demo</Text>
            </Pressable>
            <Text style={styles.demoNote}>Explore Ledgerly with a sample account. No setup needed.</Text>
            <View style={styles.registerRow}><Text style={styles.registerCopy}>New to Ledgerly? </Text><Link href="/register" style={styles.registerLink}>Create an account</Link></View>
          </View>

          <Text style={styles.footer}>Secure, private, and always in your control.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 26, alignSelf: "center", width: "100%", maxWidth: 580 },
  topline: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  brandMarkText: { color: "white", fontSize: 20, lineHeight: 24, fontWeight: "800" },
  wordmark: { color: colors.ink, fontSize: 19, fontWeight: "700", letterSpacing: -0.5 },
  hero: { paddingTop: 42, paddingBottom: 28 },
  eyebrow: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 30, paddingVertical: 7, paddingHorizontal: 11, backgroundColor: colors.greenWash },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  eyebrowText: { color: colors.green, fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  title: { marginTop: 19, color: colors.ink, fontSize: 38, lineHeight: 43, letterSpacing: -1.4, fontWeight: "700" },
  titleAccent: { color: colors.green },
  subtitle: { marginTop: 13, maxWidth: 360, color: colors.muted, fontSize: 15, lineHeight: 23 },
  card: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 22, shadowColor: "#1d3026", shadowOpacity: 0.04, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 2 },
  cardTitle: { color: colors.ink, fontSize: 21, fontWeight: "700", letterSpacing: -0.5 },
  cardSub: { marginTop: 5, marginBottom: 22, color: colors.muted, fontSize: 13, lineHeight: 19 },
  label: { color: colors.ink, fontSize: 12, fontWeight: "700", marginBottom: 8 },
  input: { height: 49, borderWidth: 1, borderColor: colors.line, borderRadius: 11, paddingHorizontal: 14, marginBottom: 17, color: colors.ink, fontSize: 14, backgroundColor: "#fdfefd" },
  passwordLabel: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  signInButton: { height: 50, borderRadius: 11, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", marginTop: 2 },
  pressed: { opacity: 0.83 },
  signInText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  arrow: { fontSize: 17, fontWeight: "400" },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 20 },
  rule: { height: 1, backgroundColor: colors.line, flex: 1 },
  orText: { fontSize: 9, color: "#a1aaa3", fontWeight: "700", letterSpacing: 1.2 },
  demoButton: { height: 49, borderRadius: 11, borderWidth: 1, borderColor: "#d4e2d8", backgroundColor: "#f8fbf8", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  demoIcon: { color: colors.green, fontSize: 17 },
  demoText: { color: colors.green, fontSize: 13, fontWeight: "700" },
  demoNote: { marginTop: 11, textAlign: "center", color: "#8b948d", fontSize: 10 },
  error: { color: "#b33838", fontSize: 12, marginTop: 11, textAlign: "center" },
  registerRow: { flexDirection: "row", justifyContent: "center", marginTop: 19 },
  registerCopy: { color: colors.muted, fontSize: 12 },
  registerLink: { color: colors.green, fontSize: 12, fontWeight: "700" },
  footer: { marginTop: 22, textAlign: "center", color: "#9ba39c", fontSize: 11 },
});
