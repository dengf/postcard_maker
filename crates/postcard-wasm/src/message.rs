//! Re-exports `postcard_core::Message` -- the type itself and its
//! `PostcardError` mapping live in `postcard-core`. See that crate's
//! module for the full rationale (shared by every wasm-bindgen crate this
//! app might ever split into, mirroring `budget-core`'s reasoning).

pub use postcard_core::Message;

/// Guards the boundary against leaking a foreign error's `Debug` output to
/// the page. Ported verbatim from the other meifio tools' `message.rs`.
#[cfg(test)]
mod no_debug_formatted_errors {
    const BINDINGS: &[(&str, &str)] = &[
        ("photo.rs", include_str!("photo.rs")),
        ("template.rs", include_str!("template.rs")),
    ];

    #[test]
    fn every_binding_serializes_through_the_json_compatible_helper() {
        let mut offenders = Vec::new();
        for (name, source) in BINDINGS {
            for (i, line) in source.lines().enumerate() {
                let code = line.split("//").next().unwrap_or(line);
                if code.contains("serde_wasm_bindgen::to_value") {
                    offenders.push(format!("{name}:{}", i + 1));
                }
            }
        }
        assert!(
            offenders.is_empty(),
            "these lines serialize with serde_wasm_bindgen::to_value: {offenders:?}. \
             Use convert::to_js."
        );
    }

    #[test]
    fn no_binding_debug_formats_an_error_into_a_user_facing_field() {
        let mut offenders = Vec::new();
        for (name, source) in BINDINGS {
            for (i, line) in source.lines().enumerate() {
                let code = line.split("//").next().unwrap_or(line);
                if code.contains("{e:?}") || code.contains("{err:?}") {
                    offenders.push(format!("{name}:{}", i + 1));
                }
            }
        }
        assert!(
            offenders.is_empty(),
            "these lines Debug-format an error that reaches the DOM: {offenders:?}. \
             Use Message::bad_request() instead."
        );
    }

    #[test]
    fn the_bad_request_message_names_no_internals() {
        let text = super::Message::bad_request().text;
        for leak in ["wasm", "Error(", "JsValue", "f64", ".js:", "0x"] {
            assert!(
                !text.contains(leak),
                "bad_request text leaks {leak:?}: {text}"
            );
        }
    }
}
