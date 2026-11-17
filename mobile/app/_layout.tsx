import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../src/auth/AuthProvider";
import { AuthGate } from "../src/auth/AuthGate";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: (count, error) => !(error instanceof Error && "status" in error && Number(error.status) < 500) && count < 2 } },
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
          <AuthGate />
        </QueryClientProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
