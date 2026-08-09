import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../attendance/attendance_screen.dart';

class ChildDetailScreen extends ConsumerWidget {
  final String studentId;
  const ChildDetailScreen({super.key, required this.studentId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final absences = ref.watch(attendanceProvider(studentId));

    return Scaffold(
      appBar: AppBar(title: const Text('Suivi enfant')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Consulter', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
          const SizedBox(height: 12),

          _ActionTile(
            icon: Icons.dashboard_rounded, label: 'Aperçu', color: const Color(0xFF16A34A),
            onTap: () => context.push('/parent/child/$studentId/summary'),
          ),
          _ActionTile(
            icon: Icons.grade_rounded, label: 'Notes', color: AppTheme.primary,
            onTap: () => context.push('/parent/child/$studentId/grades'),
          ),
          _ActionTile(
            icon: Icons.description_rounded, label: 'Bulletins', color: const Color(0xFF7C3AED),
            onTap: () => context.push('/parent/child/$studentId/bulletins'),
          ),
          _ActionTile(
            icon: Icons.assignment_rounded, label: 'Devoirs & exercices', color: const Color(0xFF0D9488),
            onTap: () => context.push('/parent/child/$studentId/assignments'),
          ),
          _ActionTile(
            icon: Icons.calendar_today_rounded, label: 'Emploi du temps', color: AppTheme.secondary,
            onTap: () => context.push('/parent/child/$studentId/schedule'),
          ),
          _ActionTile(
            icon: Icons.event_note_rounded, label: 'Agenda scolaire', color: const Color(0xFF4F46E5),
            onTap: () => context.push('/parent/child/$studentId/agenda'),
          ),
          _ActionTile(
            icon: Icons.check_circle_outline, label: 'Absences', color: AppTheme.warning,
            onTap: () => context.push('/parent/child/$studentId/attendance'),
          ),
          _ActionTile(
            icon: Icons.gavel_rounded, label: 'Sanctions', color: AppTheme.danger,
            onTap: () => context.push('/parent/child/$studentId/sanctions'),
          ),
          _ActionTile(
            icon: Icons.receipt_long_rounded, label: 'Paiements', color: const Color(0xFF0891B2),
            onTap: () => context.push('/parent/child/$studentId/payments'),
          ),
          _ActionTile(
            icon: Icons.qr_code_2_rounded, label: 'Carte d\'élève', color: AppTheme.primary,
            onTap: () => context.push('/parent/child/$studentId/id-card'),
          ),
          _ActionTile(
            icon: Icons.hiking_rounded, label: 'Sorties scolaires', color: const Color(0xFFEA580C),
            onTap: () => context.push('/trips'),
          ),
          _ActionTile(
            icon: Icons.event_available_rounded, label: 'Rendez-vous enseignants', color: const Color(0xFF0D9488),
            onTap: () => context.push('/parent/child/$studentId/appointments'),
          ),
          _ActionTile(
            icon: Icons.directions_bus_filled_rounded, label: 'Transport scolaire', color: const Color(0xFF1800AD),
            onTap: () => context.push('/parent/child/$studentId/transport'),
          ),

          const SizedBox(height: 20),
          const Text('Résumé des absences', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
          const SizedBox(height: 10),

          absences.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error:   (e, _) => Text('$e', style: const TextStyle(color: AppTheme.danger)),
            data: (data) {
              final stats = data['stats'] as Map<String, dynamic>;
              return Row(
                children: [
                  _StatBox(label: 'Absences', value: stats['absent'] ?? 0, color: AppTheme.danger),
                  const SizedBox(width: 10),
                  _StatBox(label: 'Retards',  value: stats['late']   ?? 0, color: AppTheme.warning),
                  const SizedBox(width: 10),
                  _StatBox(label: 'Justifiées', value: stats['justified'] ?? 0, color: AppTheme.success),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  final IconData  icon;
  final String    label;
  final Color     color;
  final VoidCallback onTap;
  const _ActionTile({required this.icon, required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 8),
    child: ListTile(
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
        child: Icon(icon, color: color, size: 20),
      ),
      title: Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
      trailing: const Icon(Icons.chevron_right_rounded, color: AppTheme.textSub),
      onTap: onTap,
    ),
  );
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
        color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: [
          Text('$value', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color)),
          Text(label,    style: TextStyle(fontSize: 10, color: color)),
        ],
      ),
    ),
  );
}
