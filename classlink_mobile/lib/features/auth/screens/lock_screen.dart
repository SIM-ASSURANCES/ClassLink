import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import '../providers/auth_provider.dart';

/// Écran de verrouillage — affiché quand une session est restaurée depuis le
/// stockage mais que le déverrouillage biométrique est activé. Ne remplace
/// pas le login (le token reste valide), juste une barrière locale.
class LockScreen extends ConsumerStatefulWidget {
  const LockScreen({super.key});

  @override
  ConsumerState<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends ConsumerState<LockScreen> with WidgetsBindingObserver {
  bool _attempting = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _tryUnlock());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Relance l'invite quand l'utilisateur revient sur l'app après l'avoir
    // quittée pendant l'invite système (ex. annulation accidentelle).
    if (state == AppLifecycleState.resumed && !_attempting) _tryUnlock();
  }

  Future<void> _tryUnlock() async {
    if (!mounted || _attempting) return;
    setState(() { _attempting = true; _failed = false; });
    final ok = await ref.read(authProvider.notifier).unlockWithBiometrics();
    if (!mounted) return;
    setState(() { _attempting = false; _failed = !ok; });
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    return Scaffold(
      backgroundColor: AppTheme.surface,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 88, height: 88,
                  decoration: const BoxDecoration(shape: BoxShape.circle, color: AppTheme.card),
                  child: const Icon(Icons.fingerprint_rounded, size: 44, color: AppTheme.primary),
                ),
                const SizedBox(height: 20),
                Text('Bonjour, ${user?.firstName ?? ''}',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppTheme.textMain)),
                const SizedBox(height: 6),
                Text(
                  _failed
                    ? 'Authentification échouée ou annulée.'
                    : 'Déverrouillez pour continuer.',
                  style: TextStyle(fontSize: 13, color: _failed ? AppTheme.danger : AppTheme.textSub),
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: _attempting ? null : _tryUnlock,
                  icon: _attempting
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.lock_open_rounded, size: 18),
                  label: Text(_attempting ? 'Vérification…' : 'Déverrouiller'),
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () => ref.read(authProvider.notifier).logout(),
                  child: const Text('Se déconnecter', style: TextStyle(color: AppTheme.textSub, fontSize: 13)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
