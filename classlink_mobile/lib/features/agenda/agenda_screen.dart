import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/theme/app_theme.dart';
import '../parent/widgets/parent_paywall_gate.dart';

// ─── Provider ────────────────────────────────────────────────────────────────

final agendaProvider = FutureProvider.family<List<dynamic>, String>(
  (ref, studentId) async {
    final resp = await ApiClient().get(ApiConstants.agenda, params: {'studentId': studentId});
    return resp.data['events'] as List<dynamic>;
  },
);

const _eventLabels = {
  'EXAM': 'Examen', 'HOLIDAY': 'Vacances', 'MEETING': 'Réunion',
  'ACTIVITY': 'Activité', 'DEADLINE': 'Échéance', 'GENERAL': 'Général',
};

const _eventColors = {
  'EXAM': AppTheme.danger, 'HOLIDAY': AppTheme.success, 'MEETING': AppTheme.primary,
  'ACTIVITY': Color(0xFFEA580C), 'DEADLINE': AppTheme.warning, 'GENERAL': AppTheme.secondary,
};

// ─── Screen ──────────────────────────────────────────────────────────────────

class AgendaScreen extends ConsumerWidget {
  final String studentId;
  const AgendaScreen({super.key, required this.studentId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(agendaProvider(studentId));

    return Scaffold(
      appBar: AppBar(title: const Text('Agenda scolaire')),
      body: ParentPaywallGate(
        featureName: 'L\'agenda scolaire',
        featureKey: 'agenda',
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error:   (e, _) => Center(child: Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger))),
          data: (events) {
            if (events.isEmpty) {
              return const Center(child: Text('Aucun événement à venir.', style: TextStyle(color: AppTheme.textSub)));
            }
            return RefreshIndicator(
              onRefresh: () => ref.refresh(agendaProvider(studentId).future),
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: events.length,
                itemBuilder: (ctx, i) {
                  final e = events[i] as Map<String, dynamic>;
                  final type  = e['eventType'] as String? ?? 'GENERAL';
                  final color = _eventColors[type] ?? AppTheme.secondary;
                  final startDate = e['startDate'] != null
                      ? DateFormat('dd MMM yyyy', 'fr').format(
                          DateTime.tryParse(e['startDate'].toString()) ?? DateTime.now())
                      : '—';

                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border(left: BorderSide(color: color, width: 4)),
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6, offset: const Offset(0, 2))],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(6)),
                              child: Text(_eventLabels[type] ?? type,
                                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
                            ),
                            const Spacer(),
                            Text(startDate, style: const TextStyle(fontSize: 11, color: AppTheme.textSub)),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(e['title'] as String? ?? '',
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
                        if ((e['description'] as String?)?.isNotEmpty ?? false) ...[
                          const SizedBox(height: 4),
                          Text(e['description'] as String,
                            style: const TextStyle(fontSize: 12, color: AppTheme.textSub), maxLines: 2, overflow: TextOverflow.ellipsis),
                        ],
                        if (e['startTime'] != null) ...[
                          const SizedBox(height: 6),
                          Text('${e['startTime']}${e['endTime'] != null ? ' – ${e['endTime']}' : ''}',
                            style: const TextStyle(fontSize: 11, color: AppTheme.textSub)),
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
