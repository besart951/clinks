import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';

import 'backend.dart';
import 'strings.g.dart';

void main() => runApp(const MaterialApp(home: WorkspacePage()));

class WorkspacePage extends StatefulWidget {
  const WorkspacePage({super.key});
  @override
  State<WorkspacePage> createState() => _WorkspacePageState();
}

class _WorkspacePageState extends State<WorkspacePage> {
  final email = TextEditingController(),
      password = TextEditingController(),
      code = TextEditingController();
  late final bool english =
      WidgetsBinding.instance.platformDispatcher.locale.languageCode != 'de';
  late final backend = MobileBackend(english ? 'en-US' : 'de-CH');
  bool busy = false;
  String? error, tenantId;
  String t(String key) => labels[key]![english ? 1 : 0];
  bool valid(String origin) {
    final uri = Uri.tryParse(origin);
    return uri != null &&
        uri.host.isNotEmpty &&
        (uri.scheme == 'https' || (kDebugMode && uri.scheme == 'http'));
  }

  Future<void> run(Future<void> Function() work) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await work();
    } on ApiFailure catch (e) {
      error = e.message;
    } catch (_) {
      error = t('error.ws.offline');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!valid(MobileBackend.api) || !valid(MobileBackend.syncEndpoint)) {
        setState(() => error = t('ui.ws.mobile.config'));
        return;
      }
      run(() async {
        await backend.refresh();
        if (backend.session != null) await backend.loadTenants();
      });
    });
  }

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final challenge = backend.challenge != null || backend.verification != null;
    final db = backend.database;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          t(
            db != null
                ? 'ui.ws.module.contacts'
                : backend.session != null
                ? 'ui.tenants'
                : 'ui.sign_in',
          ),
        ),
        actions: [
          if (backend.session != null)
            IconButton(
              tooltip: t('ui.sign_out'),
              icon: const Icon(Icons.logout),
              onPressed: busy
                  ? null
                  : () => run(() async {
                      try {
                        await backend.logout();
                      } finally {
                        tenantId = null;
                      }
                    }),
            ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (busy) const LinearProgressIndicator(),
              if (error != null) Text(error!, semanticsLabel: error),
              if (db != null && tenantId != null)
                Expanded(
                  child: StreamBuilder(
                    stream: db.watch(
                      'SELECT first_name,last_name,company_name FROM contacts WHERE tenant_id=? AND archived=0 ORDER BY last_name,first_name',
                      parameters: [tenantId],
                    ),
                    builder: (context, snapshot) {
                      final rows = snapshot.data ?? [];
                      if (rows.isEmpty) {
                        return Center(
                          child: Text(t('ui.ws.contacts.empty_title')),
                        );
                      }
                      return ListView(
                        children: [
                          for (final row in rows)
                            ListTile(
                              title: Text(
                                (row['company_name'] as String?)?.isNotEmpty ==
                                        true
                                    ? row['company_name']
                                    : '${row['first_name']} ${row['last_name']}',
                              ),
                            ),
                        ],
                      );
                    },
                  ),
                )
              else if (backend.session != null) ...[
                if (backend.tenants.isEmpty) Text(t('ui.ws.mobile.existing')),
                for (final tenant in backend.tenants)
                  ListTile(
                    title: Text(tenant.name),
                    onTap: busy
                        ? null
                        : () => run(() async {
                            await backend.open(tenant);
                            tenantId = tenant.id;
                          }),
                  ),
              ] else ...[
                if (challenge)
                  TextField(
                    controller: code,
                    decoration: InputDecoration(
                      labelText: t('ui.ws.auth.code'),
                    ),
                    autofillHints: const [AutofillHints.oneTimeCode],
                  )
                else ...[
                  TextField(
                    controller: email,
                    decoration: InputDecoration(labelText: t('ui.email')),
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.username],
                  ),
                  TextField(
                    controller: password,
                    decoration: InputDecoration(labelText: t('ui.password')),
                    obscureText: true,
                    autofillHints: const [AutofillHints.password],
                  ),
                ],
                FilledButton(
                  onPressed:
                      busy ||
                          !valid(MobileBackend.api) ||
                          !valid(MobileBackend.syncEndpoint)
                      ? null
                      : () => run(() async {
                          if (challenge) {
                            await backend.confirm(code.text);
                            code.clear();
                          } else {
                            await backend.login(email.text, password.text);
                            password.clear();
                          }
                        }),
                  child: Text(
                    t(challenge ? 'ui.ws.auth.verify_submit' : 'ui.sign_in'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
