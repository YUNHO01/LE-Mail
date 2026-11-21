pub struct ImapResponse;

impl ImapResponse {
    pub fn tagged(tag: &str, status: &str, message: &str, code: Option<&str>) -> String {
        match code {
            Some(c) => format!("{tag} {status} [{c}] {message}\r\n"),
            None => format!("{tag} {status} {message}\r\n"),
        }
    }

    pub fn untagged(status: &str, message: &str, code: Option<&str>) -> String {
        match code {
            Some(c) => format!("* {status} [{c}] {message}\r\n"),
            None => format!("* {status} {message}\r\n"),
        }
    }

    pub fn capability(capabilities: &[&str]) -> String {
        format!("* CAPABILITY {}\r\n", capabilities.join(" "))
    }

    pub fn data(content: &str) -> String {
        format!("* {content}\r\n")
    }

    pub fn continuation(message: &str) -> String {
        format!("+ {message}\r\n")
    }
}
