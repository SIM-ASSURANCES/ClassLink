import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

// Palette de statut fixe (present = bon, retard = alerte, absence = critique) —
// identique à la version web (components/charts/attendance-trend-chart.tsx).
const _kPresent = Color(0xFF0CA30C);
const _kLate    = Color(0xFFFAB219);
const _kAbsent  = Color(0xFFD03B3B);

/// Présences/retards/absences par trimestre — 3 séries de statut, légende
/// toujours visible (jamais la couleur seule qui porte le sens).
class AttendanceTrendChart extends StatelessWidget {
  final List<({String name, int present, int late, int absent})> terms;
  const AttendanceTrendChart({super.key, required this.terms});

  @override
  Widget build(BuildContext context) {
    final hasData = terms.any((t) => t.present + t.late + t.absent > 0);
    if (!hasData) {
      return const SizedBox(
        height: 120,
        child: Center(
          child: Text('Aucune donnée de présence pour l\'instant.',
            style: TextStyle(fontSize: 13, color: AppTheme.textSub)),
        ),
      );
    }

    final maxVal = terms
        .expand((t) => [t.present, t.late, t.absent])
        .fold<int>(1, (m, v) => v > m ? v : m);

    return SizedBox(
      height: 190,
      child: Column(
        children: [
          Expanded(
            child: BarChart(
              BarChartData(
                maxY: (maxVal * 1.2).ceilToDouble(),
                gridData: FlGridData(
                  drawVerticalLine: false,
                  getDrawingHorizontalLine: (_) => FlLine(color: AppTheme.border, strokeWidth: 1),
                ),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true, reservedSize: 24,
                      getTitlesWidget: (v, meta) => v == v.roundToDouble()
                        ? Text('${v.toInt()}', style: const TextStyle(fontSize: 10, color: AppTheme.textSub))
                        : const SizedBox.shrink(),
                    ),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true, reservedSize: 22,
                      getTitlesWidget: (v, meta) {
                        final i = v.toInt();
                        if (i < 0 || i >= terms.length) return const SizedBox.shrink();
                        return Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(terms[i].name,
                            style: const TextStyle(fontSize: 10, color: AppTheme.textSub)),
                        );
                      },
                    ),
                  ),
                ),
                barTouchData: BarTouchData(
                  touchTooltipData: BarTouchTooltipData(
                    getTooltipColor: (_) => AppTheme.textMain,
                    getTooltipItem: (group, groupIndex, rod, rodIndex) {
                      const labels = ['Présences', 'Retards', 'Absences'];
                      return BarTooltipItem(
                        '${terms[groupIndex].name}\n${labels[rodIndex]} : ${rod.toY.toInt()}',
                        const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
                      );
                    },
                  ),
                ),
                barGroups: [
                  for (var i = 0; i < terms.length; i++)
                    BarChartGroupData(x: i, barsSpace: 3, barRods: [
                      BarChartRodData(toY: terms[i].present.toDouble(), color: _kPresent, width: 10, borderRadius: BorderRadius.circular(3)),
                      BarChartRodData(toY: terms[i].late.toDouble(), color: _kLate, width: 10, borderRadius: BorderRadius.circular(3)),
                      BarChartRodData(toY: terms[i].absent.toDouble(), color: _kAbsent, width: 10, borderRadius: BorderRadius.circular(3)),
                    ]),
                ],
              ),
            ),
          ),
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _LegendDot(color: _kPresent, label: 'Présences'),
                SizedBox(width: 14),
                _LegendDot(color: _kLate, label: 'Retards'),
                SizedBox(width: 14),
                _LegendDot(color: _kAbsent, label: 'Absences'),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LegendDot extends StatelessWidget {
  final Color color;
  final String label;
  const _LegendDot({required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 5),
        Text(label, style: const TextStyle(fontSize: 11, color: AppTheme.textSub)),
      ],
    );
  }
}
