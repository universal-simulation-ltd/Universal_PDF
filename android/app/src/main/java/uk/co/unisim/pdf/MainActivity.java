package uk.co.unisim.pdf;

import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.UUID;

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
        // This project's own plugins, which `npx cap sync` does not know
        // about. Before super.onCreate: the Bridge is built there and only
        // loads what is registered by then.
        registerPlugin(DocumentScannerPlugin.class);
        registerPlugin(AppActionsPlugin.class);
        registerPlugin(SignatureVaultPlugin.class);
        registerPlugin(PhotoLibraryPlugin.class);
        super.onCreate(savedInstanceState);
        // Same rule as the VIEW intent above: a restored activity's intent is
        // a memory, so only a fresh launch can carry a shortcut or a share.
        if (savedInstanceState == null) queueAction(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        queueAction(intent);
    }

    /** Action of the launcher's "Scan to PDF" shortcut (res/xml/shortcuts.xml). */
    static final String ACTION_SCAN = "uk.co.unisim.pdf.action.SCAN";
    private static final String HANDLED = "uk.co.unisim.pdf.actionHandled";

    /**
     * Shortcuts and share targets become actions for the web layer
     * (AppActionsPlugin, src/lib/appActions.ts). The two share targets are
     * activity-aliases of this activity (AndroidManifest.xml), so the alias
     * the user picked in the share sheet says which action it was.
     *
     * The shared PDF is copied into the app's cache straight away: the read
     * grant a share comes with only lasts as long as the sending app wants,
     * and the web layer reads the file a moment later.
     */
    private void queueAction(Intent intent) {
        if (intent == null || intent.getBooleanExtra(HANDLED, false)) return;
        String action = intent.getAction();
        // ⚠️ Once only: BridgeActivity.load() re-fires the launch intent through
        // onNewIntent, which queued every share twice (seen on the emulator,
        // 2026-10-12). Marking the very intent object stops the second pass.
        if (ACTION_SCAN.equals(action) || Intent.ACTION_SEND.equals(action)) intent.putExtra(HANDLED, true);
        if (ACTION_SCAN.equals(action)) {
            JSObject a = new JSObject();
            a.put("type", "scan");
            AppActionsPlugin.enqueue(a);
            return;
        }
        if (!Intent.ACTION_SEND.equals(action)) return;
        ComponentName component = intent.getComponent();
        String alias = component == null ? "" : component.getClassName();
        String type = alias.endsWith(".ShareCompress") ? "compress" : alias.endsWith(".ShareSign") ? "sign" : null;
        Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (type == null || stream == null) return;
        try {
            File dir = new File(getCacheDir(), "shortcuts");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("no cache dir");
            File out = new File(dir, UUID.randomUUID().toString().substring(0, 8) + "-document.pdf");
            try (InputStream in = getContentResolver().openInputStream(stream);
                 OutputStream os = new FileOutputStream(out)) {
                if (in == null) throw new Exception("nothing to read");
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            }
            JSObject a = new JSObject();
            a.put("type", type);
            a.put("file", Uri.fromFile(out).toString());
            AppActionsPlugin.enqueue(a);
        } catch (Exception e) {
            Log.e(TAG, "Could not take the shared PDF", e);
        }
    }
}
