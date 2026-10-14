# Pipeline Analyzer: Project Introduction

## What this project is

Pipeline Analyzer is an interactive model of a software delivery pipeline. It helps people explore how a compromise can move between people, code, dependencies, build systems, credentials, releases, and deployed software—and how security controls may block, delay, or detect that movement.

The project is an educational scenario tool. Its results explain the behavior encoded in the model; they are not a real-world security assessment, a prediction of breach probability, or a substitute for reviewing an actual pipeline.

## How to use the model

1. Load the sample pipeline, or create a graph that represents the delivery environment you want to discuss.
2. Choose an attack scenario and start it from a suggested node category. The selected node represents the initial foothold.
3. Read the attack trace hop by hop. Each hop shows the relationship followed, its outcome, the reason for that outcome, and any controls that affected it.
4. Change a control on the relevant node and run the same scenario again. Compare which paths and outcomes changed.
5. Try the other scenarios before drawing conclusions. A control that affects one modeled route may not affect another.

The sample is arranged to make these comparisons visible. For example, a maintainer start can show how the same environment behaves when trusted publishing, dependency installation, or source review is involved.

## The graph model

A graph contains **nodes** and directed **relationships**. Nodes stand for parts of a delivery environment, such as a person, repository, dependency, build environment, CI workflow, credential, artifact registry, distribution service, production runtime, or monitoring system. Relationships describe how one part reaches, uses, publishes to, or otherwise interacts with another.

Node properties represent modeled security settings. They are intentionally simplified into values that can be changed and compared during a demonstration. Edges represent possible movement; they do not mean that every movement is possible in every scenario.

## The three attack scenarios

Each scenario explores a different place where trust can be abused as software moves from development to users. They are inspired by real events, but are teaching models: the sample graph simplifies the steps and controls, and does not claim to reproduce any incident exactly.

### 1. ChainDrop npm Worm

**What it is.** Many applications use packages written and published by other teams. A package may also run setup code automatically when it is installed. If an attacker can publish a malicious version of a trusted package, that code can run on developers' computers or in an automated build environment.

**How the modeled attack works.** Start from a dependency or a person. The simulator follows the package into the build or developer environment. If the malicious install code runs, the environment may expose credentials—secret tokens used to access code hosting, build services, or package registries. If a usable publishing credential is reached, the attacker can publish a poisoned downstream package, which may affect its consumers in turn. That repeated spread is why the scenario is called a worm. In the trace, credential collection can appear as a reverse step from the build environment back to a credential node.

**How to reduce the risk.** The sample lets you disable automatic package install scripts, wait before accepting newly published package versions, and pin dependencies so a build keeps using a reviewed version. In this model, turning off install scripts blocks that execution path. A release waiting period and a pinned dependency together block the modeled fresh release; either one by itself only slows it. Limiting credentials to the smallest necessary permission and lifetime also reduces the chance that a stolen token can publish another package. In real projects, teams should combine these steps with careful dependency updates, protected maintainer accounts, and review of published package contents.

**Real-world context.** GitHub's report on the 2025 Shai-Hulud campaigns describes malicious package install scripts being used to steal credentials and spread infected packages. A separate 2026 campaign, Mini Shai-Hulud, used weaknesses in automated build workflows and exposed credentials to publish malicious packages. These incidents used different details from this simulation, but show why package installation, maintainer credentials, and automated publishing are connected risks. The [OpenSSF npm best-practices guide](https://openssf.org/blog/2022/09/01/npm-best-practices-for-the-supply-chain/) offers broader advice for managing dependency risk.

- [GitHub: Preparing for the next malware campaign (2025 Shai-Hulud reporting and mitigations)](https://github.blog/security/supply-chain-security/strengthening-supply-chain-security-preparing-for-the-next-malware-campaign/)
- [OpenSSF: Mini Shai-Hulud and the limits of build attestations (2026)](https://openssf.org/blog/2026/06/10/mini-shai-hulud-where-slsas-boundaries-fall/)
- [OpenSSF: npm Best Practices for the Supply Chain](https://openssf.org/blog/2022/09/01/npm-best-practices-for-the-supply-chain/)

### 2. Build Tamper (SolarWinds-style)

**What it is.** Software is often assembled by an automated build system. That system takes source code and turns it into a package or update that customers install. If an attacker changes the build process or the build environment, the result can contain malicious code even when customers download it from the normal, trusted source.

**How the modeled attack works.** Start from a build environment. The simulator follows the build output to an artifact store, then to distribution or production. A poisoned build can still carry a valid signature: the signature can show that the expected organization published it, but cannot by itself prove that the contents are safe. The modeled independent rebuild control compares a second build with the published result; a mismatch blocks publication. Strict monitoring can detect the modeled unusual behavior later in the route.

**How to reduce the risk.** Protect build systems as carefully as source repositories. Keep builds isolated from one another, restrict what untrusted changes and workflows can access, limit credentials available during a build, and make releases traceable to reviewed source. Independently rebuilding important releases and comparing the results can reveal unexpected changes introduced during building. Monitoring can help find unusual activity, but it should complement preventive controls. A signed package or build record is useful evidence about origin and process; it is not a guarantee that the source or builder was uncompromised.

**Real-world context.** In the 2020 SolarWinds Orion compromise, attackers inserted malicious code into software updates that were then distributed to customers through the normal update process. CISA's alert and supply-chain guidance describe the incident and recommendations for defending software build and release processes. The simulator compresses that complex operation into a path through a build environment and release pipeline; the real incident involved additional stages and targeted follow-on activity.

- [CISA: Active Exploitation of SolarWinds Software](https://www.cisa.gov/news-events/alerts/2020/12/13/active-exploitation-solarwinds-software)
- [CISA: Defending Against Software Supply Chain Attacks](https://www.cisa.gov/sites/default/files/publications/defending_against_software_supply_chain_attacks_508_1.pdf)
- [OpenSSF: Mini Shai-Hulud analysis of build isolation and signing trust (2026)](https://openssf.org/blog/2026/06/10/mini-shai-hulud-where-slsas-boundaries-fall/)

### 3. Maintainer Takeover (xz-style)

**What it is.** Open-source projects rely on people who review contributions and decide what goes into a release. An attacker may spend time gaining a contributor's trust or may compromise someone who already has release access. If that trusted access is abused, harmful changes can pass through a process that users normally rely on.

**How the modeled attack works.** Start from a person with maintainer access. The modeled route goes through the source repository, an automated release workflow, and the published package. The release workflow can publish an uploaded archive that differs from the source version reviewers examined. A valid signature may still be present because the release was published through a legitimate account or workflow. In the sample, asking for multiple reviewers slows this route but does not stop a trusted maintainer. Requiring the release to be built from reviewed source blocks the modeled uploaded-archive route.

**How to reduce the risk.** Use more than one independent reviewer for important changes, especially changes that affect releases or build automation. Make releases from the reviewed source and check that the published package corresponds to that source. Protect maintainer accounts, review who has release privileges, and monitor changes to release settings and published artifacts. These practices reduce the chance that one person's access or one altered release step can silently change what users receive. No single review rule is enough if the reviewers, accounts, or build process are all compromised together.

**Real-world context.** The 2024 XZ Utils backdoor attempt showed how an attacker could build credibility in an open-source project and introduce malicious changes into a widely used component. A developer noticed unusual behavior and reported the backdoor before it spread broadly through stable operating-system releases. The simulator's maintainer scenario is inspired by the trust and release-process risks highlighted by XZ; it is not a step-by-step reconstruction of that event. OpenSSF and OpenJS later warned maintainers about similar social-engineering attempts against open-source projects.

- [Andres Freund's original XZ Utils backdoor disclosure (Openwall, March 2024)](https://www.openwall.com/lists/oss-security/2024/03/29/4)
- [OpenSSF and OpenJS: Alert on social-engineering takeovers of open-source projects](https://openssf.org/blog/2024/04/15/open-source-security-openssf-and-openjs-foundations-issue-alert-for-social-engineering-takeovers-of-open-source-projects/)
- [OpenSSF: XZ backdoor summary and response](https://openssf.org/blog/2024/03/30/xz-backdoor-cve-2024-3094/)

## Evaluation method

The simulator starts with the chosen node considered compromised, then follows directed edges from reachable nodes. Each scenario has its own allowed routes and evaluates applicable controls on each route. A route the scenario does not allow is omitted from the trace; it does not change a node's outcome.

Each evaluated hop receives one outcome:

- **Compromised:** the target is affected, and the simulator may continue traversing from it.
- **Slowed:** the target is still counted as compromised, and traversal may continue; the result represents added friction rather than prevention.
- **Blocked:** the target is not counted as compromised, and that branch does not continue through the target.
- **Detected:** the target is counted as compromised and traversal may continue, while the result records that detection occurred.

Traversal avoids following the same edge more than once. ChainDrop also models credential harvesting in reverse along applicable authentication relationships, then uses compromised credentials and token scope when evaluating republishing. The trace may therefore contain reverse steps as well as ordinary forward movement.

The simulator evaluates modeled graph structure and property values, not exploit likelihood, time to exploit, business impact, asset criticality, or the quality of real security operations. If a route has no specific rule, the shared base rules or an explicit scenario rule determine its outcome; the trace explains the assumption used for that hop.

## Severity calculation

The displayed score is a simple measure of modeled graph reach, not a conventional risk score:

```text
base score = 10 × (number of compromised nodes ÷ total number of graph nodes)
final score = base score × 0.7, if any detection occurred
              base score, otherwise
```

The starting node is included in the compromised count. Nodes counted as **Slowed** or **Detected** are also included. Blocked nodes are not. The denominator is every node in the graph, including nodes unreachable by the selected scenario. If detection occurs at any hop, the entire base score receives the 30% reduction; the reduction is not weighted by where or how much of the attack was detected.

The label is assigned from the final score:

| Final score | Label |
| --- | --- |
| 7.5–10 | Critical |
| 5–less than 7.5 | High |
| 2.5–less than 5 | Medium |
| Less than 2.5 | Low |

For example, compromising 4 of 10 graph nodes gives a base score of 4.0 (Medium). If any hop is detected, the final score is 2.8 (also Medium).

Because graph size affects the denominator and detection applies a fixed discount, the score is best used to compare changes within the same graph and scenario. It does not indicate probability, expected loss, or the severity of a real incident. A small graph can produce a higher score than a larger graph with the same number of compromised nodes.

## Controls and interpretation

Controls are scenario-specific and deliberately limited. For example, a valid signature can establish who published an artifact without proving that its contents are benign. Likewise, checking that an artifact has not changed in delivery can confirm it matches the published artifact even when the published artifact is already poisoned. The sample uses these cases to distinguish authenticity and consistency from the separate question of whether the artifact itself is trustworthy.

Use the reasons attached to each trace step as the authoritative explanation of the model's decision. A control shown as triggered may slow or detect an attack rather than block it. A control's effect in one scenario should not be generalized to routes or scenarios the model does not evaluate.

## Further reading

For installation, development workflow, repository layout, API contracts, and where implementation changes belong, continue to [ONBOARD.md](ONBOARD.md).
