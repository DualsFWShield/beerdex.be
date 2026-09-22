# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Keep Capacitor Core and Bridge
-keep public class com.getcapacitor.** { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep public class * extends com.getcapacitor.BridgeActivity { *; }
-keep public class * extends android.webkit.WebView { *; }

# Keep JavaScript Interfaces for Web-Native communication
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep annotations and attributes
-keepattributes *Annotation*
-keepattributes JavascriptInterface
-dontwarn com.getcapacitor.**

# Line numbers for crash reporting
-keepattributes SourceFile,LineNumberTable