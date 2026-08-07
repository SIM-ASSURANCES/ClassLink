import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../providers/grades_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/grade_trend_chart.dart';
import '../../parent/widgets/parent_paywall_gate.dart';

// Libellés des types de note — identiques au web (notes/page.tsx).
const _gradeTypeLabels = {
  'DEVOIR': 'Devoir', 'INTERROGATION': 'Interro.',
  'COMPOSITION': 'Composition', 'EXAM': 'Examen',
};

class GradesScreen extends ConsumerWidget {
  final String? studentId;
  const GradesScreen({super.key, this.studentId});

  Color _avgColor(double? avg) {
    if (avg == null) return AppTheme.textSub;
    if (avg >= 14) return AppTheme.success;
    if (avg >= 10) return AppTheme.primary;
    return AppTheme.danger;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(gradesProvider(studentId));

    return Scaffold(
      appBar: AppBar(title: const Text('Mes notes')),
      body: ParentPaywallGate(
        featureName: 'Les notes & moyennes',
        featureKey: 'grades',
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error:   (e, _) => const Center(child: Text('Impossible de charger les notes.', style: TextStyle(color: AppTheme.danger))),
          data: (state) {
            final terms = state.terms;
            final hasGrades = terms.any((t) => t.subjects.isNotEmpty);
            if (!hasGrades) {
              return const Center(child: Text('Aucune note enregistrée pour cette année.'));
            }
            return RefreshIndicator(
              onRefresh: () => ref.refresh(gradesProvider(studentId).future),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (terms.any((t) => t.generalAverage != null))
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
                          const Text('Évolution de la moyenne générale',
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
                          GradeTrendChart(terms: [
                            for (final t in terms) (name: t.name, average: t.generalAverage),
                          ]),
                        ],
                      ),
                    ),
                  // Récapitulatif des moyennes par trimestre — comme le web.
                  Row(
                    children: terms.map((t) {
                      final avg = t.generalAverage;
                      return Expanded(
                        child: Container(
                          margin: const EdgeInsets.symmetric(horizontal: 3),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: AppTheme.border),
                          ),
                          child: Column(
                            children: [
                              Text(t.name.toUpperCase(),
                                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppTheme.textSub),
                                maxLines: 1, overflow: TextOverflow.ellipsis),
                              const SizedBox(height: 4),
                              Text(avg != null ? avg.toStringAsFixed(2) : '—',
                                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: _avgColor(avg))),
                              if (avg != null)
                                Text('/ 20', style: TextStyle(fontSize: 10, color: AppTheme.textSub)),
                            ],
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 16),

                  // Notes par trimestre — sections identiques au web.
                  for (final term in terms.where((t) => t.subjects.isNotEmpty)) ...[
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: AppTheme.surface,
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
                        border: Border.all(color: AppTheme.border),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(term.name,
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppTheme.textMain)),
                          ),
                          if (term.generalAverage != null)
                            Text('Moy. générale : ${term.generalAverage!.toStringAsFixed(2)} / 20',
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _avgColor(term.generalAverage))),
                        ],
                      ),
                    ),
                    Container(
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(12)),
                        border: Border(
                          left:   BorderSide(color: AppTheme.border),
                          right:  BorderSide(color: AppTheme.border),
                          bottom: BorderSide(color: AppTheme.border),
                        ),
                      ),
                      child: Column(
                        children: term.subjects.map((sub) => _SubjectTile(
                          subject: sub,
                          avgColor: _avgColor,
                        )).toList(),
                      ),
                    ),
                  ],
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _SubjectTile extends StatelessWidget {
  final SubjectGrades subject;
  final Color Function(double?) avgColor;
  const _SubjectTile({required this.subject, required this.avgColor});

  @override
  Widget build(BuildContext context) {
    return ExpansionTile(
      tilePadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
      shape: const Border(),
      title: Row(
        children: [
          Expanded(
            child: Text(subject.name,
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          ),
          Text('coeff. ${subject.coefficient.toStringAsFixed(subject.coefficient == subject.coefficient.roundToDouble() ? 0 : 1)}',
            style: TextStyle(fontSize: 11, color: AppTheme.textSub)),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: avgColor(subject.average).withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              subject.average != null ? subject.average!.toStringAsFixed(2) : '—',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: avgColor(subject.average)),
            ),
          ),
        ],
      ),
      subtitle: Text('${subject.grades.length} note${subject.grades.length > 1 ? 's' : ''}',
        style: TextStyle(fontSize: 11, color: AppTheme.textSub)),
      children: subject.grades.map((g) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
        child: Row(
          children: [
            Text('${g.value.toStringAsFixed(2)}/20',
              style: TextStyle(fontWeight: FontWeight.w700, color: avgColor(g.value), fontSize: 13)),
            const SizedBox(width: 6),
            if (g.coefficient != 1)
              Text('×${g.coefficient.toStringAsFixed(0)}',
                style: TextStyle(fontSize: 11, color: AppTheme.textSub)),
            const SizedBox(width: 8),
            if (g.type != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: AppTheme.surface,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(_gradeTypeLabels[g.type] ?? g.type!,
                  style: TextStyle(fontSize: 10, color: AppTheme.textSub)),
              ),
            const Spacer(),
            if (g.publishedAt != null)
              Text(_shortDate(g.publishedAt!),
                style: TextStyle(fontSize: 10, color: AppTheme.textSub)),
          ],
        ),
      )).toList(),
    );
  }

  static String _shortDate(String iso) {
    try {
      return DateFormat('d MMM', 'fr').format(DateTime.parse(iso));
    } catch (_) {
      try { return DateFormat('d MMM').format(DateTime.parse(iso)); } catch (_) { return ''; }
    }
  }
}
