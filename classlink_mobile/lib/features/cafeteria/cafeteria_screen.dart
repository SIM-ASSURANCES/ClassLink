import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/theme/app_theme.dart';
import '../parent/widgets/parent_paywall_gate.dart';

// ─── Provider ────────────────────────────────────────────────────────────────

final cafeteriaProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final resp = await ApiClient().get(ApiConstants.cafeteria);
  return resp.data as Map<String, dynamic>;
});

// ─── Screen ──────────────────────────────────────────────────────────────────

const _dayNames = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const _mealLabels = {'BREAKFAST': 'Petit-déj', 'LUNCH': 'Déjeuner', 'SNACK': 'Goûter'};

class CafeteriaScreen extends ConsumerWidget {
  const CafeteriaScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(cafeteriaProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Cantine')),
      body: ParentPaywallGate(
        featureName: 'La cantine',
        featureKey: 'cafeteria',
        child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error:   (e, _) => Center(child: Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger))),
        data: (data) {
          final menus = data['menus'] as List<dynamic>;
          final sub   = data['subscription'] as Map<String, dynamic>?;

          // Grouper par jour
          final byDay = <int, List<Map<String, dynamic>>>{};
          for (final m in menus) {
            final menu = m as Map<String, dynamic>;
            final day  = menu['dayOfWeek'] as int;
            byDay.putIfAbsent(day, () => []).add(menu);
          }

          // Menu du jour (jour courant : 1 = lundi … 7 = dimanche)
          final today      = DateTime.now().weekday;
          final todayMenus = byDay[today] ?? const [];

          return RefreshIndicator(
            onRefresh: () => ref.refresh(cafeteriaProvider.future),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Statut abonnement
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: sub != null ? AppTheme.success.withValues(alpha: 0.1) : AppTheme.textSub.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: sub != null ? AppTheme.success.withValues(alpha: 0.3) : AppTheme.border),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        sub != null ? Icons.check_circle_rounded : Icons.cancel_outlined,
                        color: sub != null ? AppTheme.success : AppTheme.textSub,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: sub != null
                          ? Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Abonnement actif — ${sub['meal_type'] ?? ''}',
                                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.success)),
                                Text('Depuis le ${sub['start_date']?.toString().substring(0, 10) ?? ''}',
                                  style: TextStyle(fontSize: 11, color: AppTheme.textSub)),
                              ],
                            )
                          : const Text('Pas d\'abonnement cantine actif.',
                              style: TextStyle(fontSize: 13, color: AppTheme.textSub)),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 20),

                // ─── Menu du jour ───────────────────────────────────────────
                Row(
                  children: [
                    const Icon(Icons.today_rounded, size: 16, color: Color(0xFFEA580C)),
                    const SizedBox(width: 6),
                    Text(
                      'Menu du jour — ${today < _dayNames.length ? _dayNames[today] : ''}',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textMain),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                if (todayMenus.isEmpty)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEA580C).withValues(alpha: 0.04),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFEA580C).withValues(alpha: 0.15)),
                    ),
                    child: const Text('Aucun menu prévu aujourd\'hui.',
                      style: TextStyle(fontSize: 13, color: AppTheme.textSub)),
                  )
                else
                  ...todayMenus.map((m) => _MenuTile(menu: m, highlight: true)),

                const SizedBox(height: 24),
                const Text('Menu de la semaine',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
                const SizedBox(height: 12),

                if (byDay.isEmpty)
                  const Center(child: Text('Aucun menu cette semaine.', style: TextStyle(color: AppTheme.textSub)))
                else
                  ...(byDay.entries.toList()
                    ..sort((a, b) => a.key.compareTo(b.key)))
                    .map((entry) => _DaySection(day: entry.key, menus: entry.value)),
              ],
            ),
          );
        },
      ),
      ),
    );
  }
}

class _DaySection extends StatelessWidget {
  final int day;
  final List<Map<String, dynamic>> menus;
  const _DaySection({required this.day, required this.menus});

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(
          day < _dayNames.length ? _dayNames[day] : 'Jour $day',
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.textSub),
        ),
      ),
      ...menus.map((m) => _MenuTile(menu: m)),
      const SizedBox(height: 8),
    ],
  );
}

class _MenuTile extends StatelessWidget {
  final Map<String, dynamic> menu;
  final bool highlight;
  const _MenuTile({required this.menu, this.highlight = false});

  @override
  Widget build(BuildContext context) {
    const orange = Color(0xFFEA580C);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: highlight ? orange.withValues(alpha: 0.06) : Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: highlight ? orange.withValues(alpha: 0.35) : AppTheme.border,
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: orange.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              _mealLabels[menu['mealType']] ?? (menu['mealType'] as String? ?? ''),
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: orange),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(menu['description'] ?? '', style: const TextStyle(fontSize: 13))),
          if ((menu['price'] as num? ?? 0) > 0)
            Text(
              '${NumberFormat('#,###').format(menu['price'])} F',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.textSub),
            ),
        ],
      ),
    );
  }
}
