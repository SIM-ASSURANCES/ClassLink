import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/providers/refresh_provider.dart';
import '../../core/theme/app_theme.dart';
import '../parent/widgets/parent_paywall_gate.dart';

// ─── Provider ────────────────────────────────────────────────────────────────

final sanctionsProvider = FutureProvider.family<List<dynamic>, String>(
  (ref, studentId) async {
    ref.watch(refreshTickProvider);
    final resp = await ApiClient().get(ApiConstants.sanctions, params: {'studentId': studentId});
    return resp.data['sanctions'] as List<dynamic>;
  },
);

const _sanctionLabels = {
  'AVERTISSEMENT': 'Avertissement', 'BLAME': 'Blâme',
  'EXCLUSION_TEMP': 'Exclusion temporaire', 'RENVOI': 'Renvoi', 'AUTRE': 'Autre',
};

// ─── Screen ──────────────────────────────────────────────────────────────────

class SanctionsScreen extends ConsumerWidget {
  final String studentId;
  const SanctionsScreen({super.key, required this.studentId});

  Color _typeColor(String type) => switch (type) {
    'AVERTISSEMENT' => AppTheme.warning,
    'BLAME'         => const Color(0xFFEA580C),
    'EXCLUSION_TEMP' || 'RENVOI' => AppTheme.danger,
    _ => AppTheme.textSub,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(sanctionsProvider(studentId));

    return Scaffold(
      appBar: AppBar(title: const Text('Sanctions')),
      body: ParentPaywallGate(
        featureName: 'L\'historique des sanctions',
        featureKey: 'sanctions',
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error:   (e, _) => Center(child: Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger))),
          data: (sanctions) {
            if (sanctions.isEmpty) {
              return const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.check_circle_outline_rounded, size: 48, color: AppTheme.success),
                    SizedBox(height: 12),
                    Text('Aucune sanction enregistrée.', style: TextStyle(color: AppTheme.textSub)),
                  ],
                ),
              );
            }
            return RefreshIndicator(
              onRefresh: () => ref.refresh(sanctionsProvider(studentId).future),
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: sanctions.length,
                itemBuilder: (ctx, i) {
                  final s = sanctions[i] as Map<String, dynamic>;
                  final type  = s['type'] as String? ?? 'AUTRE';
                  final color = _typeColor(type);
                  final date = s['date'] != null
                      ? DateFormat('dd MMM yyyy', 'fr').format(
                          DateTime.tryParse(s['date'].toString()) ?? DateTime.now())
                      : '—';

                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border(left: BorderSide(color: color, width: 4)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(6)),
                              child: Text(_sanctionLabels[type] ?? type,
                                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
                            ),
                            const Spacer(),
                            Text(date, style: const TextStyle(fontSize: 11, color: AppTheme.textSub)),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(s['reason'] as String? ?? '',
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
                        if ((s['description'] as String?)?.isNotEmpty ?? false) ...[
                          const SizedBox(height: 4),
                          Text(s['description'] as String, style: const TextStyle(fontSize: 12, color: AppTheme.textSub)),
                        ],
                        if (s['duration'] != null) ...[
                          const SizedBox(height: 4),
                          Text('Durée : ${s['duration']} jour(s)', style: const TextStyle(fontSize: 11, color: AppTheme.textSub)),
                        ],
                        if ((s['issuedBy'] as String?)?.isNotEmpty ?? false) ...[
                          const SizedBox(height: 4),
                          Text('Par ${s['issuedBy']}', style: const TextStyle(fontSize: 11, color: AppTheme.textSub)),
                        ],
                      ],
                    ),
                  );
                },
              ),
            );
          },
        ),
      ),
    );
  }
}
