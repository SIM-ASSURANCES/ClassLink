import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/providers/refresh_provider.dart';
import '../../core/theme/app_theme.dart';
import '../parent/widgets/parent_paywall_gate.dart';

// ─── Provider ────────────────────────────────────────────────────────────────

final scheduleProvider = FutureProvider.family<Map<int, List<dynamic>>, String?>(
  (ref, studentId) async {
    ref.watch(refreshTickProvider);
    final params = studentId != null ? {'studentId': studentId} : null;
    final resp = await ApiClient().get(ApiConstants.schedule, params: params);
    final raw = resp.data['schedule'] as Map<String, dynamic>;
    return raw.map((k, v) => MapEntry(int.parse(k), v as List<dynamic>));
  },
);

// ─── Screen ──────────────────────────────────────────────────────────────────

const _dayNames = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

class ScheduleScreen extends ConsumerStatefulWidget {
  final String? studentId;
  const ScheduleScreen({super.key, this.studentId});

  @override
  ConsumerState<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends ConsumerState<ScheduleScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;
  final int _today = DateTime.now().weekday; // 1=lundi … 7=dimanche

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 5, vsync: this, initialIndex: (_today - 1).clamp(0, 4));
  }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Color _slotColor(String? hex) {
    if (hex == null || hex.isEmpty) return AppTheme.primary;
    try {
      return Color(int.parse(hex.replaceAll('#', '0xFF')));
    } catch (_) {
      return AppTheme.primary;
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(scheduleProvider(widget.studentId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Emploi du temps'),
        bottom: TabBar(
          controller: _tabs,
          isScrollable: false,
          labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          tabs: List.generate(5, (i) => Tab(text: _dayNames[i + 1].substring(0, 3))),
        ),
      ),
      body: ParentPaywallGate(
        featureName: 'L\'emploi du temps',
        featureKey: 'schedule',
        child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error:   (e, _) => Center(child: Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger))),
        data: (schedule) => TabBarView(
          controller: _tabs,
          children: List.generate(5, (i) {
            final day  = i + 1;
            final slots = schedule[day] ?? [];
            if (slots.isEmpty) {
              return const Center(
                child: Text('Pas de cours ce jour.', style: TextStyle(color: AppTheme.textSub)),
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: slots.length,
              itemBuilder: (ctx, j) {
                final s = slots[j] as Map<String, dynamic>;
                final color = _slotColor(s['subjectColor'] as String?);
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border(left: BorderSide(color: color, width: 4)),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6, offset: const Offset(0, 2))],
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    child: Row(
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(s['startTime'] ?? '', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
                            Text(s['endTime']   ?? '', style: TextStyle(fontSize: 11, color: AppTheme.textSub)),
                          ],
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(s['subjectName'] ?? '', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                              if (s['teacherName'] != null)
                                Text(s['teacherName'], style: TextStyle(fontSize: 12, color: AppTheme.textSub)),
                            ],
                          ),
                        ),
                        if (s['room'] != null)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(6)),
                            child: Text(s['room'], style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color)),
                          ),
                      ],
                    ),
                  ),
                );
              },
            );
          }),
        ),
      ),
      ),
    );
  }
}
