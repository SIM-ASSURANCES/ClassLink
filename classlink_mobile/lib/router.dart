import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/widgets/app_shell.dart';
import 'features/auth/providers/auth_provider.dart';
import 'features/auth/screens/login_screen.dart';
import 'features/auth/screens/lock_screen.dart';
import 'features/dashboard/dashboard_screen.dart';
import 'features/grades/screens/grades_screen.dart';
import 'features/schedule/schedule_screen.dart';
import 'features/attendance/attendance_screen.dart';
import 'features/announcements/announcements_screen.dart';
import 'features/cafeteria/cafeteria_screen.dart';
import 'features/messages/messages_screen.dart';
import 'features/payments/payments_screen.dart';
import 'features/bulletins/bulletins_screen.dart';
import 'features/bulletins/bulletin_pdf_screen.dart';
import 'features/parent/screens/children_screen.dart';
import 'features/parent/screens/child_detail_screen.dart';
import 'features/parent/screens/id_card_screen.dart';
import 'features/trips/trips_screen.dart';
import 'features/assignments/assignments_screen.dart';
import 'features/agenda/agenda_screen.dart';
import 'features/sanctions/sanctions_screen.dart';
import 'features/summary/summary_screen.dart';
import 'features/appointments/appointments_screen.dart';
import 'features/settings/settings_screen.dart';
import 'features/transport/transport_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      final isLocked   = authState.user != null && authState.locked;
      final isLoggedIn = authState.isAuthenticated;
      final isOnLogin  = state.matchedLocation == '/login';
      final isOnLock   = state.matchedLocation == '/lock';

      if (isLocked && !isOnLock) return '/lock';
      if (!isLocked && isOnLock) return isLoggedIn ? '/' : '/login';
      if (!isLoggedIn && !isLocked && !isOnLogin) return '/login';
      if (isLoggedIn && isOnLogin) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/lock',  builder: (context, state) => const LockScreen()),

      // Barre de navigation basse fixe et permanente (Accueil, Frais,
      // Cantine, Absences, Messages) : un seul Scaffold partagé par ces 5
      // écrans (voir core/widgets/app_shell.dart) — elle ne dépend plus de
      // chaque écran pour l'afficher, donc ne peut plus être oubliée nulle
      // part. Chaque branche garde son propre historique de navigation.
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: '/', builder: (context, state) => const DashboardScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/payments', builder: (context, state) => const PaymentsScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/cafeteria', builder: (context, state) => const CafeteriaScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/attendance', builder: (context, state) => const AttendanceScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/messages', builder: (context, state) => const MessagesScreen()),
          ]),
        ],
      ),

      GoRoute(path: '/grades',        builder: (context, state) => const GradesScreen()),
      GoRoute(path: '/schedule',      builder: (context, state) => const ScheduleScreen()),
      GoRoute(path: '/announcements', builder: (context, state) => const AnnouncementsScreen()),
      GoRoute(path: '/bulletins',     builder: (context, state) => const BulletinsScreen()),
      GoRoute(path: '/assignments',   builder: (context, state) => const AssignmentsScreen()),
      GoRoute(
        path: '/bulletins/:termId',
        builder: (context, state) => BulletinPdfScreen(
          termId: state.pathParameters['termId']!,
        ),
      ),

      // Espace parent
      GoRoute(path: '/parent/children', builder: (context, state) => const ChildrenScreen()),
      GoRoute(
        path: '/parent/child/:studentId',
        builder: (context, state) => ChildDetailScreen(
          studentId: state.pathParameters['studentId']!,
        ),
      ),
      GoRoute(
        path: '/parent/child/:studentId/grades',
        builder: (context, state) => GradesScreen(
          studentId: state.pathParameters['studentId'],
        ),
      ),
      GoRoute(
        path: '/parent/child/:studentId/schedule',
        builder: (context, state) => ScheduleScreen(
          studentId: state.pathParameters['studentId'],
        ),
      ),
      GoRoute(
        path: '/parent/child/:studentId/attendance',
        builder: (context, state) => AttendanceScreen(
          studentId: state.pathParameters['studentId'],
        ),
      ),
      GoRoute(
        path: '/parent/child/:studentId/payments',
        builder: (context, state) => PaymentsScreen(
          studentId: state.pathParameters['studentId'],
        ),
      ),
      GoRoute(
        path: '/parent/child/:studentId/bulletins',
        builder: (context, state) => BulletinsScreen(
          studentId: state.pathParameters['studentId'],
        ),
      ),
      GoRoute(
        path: '/parent/child/:studentId/bulletins/:termId',
        builder: (context, state) => BulletinPdfScreen(
          termId:    state.pathParameters['termId']!,
          studentId: state.pathParameters['studentId'],
        ),
      ),
      GoRoute(
        path: '/parent/child/:studentId/id-card',
        builder: (context, state) => IdCardScreen(
          studentId: state.pathParameters['studentId']!,
        ),
      ),
      GoRoute(
        path: '/parent/child/:studentId/assignments',
        builder: (context, state) => AssignmentsScreen(
          studentId: state.pathParameters['studentId'],
        ),
      ),
      GoRoute(
        path: '/parent/child/:studentId/agenda',
        builder: (context, state) => AgendaScreen(
          studentId: state.pathParameters['studentId']!,
        ),
      ),
      GoRoute(
        path: '/parent/child/:studentId/sanctions',
        builder: (context, state) => SanctionsScreen(
          studentId: state.pathParameters['studentId']!,
        ),
      ),
      GoRoute(
        path: '/parent/child/:studentId/summary',
        builder: (context, state) => SummaryScreen(
          studentId: state.pathParameters['studentId']!,
        ),
      ),
      GoRoute(path: '/trips', builder: (context, state) => const TripsScreen()),
      GoRoute(path: '/settings', builder: (context, state) => const SettingsScreen()),
      GoRoute(
        path: '/parent/child/:studentId/appointments',
        builder: (context, state) => AppointmentsScreen(
          studentId: state.pathParameters['studentId']!,
        ),
      ),
      GoRoute(
        path: '/parent/child/:studentId/transport',
        builder: (context, state) => TransportScreen(
          studentId: state.pathParameters['studentId']!,
        ),
      ),
    ],
  );
});
