//! Rank system implementation.

use crate::protocol::RankInfo;

/// Rank enum with thresholds.
#[derive(Debug, Clone, Copy)]
pub enum Rank {
    AcademyStudent,
    Genin,
    Chunin,
    Jonin,
    Anbu,
    AkatsukiMember,
}

impl Rank {
    /// Get the rank key.
    #[must_use]
    pub const fn key(&self) -> &'static str {
        match self {
            Rank::AcademyStudent => "academy_student",
            Rank::Genin => "genin",
            Rank::Chunin => "chunin",
            Rank::Jonin => "jonin",
            Rank::Anbu => "anbu",
            Rank::AkatsukiMember => "akatsuki_member",
        }
    }

    /// Get the rank label.
    #[must_use]
    pub const fn label(&self) -> &'static str {
        match self {
            Rank::AcademyStudent => "Academy Student",
            Rank::Genin => "Genin",
            Rank::Chunin => "Chunin",
            Rank::Jonin => "Jonin",
            Rank::Anbu => "Anbu",
            Rank::AkatsukiMember => "Akatsuki Member",
        }
    }

    /// Get the commit threshold for this rank.
    #[must_use]
    pub const fn threshold(&self) -> u64 {
        match self {
            Rank::AcademyStudent => 0,
            Rank::Genin => 25,
            Rank::Chunin => 100,
            Rank::Jonin => 500,
            Rank::Anbu => 1500,
            Rank::AkatsukiMember => 5000,
        }
    }

    /// Get the next rank's threshold, if any.
    #[must_use]
    pub const fn next_threshold(&self) -> Option<u64> {
        match self {
            Rank::AcademyStudent => Some(25),
            Rank::Genin => Some(100),
            Rank::Chunin => Some(500),
            Rank::Jonin => Some(1500),
            Rank::Anbu => Some(5000),
            Rank::AkatsukiMember => None,
        }
    }
}

/// Get the rank for a given total commit count.
#[must_use]
pub fn rank_for(total_commits: u64) -> RankInfo {
    let rank = match total_commits {
        0..=24 => Rank::AcademyStudent,
        25..=99 => Rank::Genin,
        100..=499 => Rank::Chunin,
        500..=1499 => Rank::Jonin,
        1500..=4999 => Rank::Anbu,
        5000.. => Rank::AkatsukiMember,
    };

    let floor = rank.threshold();
    let next_threshold = rank.next_threshold();
    let progress = if let Some(next) = next_threshold {
        if next == floor {
            0.0
        } else {
            let progress = (total_commits - floor) as f64 / (next - floor) as f64;
            progress.clamp(0.0, 1.0)
        }
    } else {
        // Max rank
        1.0
    };

    RankInfo {
        rank: rank.label().to_string(),
        rank_key: rank.key().to_string(),
        current: total_commits,
        next_threshold,
        progress,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_boundaries() {
        // Test exact boundaries
        assert_eq!(rank_for(0).rank_key, "academy_student");
        assert_eq!(rank_for(24).rank_key, "academy_student");
        assert_eq!(rank_for(25).rank_key, "genin");
        assert_eq!(rank_for(99).rank_key, "genin");
        assert_eq!(rank_for(100).rank_key, "chunin");
        assert_eq!(rank_for(499).rank_key, "chunin");
        assert_eq!(rank_for(500).rank_key, "jonin");
        assert_eq!(rank_for(1499).rank_key, "jonin");
        assert_eq!(rank_for(1500).rank_key, "anbu");
        assert_eq!(rank_for(4999).rank_key, "anbu");
        assert_eq!(rank_for(5000).rank_key, "akatsuki_member");
        assert_eq!(rank_for(10000).rank_key, "akatsuki_member");
    }

    #[test]
    fn test_progress_clamping() {
        // Test progress at boundaries
        let rank = rank_for(0);
        assert_eq!(rank.progress, 0.0);

        let rank = rank_for(24);
        assert_eq!(rank.progress, 0.96); // (24-0)/(25-0) = 0.96

        let rank = rank_for(25);
        assert_eq!(rank.progress, 0.0);

        let rank = rank_for(99);
        assert_eq!(rank.progress, 0.9866666666666667); // (99-25)/(100-25) ≈ 0.9866

        let rank = rank_for(5000);
        assert_eq!(rank.progress, 1.0); // Max rank

        let rank = rank_for(10000);
        assert_eq!(rank.progress, 1.0); // Max rank
    }

    #[test]
    fn test_progress_calculation() {
        // Test some intermediate values
        let rank = rank_for(50);
        assert_eq!(rank.rank_key, "genin");
        assert!((rank.progress - (50.0 - 25.0) / (100.0 - 25.0)).abs() < f64::EPSILON);

        let rank = rank_for(250);
        assert_eq!(rank.rank_key, "chunin");
        assert!((rank.progress - (250.0 - 100.0) / (500.0 - 100.0)).abs() < f64::EPSILON);

        let rank = rank_for(1000);
        assert_eq!(rank.rank_key, "jonin");
        assert!((rank.progress - (1000.0 - 500.0) / (1500.0 - 500.0)).abs() < f64::EPSILON);

        let rank = rank_for(3000);
        assert_eq!(rank.rank_key, "anbu");
        assert!((rank.progress - (3000.0 - 1500.0) / (5000.0 - 1500.0)).abs() < f64::EPSILON);
    }
}
