import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/providers/refresh_provider.dart';
import '../../core/theme/app_theme.dart';
import '../parent/widgets/parent_paywall_gate.dart';

const _pollInterval = Duration(seconds: 15);

final _transportProvider = FutureProvider.family<Map<String, dynamic>?, String>((ref, studentId) async {
  ref.watch(refreshTickProvider);
  final resp = await ApiClient().get(ApiConstants.transport, params: {'studentId': studentId});
  return resp.data['transport'] as Map<String, dynamic>?;
});

class TransportScreen extends ConsumerStatefulWidget {
  final String studentId;
  const TransportScreen({super.key, required this.studentId});

  @override
  ConsumerState<TransportScreen> createState() => _TransportScreenState();
}

class _TransportScreenState extends ConsumerState<TransportScreen> {
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _pollTimer = Timer.periodic(_pollInterval, (_) {
      ref.invalidate(_transportProvider(widget.studentId));
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_transportProvider(widget.studentId));

    return Scaffold(
      appBar: AppBar(title: const Text('Transport scolaire')),
      body: ParentPaywallGate(
        featureName: 'Le transport scolaire',
        featureKey: 'transport',
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger))),
          data: (transport) {
            if (transport == null) {
              return const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('Aucun transport scolaire assigné pour cet enfant.',
                    textAlign: TextAlign.center, style: TextStyle(color: AppTheme.textSub)),
                ),
              );
            }
            if (transport['subscribed'] == false) {
              final stop = transport['stop'] as Map<String, dynamic>?;
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.lock_clock_rounded, color: AppTheme.warning, size: 36),
                      const SizedBox(height: 10),
                      const Text('Abonnement transport requis',
                        style: TextStyle(fontWeight: FontWeight.w700, color: AppTheme.textMain)),
                      if (stop?['name'] != null) ...[
                        const SizedBox(height: 4),
                        Text('${transport['routeName'] ?? ''} — ${stop!['name']}',
                          style: const TextStyle(fontSize: 12, color: AppTheme.textSub)),
                      ],
                      const SizedBox(height: 10),
                      const Text(
                        "Le suivi en direct du car et les informations du chauffeur ne sont "
                        "disponibles qu'une fois l'abonnement transport souscrit auprès de "
                        "l'administration de l'école.",
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12, color: AppTheme.textSub),
                      ),
                    ],
                  ),
                ),
              );
            }
            return _TransportContent(transport: transport);
          },
        ),
      ),
    );
  }
}

class _TransportContent extends StatelessWidget {
  final Map<String, dynamic> transport;
  const _TransportContent({required this.transport});

  @override
  Widget build(BuildContext context) {
    final stop = transport['stop'] as Map<String, dynamic>;
    final driver = transport['driver'] as Map<String, dynamic>?;
    final activeTrip = transport['activeTrip'] as Map<String, dynamic>?;
    final lastLocation = transport['lastLocation'] as Map<String, dynamic>?;

    final stopPoint = LatLng((stop['latitude'] as num).toDouble(), (stop['longitude'] as num).toDouble());
    final busPoint = lastLocation != null
      ? LatLng((lastLocation['latitude'] as num).toDouble(), (lastLocation['longitude'] as num).toDouble())
      : null;
    final center = busPoint ?? stopPoint;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (activeTrip != null)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.success.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppTheme.success.withValues(alpha: 0.4), width: 2),
            ),
            child: Row(
              children: [
                const Icon(Icons.directions_bus_filled_rounded, color: AppTheme.success),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Trajet ${activeTrip['direction'] == 'MORNING' ? 'de ramassage' : 'retour'} en cours',
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.success),
                      ),
                      Text(
                        lastLocation != null
                          ? 'Mis à jour à ${DateTime.parse(lastLocation['recorded_at']).toLocal().toString().substring(11, 16)}'
                          : 'En attente de la première position…',
                        style: const TextStyle(fontSize: 11, color: AppTheme.textSub),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          )
        else
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: AppTheme.surface, borderRadius: BorderRadius.circular(14)),
            child: const Text('Aucun trajet en cours actuellement.', style: TextStyle(fontSize: 13, color: AppTheme.textSub)),
          ),

        const SizedBox(height: 16),

        ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: SizedBox(
            height: 260,
            child: FlutterMap(
              options: MapOptions(initialCenter: center, initialZoom: 14),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.classlink.classlink_mobile',
                ),
                MarkerLayer(markers: [
                  Marker(
                    point: stopPoint,
                    width: 20, height: 20,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppTheme.primary, shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                        boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 3)],
                      ),
                    ),
                  ),
                  if (busPoint != null)
                    Marker(
                      point: busPoint,
                      width: 40, height: 40,
                      child: Container(
                        decoration: BoxDecoration(
                          color: AppTheme.primary, shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 3),
                          boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 5)],
                        ),
                        child: const Center(child: Text('🚌', style: TextStyle(fontSize: 18))),
                      ),
                    ),
                ]),
              ],
            ),
          ),
        ),

        const SizedBox(height: 16),

        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppTheme.border)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${transport['routeName']}${transport['plateNumber'] != null ? ' · ${transport['plateNumber']}' : ''}',
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.textSub)),
              const SizedBox(height: 8),
              Text(stop['name'] as String, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
              const SizedBox(height: 6),
              if (stop['morningPickupTime'] != null)
                Text('🌅 Ramassage le matin : ${(stop['morningPickupTime'] as String).substring(0, 5)}',
                  style: const TextStyle(fontSize: 13, color: AppTheme.textMain)),
              if (stop['afternoonDropoffTime'] != null)
                Text('🏠 Dépose le soir : ${(stop['afternoonDropoffTime'] as String).substring(0, 5)}',
                  style: const TextStyle(fontSize: 13, color: AppTheme.textMain)),
            ],
          ),
        ),

        const SizedBox(height: 16),

        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppTheme.border)),
          child: driver == null
            ? const Text('Aucun chauffeur assigné pour l\'instant.', style: TextStyle(fontSize: 13, color: AppTheme.textSub))
            : Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: AppTheme.primary.withValues(alpha: 0.12),
                    backgroundImage: driver['photoUrl'] != null ? NetworkImage(driver['photoUrl'] as String) : null,
                    child: driver['photoUrl'] == null
                      ? Text('${(driver['firstName'] as String)[0]}${(driver['lastName'] as String)[0]}',
                          style: const TextStyle(fontWeight: FontWeight.w700, color: AppTheme.primary))
                      : null,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${driver['firstName']} ${driver['lastName']}',
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
                        if (driver['phone'] != null)
                          GestureDetector(
                            onTap: () => launchUrl(Uri.parse('tel:${driver['phone']}')),
                            child: Text(driver['phone'] as String,
                              style: const TextStyle(fontSize: 13, color: AppTheme.primary, fontWeight: FontWeight.w600)),
                          ),
                      ],
                    ),
                  ),
                  if (driver['phone'] != null)
                    IconButton(
                      icon: const Icon(Icons.call_rounded, color: AppTheme.success),
                      onPressed: () => launchUrl(Uri.parse('tel:${driver['phone']}')),
                    ),
                ],
              ),
        ),
      ],
    );
  }
}
