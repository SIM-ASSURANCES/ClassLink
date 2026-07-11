import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_bottom_nav.dart';

// ─── Provider ────────────────────────────────────────────────────────────────

final attendanceProvider = FutureProvider.family<Map<String, dynamic>, String?>(
  (ref, studentId) async {
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

    return Scaffold(
      appBar: AppBar(title: const Text('Absences & retards')),
      bottomNavigationBar: studentId == null ? const AppBottomNav(current: AppTab.attendance) : null,
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error:   (e, _) => Center(child: Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger))),
        data: (data) {
          final stats   = data['stats']   as Map<String, dynamic>;
          final records = data['records'] as List<dynamic>;

          return RefreshIndicator(
            onRefresh: () => ref.refresh(attendanceProvider(studentId).future),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
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

                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(10),
                        border: Border(left: BorderSide(color: color, width: 3)),
                      ),
                      child: Row(
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
                    );
                  }),
              ],
            ),
          );
        },
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
