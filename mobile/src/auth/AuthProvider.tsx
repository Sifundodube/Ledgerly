import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, type User } from "../lib/api";
import { clearTokens, getRefreshToken, onSessionChange, refreshAccessToken, setAccessToken, storeRefreshToken } from "../lib/tokenStore";

type AuthContextValue = {
  user: User | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onSessionChange((authenticated) => {
      if (!authenticated) setUser(null);
    });
    void (async () => {
      const accessToken = await refreshAccessToken();
      if (accessToken) {
        try {
          const result = await api.me();
          setUser(result.user);
        } catch {
          await clearTokens();
        }
      }
      setReady(true);
    })();
    return unsubscribe;
  }, []);

  const acceptSession = useCallback(async (result: { accessToken: string; refreshToken?: string; user: User }) => {
    if (!result.refreshToken) throw new Error("The server did not return a refresh token for this mobile session.");
    await storeRefreshToken(result.refreshToken);
    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await acceptSession(await api.login(email, password));
  }, [acceptSession]);

  const register = useCallback(async (email: string, password: string) => {
    await acceptSession(await api.register(email, password));
  }, [acceptSession]);

  const signOut = useCallback(async () => {
    try {
      await api.logout(await getRefreshToken());
    } finally {
      await clearTokens();
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, ready, signIn, register, signOut }), [user, ready, signIn, register, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
