# Metadata Schema Documentation

**Version:** 1.3  
**Last Updated:** 2026-01-10

## Overview

The Smooth Ride Tracker metadata schema provides a stable, validated data contract for ride recordings. This schema serves as the single source of truth for all UI screens (Home, History, Stats) and future backend integration.

## Schema Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.3 | 2026-01-10 | Added timezone clarity fields, GPS sampling explanation, enhanced data integrity rules, locked enumerations |
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
| `jsTimezoneOffsetMinutes` | ✅ | `number` | minutes | JavaScript `Date.getTimezoneOffset()` value | **Israel = -120** (negative for east of UTC) |
| `utcOffsetMinutes` | ✅ | `number` | minutes | UTC offset (inverse of JS offset) | **Israel = +120** (positive for east of UTC) |
| `timezoneOffsetMinutes` | ⚠️ | `number` | minutes | **DEPRECATED** - Use `jsTimezoneOffsetMinutes` | Same as `jsTimezoneOffsetMinutes` |

> [!IMPORTANT]
> **Timezone Invariant:** `utcOffsetMinutes === -jsTimezoneOffsetMinutes` must always be true.

### Application

| Field | Required | Type | Meaning |
|-------|----------|------|---------|
| `app.name` | ✅ | `string` | Application name |
| `app.version` | ✅ | `string` | Application version |
| `app.build` | ❌ | `string` | Build identifier |

### Device

| Field | Required | Type | Meaning | Notes |
|-------|----------|------|---------|-------|
| `device.userAgent` | ✅ | `string` | Browser user agent | |
| `device.os.name` | ✅ | `enum` | Operating system | `"iOS"` \| `"Android"` \| `"Windows"` \| `"MacOS"` \| `"Linux"` \| `"Unknown"` |
| `device.os.major` | ❌ | `number` | OS major version | |
| `device.browserName` | ✅ | `string` | Browser name | |
| `device.browserMajor` | ✅ | `number \| string` | Browser major version | |
| `device.platform` | ❌ | `string` | Platform string | |
| `device.language` | ❌ | `string` | Browser language | |
| `device.screen` | ❌ | `object` | Screen dimensions | |

### Sampling

| Field | Required | Type | Units | Meaning | Notes |
|-------|----------|------|-------|---------|-------|
| `sampling.sensorRateHz` | ✅ | `number` | Hz | Sensor sampling rate | |
| `sampling.accelerometerHz` | ✅ | `number` | Hz | Accelerometer rate | |
| `sampling.gyroscopeHz` | ❌ | `number` | Hz | Gyroscope rate | |
| `sampling.gpsHz` | ✅ | `number` | Hz | GPS update rate | **Always computed as:** `gpsUpdates / durationSeconds` |
| `sampling.gps.nativeHz` | ✅ | `number` | Hz | Native GPS rate | Same as `gpsHz` |
| `sampling.gps.replicatedToSensorRate` | ✅ | `boolean` | | Whether GPS is replicated | |
| `sampling.gps.replicationMode` | ✅ | `"repeat-last"` | | Replication strategy | |
| `sampling.gps.rateEstimateMethod` | ✅ | `"updates/duration"` | | How GPS rate is computed | Always this literal |
| `sampling.gps.expectedRangeHz` | ✅ | `[number, number]` | Hz | Expected GPS rate range | Example: `[0.2, 1.2]` |
| `sampling.gps.rateConfidence` | ✅ | `enum` | | Confidence in GPS rate | `"low"` \| `"medium"` \| `"high"` |

> [!NOTE]
> **GPS Rate Confidence:**
> - `"low"`: < 15 GPS updates
> - `"medium"`: 15-30 GPS updates
> - `"high"`: > 30 GPS updates

### Counts

| Field | Required | Type | Meaning |
|-------|----------|------|---------|
| `counts.accelSamples` | ✅ | `number` | Number of accelerometer samples |
| `counts.gyroSamples` | ✅ | `number` | Number of gyroscope samples |
| `counts.gpsUpdates` | ✅ | `number` | Number of actual GPS updates |
| `counts.gpsSnapshots` | ✅ | `number` | Number of GPS snapshots (replicated) |
| `counts.totalEvents` | ✅ | `number` | Total events (accel + gyro + gps) |

### Derived Ratios

| Field | Required | Type | Meaning | Notes |
|-------|----------|------|---------|-------|
| `derivedRatios.gpsReplicationFactor` | ✅ | `number` | GPS replication factor | `gpsSnapshots / max(1, gpsUpdates)` |
| `derivedRatios.samplesPerSecond` | ✅ | `number` | Samples per second | `accelSamples / durationSeconds` |

### Units

| Field | Required | Type | Value |
|-------|----------|------|-------|
| `units.accel` | ✅ | `"m/s^2"` | Acceleration unit |
| `units.gyro` | ✅ | `"rad/s"` | Gyroscope unit |
| `units.speed` | ✅ | `"m/s"` | Speed unit |
| `units.distance` | ✅ | `"m"` | Distance unit |

### Processing

| Field | Required | Type | Units | Meaning | Notes |
|-------|----------|------|-------|---------|-------|
| `processing.earthFrameEnabled` | ✅ | `boolean` | | Whether earth frame is used | |
| `processing.gravityRemoved` | ✅ | `boolean` | | Whether gravity is removed | |
| `processing.smoothing.type` | ✅ | `enum` | | Smoothing type | `"none"` \| `"ema"` \| `"median"` |
| `processing.smoothing.window` | ✅ | `number \| null` | | Smoothing window size | |
| `processing.smoothing.params` | ✅ | `object \| null` | | Smoothing parameters | |
| `processing.integrityRules.expectedDtMs` | ✅ | `number` | ms | Expected time between samples | Computed as `1000 / sensorRateHz` |
| `processing.integrityRules.gapThresholdMultiplier` | ✅ | `number` | | Gap threshold multiplier | Default: `2.0` |
| `processing.integrityRules.minGapMs` | ✅ | `number` | ms | Minimum gap threshold | Default: `150` |
| `processing.integrityRules.dropoutThresholdMs` | ✅ | `number` | ms | Dropout threshold | Default: `5000` |

> [!IMPORTANT]
> **Gap Detection Logic:**
> A gap is counted only if **BOTH** conditions are met:
> 1. `dt > expectedDtMs * gapThresholdMultiplier`
> 2. `dt > minGapMs`
>
> This prevents false positives from 1-sample jitter.

### Statistics

| Field | Required | Type | Units | Meaning |
|-------|----------|------|-------|---------|
| `statsSummary.maxAbsAccel` | ✅ | `number` | m/s² | Maximum absolute acceleration |
| `statsSummary.maxAbsAccelContext.value` | ✅ | `number` | m/s² | Max acceleration value |
| `statsSummary.maxAbsAccelContext.unit` | ✅ | `"m/s^2"` | | Unit |
| `statsSummary.maxAbsAccelContext.p95` | ✅ | `number \| null` | m/s² | 95th percentile |
| `statsSummary.maxAbsAccelContext.p99` | ✅ | `number \| null` | m/s² | 99th percentile |
| `statsSummary.maxAbsGyro` | ❌ | `number` | rad/s | Maximum absolute gyroscope |
| `statsSummary.gpsDistanceMeters` | ✅ | `number` | meters | Total GPS distance |
| `statsSummary.avgSpeedMps` | ✅ | `number` | m/s | Average speed |

### Quality Flags

| Field | Required | Type | Meaning | Notes |
|-------|----------|------|---------|-------|
| `qualityFlags.isGpsLikelyDuplicated` | ✅ | `boolean` | GPS data likely duplicated | |
| `qualityFlags.isStationaryLikely` | ✅ | `boolean` | Ride likely stationary | |
| `qualityFlags.hasLowGpsQuality` | ✅ | `boolean` | GPS quality is low | |
| `qualityFlags.gpsQualityReason` | ✅ | `enum` | Reason for GPS quality | See enum below |
| `qualityFlags.phoneStability` | ✅ | `enum` | Phone stability assessment | See enum below |
| `qualityFlags.dataIntegrity.hasGaps` | ✅ | `boolean` | Data has meaningful gaps | Not 1-sample jitter |
| `qualityFlags.dataIntegrity.gapCount` | ✅ | `number` | Number of gaps | Always present, even if 0 |
| `qualityFlags.dataIntegrity.dropoutCount` | ✅ | `number` | Number of dropouts | Always present, even if 0 |

#### GPS Quality Reason Enum

| Value | Meaning |
|-------|---------|
| `"good"` | GPS quality is good (≥3 updates, no issues) |
| `"urban-canyon"` | GPS affected by urban canyon effect |
| `"no-fix"` | No GPS fix obtained (permission denied or unavailable) |
| `"low-accuracy"` | GPS accuracy is low (>50m) |
| `"unknown"` | GPS quality unknown |

#### Phone Stability Enum

| Value | Meaning | Threshold |
|-------|---------|-----------|
| `"stable"` | Phone is stable | stdDev < 1.5 m/s² |
| `"mixed"` | Phone has mixed stability | 1.5 ≤ stdDev < 3.0 m/s² |
| `"unstable"` | Phone is unstable | stdDev ≥ 3.0 m/s² |
| `"unknown"` | Stability unknown | < 10 samples |

### Privacy

| Field | Required | Type | Meaning |
|-------|----------|------|---------|
| `privacy.containsRawGps` | ✅ | `boolean` | Contains raw GPS coordinates |
| `privacy.containsUserIdentifiers` | ✅ | `boolean` | Contains user identifiers |
| `privacy.intendedUse` | ✅ | `"aggregated-analysis-only"` | Intended use |
| `privacy.dataMinimizationNotes` | ✅ | `string` | Data minimization notes |

### UI Display

| Field | Required | Type | Meaning | Notes |
|-------|----------|------|---------|-------|
| `display.summaryReason` | ✅ | `string` | Hebrew summary for UI | Single source of truth for UI display |

### Notes

| Field | Required | Type | Meaning |
|-------|----------|------|---------|
| `notes` | ❌ | `string` | Additional notes |

---

## Migration Guide

### From v1.2 to v1.3

When loading metadata with `schemaVersion: "1.2"`, the following migrations are automatically applied:

1. **Timezone Fields:**
   - `jsTimezoneOffsetMinutes` = existing `timezoneOffsetMinutes`
   - `utcOffsetMinutes` = `-timezoneOffsetMinutes`

2. **GPS Sampling Fields:**
   - `sampling.gps.rateEstimateMethod` = `"updates/duration"`
   - `sampling.gps.expectedRangeHz` = `[0.2, 1.2]`
   - `sampling.gps.rateConfidence` = computed from `gpsUpdates` count

3. **Data Integrity Rules:**
   - `processing.integrityRules.expectedDtMs` = computed from `sensorRateHz`
   - `processing.integrityRules.minGapMs` = `150`

4. **Enum Updates:**
   - `gpsQualityReason`: `"permission-denied"` → `"no-fix"`
   - `gpsQualityReason`: `"low-fix-confidence"` → `"low-accuracy"`
   - `phoneStability`: Add `"mixed"` option

5. **Schema Version:**
   - `schemaVersion` = `"1.3"`

---

## Validation

Runtime validation is performed using Zod before export. The following validations are enforced:

### Required Field Validation
All required fields must be present and have valid types.

### Custom Validations

1. **Timezone Inversion:**
   ```typescript
   utcOffsetMinutes === -jsTimezoneOffsetMinutes
   ```

2. **GPS Rate Computation:**
   ```typescript
   gpsHz === gpsUpdates / durationSeconds
   ```

3. **Enum Values:**
   - `gpsQualityReason` must be one of: `"good"`, `"urban-canyon"`, `"no-fix"`, `"low-accuracy"`, `"unknown"`
   - `phoneStability` must be one of: `"stable"`, `"mixed"`, `"unstable"`, `"unknown"`

### Validation Errors

If validation fails, export is blocked and user-friendly error messages are displayed.

---

## Example Metadata

```json
{
  "schemaVersion": "1.3",
  "idStrategy": "timestamp-ms + random-suffix",
  "rideId": "1736282000000-abcde",
  "startEpochMs": 1736282000000,
  "endEpochMs": 1736282060000,
  "createdAtIso": "2026-01-10T17:00:00.000Z",
  "endedAtIso": "2026-01-10T17:01:00.000Z",
  "durationMs": 60000,
  "durationSeconds": 60.0,
  "jsTimezoneOffsetMinutes": -120,
  "utcOffsetMinutes": 120,
  "timezoneOffsetMinutes": -120,
  "app": {
    "name": "Smooth Ride Tracker",
    "version": "0.2.5"
  },
  "sampling": {
    "sensorRateHz": 10,
    "accelerometerHz": 10,
    "gpsHz": 0.05,
    "gps": {
      "nativeHz": 0.05,
      "replicatedToSensorRate": true,
      "replicationMode": "repeat-last",
      "rateEstimateMethod": "updates/duration",
      "expectedRangeHz": [0.2, 1.2],
      "rateConfidence": "low"
    }
  },
  "processing": {
    "integrityRules": {
      "expectedDtMs": 100,
      "gapThresholdMultiplier": 2.0,
      "minGapMs": 150,
      "dropoutThresholdMs": 5000
    }
  },
  "qualityFlags": {
    "gpsQualityReason": "good",
    "phoneStability": "stable",
    "dataIntegrity": {
      "hasGaps": false,
      "gapCount": 0,
      "dropoutCount": 0
    }
  },
  "display": {
    "summaryReason": "נסיעה הושלמה בהצלחה"
  }
}
```

---

## Best Practices

1. **Always validate metadata before export** using `validateMetadata()` from `metadataValidation.ts`
2. **Never recompute derived fields in UI** - use metadata as single source of truth
3. **Use `display.summaryReason` directly** - do not regenerate summaries
4. **Check timezone inversion** when debugging timezone issues
5. **Verify GPS rate computation** when debugging GPS sampling issues

---

## References

- TypeScript Interface: `src/lib/metadata.ts`
- Zod Validation Schema: `src/lib/metadataValidation.ts`
- Migration Logic: `src/lib/metadata.ts` (`migrateMetadata()`)
