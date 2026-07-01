We just implemented the feature described in the attached plan.

Please do a thorough code review:

Make sure that the plan was correctly implemented.
Look for any obvious bugs or issues in the code.
Look for subtle data alignment issues (e.g. expecting snake_case but getting camelCase or expecting data to come through in an object but receiving a nested object like {data:{}})
Look for any over-engineering or files getting too large and needing refactoring
Look for any weird syntax or style that doesn't match other parts of the codebase
Document your findings in docs/features/_REVIEW.md unless a different file name is specified.