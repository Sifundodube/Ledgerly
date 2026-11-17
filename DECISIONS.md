# Decisions

## Mobile client

- **Navigation:** Expo Router. It is part of the Expo SDK 51 toolchain and maps the requested screen names directly to file-based routes.
- **Styling:** React Native `StyleSheet`. This keeps the first mobile release on native primitives without adding a Tailwind compatibility layer.
- **Charts:** `react-native-chart-kit` is the planned chart library for the mobile dashboard; it renders common line and bar charts using React Native views.
- **Recruiter demo:** Use a short screen recording as the primary shareable demo and an Expo Go QR for compatible Android devices/simulators. SDK 51 needs a matching Expo Go binary; Expo documents that physical iOS devices cannot install older Expo Go builds for SDK 53 or earlier, so an EAS development build is the iPhone option if distribution is needed.

## Authentication transport

- Native clients keep only the rotated refresh token in `expo-secure-store`, send it to `/api/auth/refresh` as a Bearer token, and hold the short-lived access token in memory. The backend must continue accepting its web refresh cookie and also accept the mobile Bearer token, returning the rotated refresh token in JSON for mobile clients.
- Expo native requests commonly omit an `Origin` header. CORS will allow the configured web origin and Expo development origins for browser-based development; native networking itself does not depend on CORS.

## Repository capability gap discovered before Phase 2

- The checked-in backend currently implements only `GET /health` in `backend/src/index.ts`; there is no auth router or `/api/auth/refresh` implementation to extend. The ML app likewise implements only `GET /health`. Consequently, the requested mobile login, demo login, token refresh, transaction, upload, category, and analytics flows cannot run against the current services.
- The user subsequently authorized building out the missing backend, resolving the API scope conflict. The backend now implements the auth, transaction, upload, category, and analytics contract with migrations, demo seed data, refresh rotation, and CORS support. The ML service remains unchanged and still exposes only `/health`; uploads therefore complete with uncategorized rows and a warning when its prediction endpoint is unavailable. Bulk categorization reports service unavailability rather than fabricating predictions.
