import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/providers/refresh_provider.dart';
import '../../core/theme/app_theme.dart';

// ─── Provider ────────────────────────────────────────────────────────────────

final paymentsProvider = FutureProvider.family<List<dynamic>, String?>(
  (ref, studentId) async {
    ref.watch(refreshTickProvider);
    final params = studentId != null ? {'studentId': studentId} : null;
    final resp = await ApiClient().get(ApiConstants.payments, params: params);
    return resp.data['payments'] as List<dynamic>;
  },
);

// ─── Screen ──────────────────────────────────────────────────────────────────

class PaymentsScreen extends ConsumerWidget {
  final String? studentId;
  const PaymentsScreen({super.key, this.studentId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(paymentsProvider(studentId));

    return Scaffold(
      appBar: AppBar(title: const Text('Paiements')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error:   (e, _) => Center(child: Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger))),
        data: (payments) {
          if (payments.isEmpty) {
            return const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.receipt_long_outlined, size: 48, color: AppTheme.textSub),
                  SizedBox(height: 12),
                  Text('Aucun paiement trouvé.', style: TextStyle(color: AppTheme.textSub)),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () => ref.refresh(paymentsProvider(studentId).future),
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: payments.length,
              itemBuilder: (ctx, i) => _PaymentCard(
                payment: payments[i] as Map<String, dynamic>,
                onPaid: () => ref.invalidate(paymentsProvider(studentId)),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ─── Carte paiement ───────────────────────────────────────────────────────────

class _PaymentCard extends StatefulWidget {
  final Map<String, dynamic> payment;
  final VoidCallback onPaid;
  const _PaymentCard({required this.payment, required this.onPaid});

  @override
  State<_PaymentCard> createState() => _PaymentCardState();
}

class _PaymentCardState extends State<_PaymentCard> {
  bool _loading = false;
  String? _error;
  bool _paymentUnavailable = false;

  Color _statusColor(String status) => switch (status) {
    'SUCCESS'  => AppTheme.success,
    'PENDING'  => AppTheme.warning,
    'FAILED'   => AppTheme.danger,
    'REFUNDED' => AppTheme.secondary,
    _          => AppTheme.textSub,
  };

  String _statusLabel(String status) => switch (status) {
    'SUCCESS'  => 'Payé',
    'PENDING'  => 'En attente',
    'FAILED'   => 'Échoué',
    'REFUNDED' => 'Remboursé',
    _          => status,
  };

  IconData _statusIcon(String status) => switch (status) {
    'SUCCESS'  => Icons.check_circle_rounded,
    'PENDING'  => Icons.hourglass_top_rounded,
    'FAILED'   => Icons.cancel_rounded,
    'REFUNDED' => Icons.replay_rounded,
    _          => Icons.help_outline_rounded,
  };

  Future<void> _initiatePayment() async {
    final paymentId = widget.payment['id'] as String?;
    if (paymentId == null) return;

    setState(() { _loading = true; _error = null; });

    try {
      final resp = await ApiClient().post(
        ApiConstants.paymentInitiate(paymentId),
        data: {},
      );
      final paymentUrl = resp.data['paymentUrl'] as String?;
      if (paymentUrl == null) {
        setState(() { _error = 'URL de paiement introuvable.'; _loading = false; });
        return;
      }

      final uri = Uri.parse(paymentUrl);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
        // Rafraîchir après retour
        widget.onPaid();
      } else {
        setState(() { _error = 'Impossible d\'ouvrir le navigateur.'; });
      }
    } on DioException catch (e) {
      final serverMessage = e.response?.data is Map
          ? (e.response?.data as Map)['error'] as String?
          : null;
      setState(() {
        if (e.response?.statusCode == 409) {
          _paymentUnavailable = true;
          _error = serverMessage ??
              'Paiement en ligne indisponible — l\'établissement n\'a pas encore activé de fournisseur de paiement.';
        } else {
          _error = serverMessage ?? 'Erreur lors de l\'initiation du paiement.';
        }
      });
    } catch (e) {
      setState(() { _error = e.toString().replaceAll('Exception: ', ''); });
    } finally {
      setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final status   = widget.payment['status'] as String? ?? 'PENDING';
    final color    = _statusColor(status);
    final amount   = widget.payment['amount'] as num? ?? 0;
    final isPending = status == 'PENDING';

    final dueDate = widget.payment['dueDate'] != null
        ? DateFormat('dd MMM yyyy', 'fr').format(
            DateTime.tryParse(widget.payment['dueDate'].toString()) ?? DateTime.now())
        : '—';
    final createdAt = widget.payment['createdAt'] != null
        ? DateFormat('dd/MM/yyyy', 'fr').format(
            DateTime.tryParse(widget.payment['createdAt'].toString()) ?? DateTime.now())
        : '—';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isPending ? AppTheme.warning.withValues(alpha: 0.4) : AppTheme.border,
          width: isPending ? 1.5 : 1,
        ),
        boxShadow: [BoxShadow(
          color: Colors.black.withValues(alpha: 0.04),
          blurRadius: 6,
          offset: const Offset(0, 2),
        )],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 42, height: 42,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(_statusIcon(status), color: color, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.payment['description'] as String? ?? 'Frais scolaires',
                        style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textMain),
                      ),
                      if (widget.payment['studentName'] != null)
                        Text(widget.payment['studentName'] as String,
                          style: const TextStyle(fontSize: 11, color: AppTheme.textSub)),
                      const SizedBox(height: 2),
                      Row(children: [
                        Text('Créé le $createdAt',
                          style: const TextStyle(fontSize: 11, color: AppTheme.textSub)),
                        if (dueDate != '—') ...[
                          const Text(' · ',
                            style: TextStyle(fontSize: 11, color: AppTheme.textSub)),
                          Text('Éch. $dueDate',
                            style: const TextStyle(fontSize: 11, color: AppTheme.textSub)),
                        ],
                      ]),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '${NumberFormat('#,###').format(amount)} F',
                      style: TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w800, color: color),
                    ),
                    Container(
                      margin: const EdgeInsets.only(top: 4),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(_statusLabel(status),
                        style: TextStyle(
                          fontSize: 10, fontWeight: FontWeight.w700, color: color)),
                    ),
                  ],
                ),
              ],
            ),

            // Bouton paiement Mobile Money pour les paiements en attente
            if (isPending) ...[
              const SizedBox(height: 12),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    _error!,
                    style: TextStyle(
                      fontSize: 12,
                      color: _paymentUnavailable ? AppTheme.textSub : AppTheme.danger,
                    ),
                  ),
                ),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: (_loading || _paymentUnavailable) ? null : _initiatePayment,
                  icon: _loading
                      ? const SizedBox(
                          width: 16, height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : Icon(
                          _paymentUnavailable ? Icons.block_rounded : Icons.phone_android_rounded,
                          size: 18,
                        ),
                  label: Text(
                    _loading
                        ? 'Redirection…'
                        : _paymentUnavailable
                            ? 'Paiement en ligne indisponible'
                            : 'Payer par Mobile Money',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _paymentUnavailable ? AppTheme.border : AppTheme.primary,
                    foregroundColor: _paymentUnavailable ? AppTheme.textSub : Colors.white,
                    disabledBackgroundColor: AppTheme.border,
                    disabledForegroundColor: AppTheme.textSub,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    elevation: 0,
                  ),
                ),
              ),
              if (!_paymentUnavailable) ...[
                const SizedBox(height: 6),
                const Center(
                  child: Text(
                    'Wave · Orange Money · MTN · Moov',
                    style: TextStyle(fontSize: 10, color: AppTheme.textSub),
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}
