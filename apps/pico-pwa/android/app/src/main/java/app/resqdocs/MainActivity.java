package app.resqdocs;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // #170: nativer Data-Matrix-Decoder (ZXing-C++, GMS-frei) — VOR super.onCreate registrieren.
        registerPlugin(DatamatrixDecoderPlugin.class);
        super.onCreate(savedInstanceState);
    }

    // @capgo/capacitor-social-login: der Google-Scope-Autorisierungsflow (drive.appdata) läuft über
    // startActivityForResult -> das Ergebnis MUSS hier ans Plugin durchgereicht werden, sonst schlägt
    // login() mit „You CANNOT use scopes without modifying the main activity" fehl.
    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
                && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
            if (pluginHandle == null) {
                Log.i("Google Activity Result", "SocialLogin handle is null");
                return;
            }
            Plugin plugin = pluginHandle.getInstance();
            if (!(plugin instanceof SocialLoginPlugin)) {
                Log.i("Google Activity Result", "SocialLogin plugin instance is not SocialLoginPlugin");
                return;
            }
            ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }

    // Marker-Methode des Interfaces: signalisiert dem Plugin, dass die Activity den Scope-Flow durchreicht.
    // Ohne implements ModifiedMainActivityForSocialLoginPlugin lehnt GoogleProvider login() mit Scopes sofort ab.
    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}
}
