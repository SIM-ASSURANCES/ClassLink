import 'package:flutter/material.dart';
import '../../core/services/biometric_service.dart';
import '../../core/theme/app_theme.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _loading = true;
  bool _available = false;
  bool _enabled = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final available = await BiometricService.isAvailable();
    final enabled = await BiometricService.isEnabled();
    if (!mounted) return;
    setState(() { _available = available; _enabled = enabled; _loading = false; });
  }

  Future<void> _toggle(bool value) async {
    if (value) {
      // On exige une authentification réussie avant d'activer — évite
      // d'activer un verrou que l'utilisateur ne peut ensuite pas lever.
      final ok = await BiometricService.authenticate();
      if (!ok) return;
    }
    await BiometricService.setEnabled(value);
    if (!mounted) return;
    setState(() => _enabled = value);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Réglages')),
      body: _loading
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text('Sécurité', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
              const SizedBox(height: 8),
              Card(
                child: SwitchListTile(
                  title: const Text('Déverrouillage biométrique', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  subtitle: Text(
                    _available
                      ? 'Empreinte ou reconnaissance faciale requise à l\'ouverture de l\'app.'
                      : 'Aucun capteur biométrique configuré sur cet appareil.',
                    style: const TextStyle(fontSize: 12, color: AppTheme.textSub),
                  ),
                  value: _enabled,
                  onChanged: _available ? _toggle : null,
                  activeThumbColor: AppTheme.primary,
                ),
              ),
            ],
          ),
    );
  }
}
