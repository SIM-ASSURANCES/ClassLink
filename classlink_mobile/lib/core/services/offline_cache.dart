import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// Cache local (lecture seule) des dernières réponses GET réussies — sert de
/// filet de secours quand l'appareil n'a plus de réseau. Pas de file d'attente
/// d'écriture : les actions (POST) échouent normalement hors-ligne.
class OfflineCache {
  static String _key(String path, Map<String, dynamic>? params) {
    final sorted = (params ?? {}).entries.toList()
      ..sort((a, b) => a.key.compareTo(b.key));
    final qs = sorted.map((e) => '${e.key}=${e.value}').join('&');
    return 'offline_cache:$path?$qs';
  }

  static Future<void> save(String path, Map<String, dynamic>? params, dynamic data) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final payload = jsonEncode({'data': data, 'cachedAt': DateTime.now().toIso8601String()});
      await prefs.setString(_key(path, params), payload);
    } catch (_) {
      // Le cache est un confort, pas une garantie — une erreur ici ne doit
      // jamais faire échouer la requête réseau qui vient de réussir.
    }
  }

  /// Renvoie `{data, cachedAt}` ou null si rien n'est en cache pour cet appel.
  static Future<Map<String, dynamic>?> load(String path, Map<String, dynamic>? params) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key(path, params));
      if (raw == null) return null;
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }
}
