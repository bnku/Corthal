use std::ffi::{OsStr, OsString};
use std::os::unix::ffi::{OsStrExt, OsStringExt};

/// Filters out `appmenu-gtk-module` from GTK module environment variables.
///
/// On certain Linux desktop environments (like Cinnamon/X11), stale or missing
/// appmenu modules in `GTK_MODULES` / `GTK3_MODULES` cause GTK warnings or crashes.
pub fn without_appmenu_module(value: &OsStr) -> Option<OsString> {
    let modules: Vec<_> = value.as_bytes().split(|byte| *byte == b':').collect();
    let filtered: Vec<_> = modules
        .iter()
        .copied()
        .filter(|module| {
            let name = module
                .trim_ascii()
                .rsplit(|byte| *byte == b'/')
                .next()
                .unwrap_or_default();
            !matches!(
                name,
                b"appmenu-gtk-module"
                    | b"appmenu-gtk-module.so"
                    | b"libappmenu-gtk-module"
                    | b"libappmenu-gtk-module.so"
            )
        })
        .collect();

    (filtered.len() != modules.len()).then(|| OsString::from_vec(filtered.join(&b':')))
}

pub const WEBKIT_DISABLE_DMABUF_RENDERER: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";

/// Determines if the WebKit DMA-BUF renderer should be disabled.
///
/// Returns true if `WEBKIT_DISABLE_DMABUF_RENDERER` is not already explicitly set.
/// WebKitGTK 2.42+ uses DMA-BUF for hardware acceleration by default, which fails
/// with "Failed to create GBM buffer" on proprietary NVIDIA drivers on Linux,
/// resulting in a completely black/blank window.
pub fn should_disable_dmabuf_renderer(current_value: Option<&OsStr>) -> bool {
    current_value.is_none()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_appmenu_module() {
        assert_eq!(
            without_appmenu_module(OsStr::new("gail:atk-bridge:appmenu-gtk-module")),
            Some(OsString::from("gail:atk-bridge"))
        );
    }

    #[test]
    fn disables_dmabuf_when_unset() {
        assert!(should_disable_dmabuf_renderer(None));
    }

    #[test]
    fn respects_explicit_dmabuf_setting() {
        assert!(!should_disable_dmabuf_renderer(Some(OsStr::new("0"))));
        assert!(!should_disable_dmabuf_renderer(Some(OsStr::new("1"))));
    }
}
