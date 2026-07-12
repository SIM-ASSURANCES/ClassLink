import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/theme/app_theme.dart';
import '../parent/widgets/parent_paywall_gate.dart';

// ─── Provider ────────────────────────────────────────────────────────────────

final assignmentsProvider = FutureProvider.family<List<dynamic>, String?>(
  (ref, studentId) async {
    final params = studentId != null ? {'studentId': studentId} : null;
    final resp = await ApiClient().get(ApiConstants.assignments, params: params);
    return resp.data['assignments'] as List<dynamic>;
  },
);

// ─── Screen ──────────────────────────────────────────────────────────────────

class AssignmentsScreen extends ConsumerWidget {
  final String? studentId;
  const AssignmentsScreen({super.key, this.studentId});

  Color _statusColor(String? status) => switch (status) {
    'GRADED'    => AppTheme.success,
    'SUBMITTED' => AppTheme.primary,
    'LATE'      => AppTheme.danger,
    _           => AppTheme.warning,
  };

  String _statusLabel(String? status) => switch (status) {
    'GRADED'    => 'Corrigé',
    'SUBMITTED' => 'Rendu',
    'LATE'      => 'Rendu en retard',
    _           => 'À rendre',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(assignmentsProvider(studentId));

    return Scaffold(
      appBar: AppBar(title: const Text('Devoirs & exercices')),
      body: ParentPaywallGate(
        featureName: 'Les devoirs & exercices',
        featureKey: 'assignments',
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error:   (e, _) => Center(child: Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger))),
          data: (assignments) {
            if (assignments.isEmpty) {
              return const Center(child: Text('Aucun devoir pour le moment.', style: TextStyle(color: AppTheme.textSub)));
            }
            return RefreshIndicator(
              onRefresh: () => ref.refresh(assignmentsProvider(studentId).future),
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: assignments.length,
                itemBuilder: (ctx, i) {
                  final a = assignments[i] as Map<String, dynamic>;
                  final status = a['submissionStatus'] as String?;
                  final color  = _statusColor(status);
                  final dueDate = a['dueDate'] != null
                      ? DateFormat('dd MMM yyyy', 'fr').format(
                          DateTime.tryParse(a['dueDate'].toString()) ?? DateTime.now())
                      : '—';
                  final score = a['score'] as num?;
                  final maxScore = a['maxScore'] as num?;

                  return Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(a['title'] as String? ?? '',
                                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
                                  const SizedBox(height: 2),
                                  Text(a['subjectName'] as String? ?? '',
                                    style: const TextStyle(fontSize: 12, color: AppTheme.textSub)),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: color.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(_statusLabel(status),
                                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
                            ),
                          ],
                        ),
                        if ((a['description'] as String?)?.isNotEmpty ?? false) ...[
                          const SizedBox(height: 8),
                          Text(a['description'] as String,
                            style: const TextStyle(fontSize: 12, color: AppTheme.textSub), maxLines: 3, overflow: TextOverflow.ellipsis),
                        ],
                        const SizedBox(height: 10),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('Échéance : $dueDate', style: const TextStyle(fontSize: 11, color: AppTheme.textSub)),
                            if (score != null)
                              Text('${score.toStringAsFixed(1)}/${maxScore?.toStringAsFixed(0) ?? '20'}',
                                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: color)),
                          ],
                        ),
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
