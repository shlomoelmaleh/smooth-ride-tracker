# Metadata Schema Documentation

**Version:** 1.3  
**Last Updated:** 2026-01-10

## Overview

The Smooth Ride Tracker metadata schema provides a stable, validated data contract for ride recordings. This schema serves as the single source of truth for all UI screens (Home, History, Stats) and future backend integration. 

Starting from v1.3, an **Automatic Metadata Validator** is embedded into the build process, ensuring strict internal consistency.

## Schema Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.3 | 2026-01-10 | **Locked Data Contract.** Added automatic validation, nested timezone, i18n labels, sampling explanations, and export metadata. |
| 1.2 | 2026-01-07 | Added display summary, phone stability, data integrity tracking |
| 1.1 | Earlier | Initial structured metadata |

---

## Field Reference

### Core Identity

| Field | Required | Type | Meaning | Notes |
|-------|----------|------|---------|-------|
| `schemaVersion` | ✅ | `string` | Metadata schema version | Current: `"1.3"` |
| `idStrategy` | ✅ | `"timestamp-ms + random-suffix"` | ID generation strategy | Always this literal value |
| `rideId` | ✅ | `string` | Unique ride identifier | Format: `{timestamp}-{random}` |

### Timing

| Field | Required | Type | Units | Meaning | Notes |
|-------|----------|------|-------|---------|-------|
| `startEpochMs` | ✅ | `number` | milliseconds | Unix timestamp of ride start | |
| `endEpochMs` | ✅ | `number` | milliseconds | Unix timestamp of ride end | |
| `createdAtIso` | ✅ | `string` | ISO 8601 | Start time in ISO format | |
| `endedAtIso` | ✅ | `string` | ISO 8601 | End time in ISO format | |
| `durationMs` | ✅ | `number` | milliseconds | Total ride duration | |
| `durationSeconds` | ✅ | `number` | seconds | Total ride duration | Rounded to 3 decimal places |

### Timezone (Unambiguous)

| Field | Required | Type | Units | Meaning | Notes |
|-------|----------|------|-------|---------|-------|
| `timezone.jsTimezoneOffsetMinutes` | ✅ | `number` | minutes | JavaScript `Date.getTimezoneOffset()` | **Positive = West of UTC** (e.g. UTC-5 = +300) |
| `timezone.utcOffsetMinutes` | ✅ | `number` | minutes | UTC offset | **Positive = East of UTC** (e.g. Israel = +120) |
| `timezone.note` | ✅ | `string` | | Explains sign convention | |

> [!IMPORTANT]
> **Timezone Invariant:** `utcOffsetMinutes === -jsTimezoneOffsetMinutes` must always be true.

### Device

| Field | Required | Type | Meaning | Notes |
|-------|----------|------|---------|-------|
| `device.userAgent` | ✅ | `string` | Browser user agent | |
| `device.os.name` | ✅ | `enum` | Operating system | `"iOS"` \| `"Android"` \| `"Windows"` \| `"MacOS"` \| `"Linux"` \| `"Unknown"` |
| `device.os.versionFull` | ❌ | `string` | Full OS version | e.g., `"26.2.0"` |
| `device.browserName` | ✅ | `string` | Browser name | e.g., `"Chrome iOS"` for CriOS |
| `device.browserVersionFull` | ✅ | `string` | Full browser version | e.g., `"143.0.7499.151"` |

### Sampling

| Field | Required | Type | Units | Meaning | Notes |
|-------|----------|------|-------|---------|-------|
| `sampling.sensorRateHz` | ✅ | `number` | Hz | Target sampling rate | |
| `sampling.accelerometerHz` | ✅ | `number` | Hz | Measured accel rate | |
| `sampling.gpsHz` | ✅ | `number` | Hz | GPS update rate | **Strictly:** `gpsUpdates / durationSeconds` |
| `sampling.gps.rateConfidence` | ✅ | `enum` | | Confidence in GPS rate | `"low"` (0-15) \| `"medium"` (15-30) \| `"high"` (>30) |

### Counts

| Field | Required | Type | Meaning |
|-------|----------|------|---------|
| `counts.accelSamples` | ✅ | `number` | Number of accelerometer samples |
| `counts.gpsUpdates` | ✅ | `number` | Number of actual GPS updates |
| `counts.warmupSamplesDropped` | ✅ | `number` | Samples dropped during startup |
| `counts.firstGpsFixDelayMs` | ✅ | `number \| null` | Delay until first location fix |

### Quality Flags & Evidence

| Field | Required | Type | Meaning | Notes |
|-------|----------|------|---------|-------|
| `qualityFlags.gpsQualityReason` | ✅ | `enum` | Reason for quality status | `"good"` \| `"urban-canyon"` \| `"no-fix"` \| `"low-accuracy"` \| `"unknown"` |
| `qualityFlags.gpsQualityEvidence` | ❌ | `object` | Numeric indicators | `avgAccuracyMeters`, `maxJumpMeters`, `unrealisticSpeedCount` |
| `qualityFlags.phoneStability` | ✅ | `enum` | Phone stability | `"stable"` \| `"mixed"` \| `"unstable"` \| `"unknown"` |

### UI Display (i18n)

| Field | Required | Type | Meaning |
|-------|----------|------|---------|
| `display.summaryReasonKey` | ✅ | `string` | Stable key for localization |
| `display.summaryReasonI18n.he` | ✅ | `string` | Hebrew summary text |
| `display.summaryReasonI18n.en` | ✅ | `string` | English summary text |

### Automatic Validation (Lock)

Embedded validation results added on every recording stop.

| Field | Required | Type | Meaning |
|-------|----------|------|---------|
| `validation.status` | ✅ | `enum` | Overall status | `"pass"` \| `"warn"` \| `"fail"` |
| `validation.errors` | ✅ | `string[]` | Critical consistency errors | |
| `validation.warnings` | ✅ | `string[]` | Heuristic warnings | |
| `validation.checkedAtIso` | ✅ | `string` | Check timestamp | |
| `validation.rulesVersion` | ✅ | `string` | Version of validator used | |

---

## Validation Rules

### A. Time Consistency
- `durationMs` must equal `endEpochMs - startEpochMs` (±10ms).
- ISO dates must match epoch values (±1s).

### B. Sampling Consistency
- `accelSamples` ≈ `durationSeconds * accelerometerHz` (±3%).
- `gpsUpdates` ≈ `durationSeconds * gpsHz` (±20%).
- If GPS replication is ON, `gpsSnapshots` ≈ `accelSamples` (±2%).

### C. Value Sanity
- Sensor rates must be in `[10..240]`.
- `gpsHz` must be in `[0.1..5]`.
- Timezone offsets must be in `[-720..840]`.

---

## Export Metadata

| Field | Required | Type | Meaning | Notes |
|-------|----------|------|---------|-------|
| `export.format` | ✅ | `"json" \| "zip"` | Export format | |
| `export.files` | ✅ | `array` | List of exported files | Includes `name`, `bytes`, `sha256` |
| `export.compressionRatio`| ✅ | `number \| null` | Compression factor | |

---

## Migration Guide

### From v1.2 to v1.3

1. **Timezone:** Flat fields moved to nested `timezone` object.
2. **Display:** Single `summaryReason` string replaced by i18n structure.
3. **Validation:** `validation` block added automatically during normalization.
4. **Sampling:** `warmupSamplesDropped` and `firstGpsFixDelayMs` added (default 0/null).

---

## References

- Implementation: `src/lib/metadata.ts`
- Validator: `src/lib/metadataValidator.ts`
- Tests: `src/lib/metadataValidation.test.ts`
