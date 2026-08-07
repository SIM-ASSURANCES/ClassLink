import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/providers/refresh_provider.dart';
import '../../core/theme/app_theme.dart';
import '../parent/widgets/parent_paywall_gate.dart';

// ─── Providers ──────────────────────────────────────────────────────────────

final _teachersProvider = FutureProvider.family<List<dynamic>, String>((ref, studentId) async {
  final resp = await ApiClient().get(ApiConstants.appointmentTeachers, params: {'studentId': studentId});
  return resp.data['teachers'] as List<dynamic>;
});

final _slotsProvider = FutureProvider.family<List<dynamic>, String>((ref, teacherId) async {
  final resp = await ApiClient().get(ApiConstants.appointmentSlots, params: {'teacherId': teacherId});
  return resp.data['slots'] as List<dynamic>;
});

final appointmentsProvider = FutureProvider<List<dynamic>>((ref) async {
  ref.watch(refreshTickProvider);
  final resp = await ApiClient().get(ApiConstants.appointments);
  return resp.data['appointments'] as List<dynamic>;
});

String _formatRange(String startIso, String endIso) {
  final s = DateTime.parse(startIso).toLocal();
  final e = DateTime.parse(endIso).toLocal();
  const days = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const months = ['', 'jan.', 'fév.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  final date = '${days[s.weekday]} ${s.day} ${months[s.month]}';
  String t(DateTime d) => '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  return '$date · ${t(s)} – ${t(e)}';
}

// ─── Screen ──────────────────────────────────────────────────────────────────

class AppointmentsScreen extends ConsumerStatefulWidget {
  final String studentId;
  const AppointmentsScreen({super.key, required this.studentId});

  @override
  ConsumerState<AppointmentsScreen> createState() => _AppointmentsScreenState();
}

class _AppointmentsScreenState extends ConsumerState<AppointmentsScreen> {
  String? _teacherId;
  bool _booking = false;
  String? _error;

  Future<void> _book(String slotId) async {
    setState(() { _booking = true; _error = null; });
    try {
      await ApiClient().post(ApiConstants.appointments, data: {
        'slotId': slotId, 'studentId': widget.studentId,
      });
      ref.invalidate(_slotsProvider(_teacherId!));
      ref.invalidate(appointmentsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Rendez-vous réservé.'), backgroundColor: AppTheme.success));
      }
    } catch (e) {
      setState(() => _error = 'Impossible de réserver ce créneau (peut-être déjà pris).');
    } finally {
      if (mounted) setState(() => _booking = false);
    }
  }

  Future<void> _cancel(String appointmentId) async {
    try {
      await ApiClient().post(ApiConstants.appointmentsCancel, data: {'appointmentId': appointmentId});
      ref.invalidate(appointmentsProvider);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Rendez-vous')),
      body: ParentPaywallGate(
        featureName: 'Les rendez-vous enseignants',
        featureKey: 'appointments',
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text('Réserver un créneau', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
            const SizedBox(height: 10),
            Consumer(builder: (context, ref, _) {
              final teachers = ref.watch(_teachersProvider(widget.studentId));
              return teachers.when(
                loading: () => const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator())),
                error: (e, _) => Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger)),
                data: (list) {
                  if (list.isEmpty) {
                    return const Text('Aucun enseignant trouvé pour cet enfant.', style: TextStyle(fontSize: 13, color: AppTheme.textSub));
                  }
                  return Wrap(
                    spacing: 8, runSpacing: 8,
                    children: list.map((t) {
                      final m = t as Map<String, dynamic>;
                      final id = m['teacherId'] as String;
                      final selected = id == _teacherId;
                      return ChoiceChip(
                        label: Text('${m['firstName']} ${m['lastName']} — ${m['subjectName']}'),
                        selected: selected,
                        onSelected: (_) => setState(() => _teacherId = selected ? null : id),
                        selectedColor: AppTheme.primary.withValues(alpha: 0.15),
                        labelStyle: TextStyle(fontSize: 12, color: selected ? AppTheme.primary : AppTheme.textMain),
                      );
                    }).toList(),
                  );
                },
              );
            }),

            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(fontSize: 12, color: AppTheme.danger)),
            ],

            if (_teacherId != null) ...[
              const SizedBox(height: 16),
              const Text('Créneaux disponibles', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
              const SizedBox(height: 10),
              Consumer(builder: (context, ref, _) {
                final slots = ref.watch(_slotsProvider(_teacherId!));
                return slots.when(
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (e, _) => Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger)),
                  data: (list) {
                    if (list.isEmpty) {
                      return const Text('Aucun créneau disponible actuellement.', style: TextStyle(fontSize: 13, color: AppTheme.textSub));
                    }
                    return Column(
                      children: list.map((s) {
                        final m = s as Map<String, dynamic>;
                        return Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: ListTile(
                            title: Text(_formatRange(m['startTime'], m['endTime']), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                            subtitle: m['location'] != null ? Text(m['location'], style: const TextStyle(fontSize: 12)) : null,
                            trailing: _booking
                              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                              : const Icon(Icons.chevron_right_rounded, color: AppTheme.textSub),
                            onTap: _booking ? null : () => _book(m['id'] as String),
                          ),
                        );
                      }).toList(),
                    );
                  },
                );
              }),
            ],

            const SizedBox(height: 24),
            const Text('Mes rendez-vous', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
            const SizedBox(height: 10),
            Consumer(builder: (context, ref, _) {
              final appts = ref.watch(appointmentsProvider);
              return appts.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger)),
                data: (list) {
                  final upcoming = list.where((a) {
                    final m = a as Map<String, dynamic>;
                    return m['status'] == 'CONFIRMED' && DateTime.parse(m['startTime']).isAfter(DateTime.now());
                  }).toList();
                  if (upcoming.isEmpty) {
                    return const Text('Aucun rendez-vous à venir.', style: TextStyle(fontSize: 13, color: AppTheme.textSub));
                  }
                  return Column(
                    children: upcoming.map((a) {
                      final m = a as Map<String, dynamic>;
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          title: Text(_formatRange(m['startTime'], m['endTime']), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                          subtitle: Text('${m['teacherFirstName']} ${m['teacherLastName']}'
                            '${m['studentFirstName'] != null ? ' — ${m['studentFirstName']} ${m['studentLastName']}' : ''}',
                            style: const TextStyle(fontSize: 12)),
                          trailing: TextButton(
                            onPressed: () => _cancel(m['id'] as String),
                            child: const Text('Annuler', style: TextStyle(color: AppTheme.danger, fontSize: 12)),
                          ),
                        ),
                      );
                    }).toList(),
                  );
                },
              );
            }),
          ],
        ),
      ),
    );
  }
}
