import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/providers/auth_provider.dart';
import '../grades/providers/grades_provider.dart';
import '../parent/screens/children_screen.dart';
import '../../core/providers/theme_provider.dart';
import '../../core/theme/app_theme.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth   = ref.watch(authProvider);
    final grades = ref.watch(gradesProvider(null));
    final user   = auth.user!;

    // Moyenne générale du dernier trimestre noté, pondérée par le coefficient
    // matière — même calcul que la page Notes (web et mobile).
    double? globalAvg;
    final terms = grades.value?.terms ?? const [];
    for (final term in terms.reversed) {
      final avg = term.generalAverage;
      if (avg != null) { globalAvg = avg; break; }
    }

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Bonjour, ${user.firstName} 👋',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            Text(user.schoolName, style: const TextStyle(fontSize: 11, color: AppTheme.textSub)),
          ],
        ),
        actions: [
          if (user.isParent)
            IconButton(
              icon: const Icon(Icons.hiking_rounded),
              tooltip: 'Sorties',
              onPressed: () => context.push('/trips'),
            ),
          IconButton(
            icon: Icon(ref.watch(themeModeProvider) == ThemeMode.dark
                ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
            tooltip: 'Changer de thème',
            onPressed: () => ref.read(themeModeProvider.notifier).toggle(),
          ),
          IconButton(
            icon: const Icon(Icons.logout_rounded),
            onPressed: () async => ref.read(authProvider.notifier).logout(),
          ),
        ],
      ),
      body: user.isParent ? const _ParentDashboardBody() : RefreshIndicator(
        onRefresh: () => ref.refresh(gradesProvider(null).future),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Carte moyenne générale
            _StatCard(
              label: 'Moyenne générale',
              value: globalAvg != null ? '${globalAvg.toStringAsFixed(2)}/20' : '—',
              icon:  Icons.bar_chart_rounded,
              color: globalAvg != null
                ? (globalAvg >= 14 ? AppTheme.success : globalAvg >= 10 ? AppTheme.primary : AppTheme.danger)
                : AppTheme.textSub,
              onTap: () => context.push('/grades'),
            ),
            const SizedBox(height: 20),

            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Text('Accès rapide',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
            ),

            GridView.count(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 1.3,
              children: [
                _QuickAction(icon: Icons.grade_rounded,          label: 'Notes',          color: AppTheme.primary,              onTap: () => context.push('/grades')),
                _QuickAction(icon: Icons.description_rounded,    label: 'Bulletins',      color: const Color(0xFF7C3AED),       onTap: () => context.push('/bulletins')),
                _QuickAction(icon: Icons.assignment_rounded,     label: 'Devoirs',        color: const Color(0xFF0D9488),       onTap: () => context.push('/assignments')),
                _QuickAction(icon: Icons.calendar_today_rounded, label: 'Emploi du temps',color: AppTheme.secondary,            onTap: () => context.push('/schedule')),
                _QuickAction(icon: Icons.campaign_rounded,       label: 'Annonces',       color: AppTheme.success,              onTap: () => context.push('/announcements')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Tableau de bord parent : bannière abonnement + cartes enfants, aligné
// sur /parent (web) ────────────────────────────────────────────────────────
class _ParentDashboardBody extends ConsumerWidget {
  const _ParentDashboardBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(childrenProvider);

    return RefreshIndicator(
      onRefresh: () => ref.refresh(childrenProvider.future),
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error:   (e, _) => Center(child: Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger))),
        data: (children) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              children.isEmpty
                ? 'Aucun enfant associé à votre compte.'
                : 'Vous suivez ${children.length} élève${children.length > 1 ? 's' : ''}.',
              style: const TextStyle(fontSize: 13, color: AppTheme.textSub),
            ),
            const SizedBox(height: 16),
            const SubscriptionBanner(),
            if (children.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 40),
                child: Center(
                  child: Text('Contactez l\'administration pour associer vos enfants à votre compte.',
                    style: TextStyle(color: AppTheme.textSub), textAlign: TextAlign.center),
                ),
              )
            else
              for (final c in children.cast<Map<String, dynamic>>()) ChildCard(child: c),
          ],
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  const _StatCard({required this.label, required this.value, required this.icon, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) => Card(
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, color: color, size: 24),
            ),
            const SizedBox(width: 14),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(fontSize: 12, color: AppTheme.textSub)),
                Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _QuickAction({required this.icon, required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) => Card(
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
              child: Icon(icon, color: color, size: 22),
            ),
            const SizedBox(height: 8),
            Text(label,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
              textAlign: TextAlign.center,
              maxLines: 2,
            ),
          ],
        ),
      ),
    ),
  );
}
