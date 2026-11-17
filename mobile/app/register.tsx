import { useState } from "react";
import { Link, useRouter } from "expo-router";
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth/AuthProvider";
import { ApiError } from "../src/lib/api";

const palette = { bg: "#f6f7f4", paper: "#fff", ink: "#17231f", muted: "#77817a", line: "#e6eae5", green: "#276b52" };

export default function RegisterScreen() {
  const { register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    if (password !== confirm) { setError("Your passwords do not match."); return; }
    if (password.length < 8) { setError("Use at least 8 characters for your password."); return; }
    setBusy(true);
    try {
      await register(email.trim(), password);
      router.replace("/dashboard");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Unable to create your account. Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}><View style={styles.mark}><Text style={styles.markLetter}>L</Text></View><Text style={styles.brand}>Ledgerly</Text></View>
          <Text style={styles.kicker}>A fresh start</Text>
          <Text style={styles.title}>Make room for clarity.</Text>
          <Text style={styles.subtitle}>Create your account to bring your spending into focus.</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Create your account</Text>
            <Text style={styles.label}>Email address</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor="#a2aaa4" autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" accessibilityLabel="Email address" />
            <Text style={styles.label}>Password</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="At least 8 characters" placeholderTextColor="#a2aaa4" secureTextEntry autoComplete="new-password" textContentType="newPassword" accessibilityLabel="Password" />
            <Text style={styles.label}>Confirm password</Text>
            <TextInput style={styles.input} value={confirm} onChangeText={setConfirm} placeholder="Re-enter your password" placeholderTextColor="#a2aaa4" secureTextEntry autoComplete="new-password" textContentType="newPassword" accessibilityLabel="Confirm password" onSubmitEditing={() => void submit()} />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={busy || !email.trim() || !password || !confirm} onPress={() => void submit()} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>{busy ? "Creating account…" : "Create account  →"}</Text>
            </Pressable>
          </View>
          <View style={styles.footer}><Text style={styles.footerText}>Already have an account? </Text><Link href="/login" style={styles.link}>Sign in</Link></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, safe: { flex: 1, backgroundColor: palette.bg },
  content: { flexGrow: 1, width: "100%", maxWidth: 580, alignSelf: "center", paddingHorizontal: 24, paddingTop: 14, paddingBottom: 30 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 }, mark: { width: 34, height: 34, borderRadius: 11, backgroundColor: palette.green, alignItems: "center", justifyContent: "center" },
  markLetter: { color: "white", fontSize: 20, fontWeight: "800" }, brand: { color: palette.ink, fontSize: 19, fontWeight: "700" },
  kicker: { marginTop: 46, color: palette.green, textTransform: "uppercase", fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
  title: { marginTop: 10, color: palette.ink, fontSize: 33, fontWeight: "700", letterSpacing: -1.1 },
  subtitle: { marginTop: 9, marginBottom: 24, color: palette.muted, fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, borderRadius: 20, padding: 22 },
  cardTitle: { marginBottom: 21, color: palette.ink, fontSize: 20, fontWeight: "700" },
  label: { marginBottom: 8, color: palette.ink, fontSize: 12, fontWeight: "700" },
  input: { height: 49, borderWidth: 1, borderColor: palette.line, borderRadius: 11, paddingHorizontal: 14, marginBottom: 17, color: palette.ink, fontSize: 14 },
  button: { height: 50, borderRadius: 11, backgroundColor: palette.green, alignItems: "center", justifyContent: "center", marginTop: 3 },
  buttonText: { color: "white", fontSize: 14, fontWeight: "700" }, pressed: { opacity: 0.82 }, error: { color: "#b33838", fontSize: 12, marginBottom: 13 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 22 }, footerText: { color: palette.muted, fontSize: 12 }, link: { color: palette.green, fontSize: 12, fontWeight: "700" },
});
