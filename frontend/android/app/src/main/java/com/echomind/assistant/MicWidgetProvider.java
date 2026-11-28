package com.echomind.assistant;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/**
 * Home-screen mic widget: one tap opens EchoMind and starts voice
 * input, so Mahdi can talk hands-free (train, bus, ship) without
 * hunting for the app icon.
 *
 * <p>The tap fires the same deep link the persistent notification's
 * "Speak" action uses ({@code echomind://assistant?listen=1}).
 * MainActivity is singleTask, so a tap while the app is open brings
 * it forward and delivers the link through Capacitor's
 * {@code appUrlOpen} event; on a cold start the launch URL is read
 * back the same way. The web side starts the existing Persian
 * (fa-IR) speech recogniser - the widget itself holds no logic
 * beyond the tap.
 */
public class MicWidgetProvider extends AppWidgetProvider {

    /** Deep link shared with the notification action: open + listen. */
    public static final String LISTEN_DEEP_LINK = "echomind://assistant?listen=1";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(LISTEN_DEEP_LINK));
            intent.setClass(context, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                    context, 0, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_mic);
            views.setOnClickPendingIntent(R.id.widget_mic_root, pendingIntent);
            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}
