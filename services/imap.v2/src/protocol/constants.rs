#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImapState {
    NotAuthenticated,
    Authenticated,
    Selected,
    Logout,
}

pub const CAPABILITIES_PLAIN: &[&str] = &[
    "IMAP4rev1",
    "STARTTLS",
    "AUTH=PLAIN",
    "IDLE",
    "NAMESPACE",
    "ENABLE",
    "UNSELECT",
    "UIDPLUS",
    "SPECIAL-USE",
];

pub const CAPABILITIES_SECURE: &[&str] = &[
    "IMAP4rev1",
    "AUTH=PLAIN",
    "IDLE",
    "NAMESPACE",
    "ENABLE",
    "UNSELECT",
    "UIDPLUS",
    "SPECIAL-USE",
];

pub const SERVER_NAME: &str = "LEMail IMAP4rev1 Server Ready";
