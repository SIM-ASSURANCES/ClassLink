import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_constants.dart';
import '../../../core/providers/refresh_provider.dart';

// Tolère num ou string : les colonnes NUMERIC de Postgres peuvent arriver
// sérialisées en string selon le chemin serveur.
double? _asDouble(dynamic v) =>
    v == null ? null : (v is num ? v.toDouble() : double.tryParse('$v'));

class GradeEntry {
  final String  id;
  final double  value;
  final double  coefficient;
  final String? type;
  final String? comment;
  final String? publishedAt;
  const GradeEntry({
    required this.id, required this.value, required this.coefficient,
    this.type, this.comment, this.publishedAt,
  });

  factory GradeEntry.fromJson(Map<String, dynamic> j) => GradeEntry(
    id: j['id'],
    value: _asDouble(j['value']) ?? 0,
    coefficient: _asDouble(j['coefficient']) ?? 1,
    type: j['type'],
    comment: j['comment'],
    publishedAt: j['publishedAt']?.toString(),
  );
}

class SubjectGrades {
  final String  id;
  final String  name;
  final double  coefficient; // coefficient MATIÈRE (level_subjects), comme le web
  final double? average;
  final List<GradeEntry> grades;
  const SubjectGrades({
    required this.id, required this.name, required this.coefficient,
    this.average, required this.grades,
  });

  factory SubjectGrades.fromJson(Map<String, dynamic> j) => SubjectGrades(
    id:          j['subjectId'],
    name:        j['subjectName'],
    coefficient: _asDouble(j['coefficient']) ?? 1,
    average:     _asDouble(j['average']),
    grades:      (j['grades'] as List? ?? []).map((g) => GradeEntry.fromJson(g)).toList(),
  );
}

class TermGrades {
  final String id;
  final String name;
  final int    termOrder;
  final List<SubjectGrades> subjects;
  const TermGrades({required this.id, required this.name, required this.termOrder, required this.subjects});

  factory TermGrades.fromJson(Map<String, dynamic> j) => TermGrades(
    id:        j['id'],
    name:      j['name'],
    termOrder: (j['termOrder'] as num?)?.toInt() ?? 0,
    subjects:  (j['subjects'] as List? ?? []).map((s) => SubjectGrades.fromJson(s)).toList(),
  );

  /// Moyenne générale du trimestre pondérée par le coefficient matière —
  /// même calcul que la page web (termAvg dans notes/page.tsx).
  double? get generalAverage {
    double sumWAvg = 0, sumCoef = 0;
    for (final s in subjects) {
      if (s.average != null) {
        sumWAvg += s.average! * s.coefficient;
        sumCoef += s.coefficient;
      }
    }
    return sumCoef > 0 ? sumWAvg / sumCoef : null;
  }
}

class GradesState {
  final List<TermGrades> terms;
  const GradesState({this.terms = const []});
}

/// Paramétré par studentId (null = notes de l'utilisateur connecté ; non-null
/// = notes d'un enfant, vue parent — voir /api/mobile/grades côté backend).
final gradesProvider = FutureProvider.family<GradesState, String?>(
  (ref, studentId) async {
    ref.watch(refreshTickProvider);
    final params = studentId != null ? {'studentId': studentId} : null;
    final resp = await ApiClient().get(ApiConstants.grades, params: params);
    final data = resp.data as Map<String, dynamic>;
    return GradesState(
      terms: (data['terms'] as List? ?? []).map((t) => TermGrades.fromJson(t)).toList(),
    );
  },
);
