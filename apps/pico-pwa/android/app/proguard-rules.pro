# R8-Regeln der App. Capacitor, die Plugins, zxing-cpp, CameraX, Room und SQLCipher bringen ihre
# Keep-Regeln selbst mit (Consumer-Regeln in den AARs); hier steht nur, was die App zusaetzlich braucht.
#
# Eigener Code ist ohne Zusatzregel sicher: ScannerPlugin erbt von com.getcapacitor.Plugin (Capacitor-Regel
# haelt die Klasse vollstaendig), ScanActivity/MainActivity stehen im Manifest, Intent-Extras sind nur
# einfache Typen und Arrays, Formatnamen kommen aus zxingcpp.** (von zxing-cpp gehalten).

# Zeilennummern in Absturzberichten (Play Console entschluesselt mit der mapping.txt aus dem AAB);
# der echte Dateiname wird nicht mitgeliefert.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
