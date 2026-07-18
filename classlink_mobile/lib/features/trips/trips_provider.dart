import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/providers/refresh_provider.dart';

final tripsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  ref.watch(refreshTickProvider);
  final resp = await ApiClient().get(ApiConstants.trips);
  return resp.data['trips'] as List<dynamic>;
});

/// Envoie la décision du parent (autorisation ou refus) au serveur.
/// [signatureBase64] est obligatoire quand [authorized] est vrai.
Future<void> submitTripAuthorization({
  required String tripId,
  required String studentId,
  required bool authorized,
  String? notes,
  String? signatureBase64,
}) async {
  await ApiClient().post(ApiConstants.tripsAuthorize, data: {
    'tripId':        tripId,
    'studentId':     studentId,
    'authorized':    authorized,
    'notes':         notes,
    'signatureData': signatureBase64,
  });
}
