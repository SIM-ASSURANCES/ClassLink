import 'package:home_widget/home_widget.dart';

const _dayNames = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/// Widget écran d'accueil Android affichant le prochain cours. Best-effort :
/// écrit les données pour le widget natif (android/…/NextClassWidgetProvider.kt)
/// mais ne fait rien sur iOS/si aucun widget n'est épinglé (échec silencieux).
class HomeWidgetService {
  /// [scheduleByDay] : même format que scheduleProvider — clé = jour ISO
  /// (1=lundi..6=samedi), valeur = liste de créneaux {startTime, endTime,
  /// subjectName, room}. Ne concerne que les comptes élève (emploi du temps
  /// personnel) — pas encore les parents (plusieurs enfants possibles).
  static Future<void> updateNextClass(Map<int, List<dynamic>> scheduleByDay) async {
    try {
      final now = DateTime.now();
      final todayIso = now.weekday; // 1=lundi..7=dimanche

      Map<String, dynamic>? next;
      int daysAhead = 0;

      for (int offset = 0; offset <= 6; offset++) {
        final iso = ((todayIso - 1 + offset) % 7) + 1;
        final slots = List<Map<String, dynamic>>.from(scheduleByDay[iso] ?? const []);
        if (slots.isEmpty) continue;
        slots.sort((a, b) => (a['startTime'] as String).compareTo(b['startTime'] as String));

        for (final slot in slots) {
          if (offset == 0) {
            final start = _parseTimeToday(slot['startTime'] as String, now);
            if (start.isBefore(now)) continue;
          }
          next = slot;
          daysAhead = offset;
          break;
        }
        if (next != null) break;
      }

      if (next == null) {
        await HomeWidget.saveWidgetData<String>('next_class_title', 'Aucun cours à venir');
        await HomeWidget.saveWidgetData<String>('next_class_subtitle', '');
      } else {
        final time = (next['startTime'] as String).substring(0, 5);
        final dayLabel = daysAhead == 0 ? "Aujourd'hui" : _dayNames[((todayIso - 1 + daysAhead) % 7) + 1];
        final room = next['room'] as String?;
        await HomeWidget.saveWidgetData<String>('next_class_title', '$dayLabel · $time');
        await HomeWidget.saveWidgetData<String>(
          'next_class_subtitle',
          '${next['subjectName']}${room != null && room.isNotEmpty ? ' — Salle $room' : ''}',
        );
      }

      await HomeWidget.updateWidget(androidName: 'NextClassWidgetProvider');
    } catch (_) {
      // Best-effort : aucun widget épinglé, plateforme non supportée, etc.
    }
  }

  static DateTime _parseTimeToday(String time, DateTime today) {
    final parts = time.split(':');
    return DateTime(today.year, today.month, today.day,
      int.parse(parts[0]), int.parse(parts[1]));
  }
}
