package com.classlink.classlink_mobile

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.SharedPreferences
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetProvider

/**
 * Widget écran d'accueil affichant le prochain cours de l'élève. Les données
 * sont écrites côté Dart via HomeWidget.saveWidgetData (voir
 * lib/core/services/home_widget_service.dart) à chaque rafraîchissement de
 * l'emploi du temps ; ce provider se contente de les relire et peindre la
 * RemoteViews — aucun appel réseau natif.
 */
class NextClassWidgetProvider : HomeWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences
    ) {
        appWidgetIds.forEach { widgetId ->
            val views = RemoteViews(context.packageName, R.layout.next_class_widget).apply {
                val title = widgetData.getString("next_class_title", null)
                val subtitle = widgetData.getString("next_class_subtitle", null)
                if (title != null) {
                    setTextViewText(R.id.widget_title, title)
                    setTextViewText(R.id.widget_subtitle, subtitle ?: "")
                } else {
                    setTextViewText(R.id.widget_title, "MyClassLink")
                    setTextViewText(R.id.widget_subtitle, "Ouvrez l'app pour voir votre prochain cours")
                }
            }
            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }
}
