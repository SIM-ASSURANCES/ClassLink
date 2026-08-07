import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _prefsKey = 'myclasslink_biometric_enabled';

/// Déverrouillage biométrique de l'app (Face ID / empreinte) — protège
/// l'accès à une session déjà connectée, ne remplace pas le login initial.
class BiometricService {
  static final LocalAuthentication _auth = LocalAuthentication();

  /// L'appareil dispose-t-il d'un capteur biométrique configuré ?
  static Future<bool> isAvailable() async {
    try {
      final canCheck = await _auth.canCheckBiometrics;
      final supported = await _auth.isDeviceSupported();
      return canCheck && supported;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> isEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_prefsKey) ?? false;
  }

  static Future<void> setEnabled(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_prefsKey, enabled);
  }

  /// Déclenche l'invite biométrique native. Retourne false en cas d'échec,
  /// d'annulation, ou d'erreur (jamais d'exception qui remonterait à l'UI).
  static Future<bool> authenticate() async {
    try {
      return await _auth.authenticate(
        localizedReason: 'Déverrouillez MyClassLink',
        options: const AuthenticationOptions(
          biometricOnly: false, // autorise le repli PIN/schéma natif de l'appareil
          stickyAuth: true,
        ),
      );
    } catch (_) {
      return false;
    }
  }
}
