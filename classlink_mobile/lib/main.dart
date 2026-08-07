import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/providers/refresh_provider.dart';
import 'core/providers/theme_provider.dart';
import 'core/services/notification_service.dart';
import 'core/theme/app_theme.dart';
import 'core/widgets/offline_banner.dart';
import 'router.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await NotificationService.initialize();
  runApp(const ProviderScope(child: MyClassLinkApp()));
}

class MyClassLinkApp extends ConsumerStatefulWidget {
  const MyClassLinkApp({super.key});

  @override
  ConsumerState<MyClassLinkApp> createState() => _MyClassLinkAppState();
}

/// Auto-refresh de toutes les pages, sans bouton dédié : les données servies
/// par les providers (`ref.watch(refreshTickProvider)` en tête de chaque
/// `FutureProvider`) sont recalculées quand ce tick avance, ce qui arrive :
///  - au retour au premier plan de l'app (l'utilisateur rouvre l'app) ;
///  - toutes les 60 secondes tant que l'app est au premier plan (filet de
///    sécurité pour les changements faits côté admin/web pendant ce temps) ;
///  - immédiatement à la réception d'un push FCM silencieux `{"type": "sync"}`,
///    envoyé par le serveur juste après une action admin/super-admin qui
///    modifie ce que voit un parent (ex. verrouillage d'une fonctionnalité).
class _MyClassLinkAppState extends ConsumerState<MyClassLinkApp> with WidgetsBindingObserver {
  Timer? _periodicTimer;
  StreamSubscription? _fcmSubscription;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _periodicTimer = Timer.periodic(const Duration(seconds: 60), (_) => _bumpRefresh());
    _fcmSubscription = NotificationService.onForegroundMessage.listen((message) {
      if (message.data['type'] == 'sync') _bumpRefresh();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _bumpRefresh();
  }

  void _bumpRefresh() {
    ref.read(refreshTickProvider.notifier).state++;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _periodicTimer?.cancel();
    _fcmSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp.router(
      title: 'MyClassLink',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeMode,
      routerConfig: router,
      builder: (context, child) => OfflineBanner(child: child ?? const SizedBox.shrink()),
    );
  }
}
