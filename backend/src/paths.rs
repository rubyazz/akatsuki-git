//! Message templates and path-specific suffixes.

use crate::protocol::{CharacterPath, GitOp, MessageTemplate, MessageTemplates};
use std::collections::HashMap;

/// Get the default message templates for a given character path.
#[must_use]
pub fn message_templates(path: CharacterPath) -> MessageTemplates {
    let suffix = path.suffix();

    let mut templates = HashMap::new();

    // For each operation, we have in_flight and completion messages.
    // The completion message gets the path suffix appended for all ops except merge_conflict.
    let ops = [
        GitOp::Commit,
        GitOp::Push,
        GitOp::Pull,
        GitOp::Merge,
        GitOp::MergeConflict,
    ];

    for op in &ops {
        let (in_flight, completion) = default_messages(*op);

        let final_completion = if matches!(op, GitOp::MergeConflict) {
            // Merge conflict has its own fixed completion text without a suffix.
            completion.to_string()
        } else {
            format!("{completion} {suffix}")
        };

        templates.insert(
            op.key().to_string(),
            MessageTemplate {
                in_flight: in_flight.to_string(),
                completion: final_completion,
            },
        );
    }

    templates
}

/// Get the default (unbranded) message text for an operation.
#[must_use]
const fn default_messages(op: GitOp) -> (&'static str, &'static str) {
    match op {
        GitOp::Commit => (
            "Sealing knowledge into a forbidden scroll…",
            "Mission Report Recorded",
        ),
        GitOp::Push => (
            "Transmitting intelligence to Akatsuki Headquarters…",
            "Mission report delivered. Leader has acknowledged your efforts.",
        ),
        GitOp::Pull => (
            "Receiving intelligence from allied spies…",
            "New information acquired.",
        ),
        GitOp::Merge => ("Combining parallel timelines…", "Reality stabilized."),
        GitOp::MergeConflict => (
            "⚔ Shinobi Battle Detected",
            "Two powerful jutsu have collided. Resolve the conflict to continue.",
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_messages() {
        let templates = message_templates(CharacterPath::Itachi);

        // Check that each operation has templates
        assert_eq!(templates.len(), 5);
        assert!(templates.contains_key("commit"));
        assert!(templates.contains_key("push"));
        assert!(templates.contains_key("pull"));
        assert!(templates.contains_key("merge"));
        assert!(templates.contains_key("merge_conflict"));
    }

    #[test]
    fn test_suffix_appended() {
        let itachi_templates = message_templates(CharacterPath::Itachi);
        let pain_templates = message_templates(CharacterPath::Pain);
        let obito_templates = message_templates(CharacterPath::Obito);
        let madara_templates = message_templates(CharacterPath::Madara);

        // Check that suffix is appended for commit (non-merge_conflict)
        let commit_itachi = &itachi_templates["commit"];
        assert!(commit_itachi
            .completion
            .ends_with("Every growth requires sacrifice."));

        let commit_pain = &pain_templates["commit"];
        assert!(commit_pain
            .completion
            .ends_with("Through pain comes progress."));

        let commit_obito = &obito_templates["commit"];
        assert!(commit_obito
            .completion
            .ends_with("Reality has been corrected."));

        let commit_madara = &madara_templates["commit"];
        assert!(commit_madara
            .completion
            .ends_with("Your ambition grows stronger."));
    }

    #[test]
    fn test_merge_conflict_no_suffix() {
        let templates = message_templates(CharacterPath::Itachi);
        let merge_conflict = &templates["merge_conflict"];

        // Merge conflict should NOT have suffix appended
        assert_eq!(
            merge_conflict.completion,
            "Two powerful jutsu have collided. Resolve the conflict to continue."
        );
        assert!(!merge_conflict
            .completion
            .contains("Every growth requires sacrifice."));
    }

    #[test]
    fn test_in_flight_messages() {
        let templates = message_templates(CharacterPath::Pain);

        assert_eq!(
            templates["commit"].in_flight,
            "Sealing knowledge into a forbidden scroll…"
        );
        assert_eq!(
            templates["push"].in_flight,
            "Transmitting intelligence to Akatsuki Headquarters…"
        );
        assert_eq!(
            templates["pull"].in_flight,
            "Receiving intelligence from allied spies…"
        );
        assert_eq!(
            templates["merge"].in_flight,
            "Combining parallel timelines…"
        );
        assert_eq!(
            templates["merge_conflict"].in_flight,
            "⚔ Shinobi Battle Detected"
        );
    }
}
