# Roadmap

This document tracks features and enhancements planned for future phases of Akatsuki Git. These are deferred from the initial build to focus on core functionality.

## Near-Term Enhancements

### Achievements
Milestone-based awards for specific accomplishments:
- First commit ever
- 100 commits in a single day
- 1000 total commits
- First merge conflict resolved
- 30-day commit streak

### Chakra Level
A secondary progression system that tracks overall activity:
- Chakra builds up with consistent commit activity
- Decays over time if inactive
- Visual indicator in status bar (e.g., Chakra: 75%)
- Temporary bonuses or titles at maximum chakra

### Full Dashboard Webview
A dedicated panel showing:
- Current rank and progress bar
- Recent commit history with timestamps
- Rank milestone timeline
- Character path information
- Achievement showcase
- Statistics dashboard (commits per day/week/month)

## Medium-Term Features

### Sharingan Build Mode
A "focused mode" for developers:
- Activated via command or gesture
- Changes VS Code theme to a "Sharingan" red theme
- Filters notifications to reduce distractions
- Shows a special "Sharingan active" indicator
- Optional: time-tracking for focused sessions

### Daily Missions
Time-limited challenges to encourage consistency:
- "Complete 10 commits today"
- "Resolve a merge conflict"
- "Work on 3 different repositories"
- Reward: special titles, badges, or chakra boosts
- Reset daily with streak tracking

### Voice Packs
Audio feedback for Git operations:
- Character-specific voices (Itachi, Pain, Obito, Madara)
- Spoken in-flight messages (e.g., "Transmitting intelligence to Akatsuki Headquarters…")
- Completion announcements (e.g., "Mission accomplished")
- Optional, configurable volume
- Community-contributed packs for other characters

## Long-Term Vision

### Team Mode
Collaborative features for development teams:
- Team-wide commit tracking
- Team leaderboards (opt-in)
- Shared missions and challenges
- Team achievement unlocks
- Clan naming and customization

### Animated Clouds
Enhanced visual polish:
- Animated Akatsuki cloud icons
- Cloud density changes based on activity
- Special animations for rank-up events
- Weather effects tied to commit patterns

### Branch Timeline Visualization
Visual representation of Git history:
- Interactive branch graph in dashboard webview
- Commit nodes colored by operation type
- Timeline zoom and pan
- Highlight merge conflict resolution points
- Export/share visualization

### Legendary Titles
Prestige system beyond ranks:
- Unlock special titles at high commit counts (e.g., "Shadow Hokage" at 10,000 commits)
- Rare titles for specific achievements
- Title display in status bar and profile
- Bragging rights in team mode

### Protocol Codegen with `ts-rs`
Replace hand-mirrored protocol types:
- Use `ts-rs` crate to automatically generate TypeScript from Rust
- Eliminate manual synchronization step
- Reduce bugs from type mismatches
- Automatically handle `PROTOCOL_VERSION` bumps

## Implementation Notes

### Priority Considerations

Features are prioritized based on:
- User value and engagement potential
- Implementation complexity
- Dependencies on other features
- Community feedback

### Contribution Guidelines

These features are open to community contribution:
1. Check this roadmap for planned features
2. Open an issue to discuss implementation approach
3. Submit PRs with clear descriptions
4. Follow the architecture patterns in [ARCHITECTURE.md](ARCHITECTURE.md)

### Timeline

- **Near-term**: Expected in next 2-3 months
- **Medium-term**: Expected in 3-6 months
- **Long-term**: No specific timeline; exploratory

Actual delivery depends on:
- Core functionality stability
- Community adoption and feedback
- Contributor availability

## Feedback

Want to influence the roadmap? Provide feedback by:
- Opening GitHub issues with feature suggestions
- Voting on existing issues
- Sharing usage patterns and pain points
- Contributing to planned features

The roadmap evolves based on user needs and technical feasibility. Your input helps shape the future of Akatsuki Git.
