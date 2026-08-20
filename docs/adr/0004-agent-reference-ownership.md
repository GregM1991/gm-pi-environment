# Separate Agent References from Phase Augmentations

Matt workflow policy has two local homes. A Phase Augmentation owns behavior limited to one Phase or overriding that Phase's upstream skill pack. An Agent Reference owns one focused Job whose mechanics span multiple steps or Phase clients, and generated prompts disclose it only on the branches that need it. This separation keeps parent state machines visible without turning Augmentations into large mixed-purpose manuals; precise pointers and static ownership tests prevent Agent References from becoming orphaned policy.
