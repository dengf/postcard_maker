use serde::{Deserialize, Serialize};

/// Everything `process_photo` needs besides the raw photo bytes, which
/// travel as a separate `&[u8]` argument -- see `photo.rs`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessPhotoParams {
    pub crop_x: u32,
    pub crop_y: u32,
    pub crop_w: u32,
    pub crop_h: u32,
    #[serde(default)]
    pub brightness: f32,
    #[serde(default = "one")]
    pub contrast: f32,
    #[serde(default = "one")]
    pub saturation: f32,
    pub filter: String,
    /// `0` means "no limit" -- see `postcard_calc::pipeline::resize_to_fit`.
    #[serde(default)]
    pub max_dimension: u32,
    pub format: String,
    #[serde(default = "default_quality")]
    pub quality: u8,
}

fn one() -> f32 {
    1.0
}

fn default_quality() -> u8 {
    88
}

#[derive(Debug, Serialize)]
pub struct RectDto {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

impl From<postcard_core::Rect> for RectDto {
    fn from(r: postcard_core::Rect) -> Self {
        Self {
            x: r.x,
            y: r.y,
            w: r.w,
            h: r.h,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct NormRectDto {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl From<postcard_core::NormRect> for NormRectDto {
    fn from(r: postcard_core::NormRect) -> Self {
        Self {
            x: r.x,
            y: r.y,
            w: r.w,
            h: r.h,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateGeometryDto {
    pub safe_margin: f32,
    pub photo_area: NormRectDto,
    pub blank_area: NormRectDto,
    pub stamp_box: NormRectDto,
    pub message_area: NormRectDto,
}

impl From<postcard_calc::TemplateGeometry> for TemplateGeometryDto {
    fn from(g: postcard_calc::TemplateGeometry) -> Self {
        Self {
            safe_margin: g.safe_margin,
            photo_area: g.photo_area.into(),
            blank_area: g.blank_area.into(),
            stamp_box: g.stamp_box.into(),
            message_area: g.message_area.into(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct CollageSlotDto {
    pub area: NormRectDto,
}

impl From<postcard_core::CollageSlot> for CollageSlotDto {
    fn from(s: postcard_core::CollageSlot) -> Self {
        Self {
            area: s.area.into(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct CollageLayoutDto {
    pub id: String,
    pub slots: Vec<CollageSlotDto>,
}

impl From<&postcard_core::CollageLayout> for CollageLayoutDto {
    fn from(l: &postcard_core::CollageLayout) -> Self {
        Self {
            id: l.id.to_string(),
            slots: l.slots.iter().map(|&s| s.into()).collect(),
        }
    }
}
