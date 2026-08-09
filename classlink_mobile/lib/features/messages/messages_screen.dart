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

final contactsProvider = FutureProvider<List<dynamic>>((ref) async {
  final resp = await ApiClient().get(ApiConstants.contacts);
  return (resp.data as Map<String, dynamic>)['contacts'] as List<dynamic>;
});

const Map<String, String> _roleLabels = {
  'ADMIN': 'Administration', 'CENSOR': 'Censeur', 'ACCOUNTANT': 'Comptabilité',
  'TEACHER': 'Enseignant', 'PARENT': 'Parent', 'STUDENT': 'Élève', 'STAFF': 'Personnel',
  'DRIVER': 'Chauffeur',
};

Future<void> _showComposeSheet(BuildContext context, WidgetRef ref) async {
  await showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => const _ComposeSheet(),
  );
}

class _ComposeSheet extends ConsumerStatefulWidget {
  const _ComposeSheet();

  @override
  ConsumerState<_ComposeSheet> createState() => _ComposeSheetState();
}

class _ComposeSheetState extends ConsumerState<_ComposeSheet> {
  final _search = TextEditingController();
  final _subject = TextEditingController();
  final _content = TextEditingController();
  Map<String, dynamic>? _recipient;
  bool _sending = false;

  Future<void> _send() async {
    if (_recipient == null || _content.text.trim().isEmpty) return;
    setState(() => _sending = true);
    try {
      await ApiClient().post(ApiConstants.messages, data: {
        'recipientId': _recipient!['id'],
        'subject': _subject.text.trim(),
        'content': _content.text.trim(),
      });
      ref.invalidate(messagesProvider);
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Message envoyé.')),
        );
      }
    } catch (e) {
      setState(() => _sending = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur : $e'), backgroundColor: AppTheme.danger),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final contactsAsync = ref.watch(contactsProvider);

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        height: MediaQuery.of(context).size.height * 0.85,
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 8, 6),
              child: Row(
                children: [
                  const Expanded(
                    child: Text('Nouveau message', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  ),
                  IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Destinataire', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.textSub)),
                    const SizedBox(height: 6),
                    if (_recipient != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(
                          color: AppTheme.primary.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                '${_recipient!['firstName']} ${_recipient!['lastName']} · ${_roleLabels[_recipient!['role']] ?? _recipient!['role']}',
                                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                              ),
                            ),
                            IconButton(
                              icon: const Icon(Icons.close, size: 18),
                              onPressed: () => setState(() => _recipient = null),
                            ),
                          ],
                        ),
                      )
                    else ...[
                      TextField(
                        controller: _search,
                        onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(
                          hintText: 'Rechercher un destinataire…',
                          prefixIcon: Icon(Icons.search, size: 20),
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                      const SizedBox(height: 8),
                      SizedBox(
                        height: 180,
                        child: contactsAsync.when(
                          loading: () => const Center(child: CircularProgressIndicator()),
                          error: (e, _) => Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger)),
                          data: (contacts) {
                            final query = _search.text.trim().toLowerCase();
                            final filtered = contacts.where((c) {
                              final name = '${c['firstName']} ${c['lastName']}'.toLowerCase();
                              return query.isEmpty || name.contains(query);
                            }).toList();
                            if (filtered.isEmpty) {
                              return const Center(child: Text('Aucun contact trouvé.', style: TextStyle(color: AppTheme.textSub)));
                            }
                            return ListView.builder(
                              itemCount: filtered.length,
                              itemBuilder: (ctx, i) {
                                final c = filtered[i] as Map<String, dynamic>;
                                return ListTile(
                                  dense: true,
                                  title: Text('${c['firstName']} ${c['lastName']}', style: const TextStyle(fontSize: 13)),
                                  subtitle: Text(_roleLabels[c['role']] ?? c['role'] as String, style: const TextStyle(fontSize: 11)),
                                  onTap: () => setState(() => _recipient = c),
                                );
                              },
                            );
                          },
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    const Text('Sujet', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.textSub)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _subject,
                      decoration: const InputDecoration(border: OutlineInputBorder(), isDense: true),
                    ),
                    const SizedBox(height: 16),
                    const Text('Message', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.textSub)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _content,
                      maxLines: 5,
                      onChanged: (_) => setState(() {}),
                      decoration: const InputDecoration(border: OutlineInputBorder()),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: (_recipient != null && _content.text.trim().isNotEmpty && !_sending) ? _send : null,
                  child: _sending
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Envoyer'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

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
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showComposeSheet(context, ref),
        child: const Icon(Icons.edit_rounded),
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
