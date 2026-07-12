import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/theme/app_theme.dart';
import '../parent/widgets/parent_paywall_gate.dart';

// ─── Provider ────────────────────────────────────────────────────────────────

final messagesProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final resp = await ApiClient().get(ApiConstants.messages);
  return resp.data as Map<String, dynamic>;
});

// ─── Screen ──────────────────────────────────────────────────────────────────

class MessagesScreen extends ConsumerWidget {
  const MessagesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(messagesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Messages')),
      body: ParentPaywallGate(
        featureName: 'La messagerie',
        featureKey: 'messages',
        child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error:   (e, _) => Center(child: Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger))),
        data: (data) {
          final received = data['received'] as List<dynamic>;
          if (received.isEmpty) {
            return const Center(child: Text('Aucun message reçu.', style: TextStyle(color: AppTheme.textSub)));
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(messagesProvider.future),
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: received.length,
              itemBuilder: (ctx, i) {
                final msg    = received[i] as Map<String, dynamic>;
                final isRead = msg['isRead'] as bool? ?? true;
                DateTime? date;
                try { date = DateTime.parse(msg['createdAt'].toString()); } catch (_) {}
                final sender = msg['senderName'] as String? ?? '?';

                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  decoration: BoxDecoration(
                    color: isRead ? Colors.white : AppTheme.primary.withValues(alpha: 0.04),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: isRead ? AppTheme.border : AppTheme.primary.withValues(alpha: 0.3)),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            CircleAvatar(
                              radius: 16,
                              backgroundColor: AppTheme.primary.withValues(alpha: 0.12),
                              child: Text(
                                sender.isNotEmpty ? sender[0].toUpperCase() : '?',
                                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.primary),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(sender,
                                style: TextStyle(
                                  fontSize: 13, fontWeight: isRead ? FontWeight.w500 : FontWeight.w700,
                                  color: AppTheme.textMain,
                                )),
                            ),
                            if (!isRead)
                              Container(width: 8, height: 8,
                                decoration: const BoxDecoration(color: AppTheme.primary, shape: BoxShape.circle)),
                            const SizedBox(width: 6),
                            if (date != null)
                              Text(DateFormat('dd/MM HH:mm').format(date),
                                style: TextStyle(fontSize: 10, color: AppTheme.textSub)),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(msg['content'] as String? ?? '',
                          style: TextStyle(fontSize: 13, color: AppTheme.textMain, height: 1.5),
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
      ),
    );
  }
}
