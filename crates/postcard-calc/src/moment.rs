//! When a photo was taken, in the terms a postcard would actually use:
//! a season and a time of day, read out of the photo's own EXIF metadata.
//!
//! This exists because "Suggest a look"'s message suggestions are keyed
//! off `vibe`'s ImageNet classifier, and that classifier is structurally
//! blind to most real postcard photos -- ImageNet has no "sunset" class,
//! no "night" class, and almost no person classes, so a portrait or a
//! group shot matches nothing however much curation goes into
//! `IMAGENET_CLASS_TO_VIBE`. A date needs no object recognition at all:
//! it works on a photo of people, a photo in the dark, and a photo of
//! nothing recognisable -- exactly the cases the model cannot help with.
//! Same role `exposure_suggestion` plays for tone, one signal further
//! along.
//!
//! **The download cost of this module is zero.** It reads bytes that are
//! already in the photo, so unlike every other signal in "Suggest a look"
//! it needs no model, and it therefore lives in the main `postcard-wasm`
//! bundle rather than the lazily-fetched `postcard-wasm-vibe` one -- a
//! date-based suggestion must not be gated behind a ~13MB download whose
//! whole point it sidesteps.
//!
//! Split the same way `vibe` is: [`read`] is the only part that touches
//! the EXIF parser, while [`season_for`] and [`time_of_day_for`] are
//! plain arithmetic, fully testable with no fixture at all.

use std::io::Cursor;

/// Which set of months counts as which season.
///
/// The third variant is the point of this type. Seasons-from-months is a
/// *temperate-zone* idea: it is upside down south of the equator, and in
/// the tropics it is simply wrong -- Singapore in December is not
/// "winter" in any sense a greeting could use, and this app's own
/// `location.js` uses `Asia/Singapore` as its worked example, so that is
/// not a hypothetical audience. [`season_for`] answers `None` for
/// `Tropical` rather than inventing a season nobody there would
/// recognise.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Belt {
    Northern,
    Southern,
    Tropical,
}

impl Belt {
    /// Stable string form for the wasm boundary -- mirrored by hand in
    /// `postcard-wasm`'s DTOs, same convention as [`Season::name`] and
    /// `Vibe::name`, so this crate needs no `serde` dependency.
    pub fn name(self) -> &'static str {
        match self {
            Belt::Northern => "northern",
            Belt::Southern => "southern",
            Belt::Tropical => "tropical",
        }
    }
}

/// The Tropic of Cancer/Capricorn, in degrees. Inside this band the sun
/// passes overhead twice a year and there is no four-season cycle to
/// speak of, so [`belt_for_latitude`] reports `Tropical`.
const TROPIC_DEGREES: f64 = 23.44;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Season {
    Spring,
    Summer,
    Autumn,
    Winter,
}

impl Season {
    pub fn name(self) -> &'static str {
        match self {
            Season::Spring => "spring",
            Season::Summer => "summer",
            Season::Autumn => "autumn",
            Season::Winter => "winter",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimeOfDay {
    Morning,
    Afternoon,
    Evening,
    Night,
}

impl TimeOfDay {
    pub fn name(self) -> &'static str {
        match self {
            TimeOfDay::Morning => "morning",
            TimeOfDay::Afternoon => "afternoon",
            TimeOfDay::Evening => "evening",
            TimeOfDay::Night => "night",
        }
    }
}

/// When a photo was taken. `season` is `None` in the tropics (see
/// [`Belt`]), so a caller must be able to render a `Moment` that only
/// knows a time of day -- that is a normal result, not a degraded one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Moment {
    pub year: u16,
    pub month: u8,
    pub day: u8,
    pub hour: u8,
    pub season: Option<Season>,
    pub time_of_day: TimeOfDay,
}

/// Meteorological season boundaries (Mar/Jun/Sep/Dec), not astronomical
/// ones (the solstices and equinoxes, which fall around the 20th-22nd).
/// Whole months are what a greeting means by "summer", and the
/// astronomical version would put the 1st of June in spring, which reads
/// as a bug to everyone who is not an astronomer.
///
/// `month` is 1..=12 as EXIF writes it; anything else is `None` rather
/// than a silent wrong answer.
pub fn season_for(month: u8, belt: Belt) -> Option<Season> {
    if belt == Belt::Tropical || !(1..=12).contains(&month) {
        return None;
    }
    let northern = match month {
        3..=5 => Season::Spring,
        6..=8 => Season::Summer,
        9..=11 => Season::Autumn,
        _ => Season::Winter,
    };
    Some(match belt {
        Belt::Northern => northern,
        // Six months out of step, which is exactly the opposite season.
        Belt::Southern => match northern {
            Season::Spring => Season::Autumn,
            Season::Summer => Season::Winter,
            Season::Autumn => Season::Spring,
            Season::Winter => Season::Summer,
        },
        Belt::Tropical => unreachable!("returned above"),
    })
}

/// Conventional boundaries, not tuned against anything -- the same
/// honesty `vibe`'s `CONFIDENCE_FLOOR` and `exposureSuggestion`'s
/// thresholds already carry. They matter less than they look like they
/// do: the copy keyed off them says "evening", which stays true either
/// side of an hour's disagreement.
///
/// Night wraps midnight, which is why this is a `match` on ranges rather
/// than a chain of comparisons.
pub fn time_of_day_for(hour: u8) -> TimeOfDay {
    match hour {
        5..=11 => TimeOfDay::Morning,
        12..=16 => TimeOfDay::Afternoon,
        17..=20 => TimeOfDay::Evening,
        _ => TimeOfDay::Night,
    }
}

/// A coarse belt guess from an IANA timezone name, for photos with no
/// GPS of their own.
///
/// Most zone names are a representative city, which is the same
/// observation `location.js` already leans on for the postmark -- but a
/// zone covers a whole region, so this is a guess and nothing more.
/// **A photo's own GPS always beats it** ([`read`] only consults this
/// when there is no latitude to read), so the cost of a wrong answer
/// here is limited to photos that carry no location at all.
///
/// The table is deliberately partial: the southern and tropical entries
/// are listed, everything else falls through to `Northern`, which is
/// where most of the world's population and most zone names are. Listing
/// every zone by hand is exactly the kind of long transcription
/// `IMAGENET_CLASS_TO_VIBE` warns about getting quietly wrong, and the
/// payoff would be small -- the entries below are the ones where a wrong
/// season would actually be noticed, chiefly the tropics, where claiming
/// any season at all is the visible mistake.
pub fn belt_for_timezone(zone: &str) -> Belt {
    // Checked before the region prefixes below, since several sit in a
    // region whose bulk falls in a different belt (Darwin is tropical in
    // an otherwise temperate Australia; Auckland is temperate in an
    // otherwise tropical Pacific).
    const TROPICAL: &[&str] = &[
        "Asia/Singapore",
        "Asia/Jakarta",
        "Asia/Kuala_Lumpur",
        "Asia/Bangkok",
        "Asia/Manila",
        "Asia/Ho_Chi_Minh",
        "Asia/Phnom_Penh",
        "Asia/Vientiane",
        "Asia/Yangon",
        "Asia/Colombo",
        "Asia/Brunei",
        "Asia/Jayapura",
        "Asia/Makassar",
        "Asia/Pontianak",
        "Asia/Kolkata",
        "Australia/Darwin",
        "America/Bogota",
        "America/Lima",
        "America/Caracas",
        "America/Panama",
        "America/Guayaquil",
        "America/Manaus",
        "America/Belem",
        "America/Havana",
        "America/Jamaica",
        "America/Port_of_Spain",
        "America/Guatemala",
        "America/Costa_Rica",
        "America/Managua",
        "America/Tegucigalpa",
        "America/El_Salvador",
        "Africa/Lagos",
        "Africa/Nairobi",
        "Africa/Accra",
        "Africa/Abidjan",
        "Africa/Kinshasa",
        "Africa/Luanda",
        "Africa/Dar_es_Salaam",
        "Africa/Kampala",
        "Africa/Addis_Ababa",
        "Africa/Khartoum",
        "Africa/Douala",
        "Africa/Dakar",
        "Indian/Maldives",
        "Indian/Mauritius",
    ];
    const SOUTHERN: &[&str] = &[
        "Pacific/Auckland",
        "Pacific/Chatham",
        "America/Santiago",
        "America/Punta_Arenas",
        "America/Montevideo",
        "America/Sao_Paulo",
        "America/Asuncion",
        "America/La_Paz",
        "Atlantic/Stanley",
        "Africa/Johannesburg",
        "Africa/Windhoek",
        "Africa/Maseru",
        "Africa/Mbabane",
        "Africa/Gaborone",
        "Africa/Harare",
    ];

    if TROPICAL.contains(&zone) {
        return Belt::Tropical;
    }
    if SOUTHERN.contains(&zone) {
        return Belt::Southern;
    }
    // Whole regions that sit on one side. `Pacific/` is mostly island
    // groups within a few degrees of the equator; the two temperate
    // exceptions are named above.
    if zone.starts_with("Australia/")
        || zone.starts_with("Antarctica/")
        || zone.starts_with("America/Argentina/")
    {
        return Belt::Southern;
    }
    if zone.starts_with("Pacific/") {
        return Belt::Tropical;
    }
    Belt::Northern
}

/// `Tropical` inside the tropics, otherwise the hemisphere the sign
/// says. Latitude arrives already signed (south negative), the way
/// [`read`] assembles it from EXIF's separate magnitude and N/S
/// reference fields.
pub fn belt_for_latitude(latitude: f64) -> Belt {
    if !latitude.is_finite() {
        return Belt::Northern;
    }
    if latitude.abs() <= TROPIC_DEGREES {
        Belt::Tropical
    } else if latitude < 0.0 {
        Belt::Southern
    } else {
        Belt::Northern
    }
}

/// Reads `bytes`' EXIF and returns when the photo was taken, or `None`
/// when the photo carries no usable date.
///
/// `fallback_belt` is used only when the photo has no GPS latitude to
/// derive one from -- which is common, since phones omit it when
/// location services are off and several messaging apps strip it on the
/// way through. The host layer supplies a guess from the browser's
/// timezone there, the same permission-free trick `location.js` already
/// uses for the postmark.
///
/// **`None` is an ordinary outcome, not an error.** A screenshot, a
/// downloaded image, an image that has been through a chat app, and --
/// worth knowing before hunting for a bug -- a photo taken with this
/// app's own in-page camera all have no EXIF date, because
/// `canvas.toBlob` writes none. The caller decides what to do with that;
/// it is not this function's business to invent a date.
pub fn read(bytes: &[u8], fallback_belt: Belt) -> Option<Moment> {
    let exif = exif::Reader::new()
        .read_from_container(&mut Cursor::new(bytes))
        .ok()?;

    // DateTimeOriginal is when the shutter fired. DateTime (tag 0x0132)
    // is when the file was last written, which an edit or a transfer can
    // move; prefer the former and fall back to the latter, never the
    // other way round.
    let field = exif
        .get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY)
        .or_else(|| exif.get_field(exif::Tag::DateTime, exif::In::PRIMARY))?;
    let exif::Value::Ascii(ref text) = field.value else {
        return None;
    };
    let taken = exif::DateTime::from_ascii(text.first()?).ok()?;

    let belt = latitude(&exif).map_or(fallback_belt, belt_for_latitude);

    Some(Moment {
        year: taken.year,
        month: taken.month,
        day: taken.day,
        hour: taken.hour,
        season: season_for(taken.month, belt),
        time_of_day: time_of_day_for(taken.hour),
    })
}

/// Signed decimal degrees from EXIF's two-field representation: an
/// unsigned degrees/minutes/seconds triple plus a separate "N"/"S"
/// reference. Reading the magnitude without the reference would put
/// every southern-hemisphere photo in the wrong half of the world --
/// and, since `belt_for_latitude` only cares about the sign and the
/// tropics, would flip its season.
fn latitude(exif: &exif::Exif) -> Option<f64> {
    let field = exif.get_field(exif::Tag::GPSLatitude, exif::In::PRIMARY)?;
    let exif::Value::Rational(ref parts) = field.value else {
        return None;
    };
    let degrees = parts.first()?.to_f64();
    let minutes = parts.get(1).map_or(0.0, |r| r.to_f64());
    let seconds = parts.get(2).map_or(0.0, |r| r.to_f64());
    let magnitude = degrees + minutes / 60.0 + seconds / 3600.0;

    let south = exif
        .get_field(exif::Tag::GPSLatitudeRef, exif::In::PRIMARY)
        .and_then(|f| match f.value {
            exif::Value::Ascii(ref text) => text.first().and_then(|s| s.first()).copied(),
            _ => None,
        })
        .is_some_and(|c| c == b'S' || c == b's');

    Some(if south { -magnitude } else { magnitude })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::codecs::jpeg::JpegEncoder;
    use image::{Rgba, RgbaImage};

    fn fixture_jpeg() -> Vec<u8> {
        let img = RgbaImage::from_pixel(8, 8, Rgba([120, 90, 60, 255]));
        let rgb = image::DynamicImage::ImageRgba8(img).to_rgb8();
        let mut out = Vec::new();
        JpegEncoder::new_with_quality(&mut out, 90)
            .encode(&rgb, 8, 8, image::ExtendedColorType::Rgb8)
            .unwrap();
        out
    }

    /// Hand-builds a real EXIF APP1 segment carrying a DateTimeOriginal
    /// and, optionally, a GPS latitude, and splices it in after the SOI
    /// marker -- the same approach `pipeline.rs` takes for its
    /// orientation fixtures, and for the same reason: the `image` crate
    /// has no API to write EXIF, and a test that doesn't parse real
    /// camera-shaped bytes isn't exercising the parser at all.
    ///
    /// `latitude` is `(degrees, b'N' | b'S')`, whole degrees being
    /// enough to place a photo in a hemisphere.
    fn with_exif(datetime: &str, latitude: Option<(u32, u8)>) -> Vec<u8> {
        assert_eq!(datetime.len(), 19, "EXIF datetimes are 19 chars + NUL");

        let ifd0_entries: u16 = if latitude.is_some() { 2 } else { 1 };
        let ifd0_len = 2 + 12 * u32::from(ifd0_entries) + 4;
        let sub_start = 8 + ifd0_len;
        let sub_len = 2 + 12 + 4; // one entry: DateTimeOriginal
        let gps_start = sub_start + sub_len;
        let gps_len = 2 + 12 * 2 + 4; // GPSLatitudeRef + GPSLatitude
        let data_start = if latitude.is_some() {
            gps_start + gps_len
        } else {
            gps_start
        };
        // The 20-byte datetime sits first in the data area; the three
        // latitude rationals (8 bytes each) follow it.
        let lat_offset = data_start + 20;

        let mut tiff = Vec::new();
        tiff.extend_from_slice(b"II"); // little-endian
        tiff.extend_from_slice(&42u16.to_le_bytes());
        tiff.extend_from_slice(&8u32.to_le_bytes()); // IFD0 offset

        // --- IFD0: pointers only ---
        tiff.extend_from_slice(&ifd0_entries.to_le_bytes());
        let mut entry = |tag: u16, kind: u16, count: u32, value: u32| {
            tiff.extend_from_slice(&tag.to_le_bytes());
            tiff.extend_from_slice(&kind.to_le_bytes());
            tiff.extend_from_slice(&count.to_le_bytes());
            tiff.extend_from_slice(&value.to_le_bytes());
        };
        entry(0x8769, 4, 1, sub_start); // ExifIFDPointer, type LONG
        if latitude.is_some() {
            entry(0x8825, 4, 1, gps_start); // GPSInfoIFDPointer
        }
        tiff.extend_from_slice(&0u32.to_le_bytes()); // no next IFD

        // --- Exif SubIFD: the date itself ---
        tiff.extend_from_slice(&1u16.to_le_bytes());
        tiff.extend_from_slice(&0x9003u16.to_le_bytes()); // DateTimeOriginal
        tiff.extend_from_slice(&2u16.to_le_bytes()); // type ASCII
        tiff.extend_from_slice(&20u32.to_le_bytes()); // 19 chars + NUL
        tiff.extend_from_slice(&data_start.to_le_bytes());
        tiff.extend_from_slice(&0u32.to_le_bytes());

        // --- GPS IFD ---
        if let Some((_, reference)) = latitude {
            tiff.extend_from_slice(&2u16.to_le_bytes());
            // GPSLatitudeRef is a 2-byte ASCII ("N\0"), short enough to
            // sit inline in the entry's own value field.
            tiff.extend_from_slice(&0x0001u16.to_le_bytes());
            tiff.extend_from_slice(&2u16.to_le_bytes()); // ASCII
            tiff.extend_from_slice(&2u32.to_le_bytes());
            tiff.extend_from_slice(&[reference, 0, 0, 0]);
            tiff.extend_from_slice(&0x0002u16.to_le_bytes()); // GPSLatitude
            tiff.extend_from_slice(&5u16.to_le_bytes()); // type RATIONAL
            tiff.extend_from_slice(&3u32.to_le_bytes());
            tiff.extend_from_slice(&lat_offset.to_le_bytes());
            tiff.extend_from_slice(&0u32.to_le_bytes());
        }

        // --- data area ---
        tiff.extend_from_slice(datetime.as_bytes());
        tiff.push(0);
        if let Some((degrees, _)) = latitude {
            for (numerator, denominator) in [(degrees, 1u32), (0, 1), (0, 1)] {
                tiff.extend_from_slice(&numerator.to_le_bytes());
                tiff.extend_from_slice(&denominator.to_le_bytes());
            }
        }

        let mut payload = b"Exif\0\0".to_vec();
        payload.extend_from_slice(&tiff);

        let mut app1 = vec![0xFF, 0xE1];
        app1.extend_from_slice(&(u16::try_from(payload.len() + 2).unwrap()).to_be_bytes());
        app1.extend_from_slice(&payload);

        let jpeg = fixture_jpeg();
        let mut out = jpeg[..2].to_vec(); // SOI
        out.extend_from_slice(&app1);
        out.extend_from_slice(&jpeg[2..]);
        out
    }

    #[test]
    fn reads_the_date_and_hour_a_camera_wrote() {
        let moment = read(&with_exif("2026:12:24 19:30:00", None), Belt::Northern).unwrap();
        assert_eq!(moment.year, 2026);
        assert_eq!(moment.month, 12);
        assert_eq!(moment.day, 24);
        assert_eq!(moment.hour, 19);
        assert_eq!(moment.time_of_day, TimeOfDay::Evening);
        assert_eq!(moment.season, Some(Season::Winter));
    }

    #[test]
    fn a_photo_with_no_exif_at_all_is_none_rather_than_an_error() {
        assert!(read(&fixture_jpeg(), Belt::Northern).is_none());
        assert!(read(b"not an image", Belt::Northern).is_none());
        assert!(read(&[], Belt::Northern).is_none());
    }

    #[test]
    fn gps_latitude_beats_the_fallback_belt() {
        // Sydney in December: the fallback says northern (the host's
        // timezone guess could easily be wrong), the photo's own GPS
        // says otherwise, and the photo wins.
        let bytes = with_exif("2026:12:24 19:30:00", Some((33, b'S')));
        let moment = read(&bytes, Belt::Northern).unwrap();
        assert_eq!(moment.season, Some(Season::Summer));
    }

    #[test]
    fn a_tropical_latitude_claims_no_season_at_all() {
        // Singapore, ~1 degree north: December is not winter there, and
        // saying so would be worse than saying nothing.
        let bytes = with_exif("2026:12:24 19:30:00", Some((1, b'N')));
        let moment = read(&bytes, Belt::Northern).unwrap();
        assert_eq!(moment.season, None);
        assert_eq!(moment.time_of_day, TimeOfDay::Evening);
    }

    #[test]
    fn the_fallback_belt_applies_only_when_the_photo_has_no_gps() {
        let bytes = with_exif("2026:12:24 19:30:00", None);
        assert_eq!(
            read(&bytes, Belt::Southern).unwrap().season,
            Some(Season::Summer)
        );
        assert_eq!(read(&bytes, Belt::Tropical).unwrap().season, None);
    }

    #[test]
    fn seasons_are_opposite_across_the_equator_every_month() {
        for month in 1..=12u8 {
            let north = season_for(month, Belt::Northern).unwrap();
            let south = season_for(month, Belt::Southern).unwrap();
            assert_ne!(north, south, "month {month}");
            // Opposite, not merely different: six months apart.
            let six_months_on = if month > 6 { month - 6 } else { month + 6 };
            assert_eq!(season_for(six_months_on, Belt::Northern).unwrap(), south);
        }
    }

    #[test]
    fn season_boundaries_fall_on_whole_months() {
        assert_eq!(season_for(2, Belt::Northern), Some(Season::Winter));
        assert_eq!(season_for(3, Belt::Northern), Some(Season::Spring));
        assert_eq!(season_for(5, Belt::Northern), Some(Season::Spring));
        assert_eq!(season_for(6, Belt::Northern), Some(Season::Summer));
        assert_eq!(season_for(11, Belt::Northern), Some(Season::Autumn));
        assert_eq!(season_for(12, Belt::Northern), Some(Season::Winter));
    }

    #[test]
    fn an_impossible_month_claims_no_season() {
        assert_eq!(season_for(0, Belt::Northern), None);
        assert_eq!(season_for(13, Belt::Northern), None);
    }

    #[test]
    fn night_wraps_around_midnight() {
        assert_eq!(time_of_day_for(23), TimeOfDay::Night);
        assert_eq!(time_of_day_for(0), TimeOfDay::Night);
        assert_eq!(time_of_day_for(4), TimeOfDay::Night);
        assert_eq!(time_of_day_for(5), TimeOfDay::Morning);
        assert_eq!(time_of_day_for(11), TimeOfDay::Morning);
        assert_eq!(time_of_day_for(12), TimeOfDay::Afternoon);
        assert_eq!(time_of_day_for(16), TimeOfDay::Afternoon);
        assert_eq!(time_of_day_for(17), TimeOfDay::Evening);
        assert_eq!(time_of_day_for(20), TimeOfDay::Evening);
    }

    #[test]
    fn a_timezone_places_a_photo_that_carries_no_gps() {
        assert_eq!(belt_for_timezone("Asia/Singapore"), Belt::Tropical);
        assert_eq!(belt_for_timezone("Europe/London"), Belt::Northern);
        assert_eq!(belt_for_timezone("America/New_York"), Belt::Northern);
        assert_eq!(belt_for_timezone("Pacific/Auckland"), Belt::Southern);
        assert_eq!(
            belt_for_timezone("America/Argentina/Cordoba"),
            Belt::Southern
        );
        // A region's bulk must not override a named exception: Darwin is
        // tropical inside an otherwise temperate Australia, Auckland
        // temperate inside an otherwise tropical Pacific.
        assert_eq!(belt_for_timezone("Australia/Sydney"), Belt::Southern);
        assert_eq!(belt_for_timezone("Australia/Darwin"), Belt::Tropical);
        assert_eq!(belt_for_timezone("Pacific/Fiji"), Belt::Tropical);
    }

    #[test]
    fn an_unrecognised_timezone_guesses_northern_rather_than_failing() {
        // `Intl` can hand back anything, including a zone added after
        // this table was written -- a guess is the whole point of this
        // path, and a photo's own GPS overrides it either way.
        assert_eq!(belt_for_timezone(""), Belt::Northern);
        assert_eq!(belt_for_timezone("Mars/Olympus_Mons"), Belt::Northern);
    }

    #[test]
    fn the_tropics_are_a_band_around_the_equator_not_a_line() {
        assert_eq!(belt_for_latitude(0.0), Belt::Tropical);
        assert_eq!(belt_for_latitude(23.0), Belt::Tropical);
        assert_eq!(belt_for_latitude(-23.0), Belt::Tropical);
        assert_eq!(belt_for_latitude(24.0), Belt::Northern);
        assert_eq!(belt_for_latitude(-24.0), Belt::Southern);
        assert_eq!(belt_for_latitude(f64::NAN), Belt::Northern);
    }
}
