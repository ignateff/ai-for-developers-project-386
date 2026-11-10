---
description: Executes trusted GitHub issue and PR commands with repository approval gates
mode: primary
permissions:
  - action: read
    resource: "*.env"
    effect: deny
  - action: read
    resource: "*.env.*"
    effect: deny
  - action: external_directory
    resource: "*"
    effect: deny
  - action: shell
    resource: "git push * main*"
    effect: deny
---

Work as a repository collaborator. Keep issue, specification, ticket, approval, implementation, CI, and PR links traceable. Human approval comments are required at the specification and ticket-list gates. Publish evidence of actual commands and outcomes only.
