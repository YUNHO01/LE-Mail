#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ImapAttr {
    Atom(String),
    Quoted(String),
    List(Vec<ImapAttr>),
}

impl ImapAttr {
    pub fn as_str_trimmed(&self) -> String {
        match self {
            ImapAttr::Atom(s) | ImapAttr::Quoted(s) => s.trim().to_string(),
            ImapAttr::List(items) => items
                .iter()
                .map(|i| i.as_str_trimmed())
                .collect::<Vec<_>>()
                .join(" "),
        }
    }

    pub fn as_list(&self) -> Vec<String> {
        match self {
            ImapAttr::List(items) => items.iter().map(|i| i.as_str_trimmed()).collect(),
            ImapAttr::Atom(s) | ImapAttr::Quoted(s) => vec![s.trim().to_string()],
        }
    }

    pub fn is_list(&self) -> bool {
        matches!(self, ImapAttr::List(_))
    }
}

#[derive(Debug, Clone)]
pub struct ParsedCommand {
    pub tag: String,
    pub command: String,
    pub attributes: Vec<ImapAttr>,
    pub raw_line: String,
}

impl ParsedCommand {
    pub fn attr_str(&self, index: usize, default_val: &str) -> String {
        self.attributes
            .get(index)
            .map(|a| a.as_str_trimmed())
            .unwrap_or_else(|| default_val.to_string())
    }

    pub fn attr_list(&self, index: usize) -> Vec<String> {
        self.attributes
            .get(index)
            .map(|a| a.as_list())
            .unwrap_or_default()
    }
}

/// 줄 끝의 IMAP 리터럴 구문(`{342}` 또는 `{342+}`)을 감지하여 바이트 길이를 반환합니다.
pub fn detect_trailing_literal(raw_line: &str) -> Option<usize> {
    let trimmed = raw_line.trim_end();
    if !trimmed.ends_with('}') {
        return None;
    }
    let open_idx = trimmed.rfind('{')?;
    let inner = &trimmed[open_idx + 1..trimmed.len() - 1];
    let num_str = inner.strip_suffix('+').unwrap_or(inner);
    if num_str.is_empty() || !num_str.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    num_str.parse::<usize>().ok()
}

/// 로그 출력 시 `LOGIN` / `AUTHENTICATE PLAIN` 비밀번호 및 자격증명을 마스킹합니다.
pub fn sanitize_command_line(raw_line: &str) -> String {
    let mut parts = raw_line.splitn(4, char::is_whitespace);
    let tag = match parts.next() {
        Some(t) => t,
        None => return raw_line.to_string(),
    };
    let cmd = match parts.next() {
        Some(c) => c,
        None => return raw_line.to_string(),
    };
    let arg1 = match parts.next() {
        Some(a) => a,
        None => return raw_line.to_string(),
    };
    let rest = parts.next();

    if cmd.eq_ignore_ascii_case("LOGIN") && rest.is_some() {
        return format!("{tag} {cmd} {arg1} ********");
    }
    if cmd.eq_ignore_ascii_case("AUTHENTICATE") && arg1.eq_ignore_ascii_case("PLAIN") {
        if let Some(r) = rest {
            if !r.trim().is_empty() {
                return format!("{tag} {cmd} {arg1} ********");
            }
        }
    }
    raw_line.to_string()
}

/// 관대한(permissive) IMAP 명령어 파서.
/// `emailjs-imap-handler`와 호환되도록 따옴표 문자열, 괄호 리스트, `UID <subcmd>`를 처리합니다.
pub fn parse_command_line(raw_line: &str) -> ParsedCommand {
    let tokens = tokenize_attrs(raw_line);
    let tag = tokens
        .first()
        .map(|a| a.as_str_trimmed())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "*".to_string());

    let mut command = tokens
        .get(1)
        .map(|a| a.as_str_trimmed().to_ascii_uppercase())
        .unwrap_or_default();

    let mut attributes: Vec<ImapAttr> = if tokens.len() > 2 {
        tokens[2..].to_vec()
    } else {
        Vec::new()
    };

    if command.starts_with("UID ") {
        let sub = command[4..].trim().to_string();
        command = "UID".to_string();
        attributes.insert(0, ImapAttr::Atom(sub));
    }

    ParsedCommand {
        tag,
        command,
        attributes,
        raw_line: raw_line.to_string(),
    }
}

fn tokenize_attrs(input: &str) -> Vec<ImapAttr> {
    let chars: Vec<char> = input.chars().collect();
    let mut pos = 0;
    parse_seq(&chars, &mut pos, false)
}

fn parse_seq(chars: &[char], pos: &mut usize, stop_at_rparen: bool) -> Vec<ImapAttr> {
    let mut items = Vec::new();
    let len = chars.len();

    while *pos < len {
        while *pos < len && chars[*pos].is_ascii_whitespace() {
            *pos += 1;
        }
        if *pos >= len {
            break;
        }
        let ch = chars[*pos];
        if stop_at_rparen && ch == ')' {
            *pos += 1;
            break;
        }

        if ch == '"' {
            *pos += 1;
            let mut buf = String::new();
            while *pos < len {
                let c = chars[*pos];
                if c == '\\' && *pos + 1 < len {
                    *pos += 1;
                    buf.push(chars[*pos]);
                    *pos += 1;
                } else if c == '"' {
                    *pos += 1;
                    break;
                } else {
                    buf.push(c);
                    *pos += 1;
                }
            }
            items.push(ImapAttr::Quoted(buf));
        } else if ch == '(' {
            *pos += 1;
            let list = parse_seq(chars, pos, true);
            items.push(ImapAttr::List(list));
        } else {
            let mut buf = String::new();
            let mut bracket_depth = 0usize;
            while *pos < len {
                let c = chars[*pos];
                if c == '[' {
                    bracket_depth += 1;
                    buf.push(c);
                    *pos += 1;
                } else if c == ']' && bracket_depth > 0 {
                    bracket_depth -= 1;
                    buf.push(c);
                    *pos += 1;
                } else if bracket_depth == 0
                    && (c.is_ascii_whitespace() || (stop_at_rparen && c == ')'))
                {
                    break;
                } else {
                    buf.push(c);
                    *pos += 1;
                }
            }
            if !buf.is_empty() {
                items.push(ImapAttr::Atom(buf));
            }
        }
    }

    items
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_basic_commands() {
        let p = parse_command_line("A001 LOGIN \"user@example.com\" \"p@ss\\\"word\"");
        assert_eq!(p.tag, "A001");
        assert_eq!(p.command, "LOGIN");
        assert_eq!(p.attr_str(0, ""), "user@example.com");
        assert_eq!(p.attr_str(1, ""), "p@ss\"word");
    }

    #[test]
    fn test_parse_list_special_use() {
        let p = parse_command_line("A002 LIST (SPECIAL-USE) \"\" \"*\"");
        assert_eq!(p.command, "LIST");
        assert!(p.attributes[0].is_list());
        assert_eq!(p.attr_str(0, ""), "SPECIAL-USE");
        assert_eq!(p.attr_str(1, ""), "");
        assert_eq!(p.attr_str(2, ""), "*");
    }

    #[test]
    fn test_detect_literal() {
        assert_eq!(detect_trailing_literal("A005 APPEND INBOX (\\Seen) {342}"), Some(342));
        assert_eq!(detect_trailing_literal("A005 APPEND INBOX {1024+}"), Some(1024));
        assert_eq!(detect_trailing_literal("A001 NOOP"), None);
    }

    #[test]
    fn test_sanitize_credentials() {
        assert_eq!(
            sanitize_command_line("A001 LOGIN admin@test.com secret123"),
            "A001 LOGIN admin@test.com ********"
        );
        assert_eq!(
            sanitize_command_line("A002 AUTHENTICATE PLAIN AGFkbWluAHNlY3JldA=="),
            "A002 AUTHENTICATE PLAIN ********"
        );
        assert_eq!(
            sanitize_command_line("A003 AUTHENTICATE PLAIN"),
            "A003 AUTHENTICATE PLAIN"
        );
    }
}
