import 'package:flutter/foundation.dart';

/// null = dernier appel réseau réussi ; sinon date des données actuellement
/// servies depuis le cache local (mode hors-ligne) — voir OfflineCache et
/// ApiClient.get(). Un ValueNotifier simple plutôt qu'un provider Riverpod
/// car ApiClient est un singleton hors de l'arbre de widgets.
final ValueNotifier<DateTime?> offlineSince = ValueNotifier<DateTime?>(null);
