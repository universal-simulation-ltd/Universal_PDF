package uk.co.unisim.pdf;

import android.app.Activity;
import android.net.Uri;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanner;
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;

import org.json.JSONArray;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;
import java.util.UUID;

/**
 * "Scan a document": Google's ML Kit Document Scanner, which finds the page,
 * flattens it, takes several pages, lets the user retake one and also import
 * from the photo library. It is a screen Google Play services provides and
 * runs on the phone — the app never needs the CAMERA permission for it,
 * because the camera is opened by Play services, not by us.
 *
 * The scanner hands back its pages as image URIs. Each is copied into our own
 * {@code cache/scans/} and the web layer gets those file URLs
 * ({@code src/lib/documentScanner.ts}), reads them through Capacitor's file
 * server and calls {@code cleanup} to delete them straight after. Copying
 * rather than passing the scanner's own URIs through means the web layer only
 * ever sees a plain file:// path, whatever scheme a future Play services
 * release decides to answer with.
 *
 * ⚠️ Needs Google Play services. On a phone without them (Huawei, most de-
 * Googled ROMs) {@code isAvailable} answers false and the web layer never
 * shows the button.
 *
 * ⚠️ Registered by {@code MainActivity}, not by {@code npx cap sync}: this
 * plugin lives in the app project, and sync only knows about npm packages.
 */
@CapacitorPlugin(name = "DocumentScanner")
public class DocumentScannerPlugin extends Plugin {

    private static final String SCAN_DIR = "scans";

    private ActivityResultLauncher<IntentSenderRequest> launcher;
    /** The call waiting on the scanner. One scan at a time. */
    private PluginCall pending;

    /**
     * ⚠️ The launcher must be registered before the activity is STARTED, or
     * AndroidX throws. {@code load()} runs while the Bridge is being built,
     * inside {@code BridgeActivity.onCreate}, which is early enough — the same
     * moment Capacitor registers its own {@code @ActivityCallback} launchers,
     * and through the same {@code Bridge} method, which also covers a bridge
     * hosted in a fragment.
     */
    @Override
    public void load() {
        launcher = getBridge().registerForActivityResult(
                new ActivityResultContracts.StartIntentSenderForResult(),
                this::onScanResult);
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        int status = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext());
        JSObject ret = new JSObject();
        ret.put("available", status == ConnectionResult.SUCCESS);
        call.resolve(ret);
    }

    @PluginMethod
    public void scan(PluginCall call) {
        if (pending != null) {
            call.reject("A scan is already in progress", "BUSY");
            return;
        }
        pending = call;
        GmsDocumentScannerOptions options = new GmsDocumentScannerOptions.Builder()
                .setGalleryImportAllowed(true)
                .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
                .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
                .build();
        GmsDocumentScanner scanner = GmsDocumentScanning.getClient(options);
        scanner.getStartScanIntent(getActivity())
                .addOnSuccessListener(sender ->
                        launcher.launch(new IntentSenderRequest.Builder(sender).build()))
                .addOnFailureListener(e -> {
                    // Typically: Play services is still downloading the
                    // scanner module, or the device is below its RAM floor.
                    PluginCall c = pending;
                    pending = null;
                    if (c != null) c.reject(e.getMessage() != null ? e.getMessage() : "Scanner unavailable", "UNAVAILABLE", e);
                });
    }

    private void onScanResult(ActivityResult result) {
        PluginCall call = pending;
        pending = null;
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject ret = new JSObject();
            ret.put("pages", new JSArray());
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }

        GmsDocumentScanningResult scan = GmsDocumentScanningResult.fromActivityResultIntent(result.getData());
        List<GmsDocumentScanningResult.Page> pages = scan != null ? scan.getPages() : null;
        if (pages == null || pages.isEmpty()) {
            JSObject ret = new JSObject();
            ret.put("pages", new JSArray());
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }

        // Off the main thread: copying a dozen full-size JPEGs is real I/O.
        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), SCAN_DIR);
                if (!dir.isDirectory() && !dir.mkdirs()) throw new Exception("Could not create " + dir);
                String batch = UUID.randomUUID().toString();
                JSArray out = new JSArray();
                for (int i = 0; i < pages.size(); i++) {
                    Uri src = pages.get(i).getImageUri();
                    File dst = new File(dir, batch + "-" + (i + 1) + ".jpg");
                    try (InputStream in = getContext().getContentResolver().openInputStream(src);
                         OutputStream os = new FileOutputStream(dst)) {
                        if (in == null) throw new Exception("Could not read page " + (i + 1));
                        byte[] buf = new byte[64 * 1024];
                        int n;
                        while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                    }
                    out.put(Uri.fromFile(dst).toString());
                    // The scanner's own copy, if it is a file we can reach.
                    if ("file".equals(src.getScheme()) && src.getPath() != null) {
                        //noinspection ResultOfMethodCallIgnored
                        new File(src.getPath()).delete();
                    }
                }
                JSObject ret = new JSObject();
                ret.put("pages", out);
                ret.put("cancelled", false);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Could not save the scan", "WRITE_FAILED", e);
            }
        }).start();
    }

    /** Delete the page files named in {@code pages} — only ones inside our own cache/scans/. */
    @PluginMethod
    public void cleanup(PluginCall call) {
        try {
            String root = new File(getContext().getCacheDir(), SCAN_DIR).getCanonicalPath() + File.separator;
            JSONArray list = call.getArray("pages", new JSArray());
            for (int i = 0; i < list.length(); i++) {
                Uri uri = Uri.parse(list.optString(i, ""));
                if (!"file".equals(uri.getScheme()) || uri.getPath() == null) continue;
                File f = new File(uri.getPath());
                if (f.getCanonicalPath().startsWith(root)) {
                    //noinspection ResultOfMethodCallIgnored
                    f.delete();
                }
            }
        } catch (Exception ignored) {
            // Best effort: what is left is in the cache, which Android clears.
        }
        call.resolve();
    }
}
