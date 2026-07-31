import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/providers/refresh_provider.dart';
import '../../core/theme/app_theme.dart';
import '../parent/widgets/parent_paywall_gate.dart';

// Couleurs de marque MyClassLink pour le PDF (#1800AD)
const _brandBlue      = PdfColor.fromInt(0xFF1800AD);
const _brandBlueLight = PdfColor.fromInt(0xFFEFEEFF);

// ─── Provider ────────────────────────────────────────────────────────────────

final bulletinDetailProvider = FutureProvider.family<Map<String, dynamic>, _BulletinArgs>(
  (ref, args) async {
    ref.watch(refreshTickProvider);
    final params = <String, String>{'termId': args.termId};
    if (args.studentId != null) params['studentId'] = args.studentId!;
    final resp = await ApiClient().get(ApiConstants.bulletins, params: params);
    return resp.data as Map<String, dynamic>;
  },
);

class _BulletinArgs {
  final String  termId;
  final String? studentId;
  const _BulletinArgs(this.termId, this.studentId);
  @override bool operator ==(Object o) => o is _BulletinArgs && o.termId == termId && o.studentId == studentId;
  @override int  get hashCode => Object.hash(termId, studentId);
}

// ─── Screen ──────────────────────────────────────────────────────────────────

double? _asDouble(dynamic v) =>
    v == null ? null : (v is num ? v.toDouble() : double.tryParse('$v'));

/// Appréciation à partir d'une moyenne — mêmes seuils que le bulletin web.
String _appreciation(double? avg) {
  if (avg == null) return '—';
  if (avg >= 16) return 'Très bien';
  if (avg >= 14) return 'Bien';
  if (avg >= 12) return 'Assez bien';
  if (avg >= 10) return 'Passable';
  return 'Insuffisant';
}

class BulletinPdfScreen extends ConsumerWidget {
  final String  termId;
  final String? studentId;
  const BulletinPdfScreen({super.key, required this.termId, this.studentId});

  Future<pw.Document> _buildPdf(Map<String, dynamic> data) async {
    final doc      = pw.Document();
    final student  = data['student'] as Map<String, dynamic>?;
    final term     = data['term']    as Map<String, dynamic>?;
    final school   = data['school']  as Map<String, dynamic>?;
    final subjects = data['subjects'] as List<dynamic>? ?? [];
    final council  = data['council'] as Map<String, dynamic>?;
    final att      = data['attendance'] as Map<String, dynamic>? ?? const {};

    final avg      = _asDouble(data['generalAverage']);
    final classAvg = _asDouble(data['classAverage']);
    final rank     = (data['rank'] as num?)?.toInt();

    final lastName  = (student?['lastName'] as String? ?? '').toUpperCase();
    final firstName = student?['firstName'] as String? ?? '';
    final termName  = term?['name'] as String? ?? 'Trimestre';

    PdfColor pdfColor(double? a) {
      if (a == null) return PdfColors.grey;
      if (a >= 10)  return PdfColors.green700;
      return PdfColors.red700;
    }

    pw.Widget infoLine(String label, String value) => pw.Padding(
      padding: const pw.EdgeInsets.only(bottom: 3),
      child: pw.Row(children: [
        pw.SizedBox(width: 80, child: pw.Text(label, style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700))),
        pw.Text(value, style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold)),
      ]),
    );

    doc.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(32),
      build: (ctx) => [
        // En-tête école — comme le bulletin web
        pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.Text((school?['schoolName'] as String? ?? 'Établissement').toUpperCase(),
            style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold)),
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
            pw.Text('BULLETIN DE NOTES', style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold)),
            pw.Text('$termName — ${student?['yearName'] ?? ''}',
              style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey700)),
          ]),
        ]),
        pw.Divider(color: PdfColors.grey800, thickness: 1.5),
        pw.SizedBox(height: 8),

        // Informations élève (nom, n°, né(e) le / classe, rang, moy. classe)
        pw.Container(
          padding: const pw.EdgeInsets.all(10),
          decoration: pw.BoxDecoration(
            color: PdfColors.grey100,
            borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6)),
            border: pw.Border.all(color: PdfColors.grey300, width: 0.5),
          ),
          child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Expanded(child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
              infoLine('Nom & Prénom', '$lastName $firstName'),
              infoLine('N° Élève', student?['studentNumber'] as String? ?? '—'),
              if (student?['dateOfBirth'] != null)
                infoLine('Né(e) le', _shortDate(student!['dateOfBirth'].toString())),
            ])),
            pw.Expanded(child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
              infoLine('Classe', student?['className'] as String? ?? '—'),
              if (rank != null) infoLine('Rang', '$rank${rank == 1 ? 'er' : 'ème'}'),
              if (classAvg != null) infoLine('Moy. classe', '${classAvg.toStringAsFixed(2)} / 20'),
            ])),
          ]),
        ),
        pw.SizedBox(height: 12),

        // Tableau des matières — Matière / Coeff. / Moy. / Appréciation (web)
        if (subjects.isEmpty)
          pw.Padding(
            padding: const pw.EdgeInsets.symmetric(vertical: 24),
            child: pw.Center(child: pw.Text('Aucune note enregistrée pour ce trimestre.',
              style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey600))),
          )
        else
          pw.Table(
            border: pw.TableBorder.all(color: PdfColors.grey300, width: 0.5),
            columnWidths: {
              0: const pw.FlexColumnWidth(3),
              1: const pw.FlexColumnWidth(1),
              2: const pw.FlexColumnWidth(1.2),
              3: const pw.FlexColumnWidth(1.8),
            },
            children: [
              pw.TableRow(
                decoration: const pw.BoxDecoration(color: _brandBlueLight),
                children: ['Matière', 'Coeff.', 'Moy. / 20', 'Appréciation'].map((h) =>
                  pw.Padding(padding: const pw.EdgeInsets.all(6),
                    child: pw.Text(h, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9))),
                ).toList(),
              ),
              ...subjects.map((s) {
                final sub    = s as Map<String, dynamic>;
                final subAvg = _asDouble(sub['average']);
                final coef   = _asDouble(sub['coefficient']) ?? 1;
                return pw.TableRow(children: [
                  pw.Padding(padding: const pw.EdgeInsets.all(6),
                    child: pw.Text(sub['name'] as String? ?? '', style: const pw.TextStyle(fontSize: 9))),
                  pw.Padding(padding: const pw.EdgeInsets.all(6),
                    child: pw.Text(coef.toStringAsFixed(coef == coef.roundToDouble() ? 0 : 1),
                      style: const pw.TextStyle(fontSize: 9))),
                  pw.Padding(padding: const pw.EdgeInsets.all(6),
                    child: pw.Text(subAvg != null ? subAvg.toStringAsFixed(2) : '—',
                      style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: pdfColor(subAvg)))),
                  pw.Padding(padding: const pw.EdgeInsets.all(6),
                    child: pw.Text(_appreciation(subAvg),
                      style: pw.TextStyle(fontSize: 8, fontStyle: pw.FontStyle.italic, color: PdfColors.grey600))),
                ]);
              }),
              // Pied : moyenne générale + appréciation — comme le web
              pw.TableRow(
                decoration: const pw.BoxDecoration(color: PdfColors.grey200),
                children: [
                  pw.Padding(padding: const pw.EdgeInsets.all(6),
                    child: pw.Text('Moyenne générale', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9))),
                  pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('')),
                  pw.Padding(padding: const pw.EdgeInsets.all(6),
                    child: pw.Text(avg != null ? avg.toStringAsFixed(2) : '—',
                      style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: pdfColor(avg)))),
                  pw.Padding(padding: const pw.EdgeInsets.all(6),
                    child: pw.Text(_appreciation(avg),
                      style: pw.TextStyle(fontSize: 9, fontStyle: pw.FontStyle.italic,
                        fontWeight: pw.FontWeight.bold, color: pdfColor(avg)))),
                ],
              ),
            ],
          ),
        pw.SizedBox(height: 14),

        // Présences + signatures — comme le web
        pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.Expanded(child: pw.Container(
            padding: const pw.EdgeInsets.all(8),
            decoration: pw.BoxDecoration(
              border: pw.Border.all(color: PdfColors.grey300, width: 0.5),
              borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6)),
            ),
            child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
              pw.Text('PRÉSENCES — $termName',
                style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold, color: PdfColors.grey600)),
              pw.SizedBox(height: 5),
              pw.Text('Absences : ${att['absent'] ?? 0}', style: const pw.TextStyle(fontSize: 9)),
              pw.Text('Retards : ${att['late'] ?? 0}', style: const pw.TextStyle(fontSize: 9)),
              pw.Text('Non justifiées : ${att['unjustified'] ?? 0}', style: const pw.TextStyle(fontSize: 9)),
            ]),
          )),
          pw.SizedBox(width: 10),
          pw.Expanded(child: pw.Container(
            padding: const pw.EdgeInsets.all(8),
            decoration: pw.BoxDecoration(
              border: pw.Border.all(color: PdfColors.grey300, width: 0.5),
              borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6)),
            ),
            child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
              pw.Text('SIGNATURES',
                style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold, color: PdfColors.grey600)),
              pw.SizedBox(height: 18),
              pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
                pw.Column(children: [
                  pw.Container(width: 70, height: 0.5, color: PdfColors.grey400),
                  pw.SizedBox(height: 2),
                  pw.Text('Le directeur', style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600)),
                ]),
                pw.Column(children: [
                  pw.Container(width: 70, height: 0.5, color: PdfColors.grey400),
                  pw.SizedBox(height: 2),
                  pw.Text('Parent / Tuteur', style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600)),
                ]),
              ]),
            ]),
          )),
        ]),

        // Décision du conseil de classe — comme le web
        if (council != null) ...[
          pw.SizedBox(height: 12),
          pw.Container(
            padding: const pw.EdgeInsets.all(10),
            decoration: pw.BoxDecoration(
              color: _brandBlueLight,
              borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6)),
              border: pw.Border.all(color: PdfColors.grey300, width: 0.5),
            ),
            child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
              pw.Text('DÉCISION DU CONSEIL DE CLASSE',
                style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold, color: PdfColors.grey600)),
              pw.SizedBox(height: 5),
              if (council['decision'] != null)
                pw.Text('Décision : ${council['decision']}',
                  style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold, color: _brandBlue)),
              if (council['appreciation'] != null)
                pw.Text('"${council['appreciation']}"',
                  style: pw.TextStyle(fontSize: 9, fontStyle: pw.FontStyle.italic)),
              if (council['councilComment'] != null)
                pw.Text('${council['councilComment']}',
                  style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
            ]),
          ),
        ],

        pw.SizedBox(height: 14),
        pw.Divider(color: PdfColors.grey300, thickness: 0.5),
        pw.Center(child: pw.Text(
          'Bulletin généré par MyClassLink · ${_shortDate(DateTime.now().toIso8601String())}',
          style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey500))),
      ],
    ));

    return doc;
  }

  static String _shortDate(String iso) {
    try {
      final d = DateTime.parse(iso);
      return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
    } catch (_) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final args  = _BulletinArgs(termId, studentId);
    final async = ref.watch(bulletinDetailProvider(args));

    return Scaffold(
      appBar: AppBar(title: const Text('Bulletin PDF')),
      body: ParentPaywallGate(
        featureName: 'Le bulletin de notes',
        featureKey: 'bulletins',
        child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error:   (e, _) => Center(child: Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger))),
        data: (data) => PdfPreview(
          allowPrinting: true,
          allowSharing:  true,
          canDebug:      false,
          build: (format) async {
            final doc = await _buildPdf(data);
            return doc.save();
          },
        ),
      ),
      ),
    );
  }
}
