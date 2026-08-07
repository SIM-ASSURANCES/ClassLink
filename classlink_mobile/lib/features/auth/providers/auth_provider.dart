import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_constants.dart';
import '../../../core/services/biometric_service.dart';
import '../../../core/services/notification_service.dart';
import '../../../core/storage/secure_storage.dart';

class AuthUser {
  final String id;
  final String firstName;
  final String lastName;
  final String email;
  final String role;
  final String? avatarUrl;
  final String schoolName;
  final String schoolSlug;

  const AuthUser({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.role,
    this.avatarUrl,
    required this.schoolName,
    required this.schoolSlug,
  });

  String get fullName => '$firstName $lastName';
  bool get isParent  => role == 'PARENT';
  bool get isStudent => role == 'STUDENT';

  factory AuthUser.fromJson(Map<String, dynamic> u, Map<String, dynamic> s) => AuthUser(
    id:         u['id'],
    firstName:  u['firstName'],
    lastName:   u['lastName'],
    email:      u['email'],
    role:       u['role'],
    avatarUrl:  u['avatarUrl'],
    schoolName: s['name'],
    schoolSlug: s['slug'],
  );

  Map<String, dynamic> toJson() => {
    'id': id, 'firstName': firstName, 'lastName': lastName,
    'email': email, 'role': role, 'avatarUrl': avatarUrl,
    'schoolName': schoolName, 'schoolSlug': schoolSlug,
  };
}

class AuthState {
  final AuthUser? user;
  final bool      isLoading;
  final String?   error;
  /// Session restaurée depuis le stockage mais en attente d'un déverrouillage
  /// biométrique (voir BiometricService) — distinct de "non connecté".
  final bool      locked;

  const AuthState({this.user, this.isLoading = false, this.error, this.locked = false});
  bool get isAuthenticated => user != null && !locked;
  AuthState copyWith({AuthUser? user, bool? isLoading, String? error, bool? locked}) =>
    AuthState(
      user: user ?? this.user, isLoading: isLoading ?? this.isLoading,
      error: error, locked: locked ?? this.locked,
    );
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(const AuthState()) {
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    state = state.copyWith(isLoading: true);
    final userData = await SecureStorage.getUser();
    if (userData != null) {
      try {
        final map = jsonDecode(userData) as Map<String, dynamic>;
        final user = AuthUser(
          id:         map['id'],
          firstName:  map['firstName'],
          lastName:   map['lastName'],
          email:      map['email'],
          role:       map['role'],
          avatarUrl:  map['avatarUrl'],
          schoolName: map['schoolName'],
          schoolSlug: map['schoolSlug'],
        );
        final needsUnlock = await BiometricService.isEnabled();
        state = AuthState(user: user, locked: needsUnlock);
        return;
      } catch (_) {}
    }
    state = const AuthState();
  }

  /// Tente le déverrouillage biométrique de la session restaurée. Retourne
  /// false en cas d'échec/annulation — l'app reste verrouillée.
  Future<bool> unlockWithBiometrics() async {
    final ok = await BiometricService.authenticate();
    if (ok) state = state.copyWith(locked: false);
    return ok;
  }

  Future<String?> login({
    required String schoolSlug,
    required String email,
    required String password,
  }) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final resp = await ApiClient().post(ApiConstants.login, data: {
        'schoolSlug': schoolSlug,
        'email':      email,
        'password':   password,
      });
      final data = resp.data as Map<String, dynamic>;
      final user = AuthUser.fromJson(
        data['user'] as Map<String, dynamic>,
        data['school'] as Map<String, dynamic>,
      );
      await SecureStorage.saveTokens(
        accessToken:  data['accessToken'],
        refreshToken: data['refreshToken'],
      );
      await SecureStorage.saveUser(jsonEncode(user.toJson()));
      state = AuthState(user: user);
      // Enregistrer le token FCM en arrière-plan après connexion
      NotificationService.registerDeviceToken().ignore();
      return null;
    } catch (e) {
      final msg = _extractError(e);
      state = AuthState(error: msg);
      return msg;
    }
  }

  Future<void> logout() async {
    await SecureStorage.clear();
    state = const AuthState();
  }

  String _extractError(Object e) {
    if (e.toString().contains('401')) return 'Email ou mot de passe incorrect.';
    if (e.toString().contains('404')) return 'Établissement introuvable.';
    if (e.toString().contains('403')) return 'Accès refusé.';
    return 'Erreur de connexion. Vérifiez votre réseau.';
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>(
  (ref) => AuthNotifier(),
);
