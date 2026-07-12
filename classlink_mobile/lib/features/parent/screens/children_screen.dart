import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_constants.dart';
import '../../../core/theme/app_theme.dart';

// Couleurs alignées sur le web (Tailwind purple-100/600/700) — réservées aux
// cartes enfants pour matcher visuellement /parent sur classelink (web).
const kChildAccent      = Color(0xFF7C3AED);
const kChildAccentLight = Color(0xFFF3E8FF);

// ─── Providers ────────────────────────────────────────────────────────────────

final childrenProvider = FutureProvider<List<dynamic>>((ref) async {
  final resp = await ApiClient().get(ApiConstants.children);
  return resp.data['children'] as List<dynamic>;
});

final parentSubscriptionProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final resp = await ApiClient().get(ApiConstants.parentSubscription);
  return resp.data as Map<String, dynamic>;
});

// ─── Écran « Mes enfants » ─────────────────────────────────────────────────────

class ChildrenScreen extends ConsumerWidget {
  const ChildrenScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(childrenProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Mes enfants')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error:   (e, _) => Center(child: Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger))),
        data: (children) {
          if (children.isEmpty) {
            return const Center(child: Text('Aucun enfant lié à votre compte.', style: TextStyle(color: AppTheme.textSub)));
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(childrenProvider.future),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const SubscriptionBanner(),
                for (final c in children.cast<Map<String, dynamic>>()) ChildCard(child: c),
              ],
            ),
          );
        },
      ),
    );
  }
}

// ─── Carte enfant (réutilisée sur le tableau de bord parent) ─────────────────

class ChildCard extends StatelessWidget {
  final Map<String, dynamic> child;
  const ChildCard({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final firstName     = child['firstName'] as String? ?? '';
    final lastName      = child['lastName']  as String? ?? '';
    final initials      = '${firstName.isNotEmpty ? firstName[0] : ''}${lastName.isNotEmpty ? lastName[0] : ''}'.toUpperCase();
    final studentId     = child['studentId'] as String;
    final className     = child['className'] as String?;
    final academicYear  = child['academicYear'] as String?;
    final relation      = child['relation'] as String?;
    final studentNumber = child['studentNumber'] as String?;

    final subtitle = [className, academicYear]
        .where((s) => s != null && s.isNotEmpty)
        .join(' · ');

    return InkWell(
      onTap: () => context.push('/parent/child/$studentId'),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 48, height: 48,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: kChildAccentLight,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    initials.isEmpty ? '?' : initials,
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: kChildAccent),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('$firstName $lastName',
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: AppTheme.textMain),
                        overflow: TextOverflow.ellipsis),
                      if (subtitle.isNotEmpty)
                        Text(subtitle, style: const TextStyle(fontSize: 12, color: AppTheme.textSub),
                          overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                if (relation != null && relation.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                    decoration: BoxDecoration(
                      color: kChildAccentLight,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: kChildAccent.withValues(alpha: 0.3)),
                    ),
                    child: Text(relation,
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: kChildAccent)),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('N° ${studentNumber ?? '—'}', style: const TextStyle(fontSize: 12, color: AppTheme.textSub)),
                const Row(
                  children: [
                    Text('Voir le détail',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: kChildAccent)),
                    SizedBox(width: 2),
                    Icon(Icons.arrow_forward_rounded, size: 14, color: kChildAccent),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Bannière abonnement MyClassLink impayé (compte plateforme, distinct des
// frais de scolarité de l'école) ─────────────────────────────────────────────

class SubscriptionBanner extends ConsumerWidget {
  const SubscriptionBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(parentSubscriptionProvider);

    return async.when(
      loading: () => const SizedBox.shrink(),
      error:   (_, _) => const SizedBox.shrink(),
      data: (sub) {
        final paid          = sub['paid'] as bool? ?? true;
        final childrenCount = sub['childrenCount'] as int? ?? 0;
        final amountDue     = (sub['amountDue'] as num?)?.toInt() ?? 0;
        if (paid || childrenCount == 0) return const SizedBox.shrink();

        final amountLabel = NumberFormat('#,###', 'fr').format(amountDue).replaceAll(',', ' ');

        return Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppTheme.warning.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppTheme.warning.withValues(alpha: 0.35)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 36, height: 36,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppTheme.warning.withValues(alpha: 0.18),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.lock_outline_rounded, size: 18, color: AppTheme.warning),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Abonnement MyClassLink non réglé',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
                        const SizedBox(height: 2),
                        Text(
                          '$childrenCount enfant${childrenCount > 1 ? 's' : ''} × 2 000 FCFA = $amountLabel FCFA/an — '
                          'certaines fonctionnalités sont verrouillées.',
                          style: const TextStyle(fontSize: 12, color: AppTheme.textSub),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              const RegulariserButton(),
            ],
          ),
        );
      },
    );
  }
}

/// Bouton « Régulariser » — initie le paiement de l'abonnement MyClassLink
/// du parent (compte plateforme) et ouvre la page de paiement dans le
/// navigateur. Réutilisé par [SubscriptionBanner] et par le verrou de
/// fonctionnalité ([ParentPaywallGate] dans parent_paywall_gate.dart).
class RegulariserButton extends ConsumerStatefulWidget {
  const RegulariserButton({super.key});

  @override
  ConsumerState<RegulariserButton> createState() => _RegulariserButtonState();
}

class _RegulariserButtonState extends ConsumerState<RegulariserButton> {
  bool _loading = false;
  String? _error;

  Future<void> _pay() async {
    setState(() { _loading = true; _error = null; });
    try {
      final resp = await ApiClient().post('${ApiConstants.parentSubscription}/initiate', data: {});
      final paymentUrl = resp.data['paymentUrl'] as String?;
      if (paymentUrl == null) {
        setState(() { _error = 'URL de paiement introuvable.'; });
        return;
      }
      final uri = Uri.parse(paymentUrl);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
        ref.invalidate(parentSubscriptionProvider);
      } else {
        setState(() { _error = 'Impossible d\'ouvrir le navigateur.'; });
      }
    } on DioException catch (e) {
      final serverMessage = e.response?.data is Map ? (e.response?.data as Map)['error'] as String? : null;
      setState(() { _error = serverMessage ?? 'Erreur lors de l\'initiation du paiement.'; });
    } catch (e) {
      setState(() { _error = e.toString().replaceAll('Exception: ', ''); });
    } finally {
      if (mounted) setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_error != null) ...[
          Text(_error!, style: const TextStyle(fontSize: 12, color: AppTheme.danger), textAlign: TextAlign.center),
          const SizedBox(height: 8),
        ],
        ElevatedButton(
          onPressed: _loading ? null : _pay,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.primary,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 10),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            elevation: 0,
          ),
          child: _loading
              ? const SizedBox(width: 16, height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('Régulariser', style: TextStyle(fontWeight: FontWeight.w700)),
        ),
      ],
    );
  }
}
