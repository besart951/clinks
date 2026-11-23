# CLinks mobile

Flutter client for Android and iOS. It supports an existing account, email and TOTP verification, tenant selection and a read-only contact directory backed by PowerSync SQLite. It keeps the rotating refresh credential in the platform secure store and clears the database on sign-out. Selecting a tenant requires a connection.

Use a Flutter SDK with Dart 3.14 or newer. From the workspace root, regenerate models and labels with `node apps/mobile/tool/generate.mjs`. The generator reads the API contract and the de-CH and en-US product catalog. The root verification command checks the generated files.

From this directory:

```sh
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=CLINKS_API=https://api.example.ch --dart-define=CLINKS_SYNC=https://sync.example.ch
```

To exercise real native HTTP and PowerSync in the host test runner, set CLINKS_TEST_EMAIL and CLINKS_TEST_PASSWORD to a synthetic account with at least one contact and pass the same dart defines to `flutter test test/backend_test.dart`. This test uses a temporary SQLite directory and a mock secure store.

Android emulator debug builds can use http://10.0.2.2:8787 and http://10.0.2.2:8080 for the host's dev stack. Build a debug APK using `flutter build apk --debug` with both defines. Production endpoints require HTTPS. Signing credentials, physical-device acceptance and store releases are operator steps. iOS packaging requires macOS and Xcode.
