import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api/api_constants.dart';
import '../storage/secure_storage.dart';

/// Ouvre l'export .ics (agenda ou emploi du temps) dans le navigateur / une
/// app Calendrier externe. Le token d'accès est passé en paramètre `token`
/// plutôt qu'en en-tête HTTP : une fois transmis à une app externe, l'appel
/// ne passe plus par notre client HTTP (Dio) et ne peut donc plus porter
/// l'en-tête Authorization — même principe que les liens iCal privés de
/// Google Calendar.
Future<void> openIcsExport(
  BuildContext context,
  String path, {
  String? studentId,
}) async {
  final token = await SecureStorage.getAccessToken();
  if (token == null) return;

  final params = <String, String>{'token': token};
  if (studentId != null) params['studentId'] = studentId;
  final uri = Uri.parse('${ApiConstants.baseUrl}$path').replace(queryParameters: params);

  final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!opened && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Impossible d\'ouvrir l\'export du calendrier.')),
    );
  }
}
