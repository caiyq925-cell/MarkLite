#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EncodingKind {
    Utf8,
    Gbk,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Newline {
    Lf,
    Crlf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedText {
    pub text: String,
    pub encoding: EncodingKind,
    pub bom: bool,
    pub newline: Newline,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum DecodeError {
    #[error("无法识别为文本")]
    BinaryOrUnknown,
}

pub fn detect_newline(bytes: &[u8]) -> Newline {
    if bytes.windows(2).any(|w| w == b"\r\n") {
        Newline::Crlf
    } else {
        Newline::Lf
    }
}

pub fn decode_bytes(bytes: &[u8]) -> Result<DecodedText, DecodeError> {
    let (rest, bom) = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        (&bytes[3..], true)
    } else {
        (bytes, false)
    };
    let newline = detect_newline(rest);

    if let Ok(s) = std::str::from_utf8(rest) {
        return Ok(DecodedText {
            text: normalize_newlines(s),
            encoding: EncodingKind::Utf8,
            bom,
            newline,
        });
    }

    let (cow, _, had_errors) = encoding_rs::GBK.decode(rest);
    if had_errors {
        return Err(DecodeError::BinaryOrUnknown);
    }
    Ok(DecodedText {
        text: normalize_newlines(&cow),
        encoding: EncodingKind::Gbk,
        bom: false,
        newline,
    })
}

pub fn encode_text(text: &str, bom: bool, newline: Newline) -> Vec<u8> {
    let body = match newline {
        Newline::Lf => text.replace("\r\n", "\n"),
        Newline::Crlf => {
            let unified = text.replace("\r\n", "\n");
            unified.replace('\n', "\r\n")
        }
    };
    let mut out = Vec::new();
    if bom {
        out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    out.extend_from_slice(body.as_bytes());
    out
}

fn normalize_newlines(s: &str) -> String {
    s.replace("\r\n", "\n").replace('\r', "\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_plain() {
        let d = decode_bytes("你好\nworld".as_bytes()).unwrap();
        assert_eq!(d.encoding, EncodingKind::Utf8);
        assert!(!d.bom);
        assert_eq!(d.newline, Newline::Lf);
        assert_eq!(d.text, "你好\nworld");
    }

    #[test]
    fn utf8_bom_preserved_on_encode() {
        let mut raw = vec![0xEF, 0xBB, 0xBF];
        raw.extend_from_slice("title\r\nbody".as_bytes());
        let d = decode_bytes(&raw).unwrap();
        assert!(d.bom);
        assert_eq!(d.newline, Newline::Crlf);
        assert_eq!(d.text, "title\nbody");
        let back = encode_text(&d.text, d.bom, d.newline);
        assert_eq!(back, raw);
    }

    #[test]
    fn gbk_round_open_then_utf8_save() {
        let (bytes, _, _) = encoding_rs::GBK.encode("中文GBK");
        let d = decode_bytes(&bytes).unwrap();
        assert_eq!(d.encoding, EncodingKind::Gbk);
        assert_eq!(d.text, "中文GBK");
        let saved = encode_text(&d.text, false, Newline::Lf);
        assert_eq!(saved, "中文GBK".as_bytes());
    }

    #[test]
    fn crlf_roundtrip_without_edit() {
        let raw = b"a\r\nb\r\n";
        let d = decode_bytes(raw).unwrap();
        let back = encode_text(&d.text, false, d.newline);
        assert_eq!(back, raw);
    }

    #[test]
    fn binary_rejected() {
        let err = decode_bytes(&[0x00, 0xFF, 0xFE, 0x00]).unwrap_err();
        assert_eq!(err, DecodeError::BinaryOrUnknown);
    }
}
