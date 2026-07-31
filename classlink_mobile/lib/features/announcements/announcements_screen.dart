import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/providers/refresh_provider.dart';
import '../../core/theme/app_theme.dart';

// ─── Provider ────────────────────────────────────────────────────────────────

final announcementsProvider = FutureProvider<List<dynamic>>((ref) async {
  ref.watch(refreshTickProvider);
  final resp = await ApiClient().get(ApiConstants.announcements);
  return resp.data['announcements'] as List<dynamic>;
});

// ─── Screen ──────────────────────────────────────────────────────────────────

class AnnouncementsScreen extends ConsumerWidget {
  const AnnouncementsScreen({super.key});

  Color _typeColor(String? type) {
    switch (type) {
      case 'URGENT':  return AppTheme.danger;
      case 'EVENT':   return AppTheme.secondary;
      case 'INFO':    return AppTheme.primary;
      default:        return AppTheme.textSub;
    }
  }

  IconData _typeIcon(String? type) {
    switch (type) {
      case 'URGENT':  return Icons.warning_rounded;
      case 'EVENT':   return Icons.event_rounded;
      default:        return Icons.campaign_rounded;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(announcementsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Annonces')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error:   (e, _) => Center(child: Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger))),
        data: (list) {
          if (list.isEmpty) {
            return const Center(child: Text('Aucune annonce.', style: TextStyle(color: AppTheme.textSub)));
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(announcementsProvider.future),
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: list.length,
              itemBuilder: (ctx, i) {
                final a     = list[i] as Map<String, dynamic>;
                final type  = a['type']  as String?;
                final color = _typeColor(type);
                DateTime? date;
                try { date = DateTime.parse(a['createdAt'].toString()); } catch (_) {}

                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
                              child: Icon(_typeIcon(type), color: color, size: 16),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(a['title'] ?? '',
                                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                            ),
                            // Badge épinglé — comme le web.
                            if (a['isPinned'] == true) ...[
                              const Icon(Icons.push_pin_rounded, size: 14, color: AppTheme.warning),
                              const SizedBox(width: 4),
                            ],
                            if (date != null)
                              Text(DateFormat('dd/MM').format(date),
                                style: TextStyle(fontSize: 11, color: AppTheme.textSub)),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(a['content'] ?? '',
                          style: TextStyle(fontSize: 13, color: AppTheme.textMain, height: 1.5)),
                        const SizedBox(height: 6),
                        Text('Par ${a['authorName'] ?? 'Administration'}',
                          style: TextStyle(fontSize: 11, color: AppTheme.textSub)),
                      ],
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
