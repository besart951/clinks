import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:powersync/powersync.dart';

import 'models.g.dart';

class ApiFailure implements Exception {
  final String message;
  final int status;
  ApiFailure(this.message, this.status);
}

class MobileBackend extends PowerSyncBackendConnector {
  static const api = String.fromEnvironment('CLINKS_API');
  static const syncEndpoint = String.fromEnvironment('CLINKS_SYNC');
  final String locale;
  final store = const FlutterSecureStorage();
  SessionTokens? session;
  Future<void>? refreshing;
  PowerSyncDatabase? database;
  String? challenge;
  String? verification;
  List<TenantSummary> tenants = [];
  MobileBackend(this.locale);

  Future<dynamic> request(String path, {Map<String, dynamic>? body}) async {
    final url = Uri.parse('$api$path');
    final headers = {
      'Accept-Language': locale,
      'X-Clinks-Client': 'native',
      'Content-Type': 'application/json',
      if (session != null) 'Authorization': 'Bearer ${session!.accessToken}',
    };
    final response =
        await (body == null
                ? http.get(url, headers: headers)
                : http.post(url, headers: headers, body: jsonEncode(body)))
            .timeout(const Duration(seconds: 15));
    final data = response.body.isEmpty
        ? null
        : jsonDecode(utf8.decode(response.bodyBytes));
    if (response.statusCode >= 400) {
      throw ApiFailure(data['error']['message'] as String, response.statusCode);
    }
    return data;
  }

  Future<void> adopt(Map<String, dynamic> body) async {
    final next = SessionTokens.fromJson(body);
    if (next.refreshToken != null) {
      await store.write(key: 'refresh', value: next.refreshToken!);
    }
    session = next;
  }

  Future<void> login(String email, String password) async {
    final data = await request(
      '/auth/sign-in',
      body: {'email': email, 'password': password},
    );
    challenge = data['challengeId'];
    verification = data['verificationId'];
    if (data['session'] != null) {
      await adopt(data['session']);
      await loadTenants();
    }
  }

  Future<void> confirm(String code) async {
    final data = challenge != null
        ? await request(
            '/auth/two-factor',
            body: {'challengeId': challenge, 'code': code},
          )
        : await request(
            '/auth/verify-email',
            body: {'verificationId': verification, 'code': code},
          );
    await adopt(data);
    challenge = null;
    verification = null;
    await loadTenants();
  }

  Future<void> loadTenants() async {
    final account = await request('/me');
    tenants = [
      for (final tenant in account['tenants']) TenantSummary.fromJson(tenant),
    ];
  }

  Future<void> refresh() async {
    final token = await store.read(key: 'refresh');
    if (token == null) return;
    try {
      await adopt(
        await request('/auth/refresh', body: {'refreshToken': token}),
      );
    } on ApiFailure catch (error) {
      if (error.status == 401) {
        await store.delete(key: 'refresh');
        session = null;
      }
      rethrow;
    }
  }

  Future<void> open(TenantSummary tenant, {String? databasePath}) async {
    await adopt(await request('/me/tenant', body: {'tenantId': tenant.id}));
    final path =
        databasePath ??
        '${(await getApplicationSupportDirectory()).path}/workspace.db';
    final db = PowerSyncDatabase(
      schema: const Schema([
        Table('contacts', [
          Column.text('tenant_id'),
          Column.text('first_name'),
          Column.text('last_name'),
          Column.text('company_name'),
          Column.integer('archived'),
        ]),
      ]),
      path: path,
    );
    database = db;
    await db.initialize();
    // Clear records from an interrupted prior session before publishing the new query.
    await db.disconnectAndClear();
    await db.connect(connector: this);
  }

  @override
  Future<PowerSyncCredentials?> fetchCredentials() async {
    if (session == null ||
        DateTime.parse(session!.expiresAt)
            .isBefore(DateTime.now().add(const Duration(minutes: 1)))) {
      await (refreshing ??= refresh().whenComplete(() => refreshing = null));
    }
    return session == null
        ? null
        : PowerSyncCredentials(
            endpoint: syncEndpoint,
            token: session!.accessToken,
          );
  }

  @override
  Future<void> uploadData(PowerSyncDatabase database) async {
    final tx = await database.getNextCrudTransaction();
    if (tx == null) return;
    await fetchCredentials();
    await request(
      '/sync/write',
      body: {
        'ops': [
          for (final op in tx.crud)
            {
              'op': op.op.json,
              'table': op.table,
              'id': op.id,
              'data': op.opData,
            },
        ],
      },
    );
    await tx.complete();
  }

  Future<void> logout() async {
    final db = database;
    database = null;
    await db?.disconnectAndClear();
    await db?.close();
    final token = await store.read(key: 'refresh');
    try {
      if (token != null) {
        await request('/auth/sign-out', body: {'refreshToken': token});
      }
    } finally {
      await store.delete(key: 'refresh');
      session = null;
      tenants = [];
      challenge = null;
      verification = null;
    }
  }
}
