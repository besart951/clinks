import 'package:clinks_mobile/main.dart';
import 'package:clinks_mobile/models.g.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  testWidgets('sign-in is disabled without configured origins', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: WorkspacePage()));
    await tester.pump();
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
  });
  test(
    'tenant switch accepts access tokens without a replacement refresh token',
    () {
      final session = SessionTokens.fromJson({
        'accessToken': 'access',
        'expiresAt': '2026-11-23T12:00:00Z',
      });
      expect(session.refreshToken, isNull);
    },
  );
}
