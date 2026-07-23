package be.beerdex.app.offline

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.widget.RemoteViews
import org.json.JSONObject
import be.beerdex.app.offline.R

/**
 * BeerdexWidgetProvider
 * 
 * Native Android home screen widget for Beerdex.
 * Reads BAC data from SharedPreferences (written by capacitor-widget-bridge)
 * and renders the current BAC status, time-to-drive, and monthly tasting count.
 * 
 * Auto-refreshes every 30 minutes via updatePeriodMillis.
 * Instant refresh triggered by the bridge plugin's reloadAllTimelines().
 */
class BeerdexWidgetProvider : AppWidgetProvider() {

    companion object {
        private const val PREFS_NAME = "beerdex_widget"

        /**
         * Utility to update all existing widget instances.
         * Called by Capacitor bridge plugin on reloadAllTimelines().
         */
        fun updateAllWidgets(context: Context) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val provider = ComponentName(context, BeerdexWidgetProvider::class.java)
            val widgetIds = appWidgetManager.getAppWidgetIds(provider)
            if (widgetIds.isNotEmpty()) {
                val intent = Intent(context, BeerdexWidgetProvider::class.java).apply {
                    action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, widgetIds)
                }
                context.sendBroadcast(intent)
            }
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    private fun updateWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int
    ) {
        // --- NATIVE BLINDAGE (v2.7.1) ---
        // Global try-catch to ensure that even if the server sends malformed data
        // or a resource fails, the app process does NOT crash.
        try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

            // 1. Read consolidated JSON
            val jsonDataStr = prefs.getString("widget_data_json", "") ?: ""
            val json = try {
                if (jsonDataStr.isNotEmpty()) JSONObject(jsonDataStr) else null
            } catch (e: Exception) {
                null
            }

            // 2. Extract values (Safe optString uses empty string as fallback)
            val bacValue = json?.optString("bac_value") ?: prefs.getString("bac_value", "0.00") ?: "0.00"
            val bacColorStr = json?.optString("bac_color") ?: prefs.getString("bac_color", "#4CAF50") ?: "#4CAF50"
            val bacTitle = json?.optString("bac_title") ?: prefs.getString("bac_title", "") ?: ""
            val bacMessage = json?.optString("bac_message") ?: prefs.getString("bac_message", "") ?: ""
            val timeToDrive = json?.optString("time_to_drive") ?: prefs.getString("time_to_drive", "✅") ?: "✅"
            val monthlyCount = json?.optString("monthly_count") ?: prefs.getString("monthly_count", "0") ?: "0"
            val vehicleEmoji = json?.optString("vehicle_emoji") ?: "🚗"
            
            val bacChartBase64 = prefs.getString("bac_chart_base64", "") ?: ""

            // 3. Parse color safely
            val bacColor = try {
                Color.parseColor(bacColorStr)
            } catch (e: Exception) {
                Color.parseColor("#4CAF50")
            }

            // 4. Build RemoteViews
            val views = RemoteViews(context.packageName, R.layout.widget_beerdex_status)

            views.setTextViewText(R.id.widget_bac_value, bacValue)
            views.setTextColor(R.id.widget_bac_value, bacColor)
            views.setTextViewText(R.id.widget_bac_title, bacTitle)

            if (bacMessage.isNotEmpty()) {
                views.setTextViewText(R.id.widget_bac_message, bacMessage)
                views.setViewVisibility(R.id.widget_bac_message, android.view.View.VISIBLE)
            } else {
                views.setViewVisibility(R.id.widget_bac_message, android.view.View.GONE)
            }

            // 5. Safe Chart Graphic (w/ Downsampling Failsafe for oversized server data)
            if (bacChartBase64.isNotEmpty()) {
                val bitmap = decodeSampledBitmapFromBase64(bacChartBase64, 400, 300)
                if (bitmap != null) {
                    views.setImageViewBitmap(R.id.widget_chart, bitmap)
                    views.setViewVisibility(R.id.widget_chart, android.view.View.VISIBLE)
                } else {
                    views.setViewVisibility(R.id.widget_chart, android.view.View.GONE)
                }
            } else {
                views.setViewVisibility(R.id.widget_chart, android.view.View.GONE)
            }

            views.setTextViewText(R.id.widget_time_drive, "$vehicleEmoji $timeToDrive")
            views.setTextViewText(R.id.widget_monthly, "📊 $monthlyCount ce mois")
            views.setInt(R.id.widget_accent_bar, "setBackgroundColor", bacColor)

            // Click intent
            context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launchIntent ->
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                val pendingIntent = PendingIntent.getActivity(
                    context, 0, launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)

        } catch (e: Exception) {
            // Failsafe: Log error but DO NOT crash the process
            e.printStackTrace()
        }
    }

    /**
     * Decodes a Base64 string into a Bitmap with optional downsampling.
     * Prevents TransactionTooLargeException if the input is too large (like from old website code).
     */
    private fun decodeSampledBitmapFromBase64(base64: String, reqWidth: Int, reqHeight: Int): Bitmap? {
        return try {
            val bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
            
            // First decode with inJustDecodeBounds=true to check dimensions
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)

            // Calculate inSampleSize
            options.inSampleSize = calculateInSampleSize(options, reqWidth, reqHeight)

            // Decode bitmap with inSampleSize set
            options.inJustDecodeBounds = false
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
        } catch (e: Exception) {
            null
        }
    }

    private fun calculateInSampleSize(options: BitmapFactory.Options, reqWidth: Int, reqHeight: Int): Int {
        val (height: Int, width: Int) = options.outHeight to options.outWidth
        var inSampleSize = 1

        if (height > reqHeight || width > reqWidth) {
            val halfHeight: Int = height / 2
            val halfWidth: Int = width / 2
            while (halfHeight / inSampleSize >= reqHeight && halfWidth / inSampleSize >= reqWidth) {
                inSampleSize *= 2
            }
        }
        return inSampleSize
    }

    override fun onEnabled(context: Context) {
        // Widget added for the first time — no special action needed
    }

    override fun onDisabled(context: Context) {
        // All widgets removed — no special action needed
    }
}
