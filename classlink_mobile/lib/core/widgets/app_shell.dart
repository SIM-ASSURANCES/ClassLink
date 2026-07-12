import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Coquille de navigation permanente : la barre du bas (Accueil, Frais,
/// Cantine, Absences, Messages) vit dans ce Scaffold *unique*, partagé par
/// toutes les branches via [StatefulNavigationShell] — elle ne peut donc plus
/// disparaître au gré des écrans (voir router.dart pour les branches).
/// Chaque branche conserve sa propre pile de navigation et son état
/// (position de scroll, données chargées) quand on change d'onglet.
class AppShell extends StatelessWidget {
  final StatefulNavigationShell navigationShell;
  const AppShell({super.key, required this.navigationShell});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: (index) => navigationShell.goBranch(
          index,
          // Revenir à la racine de la branche si on retape l'onglet déjà actif.
          initialLocation: index == navigationShell.currentIndex,
        ),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_rounded),         label: 'Accueil'),
          NavigationDestination(icon: Icon(Icons.receipt_long_rounded), label: 'Frais'),
          NavigationDestination(icon: Icon(Icons.restaurant_rounded),   label: 'Cantine'),
          NavigationDestination(icon: Icon(Icons.check_circle_outline), label: 'Absences'),
          NavigationDestination(icon: Icon(Icons.mail_outline_rounded), label: 'Messages'),
        ],
      ),
    );
  }
}
