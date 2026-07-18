import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_constants.dart';
import '../../../core/providers/refresh_provider.dart';

class GradeEntry {
  final String  id;
  final double  value;
  final double  coefficient;
  final String? comment;
  final String  gradedAt;
  const GradeEntry({required this.id, required this.value, required this.coefficient, this.comment, required this.gradedAt});

  factory GradeEntry.fromJson(Map<String, dynamic> j) => GradeEntry(
    id: j['id'], value: (j['value'] as num).toDouble(),
    coefficient: (j['coefficient'] as num).toDouble(),
    comment: j['comment'], gradedAt: j['gradedAt'],
  );
}

class SubjectGrades {
  final String        name;
  final String?       color;
  final List<GradeEntry> grades;
  final double?       average;
  const SubjectGrades({required this.name, this.color, required this.grades, this.average});

  factory SubjectGrades.fromJson(Map<String, dynamic> j) => SubjectGrades(
    name:    j['name'],
    color:   j['color'],
    average: j['average'] != null ? (j['average'] as num).toDouble() : null,
    grades:  (j['grades'] as List).map((g) => GradeEntry.fromJson(g)).toList(),
  );
}

class GradesState {
  final List<SubjectGrades> subjects;
  final List<dynamic>       terms;
  const GradesState({this.subjects = const [], this.terms = const []});
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
      subjects: (data['subjects'] as List).map((s) => SubjectGrades.fromJson(s)).toList(),
      terms:    data['terms'] as List,
    );
  },
);
