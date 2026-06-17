#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// #170: Registrierung des nativen iOS-Data-Matrix-Decoders (Apple Vision).
// Plugin-Name "DatamatrixDecoder" == Android-Plugin -> gleiche TS-Bridge (registerPlugin).
CAP_PLUGIN(DatamatrixDecoderPlugin, "DatamatrixDecoder",
    CAP_PLUGIN_METHOD(decode, CAPPluginReturnPromise);
)
