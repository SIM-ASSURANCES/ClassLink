import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_constants.dart';
import '../../core/providers/refresh_provider.dart';
import '../../core/theme/app_theme.dart';
import '../parent/widgets/parent_paywall_gate.dart';

// ─── Provider ────────────────────────────────────────────────────────────────

final bulletinsProvider = FutureProvider.family<Map<String, dynamic>, String?>(
  (ref, studentId) async {
    ref.watch(refreshTickProvider);
    final params = studentId != null ? {'studentId': studentId} : null;
    final resp = await ApiClient().get(ApiConstants.bulletins, params: params);
    return resp.data as Map<String, dynamic>;
  },
);

// ─── Screen ──────────────────────────────────────────────────────────────────

class BulletinsScreen extends ConsumerWidget {
  final String? studentId;
  const BulletinsScreen({super.key, this.studentId});

  Color _avgColor(double? avg) {
    if (avg == null) return AppTheme.textSub;
    if (avg >= 14) return AppTheme.success;
    if (avg >= 10) return AppTheme.primary;
    return AppTheme.danger;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(bulletinsProvider(studentId));

    return Scaffold(
      appBar: AppBar(title: const Text('Bulletins de notes')),
      body: ParentPaywallGate(
        featureName: 'Les bulletins scolaires',
        featureKey: 'bulletins',
        child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error:   (e, _) => Center(child: Text('Erreur : $e', style: const TextStyle(color: AppTheme.danger))),
        data: (data) {
          final terms = data['terms'] as List<dynamic>? ?? [];
          if (terms.isEmpty) {
            return const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.description_outlined, size: 48, color: AppTheme.textSub),
                  SizedBox(height: 12),
                  Text('Aucun bulletin disponible.', style: TextStyle(color: AppTheme.textSub)),
                ],
              ),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: terms.length,
            itemBuilder: (ctx, i) {
              final term    = terms[i] as Map<String, dynamic>;
              final avg     = term['average'] != null ? double.tryParse(term['average'].toString()) : null;
              final color   = _avgColor(avg);
              final count   = term['grade_count'] as int? ?? 0;
              final termId  = term['term_id'] as String? ?? '';

              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppTheme.border),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6)],
                ),
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  leading: Container(
                    width: 48, height: 48,
                    decoration: BoxDecoration(color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
                    child: Center(
                      child: Text(
                        avg != null ? avg.toStringAsFixed(1) : '—',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: color),
                      ),
                    ),
                  ),
                  title: Text(
                    term['term_name'] as String? ?? 'Trimestre',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.textMain),
                  ),
                  subtitle: Text(
                    '$count note${count > 1 ? 's' : ''} enregistrée${count > 1 ? 's' : ''}',
                    style: const TextStyle(fontSize: 12, color: AppTheme.textSub),
                  ),
                  trailing: const Icon(Icons.picture_as_pdf_rounded, color: AppTheme.danger),
                  onTap: () {
                    final sid = studentId;
                    final path = sid != null
                        ? '/parent/child/$sid/bulletins/$termId'
                        : '/bulletins/$termId';
                    context.push(path);
                  },
                ),
              );
            },
          );
        },
      ),
      ),
    );
  }
}
