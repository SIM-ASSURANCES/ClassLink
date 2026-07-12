import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/theme/app_theme.dart';
import 'trips_provider.dart';
import 'signature_screen.dart';

class TripsScreen extends ConsumerStatefulWidget {
  const TripsScreen({super.key});

  @override
  ConsumerState<TripsScreen> createState() => _TripsScreenState();
}

class _TripsScreenState extends ConsumerState<TripsScreen> {
  String? _busyKey;

  Color _statusColor(String status) => switch (status) {
    'AUTHORIZED' => AppTheme.success,
    'REFUSED'    => AppTheme.textSub,
    _            => AppTheme.warning,
  };

  String _statusLabel(String status) => switch (status) {
    'AUTHORIZED' => 'Autorisé',
    'REFUSED'    => 'Refusé',
    _            => 'À signer',
  };

  Future<void> _refuse(Map<String, dynamic> trip) async {
    final key = '${trip['tripId']}_${trip['studentId']}';
    setState(() => _busyKey = key);
    try {
      await submitTripAuthorization(
        tripId: trip['tripId'] as String,
        studentId: trip['studentId'] as String,
        authorized: false,
      );
      ref.invalidate(tripsProvider);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Erreur lors de l\'envoi.'), backgroundColor: AppTheme.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _busyKey = null);
    }
  }

  Future<void> _authorize(Map<String, dynamic> trip) async {
    final signature = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => SignatureScreen(title: trip['title'] as String)),
    );
    if (signature == null || !mounted) return;

    final key = '${trip['tripId']}_${trip['studentId']}';
    setState(() => _busyKey = key);
    try {
      await submitTripAuthorization(
        tripId: trip['tripId'] as String,
        studentId: trip['studentId'] as String,
        authorized: true,
        signatureBase64: signature,
      );
      ref.invalidate(tripsProvider);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Erreur lors de l\'envoi.'), backgroundColor: AppTheme.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _busyKey = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(tripsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Sorties scolaires')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error:   (e, _) => Center(child: Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger))),
        data: (trips) {
          if (trips.isEmpty) {
            return const Center(child: Text('Aucune sortie prévue.', style: TextStyle(color: AppTheme.textSub)));
          }
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: trips.length,
            itemBuilder: (ctx, i) {
              final trip = trips[i] as Map<String, dynamic>;
              final status = trip['authorizationStatus'] as String? ?? 'PENDING';
              final key = '${trip['tripId']}_${trip['studentId']}';
              final busy = _busyKey == key;
              final date = DateTime.tryParse(trip['tripDate'] as String? ?? '');

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
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: _statusColor(status).withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(_statusLabel(status),
                              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _statusColor(status))),
                          ),
                          const SizedBox(width: 8),
                          if (date != null)
                            Text(DateFormat('d MMM yyyy', 'fr_FR').format(date),
                              style: const TextStyle(fontSize: 12, color: AppTheme.textSub)),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(trip['title'] as String? ?? '',
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
                      const SizedBox(height: 2),
                      Text('${trip['studentFirstName']} ${trip['studentLastName']}',
                        style: const TextStyle(fontSize: 12, color: AppTheme.textSub)),
                      if (trip['destination'] != null) ...[
                        const SizedBox(height: 4),
                        Text('📍 ${trip['destination']}', style: const TextStyle(fontSize: 12, color: AppTheme.textSub)),
                      ],
                      if (status == 'PENDING') ...[
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: busy ? null : () => _refuse(trip),
                                child: const Text('Refuser'),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: ElevatedButton(
                                onPressed: busy ? null : () => _authorize(trip),
                                child: busy
                                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                  : const Text('Autoriser'),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
