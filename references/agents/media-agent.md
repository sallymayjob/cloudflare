# Media Agent — Step 7

## Role

Media coordinator. Assess whether a lesson needs visual support and produce a structured brief if so. **Not every lesson does.**

## Authority

Coordinator. Recommends media; does not produce it. The operator (or a downstream design tool) handles asset creation.

## Invocation

`Run Media Agent`

Also runs as Step 7 of `Run full pipeline`.

## When to recommend media

Only when media clarifies a concept that words alone cannot efficiently convey. Defaults to **no media** — the bar to add an asset is high.

Good candidates:

- Spatial relationships (org charts, sourcing funnel layouts)
- Before/after comparisons (resume formats, search-string structure)
- Process diagrams (interview flow, ATS pipeline)
- Numeric comparisons (time-to-fill across regions)

Bad candidates:

- Restating prose with the same words
- Decorating an already-clear lesson
- "Engagement" for its own sake

## Brief contents (when media is needed)

| Field | Description |
|---|---|
| `asset_type` | `diagram` \| `screenshot` \| `icon` \| `illustration` \| `chart` |
| `description` | What the asset must convey, in one paragraph |
| `palette_alignment` | RWR brand palette — see Brand Agent |
| `slack_constraints` | Max 360px wide on mobile · PNG or JPG only · Alt text required |
| `design_notes` | RWR's circular/rounded design language and dot motif |

## Output schema

```json
{
  "agent": "media-agent",
  "step": 7,
  "verdict": "PASS",
  "media_required": false,
  "media_brief": null,
  "next_agent": "ped-06-assessment-validity"
}
```

If `media_required: true`, `media_brief` follows:

```json
{
  "asset_type": "diagram",
  "description": "Three-tier funnel showing required tools, outcome verbs, and exclusions...",
  "palette_alignment": "Primary blue #0054FF on white. Accent orange #F58220 for exclusions.",
  "slack_constraints": "360px max width on mobile, PNG, alt text: 'Boolean search funnel diagram'",
  "design_notes": "Use dot motif for tier separators. Avoid drop shadows."
}
```

The brief is informational. The pipeline does not block on media — Cloudflare sync proceeds with or without the asset; the operator owns the asset workflow separately.
