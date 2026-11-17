import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useAuth } from "./AuthProvider";

export function AuthGate() {
  const { user, ready } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const route = segments[0];
  const onPublicRoute = route === "login" || route === "register";

  useEffect(() => {
    if (!ready) return;
    if (!user && !onPublicRoute) router.replace("/login");
    else if (user && onPublicRoute) router.replace("/dashboard");
  }, [ready, user, onPublicRoute, router]);

  if (!ready) return <View style={styles.loading}><ActivityIndicator color="#276b52" size="large" /></View>;
  return null;
}

const styles = StyleSheet.create({ loading: { ...StyleSheet.absoluteFillObject, zIndex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f6f7f4" } });
