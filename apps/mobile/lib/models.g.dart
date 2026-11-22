// Generated from packages/contracts/openapi.json. Run node tool/generate.mjs.
class SessionTokens {
  final String accessToken;
  final String expiresAt;
  final String? refreshToken;
  SessionTokens.fromJson(Map<String, dynamic> json)
      : accessToken = json['accessToken'] as String,
        expiresAt = json['expiresAt'] as String,
        refreshToken = json['refreshToken'] as String?;
}

class TenantSummary {
  final String id;
  final String name;
  TenantSummary.fromJson(Map<String, dynamic> json)
      : id = json['id'] as String,
        name = json['name'] as String;
}
