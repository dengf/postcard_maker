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
    /// Degrees clockwise, with the crop above read in the *rotated*
    /// photo's coordinates. Defaults to zero so a draft saved before
    /// rotation existed -- and every caller that never turns a photo --
    /// keeps working untouched.
    #[serde(default)]
    pub rotation: f32,
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

/// The bounding box a photo occupies once it is turned -- the coordinate
/// space every rotated crop is expressed in.
#[derive(Debug, Serialize)]
pub struct SizeDto {
    pub w: u32,
    pub h: u32,
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

/// When a photo was taken, in the terms the message copy uses.
///
/// `season` is deliberately nullable: in the tropics there is no
/// four-season cycle to name, and inventing one would be worse than
/// saying nothing -- see `postcard_calc::moment::Belt`. Callers must
/// handle a moment that only knows a time of day.
///
/// The enums cross as strings rather than numbers, same convention as
/// `Vibe`'s own boundary: an i18n key is built from them in the host
/// layer, and a shifted integer would silently rename every season.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MomentDto {
    pub year: u16,
    pub month: u8,
    pub day: u8,
    pub hour: u8,
    pub season: Option<&'static str>,
    pub time_of_day: &'static str,
}

impl From<postcard_calc::Moment> for MomentDto {
    fn from(m: postcard_calc::Moment) -> Self {
        Self {
            year: m.year,
            month: m.month,
            day: m.day,
            hour: m.hour,
            season: m.season.map(|s| s.name()),
            time_of_day: m.time_of_day.name(),
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
