import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/theme/app_theme.dart';
import '../parent/widgets/parent_paywall_gate.dart';

// Couleurs de marque MyClassLink pour le PDF (#1800AD)
const _brandBlue      = PdfColor.fromInt(0xFF1800AD);
const _brandBlueLight = PdfColor.fromInt(0xFFEFEEFF);

// ─── Provider ────────────────────────────────────────────────────────────────

final bulletinDetailProvider = FutureProvider.family<Map<String, dynamic>, _BulletinArgs>(
  (ref, args) async {
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

class BulletinPdfScreen extends ConsumerWidget {
  final String  termId;
  final String? studentId;
  const BulletinPdfScreen({super.key, required this.termId, this.studentId});

  Future<pw.Document> _buildPdf(Map<String, dynamic> data) async {
    final doc      = pw.Document();
    final student  = data['student'] as Map<String, dynamic>?;
    final term     = data['term']    as Map<String, dynamic>?;
    final subjects = data['subjects'] as List<dynamic>? ?? [];
    final global   = data['globalAverage'];

    final name     = student != null
        ? '${student['first_name'] ?? ''} ${student['last_name'] ?? ''}'.trim()
        : 'Élève';
    final termName = term?['name'] as String? ?? 'Trimestre';
    final avg      = global != null ? double.tryParse(global.toString()) : null;

    PdfColor _pdfColor(double? a) {
      if (a == null) return PdfColors.grey;
      if (a >= 14)  return PdfColors.green700;
      if (a >= 10)  return _brandBlue;
      return PdfColors.red700;
    }

    doc.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(32),
      header: (ctx) => pw.Column(children: [
        pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Text('MyClassLink', style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold, color: _brandBlue)),
            pw.Text('Bulletin scolaire', style: const pw.TextStyle(fontSize: 11, color: PdfColors.grey700)),
          ]),
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
            pw.Text(name, style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold)),
            pw.Text(termName, style: const pw.TextStyle(fontSize: 11, color: PdfColors.grey700)),
          ]),
        ]),
        pw.Divider(color: _brandBlue, thickness: 1.5),
        pw.SizedBox(height: 4),
      ]),
      build: (ctx) => [
        // Tableau des notes
        pw.Table(
          border: pw.TableBorder.all(color: PdfColors.grey300, width: 0.5),
          columnWidths: {
            0: const pw.FlexColumnWidth(3),
            1: const pw.FlexColumnWidth(1),
            2: const pw.FlexColumnWidth(1),
          },
          children: [
            // En-tête
            pw.TableRow(
              decoration: const pw.BoxDecoration(color: _brandBlueLight),
              children: [
                pw.Padding(padding: const pw.EdgeInsets.all(6),
                  child: pw.Text('Matière', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
                pw.Padding(padding: const pw.EdgeInsets.all(6),
                  child: pw.Text('Notes', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
                pw.Padding(padding: const pw.EdgeInsets.all(6),
                  child: pw.Text('Moyenne', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
              ],
            ),
            // Lignes par matière
            ...subjects.map((s) {
              final sub = s as Map<String, dynamic>;
              final subAvg = sub['average'] != null ? double.tryParse(sub['average'].toString()) : null;
              final grades = sub['grades'] as List<dynamic>? ?? [];
              final gradesStr = grades.map((g) {
                final v = (g as Map)['value'];
                return v != null ? (double.tryParse(v.toString())?.toStringAsFixed(1) ?? '—') : '—';
              }).join(', ');

              return pw.TableRow(children: [
                pw.Padding(padding: const pw.EdgeInsets.all(6),
                  child: pw.Text(sub['name'] as String? ?? '', style: const pw.TextStyle(fontSize: 10))),
                pw.Padding(padding: const pw.EdgeInsets.all(6),
                  child: pw.Text(gradesStr, style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700))),
                pw.Padding(padding: const pw.EdgeInsets.all(6),
                  child: pw.Text(
                    subAvg != null ? '${subAvg.toStringAsFixed(2)}/20' : '—',
                    style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold, color: _pdfColor(subAvg)),
                  )),
              ]);
            }),
          ],
        ),
        pw.SizedBox(height: 16),
        // Moyenne générale
        pw.Container(
          padding: const pw.EdgeInsets.all(12),
          decoration: pw.BoxDecoration(
            color: _pdfColor(avg).shade(0.08),
            borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6)),
          ),
          child: pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
            pw.Text('Moyenne générale', style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold)),
            pw.Text(
              avg != null ? '${avg.toStringAsFixed(2)} / 20' : '—',
              style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold, color: _pdfColor(avg)),
            ),
          ]),
        ),
      ],
    ));

    return doc;
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
