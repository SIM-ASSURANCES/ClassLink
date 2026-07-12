import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/theme/app_theme.dart';
import '../parent/widgets/parent_paywall_gate.dart';

// ─── Provider ────────────────────────────────────────────────────────────────

final summaryProvider = FutureProvider.family<Map<String, dynamic>, String>(
  (ref, studentId) async {
    final resp = await ApiClient().get(ApiConstants.summary, params: {'studentId': studentId});
    return resp.data as Map<String, dynamic>;
  },
);

const _sanctionLabels = {
  'AVERTISSEMENT': 'Avertissement', 'BLAME': 'Blâme',
  'EXCLUSION_TEMP': 'Exclusion temporaire', 'RENVOI': 'Renvoi', 'AUTRE': 'Autre',
};

// ─── Screen ──────────────────────────────────────────────────────────────────

class SummaryScreen extends ConsumerWidget {
  final String studentId;
  const SummaryScreen({super.key, required this.studentId});

  Color _avgColor(num? value, num? max) {
    if (value == null) return AppTheme.textSub;
    final ratio = value.toDouble() / (max?.toDouble() ?? 20);
    if (ratio >= 0.7) return AppTheme.success;
    if (ratio >= 0.5) return AppTheme.primary;
    return AppTheme.danger;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(summaryProvider(studentId));

    return Scaffold(
      appBar: AppBar(title: const Text('Aperçu')),
      body: ParentPaywallGate(
        featureName: 'Le résumé hebdomadaire',
        featureKey: 'summary',
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error:   (e, _) => Center(child: Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger))),
          data: (data) {
            final grades      = data['recentGrades'] as List<dynamic>? ?? [];
            final attendance  = data['weekAttendance'] as Map<String, dynamic>? ?? {};
            final pending     = data['pendingAssignments'] as int? ?? 0;
            final sanctions   = data['recentSanctions'] as List<dynamic>? ?? [];

            return RefreshIndicator(
              onRefresh: () => ref.refresh(summaryProvider(studentId).future),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  const Text('Présence cette semaine',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      _StatBox(label: 'Présent', value: attendance['present'] ?? 0, color: AppTheme.success),
                      const SizedBox(width: 10),
                      _StatBox(label: 'Absent', value: attendance['absent'] ?? 0, color: AppTheme.danger),
                      const SizedBox(width: 10),
                      _StatBox(label: 'Retard', value: attendance['late'] ?? 0, color: AppTheme.warning),
                    ],
                  ),
                  const SizedBox(height: 20),

                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: pending > 0 ? AppTheme.warning.withValues(alpha: 0.1) : AppTheme.success.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        Icon(pending > 0 ? Icons.assignment_late_rounded : Icons.check_circle_rounded,
                          color: pending > 0 ? AppTheme.warning : AppTheme.success),
                        const SizedBox(width: 10),
                        Text(
                          pending > 0
                            ? '$pending devoir${pending > 1 ? 's' : ''} à rendre cette semaine'
                            : 'Aucun devoir en attente',
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textMain),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  const Text('Notes récentes',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
                  const SizedBox(height: 10),
                  if (grades.isEmpty)
                    const Text('Aucune note récente.', style: TextStyle(fontSize: 12, color: AppTheme.textSub))
                  else
                    ...grades.cast<Map<String, dynamic>>().map((g) {
                      final value = g['value'] as num?;
                      final max   = g['maxValue'] as num?;
                      final color = _avgColor(value, max);
                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppTheme.border),
                        ),
                        child: Row(
                          children: [
                            Expanded(child: Text(g['subjectName'] as String? ?? '',
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
                            Text('${value?.toStringAsFixed(1) ?? '—'}/${max?.toStringAsFixed(0) ?? '20'}',
                              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: color)),
                          ],
                        ),
                      );
                    }),
                  const SizedBox(height: 20),

                  const Text('Sanctions récentes',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
                  const SizedBox(height: 10),
                  if (sanctions.isEmpty)
                    const Text('Aucune sanction récente.', style: TextStyle(fontSize: 12, color: AppTheme.textSub))
                  else
                    ...sanctions.cast<Map<String, dynamic>>().map((s) {
                      final date = s['date'] != null
                          ? DateFormat('dd MMM yyyy', 'fr').format(
                              DateTime.tryParse(s['date'].toString()) ?? DateTime.now())
                          : '—';
                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppTheme.border),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(_sanctionLabels[s['type']] ?? s['type'] as String? ?? '',
                                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.danger)),
                                  Text(s['reason'] as String? ?? '', style: const TextStyle(fontSize: 12, color: AppTheme.textSub)),
                                ],
                              ),
                            ),
                            Text(date, style: const TextStyle(fontSize: 11, color: AppTheme.textSub)),
                          ],
                        ),
                      );
                    }),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => context.push('/parent/child/$studentId/sanctions'),
                    child: const Text('Voir tout l\'historique →'),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _StatBox extends StatelessWidget {
  final String label;
  final int    value;
  final Color  color;
  const _StatBox({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Text('$value', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
          Text(label,    style: TextStyle(fontSize: 11, color: color)),
        ],
      ),
    ),
  );
}
