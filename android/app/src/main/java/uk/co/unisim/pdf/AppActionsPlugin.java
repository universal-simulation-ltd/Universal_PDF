package uk.co.unisim.pdf;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/**
 * Shortcuts and share-sheet actions for the web layer (2026-10-12): the
 * Android half of `ios/App/App/AppActions.swift`, read by `src/lib/appActions.ts`.
 *
 * MainActivity turns the launcher's "Scan to PDF" shortcut and the two share
 * targets ("Sign with Universal PDF", "Make smaller with Universal PDF") into
 * actions and queues them here. JavaScript collects the queue with
 * `getPending()` on start and gets later ones as an `action` event.
 *
 * The queue is static because an action can arrive before the Bridge has
 * loaded this plugin (a cold start from the share sheet).
 */
@CapacitorPlugin(name = "AppActions")
public class AppActionsPlugin extends Plugin {

    private static final List<JSObject> pending = new ArrayList<>();
    private static AppActionsPlugin instance;

    static void enqueue(JSObject action) {
        AppActionsPlugin live;
        synchronized (pending) {
            pending.add(action);
            live = instance;
        }
        if (live != null) live.deliver();
    }

    @Override
    public void load() {
        synchronized (pending) {
            instance = this;
        }
    }

    /** Pushed only while JavaScript listens; otherwise it waits for getPending. */
    private void deliver() {
        if (!hasListeners("action")) return;
        List<JSObject> out;
        synchronized (pending) {
            out = new ArrayList<>(pending);
            pending.clear();
        }
        for (JSObject a : out) notifyListeners("action", a);
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        JSArray actions = new JSArray();
        synchronized (pending) {
            for (JSObject a : pending) actions.put(a);
            pending.clear();
        }
        JSObject ret = new JSObject();
        ret.put("actions", actions);
        call.resolve(ret);
    }
}
