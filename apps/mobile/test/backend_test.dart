import 'dart:io';

import 'package:clinks_mobile/backend.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final email = Platform.environment['CLINKS_TEST_EMAIL'];
  final password = Platform.environment['CLINKS_TEST_PASSWORD'];
  test(
    'a native session syncs contacts for its tenant and clears on logout',
    () async {
      TestWidgetsFlutterBinding.ensureInitialized();
      HttpOverrides.global = null;
      FlutterSecureStorage.setMockInitialValues({});
      final dir = await Directory.systemTemp.createTemp('clinks-mobile-');
      addTearDown(() => dir.delete(recursive: true));
      final client = MobileBackend('de-CH');
      await client.login(email!, password!);
      final tenant = client.tenants.first;
      await client.open(tenant, databasePath: '${dir.path}/workspace.db');
      final contacts = await client.database!
          .watch('SELECT tenant_id FROM contacts')
          .firstWhere((rows) => rows.isNotEmpty)
          .timeout(const Duration(seconds: 45));
      expect(contacts.every((row) => row['tenant_id'] == tenant.id), isTrue);
      await client.logout();
      expect(client.session, isNull);
      expect(await client.store.read(key: 'refresh'), isNull);
    },
    skip: email == null || password == null,
  );
}
