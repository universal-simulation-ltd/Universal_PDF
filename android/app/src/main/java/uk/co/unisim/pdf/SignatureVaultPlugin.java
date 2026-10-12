package uk.co.unisim.pdf;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyStore;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * "Lock saved signatures" (2026-10-12): the Android half of
 * `ios/App/App/SignatureVault.swift`, read by `src/lib/signatureVault.ts`.
 *
 * The key the web layer encrypts saved signatures with is itself encrypted by
 * an AndroidKeyStore key that can only be used after a fingerprint, face or the
 * screen lock (BIOMETRIC_STRONG | DEVICE_CREDENTIAL), checked per use through
 * BiometricPrompt's CryptoObject. The wrapped key lives in this app's private
 * SharedPreferences; nothing leaves the phone.
 *
 * Android 11 (API 30) and later, where a CryptoObject may be unlocked by the
 * screen lock as well as a biometric. Older phones report it unavailable and
 * the app does not offer the switch.
 */
@CapacitorPlugin(name = "SignatureVault")
public class SignatureVaultPlugin extends Plugin {

    private static final String ALIAS = "uk.co.unisim.pdf.signature-vault";
    private static final String PREFS = "signature-vault";
    private static final int AUTHENTICATORS =
            BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    private boolean supported() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false;
        return BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS) == BiometricManager.BIOMETRIC_SUCCESS;
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        boolean ok = supported();
        ret.put("available", ok);
        ret.put("biometry", ok ? "biometric" : "none");
        call.resolve(ret);
    }

    @PluginMethod
    public void createKey(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || !supported()) {
            call.reject("Not available", "UNAVAILABLE");
            return;
        }
        try {
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS);
            KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            gen.init(wrappingKeySpec());
            SecretKey wrap = gen.generateKey();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, wrap);
            prompt(call, cipher, "Lock your saved signatures", (c) -> {
                byte[] dataKey = new byte[32];
                new SecureRandom().nextBytes(dataKey);
                byte[] sealed = c.doFinal(dataKey);
                prefs().edit()
                        .putString("iv", Base64.encodeToString(c.getIV(), Base64.NO_WRAP))
                        .putString("ct", Base64.encodeToString(sealed, Base64.NO_WRAP))
                        .apply();
                JSObject ret = new JSObject();
                ret.put("key", Base64.encodeToString(dataKey, Base64.NO_WRAP));
                call.resolve(ret);
            });
        } catch (Exception e) {
            call.reject("Could not make a key", e);
        }
    }

    @PluginMethod
    public void getKey(PluginCall call) {
        if (!supported()) { call.reject("Not available", "UNAVAILABLE"); return; }
        String iv = prefs().getString("iv", null);
        String ct = prefs().getString("ct", null);
        if (iv == null || ct == null) { call.reject("No key", "NO_KEY"); return; }
        try {
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            SecretKey wrap = (SecretKey) ks.getKey(ALIAS, null);
            if (wrap == null) { call.reject("No key", "NO_KEY"); return; }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, wrap, new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            prompt(call, cipher, "Unlock your saved signatures", (c) -> {
                byte[] dataKey = c.doFinal(Base64.decode(ct, Base64.NO_WRAP));
                JSObject ret = new JSObject();
                ret.put("key", Base64.encodeToString(dataKey, Base64.NO_WRAP));
                call.resolve(ret);
            });
        } catch (Exception e) {
            call.reject("Could not read the key", e);
        }
    }

    @PluginMethod
    public void deleteKey(PluginCall call) {
        try {
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS);
        } catch (Exception ignored) { /* nothing to delete */ }
        prefs().edit().clear().apply();
        call.resolve();
    }

    /** Usable only straight after a fingerprint, face or screen-lock check. */
    @RequiresApi(Build.VERSION_CODES.R)
    private KeyGenParameterSpec wrappingKeySpec() {
        return new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(true)
                .setUserAuthenticationParameters(0,
                        KeyProperties.AUTH_BIOMETRIC_STRONG | KeyProperties.AUTH_DEVICE_CREDENTIAL)
                .build();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private interface WithCipher {
        void run(Cipher cipher) throws Exception;
    }

    private void prompt(PluginCall call, Cipher cipher, String fallbackTitle, WithCipher onOk) {
        String title = call.getString("reason", fallbackTitle);
        getActivity().runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(getActivity(), ContextCompat.getMainExecutor(getContext()),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                            try {
                                BiometricPrompt.CryptoObject co = result.getCryptoObject();
                                onOk.run(co != null && co.getCipher() != null ? co.getCipher() : cipher);
                            } catch (Exception e) {
                                call.reject("Could not use the key", e);
                            }
                        }

                        @Override
                        public void onAuthenticationError(int code, @NonNull CharSequence msg) {
                            call.reject(msg.toString(), "CANCELLED");
                        }
                    });
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setAllowedAuthenticators(AUTHENTICATORS)
                    .build();
            prompt.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
        });
    }
}
