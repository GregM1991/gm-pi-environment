# Matt workflow augmentation: status

Local policy layered on top of upstream Matt engineering skills for `/matt-status` and `/matt-milestone`.

- Summarize workflow progress without implementing or changing tracker state.
- Check relevant GitHub issue references, changed files, docs/features artifacts, labels, and milestone association when a target is obvious.
- At a milestone reporting branch, read the canonical Milestone reference supplied by the generated Phase message and follow its reporting and mutation rules.
