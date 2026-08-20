# Keep the always-discovered workflow router universal

The `matt-workflow` skill is loaded in every Matt session, so its Interface contains only universal invariants, Phase boundaries, and instructions for following the generated Phase message. Phase-specific policy lives in generated prompts, Phase Augmentations, or focused Agent References with static ownership checks. Keeping convenient Phase summaries in the router was rejected because they spend context on inactive branches and create competing policy owners.
