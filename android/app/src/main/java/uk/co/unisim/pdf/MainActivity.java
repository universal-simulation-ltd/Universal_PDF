package uk.co.unisim.pdf;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "UniversalPdf";

    /**
     * ⚠️ ANDROID REPLAYS THE DOCUMENT INTENT FOR THE LIFE OF THE TASK, and it
     * is a bug the JavaScript side cannot see, let alone fix.
     *
     * When WhatsApp (or any chooser) hands over a PDF, the ACTION_VIEW intent
     * carrying `content://…/item/<uuid>` becomes this task's BASE INTENT, and
     * the task outlives the process. Every later launch that resolves to that
     * task recreates this activity from the remembered intent, so `getIntent()`
     * returns the old VIEW, Capacitor's Bridge copies its data into `intentUri`
     * in its constructor, and `App.getLaunchUrl()` hands the web layer a
     * document nobody asked for.
     *
     * Measured on a Nothing Phone (Android 16), three cases, printed by a probe
     * build of this file:
     *
     *   A  cold start, real hand-over    savedState=false  getIntent()=the document
     *   B  restored task, launcher tap   savedState=true   getIntent()=STALE,
     *                                                      then onNewIntent(MAIN, null)
     *   C  restored task, NEW hand-over  savedState=true   getIntent()=STALE,
     *                                                      then onNewIntent(the new document)
     *
     * So `savedInstanceState` is the discriminator, and the rule it encodes is
     * simply: WHEN THE ACTIVITY IS BEING RESTORED, `getIntent()` IS A MEMORY,
     * NOT A REQUEST. Whatever the user actually just did arrives afterwards
     * through `onNewIntent` — which Capacitor already forwards as `appUrlOpen`
     * — so dropping the remembered document here loses nothing and un-breaks
     * both B (the app reopened the last WhatsApp PDF instead of its own front
     * page — and once the URI grant lapsed, failed doing it) and C, where the
     * app read the stale document AND the new one and raced over which of the
     * two the user ended up looking at.
     *
     * ⚠️ Blanking BEFORE `super.onCreate()` is load-bearing: the Bridge is
     * constructed inside `BridgeActivity.onCreate` and reads `getIntent()`
     * there, so a later `setIntent` would be read by nobody. The action is
     * cleared as well as the data because `AppPlugin.handleOnNewIntent` gates
     * on ACTION_VIEW, and `BridgeActivity.load()` re-fires this very intent.
     *
     * Fails open: `savedInstanceState == null` is left completely alone, so a
     * genuine hand-over still opens even if Android someday stops saving state
     * here. Showing a document the user did not ask for is a bug; dropping one
     * they did is a worse one.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        Intent intent = getIntent();
        if (savedInstanceState != null
                && intent != null
                && Intent.ACTION_VIEW.equals(intent.getAction())
                && intent.getData() != null) {
            Log.i(TAG, "restored task: dropping remembered launch document; "
                    + "a real one, if any, follows via onNewIntent");
            intent.setAction(Intent.ACTION_MAIN);
            intent.setData(null);
            setIntent(intent);
        }
        super.onCreate(savedInstanceState);
    }
}
