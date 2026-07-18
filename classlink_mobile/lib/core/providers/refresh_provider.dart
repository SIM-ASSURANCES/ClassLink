import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Compteur global de rafraîchissement. Chaque écran qui affiche des données
/// serveur observe ce provider en tête de son [FutureProvider] : l'incrémenter
/// force donc le recalcul de toutes les données affichées, sans devoir cibler
/// chaque écran individuellement.
///
/// Incrémenté par [AutoRefreshObserver] (retour au premier plan, minuterie
/// périodique, ou réception d'un push FCM `{"type": "sync"}` envoyé par le
/// serveur après une action admin/super-admin — ex. verrouillage/déverrouillage
/// d'une fonctionnalité parent).
final refreshTickProvider = StateProvider<int>((ref) => 0);
