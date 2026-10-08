#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Registrierung des nativen iOS-Data-Matrix-Decoders (Apple Vision).
// Plugin-Name "DatamatrixDecoder" == Android-Plugin -> gleiche TS-Bridge (registerPlugin).
CAP_PLUGIN(DatamatrixDecoderPlugin, "DatamatrixDecoder",
    CAP_PLUGIN_METHOD(decode, CAPPluginReturnPromise);
)
