import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/providers/refresh_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/subscribe_button.dart';
import '../parent/widgets/parent_paywall_gate.dart';

// ─── Provider ────────────────────────────────────────────────────────────────

final cafeteriaProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  ref.watch(refreshTickProvider);
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
          final menus    = data['menus'] as List<dynamic>;
          final sub      = data['subscription'] as Map<String, dynamic>?;
          // Vue parent : un statut d'abonnement par enfant, comme le web.
          final children = data['children'] as List<dynamic>?;
          final prices   = (data['prices'] as Map<String, dynamic>?) ?? const {};

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
                // Statut abonnement — parent : un bandeau par enfant (comme le
                // web) ; élève : son propre bandeau.
                if (children != null)
                  ...children.map((c) => _ChildSubscriptionCard(
                    child: c as Map<String, dynamic>,
                    prices: prices,
                    onSubscribed: () => ref.invalidate(cafeteriaProvider),
                  ))
                else
                  _SubscriptionBanner(sub: sub),

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

/// Bandeau d'abonnement d'un élève connecté (comportement historique).
class _SubscriptionBanner extends StatelessWidget {
  final Map<String, dynamic>? sub;
  const _SubscriptionBanner({required this.sub});

  @override
  Widget build(BuildContext context) {
    final active = sub != null;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: active ? AppTheme.success.withValues(alpha: 0.1) : AppTheme.textSub.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: active ? AppTheme.success.withValues(alpha: 0.3) : AppTheme.border),
      ),
      child: Row(
        children: [
          Icon(
            active ? Icons.check_circle_rounded : Icons.cancel_outlined,
            color: active ? AppTheme.success : AppTheme.textSub,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: active
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Abonnement actif — ${_mealLabels[sub!['meal_type']] ?? sub!['meal_type'] ?? ''}',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.success)),
                    Text('Depuis le ${sub!['start_date']?.toString().substring(0, 10) ?? ''}',
                      style: TextStyle(fontSize: 11, color: AppTheme.textSub)),
                  ],
                )
              : const Text('Pas d\'abonnement cantine actif.',
                  style: TextStyle(fontSize: 13, color: AppTheme.textSub)),
          ),
        ],
      ),
    );
  }
}

/// Carte de statut cantine d'un enfant (vue parent) — reflète la page web :
/// nom, classe, badge de statut, et détail type/depuis/montant si abonné.
class _ChildSubscriptionCard extends StatefulWidget {
  final Map<String, dynamic> child;
  final Map<String, dynamic> prices;
  final VoidCallback onSubscribed;
  const _ChildSubscriptionCard({required this.child, required this.prices, required this.onSubscribed});

  @override
  State<_ChildSubscriptionCard> createState() => _ChildSubscriptionCardState();
}

class _ChildSubscriptionCardState extends State<_ChildSubscriptionCard> {
  String? _mealType;

  @override
  Widget build(BuildContext context) {
    final child     = widget.child;
    final prices    = widget.prices;
    final sub       = child['subscription'] as Map<String, dynamic>?;
    final active    = sub != null && sub['status'] == 'ACTIVE';
    final pending   = sub != null && sub['status'] == 'PENDING_PAYMENT';
    final firstName = child['firstName'] as String? ?? '';
    final lastName  = child['lastName'] as String? ?? '';
    final amount    = sub?['amount'];
    final available = prices.entries.where((e) => e.value != null).toList();
    _mealType ??= available.isNotEmpty ? available.first.key : null;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 16,
                backgroundColor: AppTheme.primary.withValues(alpha: 0.12),
                child: Text(
                  '${firstName.isNotEmpty ? firstName[0] : ''}${lastName.isNotEmpty ? lastName[0] : ''}'.toUpperCase(),
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.primary),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('$firstName $lastName',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
                    if (child['className'] != null)
                      Text(child['className'] as String,
                        style: TextStyle(fontSize: 11, color: AppTheme.textSub)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: (active ? AppTheme.success : pending ? AppTheme.primary : AppTheme.textSub).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  active ? 'Actif' : pending ? 'Paiement en attente' : 'Non abonné',
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                    color: active ? AppTheme.success : pending ? AppTheme.primary : AppTheme.textSub),
                ),
              ),
            ],
          ),
          if (active) ...[
            const SizedBox(height: 8),
            Text(
              'Type : ${_mealLabels[sub['meal_type']] ?? sub['meal_type'] ?? ''}'
              ' · Depuis le ${sub['start_date']?.toString().substring(0, 10) ?? ''}'
              '${amount != null && (amount as num) > 0 ? ' · ${NumberFormat('#,###').format(amount)} F' : ''}',
              style: TextStyle(fontSize: 11, color: AppTheme.textSub),
            ),
          ] else if (pending) ...[
            const SizedBox(height: 8),
            const Text('Paiement en cours de traitement — actualisez dans quelques instants.',
              style: TextStyle(fontSize: 11, color: AppTheme.textSub)),
          ] else if (available.isNotEmpty) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _mealType,
                    isDense: true,
                    decoration: const InputDecoration(
                      isDense: true,
                      contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      border: OutlineInputBorder(),
                    ),
                    items: available.map((e) => DropdownMenuItem(
                      value: e.key,
                      child: Text('${_mealLabels[e.key] ?? e.key} — ${NumberFormat('#,###').format(e.value)} F',
                        style: const TextStyle(fontSize: 11)),
                    )).toList(),
                    onChanged: (v) => setState(() => _mealType = v),
                  ),
                ),
                const SizedBox(width: 8),
                SubscribeButton(
                  endpoint: ApiConstants.cafeteria,
                  body: {'studentId': child['studentId'], 'mealType': _mealType},
                  label: "S'abonner",
                  onLaunched: widget.onSubscribed,
                ),
              ],
            ),
          ] else ...[
            const SizedBox(height: 8),
            Text('$firstName n\'est pas abonné(e) à la cantine. Contactez l\'administration pour souscrire.',
              style: TextStyle(fontSize: 11, color: AppTheme.textSub)),
          ],
        ],
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
