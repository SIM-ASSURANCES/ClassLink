import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Évolution de la moyenne générale par trimestre — série unique (pas de
/// légende, le titre du bloc suffit). Même palette et logique que la version
/// web (components/charts/grade-trend-chart.tsx).
class GradeTrendChart extends StatelessWidget {
  final List<({String name, double? average})> terms;
  const GradeTrendChart({super.key, required this.terms});

  @override
  Widget build(BuildContext context) {
    final hasData = terms.any((t) => t.average != null);
    if (!hasData) {
      return const SizedBox(
        height: 120,
        child: Center(
          child: Text('Pas encore assez de notes pour afficher une tendance.',
            style: TextStyle(fontSize: 13, color: AppTheme.textSub)),
        ),
      );
    }

    final spots = <FlSpot>[];
    for (var i = 0; i < terms.length; i++) {
      final avg = terms[i].average;
      if (avg != null) spots.add(FlSpot(i.toDouble(), avg));
    }
    final last = terms.lastWhere((t) => t.average != null);

    return SizedBox(
      height: 170,
      child: Column(
        children: [
          Expanded(
            child: LineChart(
              LineChartData(
                minY: 0,
                maxY: 20,
                gridData: FlGridData(
                  drawVerticalLine: false,
                  horizontalInterval: 10,
                  getDrawingHorizontalLine: (_) => FlLine(color: AppTheme.border, strokeWidth: 1),
                ),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true, interval: 10, reservedSize: 28,
                      getTitlesWidget: (v, meta) => Text('${v.toInt()}',
                        style: const TextStyle(fontSize: 10, color: AppTheme.textSub)),
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
                lineTouchData: LineTouchData(
                  touchTooltipData: LineTouchTooltipData(
                    getTooltipColor: (_) => AppTheme.textMain,
                    getTooltipItems: (spots) => spots.map((s) => LineTooltipItem(
                      '${terms[s.x.toInt()].name}\n${s.y.toStringAsFixed(2)} / 20',
                      const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
                    )).toList(),
                  ),
                ),
                lineBarsData: [
                  LineChartBarData(
                    spots: spots,
                    isCurved: true,
                    color: AppTheme.primary,
                    barWidth: 2,
                    dotData: FlDotData(
                      getDotPainter: (spot, percent, bar, index) =>
                        FlDotCirclePainter(radius: 4, color: AppTheme.primary, strokeWidth: 2, strokeColor: AppTheme.surface),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text.rich(
              TextSpan(
                style: const TextStyle(fontSize: 11, color: AppTheme.textSub),
                children: [
                  const TextSpan(text: 'Dernière moyenne connue : '),
                  TextSpan(
                    text: '${last.average!.toStringAsFixed(2)} / 20',
                    style: const TextStyle(fontWeight: FontWeight.w700, color: AppTheme.primary),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
