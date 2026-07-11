import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/providers/auth_provider.dart';

/// Onglets disponibles dans la barre de navigation basse.
enum AppTab { payments, cafeteria, trips, attendance, messages }

/// Barre de navigation persistante en bas de l'écran, partagée par les
/// écrans élève et parent pour les fonctionnalités du quotidien : frais
/// scolaires, cantine, sorties (parent uniquement — autorisation de sortie
/// non applicable à l'élève, voir /api/mobile/parent/trips côté backend),
/// absences et messages.
class AppBottomNav extends ConsumerWidget {
  final AppTab current;
  const AppBottomNav({super.key, required this.current});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isParent = ref.watch(authProvider).user?.isParent ?? false;

    final tabs = <_NavTab>[
      const _NavTab(AppTab.payments,   Icons.receipt_long_rounded, 'Frais',    '/payments'),
      const _NavTab(AppTab.cafeteria,  Icons.restaurant_rounded,   'Cantine',  '/cafeteria'),
      if (isParent)
        const _NavTab(AppTab.trips,    Icons.hiking_rounded,       'Sorties',  '/trips'),
      const _NavTab(AppTab.attendance, Icons.check_circle_outline, 'Absences', '/attendance'),
      const _NavTab(AppTab.messages,   Icons.mail_outline_rounded, 'Messages', '/messages'),
    ];

    final index = tabs.indexWhere((t) => t.tab == current);

    return NavigationBar(
      selectedIndex: index < 0 ? 0 : index,
      onDestinationSelected: (i) {
        final tab = tabs[i];
        if (tab.tab != current) context.go(tab.path);
      },
      destinations: [
        for (final t in tabs) NavigationDestination(icon: Icon(t.icon), label: t.label),
      ],
    );
  }
}

class _NavTab {
  final AppTab tab;
  final IconData icon;
  final String label;
  final String path;
  const _NavTab(this.tab, this.icon, this.label, this.path);
}
