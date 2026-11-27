package com.echomind.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import java.util.Locale;

/**
 * Persistent Speak notification, posted from native code (round 3).
 *
 * <p>Why native: the Capacitor LocalNotifications plugin hardcodes
 * every notification it posts to VISIBILITY_PRIVATE
 * (LocalNotificationManager.java, v7.0.4), so the Speak card could
 * only ever show on the lock screen redacted — and on Mahdi's phone
 * it showed nothing at all. No JS API can set it PUBLIC. This class
 * posts the same notification from the app's own Java with
 * VISIBILITY_PUBLIC on the notification itself (and PUBLIC on the
 * channel), so the full "EchoMind — Tap Speak to talk" card shows on
 * the lock screen. Framework classes only (android.app.Notification)
 * — no new dependency.
 *
 * <p>Same id (1) and channel (echomind-voice) the JS plugin used:
 * the home-screen badge "1" is this notification, and posting the
 * same id replaces an old PRIVATE card instead of duplicating it.
 * Called from MainActivity.onResume, so the card self-heals on every
 * app open — after a reboot, a force-stop, or a permission granted
 * later in Settings. Tapping the card (or its Speak action) fires
 * the same deep link the home-screen widget uses
 * (echomind://assistant?listen=1): MainActivity is singleTask, so a
 * tap while the app is open brings it forward and delivers the link
 * through Capacitor's appUrlOpen event, which starts listening.
 *
 * <p>Lock-screen truth: even a PUBLIC notification is hidden when
 * the phone itself disables lock-screen notifications (Settings →
 * Lock screen → Notifications) or hides notification content. If
 * the card still shows nothing after this build, that phone setting
 * is the remaining cause.
 */
public final class SpeakNotification {

    /** Same id the JS plugin used (1): the home-screen badge "1". */
    public static final int NOTIFICATION_ID = 1;

    /** Same channel the JS plugin created (echomind-voice). */
    public static final String CHANNEL_ID = "echomind-voice";

    private SpeakNotification() {}

    /** Post (or replace) the ongoing Speak notification. Safe to call
        on every resume: the same id replaces the visible card and
        does not re-ping. Does nothing when the notification service
        is unavailable, and silently drops the post when
        POST_NOTIFICATIONS is not granted (Android 13+). */
    public static void ensure(Context context) {
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // createNotificationChannel ignores an existing channel,
            // so the channel created by the old JS build (already
            // PUBLIC at channel level) is left exactly as it is.
            if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID, "EchoMind voice", NotificationManager.IMPORTANCE_DEFAULT);
                channel.setDescription("EchoMind always-on voice shortcut");
                channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                manager.createNotificationChannel(channel);
            }
        }

        // The device locale is the best Java-side approximation of
        // the app's language (the JS locale lives in WebView storage,
        // which Java cannot read).
        boolean fa = Locale.getDefault().getLanguage().equals("fa");
        String speak = fa ? "صحبت کن" : "Speak";
        String body = fa
                ? "برای صحبت با اکومایند، «صحبت کن» را بزنید"
                : "Tap Speak to talk to EchoMind";

        // Same deep link + PendingIntent shape as the home-screen
        // widget (MicWidgetProvider): an explicit intent at
        // MainActivity, FLAG_IMMUTABLE for Android 12+.
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(MicWidgetProvider.LISTEN_DEEP_LINK));
        intent.setClass(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(context);
            builder.setPriority(Notification.PRIORITY_DEFAULT);
        }
        builder
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("EchoMind")
                .setContentText(body)
                .setOngoing(true)
                .setAutoCancel(false)
                // The fix: the notification itself is PUBLIC, so the
                // lock screen shows the full card, not a redaction.
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setContentIntent(pendingIntent)
                .addAction(android.R.drawable.ic_btn_speak_now, speak, pendingIntent);

        try {
            manager.notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS not granted (Android 13+): the post
            // is dropped. The JS permission gate asks the owner once;
            // only Settings can grant it after a denial.
        }
    }
}
