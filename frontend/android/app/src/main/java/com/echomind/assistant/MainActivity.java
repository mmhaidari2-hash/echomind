package com.echomind.assistant;

import com.getcapacitor.BridgeActivity;

/**
 * MainActivity — the single Capacitor activity.
 *
 * Round 3: onResume re-posts the persistent Speak notification
 * (SpeakNotification.ensure). The JS LocalNotifications plugin
 * hardcodes VISIBILITY_PRIVATE, so it can never show the card on
 * the lock screen; the native post sets VISIBILITY_PUBLIC. onResume
 * runs on every return to the app (and after onCreate on a cold
 * start), so the card self-heals after a reboot, a force-stop, or
 * a permission granted later in Settings.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onResume() {
        super.onResume();
        SpeakNotification.ensure(this);
    }
}
