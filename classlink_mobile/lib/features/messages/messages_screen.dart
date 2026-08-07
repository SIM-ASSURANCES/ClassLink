import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/providers/refresh_provider.dart';
import '../../core/theme/app_theme.dart';
import '../parent/widgets/parent_paywall_gate.dart';

// ─── Provider ────────────────────────────────────────────────────────────────

final messagesProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  ref.watch(refreshTickProvider);
  final resp = await ApiClient().get(ApiConstants.messages);
  return resp.data as Map<String, dynamic>;
});

// ─── Screen ──────────────────────────────────────────────────────────────────

/// Accusé de lecture façon messagerie mobile : un ✓ gris (envoyé), deux ✓✓
/// bleus (lu) — même symbole que sur le web (components/messages/read-receipt.tsx).
class _ReadReceipt extends StatelessWidget {
  final bool read;
  const _ReadReceipt({required this.read});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: const Size(16, 10),
      painter: _ReadReceiptPainter(read: read),
    );
  }
}

class _ReadReceiptPainter extends CustomPainter {
  final bool read;
  const _ReadReceiptPainter({required this.read});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = read ? AppTheme.primary : AppTheme.textSub.withValues(alpha: 0.5)
      ..strokeWidth = 1.6
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    void drawCheck(double dx) {
      final path = Path()
        ..moveTo(dx + 0.5, size.height * 0.5)
        ..lineTo(dx + 3, size.height * 0.85)
        ..lineTo(dx + 8, size.height * 0.1);
      canvas.drawPath(path, paint);
    }

    drawCheck(0);
    if (read) drawCheck(6);
  }

  @override
  bool shouldRepaint(covariant _ReadReceiptPainter old) => old.read != read;
}

class MessagesScreen extends ConsumerStatefulWidget {
  const MessagesScreen({super.key});

  @override
  ConsumerState<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends ConsumerState<MessagesScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(messagesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Messages'),
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppTheme.primary,
          unselectedLabelColor: AppTheme.textSub,
          indicatorColor: AppTheme.primary,
          tabs: const [
            Tab(text: 'Reçus'),
            Tab(text: 'Envoyés'),
          ],
        ),
      ),
      body: ParentPaywallGate(
        featureName: 'La messagerie',
        featureKey: 'messages',
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error:   (e, _) => Center(child: Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger))),
          data: (data) {
            final received = data['received'] as List<dynamic>;
            final sent     = data['sent'] as List<dynamic>? ?? const [];
            return TabBarView(
              controller: _tabController,
              children: [
                _MessageList(
                  messages: received,
                  emptyText: 'Aucun message reçu.',
                  onRefresh: () => ref.refresh(messagesProvider.future),
                  nameKey: 'senderName',
                  showUnreadDot: true,
                ),
                _MessageList(
                  messages: sent,
                  emptyText: 'Aucun message envoyé.',
                  onRefresh: () => ref.refresh(messagesProvider.future),
                  nameKey: 'recipientName',
                  showReadReceipt: true,
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _MessageList extends StatelessWidget {
  final List<dynamic> messages;
  final String emptyText;
  final Future<void> Function() onRefresh;
  final String nameKey;
  final bool showUnreadDot;
  final bool showReadReceipt;
  const _MessageList({
    required this.messages, required this.emptyText, required this.onRefresh,
    required this.nameKey, this.showUnreadDot = false, this.showReadReceipt = false,
  });

  @override
  Widget build(BuildContext context) {
    if (messages.isEmpty) {
      return Center(child: Text(emptyText, style: const TextStyle(color: AppTheme.textSub)));
    }
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: messages.length,
        itemBuilder: (ctx, i) {
          final msg    = messages[i] as Map<String, dynamic>;
          final isRead = msg['isRead'] as bool? ?? true;
          DateTime? date;
          try { date = DateTime.parse(msg['createdAt'].toString()); } catch (_) {}
          final name = msg[nameKey] as String? ?? '?';

          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            decoration: BoxDecoration(
              color: showUnreadDot && !isRead ? AppTheme.primary.withValues(alpha: 0.04) : Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: showUnreadDot && !isRead ? AppTheme.primary.withValues(alpha: 0.3) : AppTheme.border,
              ),
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
                          name.isNotEmpty ? name[0].toUpperCase() : '?',
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.primary),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(name,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: showUnreadDot && !isRead ? FontWeight.w700 : FontWeight.w500,
                            color: AppTheme.textMain,
                          )),
                      ),
                      if (showUnreadDot && !isRead)
                        Container(width: 8, height: 8,
                          decoration: const BoxDecoration(color: AppTheme.primary, shape: BoxShape.circle)),
                      if (showReadReceipt) ...[
                        _ReadReceipt(read: isRead),
                        const SizedBox(width: 4),
                      ],
                      const SizedBox(width: 4),
                      if (date != null)
                        Text(DateFormat('dd/MM HH:mm').format(date),
                          style: const TextStyle(fontSize: 10, color: AppTheme.textSub)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  // Sujet du message — affiché en gras comme sur le web.
                  if ((msg['subject'] as String?)?.isNotEmpty ?? false) ...[
                    Text(msg['subject'] as String,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: showUnreadDot && !isRead ? FontWeight.w800 : FontWeight.w600,
                        color: AppTheme.textMain),
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                  ],
                  Text(msg['content'] as String? ?? '',
                    style: const TextStyle(fontSize: 13, color: AppTheme.textMain, height: 1.5),
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
  }
}
