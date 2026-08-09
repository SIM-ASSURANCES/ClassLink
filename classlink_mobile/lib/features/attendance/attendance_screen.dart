import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/providers/refresh_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/attendance_trend_chart.dart';
import '../parent/widgets/parent_paywall_gate.dart';
import '../auth/providers/auth_provider.dart';

Future<void> _showJustifyDialog(BuildContext context, WidgetRef ref, String attendanceId, String? studentId) async {
  final controller = TextEditingController();
  final submitted = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Justifier l\'absence'),
      content: TextField(
        controller: controller,
        maxLines: 3,
        autofocus: true,
        decoration: const InputDecoration(
          hintText: 'Motif de l\'absence…',
          border: OutlineInputBorder(),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
        FilledButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Envoyer'),
        ),
      ],
    ),
  );

  if (submitted != true || controller.text.trim().isEmpty) return;

  try {
    await ApiClient().post(ApiConstants.attendance, data: {
      'attendanceId': attendanceId,
      'justification': controller.text.trim(),
    });
    ref.invalidate(attendanceProvider(studentId));
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Justification envoyée.')),
      );
    }
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erreur : $e'), backgroundColor: AppTheme.danger),
      );
    }
  }
}

// ─── Provider ────────────────────────────────────────────────────────────────

final attendanceProvider = FutureProvider.family<Map<String, dynamic>, String?>(
  (ref, studentId) async {
    ref.watch(refreshTickProvider);
    final params = studentId != null ? {'studentId': studentId} : null;
    final resp = await ApiClient().get(ApiConstants.attendance, params: params);
    return resp.data as Map<String, dynamic>;
  },
);

// ─── Screen ──────────────────────────────────────────────────────────────────

class AttendanceScreen extends ConsumerWidget {
  final String? studentId;
  const AttendanceScreen({super.key, this.studentId});

  Color _statusColor(String status) {
    switch (status) {
      case 'ABSENT': return AppTheme.danger;
      case 'LATE':   return AppTheme.warning;
      default:       return AppTheme.success;
    }
  }

  String _statusLabel(String status, bool justified) {
    if (status == 'ABSENT') return justified ? 'Absence justifiée' : 'Absence';
    if (status == 'LATE')   return 'Retard';
    return status;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(attendanceProvider(studentId));
    final isParent = ref.watch(authProvider).user?.isParent ?? false;

    return Scaffold(
      appBar: AppBar(title: const Text('Absences & retards')),
      body: ParentPaywallGate(
        featureName: 'La justification des absences',
        featureKey: 'attendance',
        child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error:   (e, _) => Center(child: Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger))),
        data: (data) {
          final stats   = data['stats']   as Map<String, dynamic>;
          final records = data['records'] as List<dynamic>;
          final byTerm  = data['byTerm'] as List<dynamic>? ?? const [];

          return RefreshIndicator(
            onRefresh: () => ref.refresh(attendanceProvider(studentId).future),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (byTerm.isNotEmpty)
                  Container(
                    margin: const EdgeInsets.only(bottom: 16),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Évolution par trimestre',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
                        AttendanceTrendChart(terms: [
                          for (final t in byTerm)
                            (
                              name: (t as Map<String, dynamic>)['termName'] as String,
                              present: t['present'] as int? ?? 0,
                              late: t['late'] as int? ?? 0,
                              absent: t['absent'] as int? ?? 0,
                            ),
                        ]),
                      ],
                    ),
                  ),
                // Statistiques
                Row(
                  children: [
                    _StatChip(label: 'Absences', value: stats['absent'] ?? 0, color: AppTheme.danger),
                    const SizedBox(width: 10),
                    _StatChip(label: 'Retards',  value: stats['late']   ?? 0, color: AppTheme.warning),
                    const SizedBox(width: 10),
                    _StatChip(label: 'Justifiées', value: stats['justified'] ?? 0, color: AppTheme.success),
                  ],
                ),

                const SizedBox(height: 20),
                const Text('Historique', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
                const SizedBox(height: 10),

                if (records.isEmpty)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 40),
                      child: Text('Aucune absence enregistrée.', style: TextStyle(color: AppTheme.textSub)),
                    ),
                  )
                else
                  ...records.map((r) {
                    final rec    = r as Map<String, dynamic>;
                    final status = rec['status'] as String;
                    final just   = rec['justified'] as bool? ?? false;
                    final color  = _statusColor(status);
                    DateTime? date;
                    try { date = DateTime.parse(rec['date'].toString()); } catch (_) {}

                    final canJustify = isParent && status == 'ABSENT' && !just;

                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(10),
                        border: Border(left: BorderSide(color: color, width: 3)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(_statusLabel(status, just),
                                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: color)),
                                    if (rec['subjectName'] != null)
                                      Text(rec['subjectName'], style: TextStyle(fontSize: 12, color: AppTheme.textSub)),
                                    if (rec['comment'] != null && (rec['comment'] as String).isNotEmpty)
                                      Text(rec['comment'], style: TextStyle(fontSize: 11, color: AppTheme.textSub)),
                                  ],
                                ),
                              ),
                              if (date != null)
                                Text(DateFormat('dd/MM/yy').format(date),
                                  style: TextStyle(fontSize: 11, color: AppTheme.textSub)),
                            ],
                          ),
                          if (canJustify) ...[
                            const SizedBox(height: 8),
                            Align(
                              alignment: Alignment.centerRight,
                              child: OutlinedButton(
                                onPressed: () => _showJustifyDialog(context, ref, rec['id'] as String, studentId),
                                style: OutlinedButton.styleFrom(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                                  minimumSize: const Size(0, 32),
                                ),
                                child: const Text('Justifier', style: TextStyle(fontSize: 12)),
                              ),
                            ),
                          ],
                        ],
                      ),
                    );
                  }),
              ],
            ),
          );
        },
      ),
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  final String label;
  final int    value;
  final Color  color;
  const _StatChip({required this.label, required this.value, required this.color});

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
