# Pipeline Analyzer

Pipeline Analyzer models software delivery graphs and simulates three attack paths on one shared sample pipeline.

## Demo script

1. Select **Load Sample**, then run **ChainDrop** from `npm: cache-utils`. The worm fans out through the pipeline. Set `releaseCooldown` to `7 days` and `lockfilePinned` to `true` on that dependency to block it.
2. Switch to **Build Tamper (SolarWinds-style)** and use **Use recommended start** to select **Shared CI Runner**. The registry still accepts the release even with signature verification enabled. Set `reproducibleBuilds` to `true` on the runner to stop the attack at the registry. Optionally set SIEM `alertThreshold` to **All Anomalies (Zero-Tolerance)** to detect it.
3. Switch to **Maintainer Takeover (xz-style)** and use **Use recommended start** to select **Package Maintainer**. Set `requiredReviewers` to **2+ reviewers**; this slows the attack but does not stop it. Set `releaseSource` to **Built from tag** on the release workflow to block the release at the registry.
4. Close with the point that no single control stops all three attacks.

## Control coverage

| Control | ChainDrop | BuildTamper | MaintainerTakeover |
| --- | --- | --- | --- |
| Cooldown + lockfile pin | Blocks | — | — |
| `signatureVerification` on registry | No effect with trusted publishing (sample config) | No effect | No effect |
| `integrityCheck` on distribution | No effect | No effect | No effect |
| `reproducibleBuilds` | — | Blocks | — |
| `releaseSource = Built from tag` | — | — | Blocks |
| `requiredReviewers = 2+` | — | — | Slows |
| SIEM `Zero-Tolerance` | Detects | Detects | No effect |
