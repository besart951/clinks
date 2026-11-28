import 'package:clinks_mobile/main.dart';
import 'package:clinks_mobile/models.g.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  testWidgets('password visibility toggles without losing input', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: WorkspacePage()));
    final field = find.byWidgetPredicate(
      (widget) => widget is TextField &&
          (widget.autofillHints?.contains(AutofillHints.password) ?? false),
    );
    expect(tester.widget<TextField>(field).obscureText, isTrue);
    await tester.enterText(field, 'example');
    await tester.tap(find.byIcon(Icons.visibility));
    await tester.pump();
    expect(tester.widget<TextField>(field).obscureText, isFalse);
    expect(tester.widget<TextField>(field).controller!.text, 'example');
    await tester.tap(find.byIcon(Icons.visibility_off));
    await tester.pump();
    expect(tester.widget<TextField>(field).obscureText, isTrue);
    expect(tester.widget<TextField>(field).controller!.text, 'example');
  });

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
