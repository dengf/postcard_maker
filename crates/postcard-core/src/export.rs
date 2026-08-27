use serde::{Deserialize, Serialize};

/// The finished postcard's file format. JPEG for photos (small, lossy,
/// what every mail client and "Save Image" expects); PNG only because a
/// sticker/text layer with transparency at the edges could otherwise band
/// under JPEG's chroma subsampling -- exposed for completeness, JPEG is
/// the default in the UI.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ExportFormat {
    Jpeg { quality: u8 },
    Png,
}

impl ExportFormat {
    pub fn mime(self) -> &'static str {
        match self {
            ExportFormat::Jpeg { .. } => "image/jpeg",
            ExportFormat::Png => "image/png",
        }
    }
}
