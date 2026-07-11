import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/auth_provider.dart';
import '../../../core/theme/app_theme.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey    = GlobalKey<FormState>();
  final _slugCtrl   = TextEditingController();
  final _emailCtrl  = TextEditingController();
  final _passCtrl   = TextEditingController();
  bool _obscure     = true;
  bool _loading     = false;

  @override
  void dispose() {
    _slugCtrl.dispose(); _emailCtrl.dispose(); _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    final error = await ref.read(authProvider.notifier).login(
      schoolSlug: _slugCtrl.text.trim(),
      email:      _emailCtrl.text.trim(),
      password:   _passCtrl.text,
    );
    if (!mounted) return;
    setState(() => _loading = false);
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error), backgroundColor: AppTheme.danger),
      );
    }
    // Succès → GoRouter redirige automatiquement via redirect
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.surface,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Logo / Header
                Center(
                  child: Column(
                    children: [
                      Container(
                        width: 88, height: 88,
                        clipBehavior: Clip.antiAlias,
                        decoration: const BoxDecoration(shape: BoxShape.circle),
                        child: Image.asset('assets/images/logo.png', fit: BoxFit.cover),
                      ),
                      const SizedBox(height: 16),
                      const Text('MyClassLink',
                        style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: AppTheme.textMain)),
                      const SizedBox(height: 4),
                      Text('Espace élève & parent',
                        style: TextStyle(fontSize: 14, color: AppTheme.textSub)),
                    ],
                  ),
                ),

                const SizedBox(height: 40),

                // Code établissement
                const Text('Code établissement', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textMain)),
                const SizedBox(height: 6),
                TextFormField(
                  controller: _slugCtrl,
                  decoration: const InputDecoration(
                    hintText: 'ex: lycee-moderne-abidjan',
                    prefixIcon: Icon(Icons.apartment_rounded, size: 20),
                  ),
                  keyboardType: TextInputType.url,
                  autocorrect: false,
                  validator: (v) => (v?.trim().isEmpty ?? true) ? 'Code requis' : null,
                ),

                const SizedBox(height: 16),

                // Email
                const Text('Email', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textMain)),
                const SizedBox(height: 6),
                TextFormField(
                  controller: _emailCtrl,
                  decoration: const InputDecoration(
                    hintText: 'votre@email.com',
                    prefixIcon: Icon(Icons.email_outlined, size: 20),
                  ),
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  validator: (v) => (v?.contains('@') ?? false) ? null : 'Email invalide',
                ),

                const SizedBox(height: 16),

                // Mot de passe
                const Text('Mot de passe', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textMain)),
                const SizedBox(height: 6),
                TextFormField(
                  controller: _passCtrl,
                  obscureText: _obscure,
                  decoration: InputDecoration(
                    hintText: '••••••••',
                    prefixIcon: const Icon(Icons.lock_outline_rounded, size: 20),
                    suffixIcon: IconButton(
                      icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 20),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                  validator: (v) => (v?.length ?? 0) >= 4 ? null : 'Mot de passe trop court',
                ),

                const SizedBox(height: 32),

                // Bouton connexion
                ElevatedButton(
                  onPressed: _loading ? null : _submit,
                  child: _loading
                    ? const SizedBox(width: 20, height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Se connecter'),
                ),

                const SizedBox(height: 16),
                Center(
                  child: Text(
                    'Contactez l\'administration de votre école\npour obtenir vos identifiants.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: AppTheme.textSub),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
