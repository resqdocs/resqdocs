package app.resqdocs;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // #170: nativer Data-Matrix-Decoder (ZXing-C++, GMS-frei) — VOR super.onCreate registrieren.
        registerPlugin(DatamatrixDecoderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
