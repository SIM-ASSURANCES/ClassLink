class ApiConstants {
  static const String baseUrl = 'https://myclasslink.cloud'; // Production
  // Dev — émulateur Android → 'http://10.0.2.2:3000'
  // Dev — téléphone sur le même WiFi que le PC → 'http://<IP locale du PC>:3000'

  static const String login        = '/api/mobile/auth/login';
  static const String refresh      = '/api/mobile/auth/refresh';
  static const String grades       = '/api/mobile/grades';
  static const String schedule     = '/api/mobile/schedule';
  static const String attendance   = '/api/mobile/attendance';
  static const String announcements= '/api/mobile/announcements';
  static const String cafeteria    = '/api/mobile/cafeteria';
  static const String messages     = '/api/mobile/messages';
  static const String children     = '/api/mobile/parent/children';
  static const String parentSubscription = '/api/mobile/parent/subscription';
  static const String payments     = '/api/mobile/payments';
  static const String bulletins    = '/api/mobile/bulletins';
  static const String assignments  = '/api/mobile/assignments';
  static const String agenda       = '/api/mobile/agenda';
  static const String sanctions    = '/api/mobile/sanctions';
  static const String summary      = '/api/mobile/summary';
  static const String fcmRegister  = '/api/mobile/fcm/register';
  static const String trips           = '/api/mobile/parent/trips';
  static const String tripsAuthorize  = '/api/mobile/parent/trips/authorize';
  static const String icsAgenda       = '/api/ics/agenda';
  static const String icsSchedule     = '/api/ics/schedule';
  static const String appointmentTeachers = '/api/mobile/parent/teachers';
  static const String appointmentSlots    = '/api/mobile/parent/appointments/slots';
  static const String appointments        = '/api/mobile/parent/appointments';
  static const String appointmentsCancel  = '/api/mobile/parent/appointments/cancel';
  static const String transport           = '/api/mobile/parent/transport';

  static String paymentInitiate(String paymentId) =>
      '/api/mobile/payments/$paymentId/initiate';
}
