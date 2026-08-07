import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/connectivity_state.dart';
import '../theme/app_theme.dart';

/// Bandeau global affiché sur tous les écrans quand les données visibles
/// proviennent du cache local (dernière connexion réussie) plutôt que du
/// réseau — voir ApiClient.get() / OfflineCache.
class OfflineBanner extends StatelessWidget {
  final Widget child;
  const OfflineBanner({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<DateTime?>(
      valueListenable: offlineSince,
      builder: (context, since, _) {
        if (since == null) return child;
        return Column(
          children: [
            Material(
              color: AppTheme.warning,
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  child: Row(
                    children: [
                      const Icon(Icons.cloud_off_rounded, size: 15, color: Colors.white),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Hors ligne — données du ${DateFormat('dd/MM à HH:mm').format(since)}',
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Expanded(child: child),
          ],
        );
      },
    );
  }
}
