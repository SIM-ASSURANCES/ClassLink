import 'package:flutter/material.dart';

class AppTheme {
  static const Color primary   = Color(0xFF1800AD); // bleu de marque MyClassLink
  // Jaune de marque (#FFE965) assombri à luminosité égale à `warning` : utilisé
  // ici comme texte/icône sur fond clair, le jaune brut serait illisible.
  static const Color secondary = Color(0xFFFFDA00);
  // Jaune de marque exact (#FFE965), réservé aux remplissages/accents décoratifs
  // (jamais comme couleur de texte ou d'icône : contraste insuffisant).
  static const Color brandAccent = Color(0xFFFFE965);
  static const Color success   = Color(0xFF16A34A); // green-600
  static const Color warning   = Color(0xFFF59E0B); // amber-500
  static const Color danger    = Color(0xFFDC2626); // red-600
  static const Color surface   = Color(0xFFF8FAFC);
  static const Color card      = Color(0xFFFFFFFF);
  static const Color textMain  = Color(0xFF111827);
  static const Color textSub   = Color(0xFF6B7280);
  static const Color border    = Color(0xFFE5E7EB);

  static ThemeData get light => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: primary,
      brightness: Brightness.light,
    ),
    scaffoldBackgroundColor: surface,
    appBarTheme: const AppBarTheme(
      backgroundColor: card,
      foregroundColor: textMain,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: textMain, fontSize: 18, fontWeight: FontWeight.w700,
      ),
    ),
    cardTheme: CardThemeData(
      color: card,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: border),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        minimumSize: const Size(double.infinity, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: card,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: primary, width: 2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
  );

  // Thème sombre — portée actuelle : coquille Material (barre du haut,
  // boutons, champs, cartes par défaut, dialogues, navigation basse). Les
  // écrans qui codent leurs couleurs en dur via les constantes ci-dessus
  // (AppTheme.textMain, AppTheme.card…) restent en clair pour l'instant —
  // voir la note dans main.dart sur la portée du mode sombre.
  static const Color darkSurface  = Color(0xFF0F172A);
  static const Color darkCard     = Color(0xFF1E293B);
  static const Color darkBorder   = Color(0xFF334155);
  static const Color darkTextMain = Color(0xFFE2E8F0);

  static ThemeData get dark => ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: ColorScheme.fromSeed(
      seedColor: primary,
      brightness: Brightness.dark,
    ),
    scaffoldBackgroundColor: darkSurface,
    appBarTheme: const AppBarTheme(
      backgroundColor: darkCard,
      foregroundColor: darkTextMain,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: darkTextMain, fontSize: 18, fontWeight: FontWeight.w700,
      ),
    ),
    cardTheme: CardThemeData(
      color: darkCard,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: darkBorder),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        minimumSize: const Size(double.infinity, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: darkCard,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: darkBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: darkBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: primary, width: 2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: darkCard,
      indicatorColor: primary.withValues(alpha: 0.25),
    ),
  );
}
