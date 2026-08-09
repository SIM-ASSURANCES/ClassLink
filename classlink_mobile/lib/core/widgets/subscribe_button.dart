import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api/api_client.dart';
import '../theme/app_theme.dart';

/// Bouton d'abonnement en ligne (transport / cantine) : appelle l'API pour
/// initier le paiement, puis ouvre l'URL du PSP dans le navigateur externe —
/// voir actions/transport.ts::initiateTransportSubscriptionPayment et
/// actions/cafeteria.ts::initiateCafeteriaSubscriptionPayment (web).
class SubscribeButton extends StatefulWidget {
  final String endpoint;
  final Map<String, dynamic> body;
  final String label;
  final VoidCallback? onLaunched;
  const SubscribeButton({
    super.key, required this.endpoint, required this.body, required this.label, this.onLaunched,
  });

  @override
  State<SubscribeButton> createState() => _SubscribeButtonState();
}

class _SubscribeButtonState extends State<SubscribeButton> {
  bool _loading = false;
  String? _error;

  Future<void> _subscribe() async {
    setState(() { _loading = true; _error = null; });
    try {
      final resp = await ApiClient().post(widget.endpoint, data: widget.body);
      final url = resp.data['paymentUrl'] as String?;
      if (url != null) {
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
        widget.onLaunched?.call();
      }
    } catch (e) {
      setState(() => _error = 'Erreur : $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        FilledButton(
          onPressed: _loading ? null : _subscribe,
          style: FilledButton.styleFrom(backgroundColor: const Color(0xFFD97706)),
          child: _loading
            ? const SizedBox(width: 16, height: 16,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : Text(widget.label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(_error!, style: const TextStyle(fontSize: 11, color: AppTheme.danger)),
          ),
      ],
    );
  }
}
