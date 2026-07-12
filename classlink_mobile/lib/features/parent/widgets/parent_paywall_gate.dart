import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../auth/providers/auth_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../screens/children_screen.dart';

/// Verrouille une fonctionnalité parent tant que l'abonnement MyClassLink
/// (2000 FCFA/an/enfant) n'est pas réglé pour l'année scolaire en cours —
/// équivalent mobile de components/ui/parent-paywall.tsx (web).
/// Transparent pour l'élève : le paiement d'abonnement ne concerne que le
/// compte parent.
class ParentPaywallGate extends ConsumerWidget {
  final String featureName;
  final Widget child;
  const ParentPaywallGate({super.key, required this.featureName, required this.child});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isParent = ref.watch(authProvider).user?.isParent ?? false;
    if (!isParent) return child;

    final async = ref.watch(parentSubscriptionProvider);

    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      // En cas d'erreur de lecture du statut, on n'affiche pas le contenu
      // verrouillable par défaut (fail-closed) plutôt que de risquer une
      // fuite d'accès — même choix que côté web.
      error: (_, _) => const Padding(
        padding: EdgeInsets.all(24),
        child: Text(
          'Impossible de vérifier le statut de votre abonnement pour le moment.',
          style: TextStyle(color: AppTheme.danger),
          textAlign: TextAlign.center,
        ),
      ),
      data: (sub) {
        final paid = sub['paid'] as bool? ?? true;
        if (paid) return child;

        final childrenCount = sub['childrenCount'] as int? ?? 0;
        final amountDue     = (sub['amountDue'] as num?)?.toInt() ?? 0;

        return Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 56, height: 56,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppTheme.warning.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.lock_outline_rounded, color: AppTheme.warning, size: 28),
                ),
                const SizedBox(height: 16),
                const Text('Fonctionnalité verrouillée',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: AppTheme.textMain)),
                const SizedBox(height: 6),
                Text(
                  '$featureName nécessite un abonnement MyClassLink actif pour l\'année scolaire en cours.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 13, color: AppTheme.textSub),
                ),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(color: AppTheme.surface, borderRadius: BorderRadius.circular(10)),
                  child: Text(
                    '$childrenCount enfant${childrenCount > 1 ? 's' : ''} × 2 000 FCFA = $amountDue FCFA/an',
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textMain),
                  ),
                ),
                const SizedBox(height: 18),
                const SizedBox(width: double.infinity, child: RegulariserButton()),
              ],
            ),
          ),
        );
      },
    );
  }
}
