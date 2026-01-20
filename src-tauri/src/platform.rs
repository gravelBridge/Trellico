use tauri::WebviewWindow;
use tauri_plugin_decorum::WebviewWindowExt;

/// Configure macOS-specific window customizations
pub fn setup_macos_window(main_window: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        // Set traffic light position
        main_window.set_traffic_lights_inset(16.0, 20.0).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[allow(deprecated)]
    {
        use cocoa::appkit::{NSColor, NSWindow};
        use cocoa::base::{id, nil};

        let ns_window = main_window.ns_window().unwrap() as id;
        unsafe {
            // Match the app background color: oklch(0.985 0.002 90) ≈ rgb(250, 249, 247)
            let bg_color = NSColor::colorWithRed_green_blue_alpha_(
                nil,
                250.0 / 255.0,
                249.0 / 255.0,
                247.0 / 255.0,
                1.0,
            );
            ns_window.setBackgroundColor_(bg_color);
        }
    }
}
