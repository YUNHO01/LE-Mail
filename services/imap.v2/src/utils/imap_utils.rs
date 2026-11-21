use base64::Engine;
use chrono::{DateTime, Datelike, Local, Timelike, Utc};
use std::collections::BTreeSet;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedAddress {
    pub name: Option<String>,
    pub user: String,
    pub host: String,
}

#[derive(Debug, Clone, Copy)]
pub struct MailFlags {
    pub is_read: bool,
    pub is_starred: bool,
    pub is_deleted: bool,
    pub is_answered: bool,
    pub is_draft: bool,
}

pub struct EnvelopeInput<'a> {
    pub date: DateTime<Utc>,
    pub subject: Option<&'a str>,
    pub from: &'a str,
    pub to: &'a [String],
    pub cc: &'a [String],
    pub bcc: &'a [String],
    pub in_reply_to: Option<&'a str>,
    pub message_id: Option<&'a str>,
}

pub struct ImapUtils;

impl ImapUtils {
    /// IMAP sequence set 파싱 (예: "1:3", "1,3,5", "4:*", "1:*")
    pub fn parse_sequence_set(set_str: &str, max_val: u32) -> Vec<u32> {
        if set_str.is_empty() || max_val == 0 {
            return Vec::new();
        }
        let clean: String = set_str
            .chars()
            .filter(|&c| c != '(' && c != ')')
            .collect();
        let clean = clean.trim();
        if clean.is_empty() {
            return Vec::new();
        }

        let mut result = BTreeSet::new();
        for part in clean.split(',') {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            if let Some((start_s, end_s)) = part.split_once(':') {
                let start = if start_s.trim() == "*" {
                    Some(max_val)
                } else {
                    start_s.trim().parse::<u32>().ok()
                };
                let end = if end_s.trim() == "*" {
                    Some(max_val)
                } else {
                    end_s.trim().parse::<u32>().ok()
                };
                if let (Some(s), Some(e)) = (start, end) {
                    let low = s.min(e).max(1);
                    let high = s.max(e).min(max_val);
                    if low <= high {
                        for i in low..=high {
                            result.insert(i);
                        }
                    }
                }
            } else {
                let num = if part == "*" {
                    Some(max_val)
                } else {
                    part.parse::<u32>().ok()
                };
                if let Some(n) = num {
                    if n > 0 && n <= max_val {
                        result.insert(n);
                    }
                }
            }
        }

        result.into_iter().collect()
    }

    /// DateTime을 IMAP INTERNALDATE 형식으로 포맷 (예: "06-Nov-2026 17:15:00 +0900")
    pub fn format_internal_date(date: DateTime<Utc>) -> String {
        const MONTHS: [&str; 12] = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ];
        let local: DateTime<Local> = date.with_timezone(&Local);
        let day = local.day();
        let month = MONTHS[(local.month0() as usize).min(11)];
        let year = local.year();
        let hours = local.hour();
        let minutes = local.minute();
        let seconds = local.second();

        let offset_secs = local.offset().local_minus_utc();
        let sign = if offset_secs >= 0 { '+' } else { '-' };
        let abs_mins = offset_secs.abs() / 60;
        let tz_hours = abs_mins / 60;
        let tz_mins = abs_mins % 60;

        format!(
            "{day:02}-{month}-{year:04} {hours:02}:{minutes:02}:{seconds:02} {sign}{tz_hours:02}{tz_mins:02}"
        )
    }

    /// 이메일 주소를 IMAP ENVELOPE용 (name, user, host)로 분리
    pub fn parse_address(addr_str: &str) -> ParsedAddress {
        let trimmed = addr_str.trim();
        let mut name: Option<String> = None;
        let mut email = trimmed.to_string();

        if let (Some(lt), Some(gt)) = (trimmed.rfind('<'), trimmed.rfind('>')) {
            if lt < gt {
                let name_part = trimmed[..lt].trim().trim_matches('"').trim();
                if !name_part.is_empty() {
                    name = Some(name_part.to_string());
                }
                email = trimmed[lt + 1..gt].trim().to_string();
            }
        }

        if let Some(at_idx) = email.rfind('@') {
            ParsedAddress {
                name,
                user: email[..at_idx].to_string(),
                host: email[at_idx + 1..].to_string(),
            }
        } else {
            ParsedAddress {
                name,
                user: email,
                host: "localhost".to_string(),
            }
        }
    }

    /// IMAP 주소 리스트 구조: ((name NIL user host))
    pub fn format_address_list(addresses: &[String]) -> String {
        if addresses.is_empty() {
            return "NIL".to_string();
        }
        let formatted: Vec<String> = addresses
            .iter()
            .map(|a| {
                let p = Self::parse_address(a);
                let name_part = match p.name {
                    Some(n) => format!("\"{}\"", n.replace('"', "\\\"")),
                    None => "NIL".to_string(),
                };
                format!("({name_part} NIL \"{}\" \"{}\")", p.user, p.host)
            })
            .collect();
        format!("({})", formatted.join(" "))
    }

    /// IMAP ENVELOPE 문자열 생성
    pub fn format_envelope(msg: &EnvelopeInput<'_>) -> String {
        let date_str = format!("\"{}\"", Self::format_internal_date(msg.date));
        let subject_str = match msg.subject {
            Some(s) if !s.is_empty() => format!("\"{}\"", s.replace('"', "\\\"")),
            _ => "NIL".to_string(),
        };
        let from_vec = vec![msg.from.to_string()];
        let from_list = Self::format_address_list(&from_vec);
        let to_list = Self::format_address_list(msg.to);
        let cc_list = Self::format_address_list(msg.cc);
        let bcc_list = Self::format_address_list(msg.bcc);
        let in_reply_to_str = match msg.in_reply_to {
            Some(s) if !s.is_empty() => format!("\"{s}\""),
            _ => "NIL".to_string(),
        };
        let message_id_str = match msg.message_id {
            Some(s) if !s.is_empty() => format!("\"{s}\""),
            _ => "NIL".to_string(),
        };

        format!(
            "({date_str} {subject_str} {from_list} {from_list} {from_list} {to_list} {cc_list} {bcc_list} {in_reply_to_str} {message_id_str})"
        )
    }

    /// IMAP FLAGS 문자열 포맷
    pub fn format_flags(flags: MailFlags) -> String {
        let mut list = Vec::new();
        if flags.is_read {
            list.push("\\Seen");
        }
        if flags.is_starred {
            list.push("\\Flagged");
        }
        if flags.is_deleted {
            list.push("\\Deleted");
        }
        if flags.is_answered {
            list.push("\\Answered");
        }
        if flags.is_draft {
            list.push("\\Draft");
        }
        format!("({})", list.join(" "))
    }

    /// 따옴표로 감싼 구문을 유지하면서 검색 조건 토큰 분리
    pub fn parse_search_criteria(raw_str: &str) -> Vec<String> {
        let mut tokens = Vec::new();
        let chars: Vec<char> = raw_str.chars().collect();
        let mut i = 0;
        let len = chars.len();

        while i < len {
            while i < len && chars[i].is_whitespace() {
                i += 1;
            }
            if i >= len {
                break;
            }
            if chars[i] == '"' {
                i += 1;
                let mut buf = String::new();
                while i < len && chars[i] != '"' {
                    buf.push(chars[i]);
                    i += 1;
                }
                if i < len && chars[i] == '"' {
                    i += 1;
                }
                tokens.push(buf);
            } else {
                let mut buf = String::new();
                while i < len && !chars[i].is_whitespace() && chars[i] != '"' {
                    buf.push(chars[i]);
                    i += 1;
                }
                tokens.push(buf);
            }
        }
        tokens
    }

    /// Unicode 문자열 → IMAP Modified UTF-7 인코딩 (RFC 3501 Section 5.1.3)
    pub fn encode_modified_utf7(s: &str) -> String {
        if s.is_empty() {
            return String::new();
        }
        let mut res = String::new();
        let mut non_ascii: Vec<u16> = Vec::new();

        let flush_non_ascii = |buf: &mut Vec<u16>, out: &mut String| {
            if buf.is_empty() {
                return;
            }
            let mut bytes = Vec::with_capacity(buf.len() * 2);
            for unit in buf.iter() {
                bytes.extend_from_slice(&unit.to_be_bytes());
            }
            let b64 = base64::engine::general_purpose::STANDARD_NO_PAD
                .encode(&bytes)
                .replace('/', ",");
            out.push('&');
            out.push_str(&b64);
            out.push('-');
            buf.clear();
        };

        for ch in s.chars() {
            let code = ch as u32;
            if (0x20..=0x7e).contains(&code) {
                flush_non_ascii(&mut non_ascii, &mut res);
                if ch == '&' {
                    res.push_str("&-");
                } else {
                    res.push(ch);
                }
            } else {
                let mut utf16 = [0u16; 2];
                for u in ch.encode_utf16(&mut utf16) {
                    non_ascii.push(*u);
                }
            }
        }
        flush_non_ascii(&mut non_ascii, &mut res);
        res
    }

    /// IMAP Modified UTF-7 → Unicode 문자열 디코딩 (RFC 3501 Section 5.1.3)
    pub fn decode_modified_utf7(s: &str) -> String {
        if s.is_empty() {
            return String::new();
        }
        let bytes = s.as_bytes();
        let mut out = String::new();
        let mut i = 0;

        while i < bytes.len() {
            if bytes[i] == b'&' {
                if let Some(rel_end) = bytes[i + 1..].iter().position(|&b| b == b'-') {
                    let b64_slice = &s[i + 1..i + 1 + rel_end];
                    if b64_slice.is_empty() {
                        out.push('&');
                    } else if b64_slice
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == ',')
                    {
                        let mut std_b64 = b64_slice.replace(',', "/");
                        while std_b64.len() % 4 != 0 {
                            std_b64.push('=');
                        }
                        if let Ok(decoded_bytes) =
                            base64::engine::general_purpose::STANDARD.decode(&std_b64)
                        {
                            let units: Vec<u16> = decoded_bytes
                                .chunks_exact(2)
                                .map(|c| u16::from_be_bytes([c[0], c[1]]))
                                .collect();
                            out.push_str(&String::from_utf16_lossy(&units));
                        } else {
                            out.push_str(&s[i..=i + 1 + rel_end]);
                        }
                    } else {
                        out.push_str(&s[i..=i + 1 + rel_end]);
                    }
                    i += rel_end + 2;
                    continue;
                }
            }
            // 일반 UTF-8 문자 안전 복사
            if let Some(ch) = s[i..].chars().next() {
                out.push(ch);
                i += ch.len_utf8();
            } else {
                break;
            }
        }

        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sequence_set() {
        assert_eq!(ImapUtils::parse_sequence_set("1:3,5", 10), vec![1, 2, 3, 5]);
        assert_eq!(ImapUtils::parse_sequence_set("4:*", 6), vec![4, 5, 6]);
        assert_eq!(ImapUtils::parse_sequence_set("5:3", 10), vec![3, 4, 5]);
        assert_eq!(ImapUtils::parse_sequence_set("*", 7), vec![7]);
    }

    #[test]
    fn test_modified_utf7_korean_roundtrip() {
        let samples = ["INBOX", "보낸 편지함", "임시 보관함", "지운 편지함", "정크 메일", "A&B/한글"];
        for s in samples {
            let encoded = ImapUtils::encode_modified_utf7(s);
            let decoded = ImapUtils::decode_modified_utf7(&encoded);
            assert_eq!(decoded, s, "roundtrip failed for {s} (encoded={encoded})");
        }
        assert_eq!(ImapUtils::encode_modified_utf7("A&B"), "A&-B");
    }

    #[test]
    fn test_parse_address() {
        let p = ImapUtils::parse_address("John Doe <john@lineedge.com>");
        assert_eq!(p.name.as_deref(), Some("John Doe"));
        assert_eq!(p.user, "john");
        assert_eq!(p.host, "lineedge.com");
    }

    #[test]
    fn test_parse_search_criteria() {
        let tokens = ImapUtils::parse_search_criteria("SUBJECT \"Test Mail 2\" UNSEEN");
        assert_eq!(tokens, vec!["SUBJECT", "Test Mail 2", "UNSEEN"]);
    }
}
