package uk.co.unisim.pdf;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * "Save to Photos" (2026-10-25): the Android half of
 * `ios/App/App/PhotoLibrary.swift`, read by `src/lib/photoLibrary.ts`. Each
 * page's picture goes into the Gallery under Pictures/&lt;the PDF's name&gt;.
 *
 * Android 10 (API 29) and later: MediaStore, which needs no permission at all
 * for an app adding its own pictures. Android 7–9 (API 24–28): the shared
 * Pictures folder, which needs WRITE_EXTERNAL_STORAGE (declared with
 * maxSdkVersion 28 in the manifest, so newer phones never see the prompt),
 * then a media scan so the Gallery shows them. Nothing leaves the phone.
 */
@CapacitorPlugin(
    name = "PhotoLibrary",
    permissions = { @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage") }
)
public class PhotoLibraryPlugin extends Plugin {

    private static boolean legacy() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q;
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (!legacy() || getPermissionState("storage") == PermissionState.GRANTED) {
            resolveAccess(call, true);
            return;
        }
        requestPermissionForAlias("storage", call, "storageAnswered");
    }

    @PermissionCallback
    private void storageAnswered(PluginCall call) {
        resolveAccess(call, getPermissionState("storage") == PermissionState.GRANTED);
    }

    private void resolveAccess(PluginCall call, boolean granted) {
        JSObject out = new JSObject();
        out.put("access", granted ? "granted" : "denied");
        call.resolve(out);
    }

    @PluginMethod
    public void saveImage(PluginCall call) {
        String b64 = call.getString("data");
        String name = call.getString("name", "page.png");
        String album = safe(call.getString("album", "Universal PDF"));
        if (b64 == null) {
            call.reject("No picture to save");
            return;
        }
        byte[] bytes;
        try {
            bytes = Base64.decode(b64, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("No picture to save");
            return;
        }
        String mime = name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
        try {
            if (legacy()) {
                if (getPermissionState("storage") != PermissionState.GRANTED) {
                    call.reject("Access refused", "DENIED");
                    return;
                }
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), album);
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Could not make " + dir);
                File file = new File(dir, safe(name));
                try (OutputStream out = new FileOutputStream(file)) {
                    out.write(bytes);
                }
                MediaScannerConnection.scanFile(getContext(), new String[] { file.getAbsolutePath() }, new String[] { mime }, null);
            } else {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, safe(name));
                values.put(MediaStore.Images.Media.MIME_TYPE, mime);
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + album);
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
                Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new Exception("The Gallery would not take the picture");
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) throw new Exception("The Gallery would not take the picture");
                    out.write(bytes);
                }
                values.clear();
                values.put(MediaStore.Images.Media.IS_PENDING, 0);
                resolver.update(uri, values, null, null);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Could not save the picture");
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /** A file or folder name with nothing a path would trip on. */
    private static String safe(String s) {
        String out = s == null ? "" : s.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        return out.isEmpty() ? "Universal PDF" : out;
    }
}
