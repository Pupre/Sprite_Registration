# GeneralFrog Stage 2 Sprite Sheet Design

## Goal

Create one new sprite sheet PNG for the stage-2 evolution of `GeneralFrog` as a pet asset. The source of truth for stage 1 is `samples/GeneralFrog.png`. The new asset should feel like a clear evolution of the same frog knight while preserving the original identity and leaving enough headroom for stages 3-5.

## Product Context

The broader project exists to stabilize sprite-sheet playback when AI-generated frames have inconsistent pivots and contact points. This new asset should therefore be designed with two goals at once:

1. deliver a convincing stage-2 evolved character sheet
2. reduce frame-to-frame jitter risk as much as possible before the project's alignment pipeline is applied

The asset is intended for use as a pet, not a primary boss or enemy. It may fight, but it should read first as a companion character.

This task is also an image-generation capability test. The prompt should therefore stay realistic to actual usage rather than being compressed to the point that it no longer reflects normal generation behavior.

## Character Direction

### Core identity to preserve

- frog knight silhouette
- small crown or crown-like helm
- red cape
- sword-bearing heroic look
- friendly, charming pet readability

### Stage-2 evolution direction

The selected direction is a moderate "royal growth" evolution. This is not a dramatic final-form transformation. The character should feel slightly more mature, more stable, and more competent than stage 1, but still clearly be an early-to-mid progression step.

### Visual growth rules

- keep the overall silhouette close to stage 1
- slightly improve posture, balance, and confidence
- make the body feel a bit sturdier and more composed
- refine crown, cape, sword, and armor details by one step
- preserve the cute and approachable pet tone
- avoid large magical effects or extreme body changes
- avoid using spectacle to fake growth; the body and pose should carry the evolution feeling

## Output Scope

Produce one sprite sheet PNG for the stage-2 evolved GeneralFrog.

The sheet should use the existing convention of one animation per row. Frame counts do not need to stay fixed at four. Each row may use the number of frames that best supports the motion.

The scope is intentionally limited to a single evolution step. This task does not attempt to generate stages 3-5. Instead, it treats `samples/GeneralFrog.png` as the known stage-1 form and asks for the next-step stage-2 form, expressed through multiple animation rows inside that one sheet.

## Required Animations

- `Idle`
- `Walk`
- `Attack`
- `Skill`
- `Emote`

### Animation intent

#### Idle

Use a calm, confident stance with subtle breathing and small secondary motion in the cape or crown.

#### Walk

Use a more assured and balanced gait than stage 1. The pet feel should remain light and readable.

#### Attack

Use a cleaner, more practiced sword swing than stage 1. This should feel like improved control rather than a huge power jump.

#### Skill

Show a restrained stage-2 awakening moment. Favor focused energy or symbolic knightly power over explosive spectacle.

#### Emote

Use a pet-like expressive reaction, such as pride, delight, or a confident chirpy response. It should reinforce charm without breaking the knight identity.

## Suggested Frame Ranges

- `Idle`: 4-6 frames
- `Walk`: 6-8 frames
- `Attack`: 5-7 frames
- `Skill`: 6-8 frames
- `Emote`: 4-6 frames

These are targets, not rigid requirements.

## Transparency and Background

- final sprite sheet background must be fully transparent
- no checkerboard, environment plate, or painted backdrop should remain in the exported asset

## Pivot and Registration Strategy

This is a first-class requirement.

### Generation-time constraints

The sprite sheet generation prompt should explicitly push for:

- fixed camera angle
- stable character scale across frames
- stable body centerline
- consistent foot contact and ground plane
- minimal frame-to-frame drift in torso and head placement
- restrained secondary motion so cape and sword do not cause large apparent bounds shifts

### Motion-design constraints

Animations should be composed conservatively enough to reduce jitter risk:

- `Idle` should rely on breathing and tiny cloth motion, not large body bobbing
- `Walk` should keep the body mass traveling in a controlled arc
- `Attack` should preserve a believable shared center of balance
- `Skill` should avoid large teleport-like or explosive pose changes
- `Emote` should read clearly without wide spatial displacement

### Post-generation handling

Even with careful generation, perfect pivot consistency is not assumed. The output should be passed through the current project alignment pipeline after generation. Success means:

- the generated source is already relatively stable
- the existing registration pipeline can further tighten alignment without fighting severe drift

## Quality Bar

The result should read as:

> the same GeneralFrog, now one stage more mature, more royal, and more reliable, but not yet close to a final-form transformation

Failure cases:

- looks like a completely different frog character
- stage-2 growth is so small that it feels like a recolor
- stage-2 growth is so dramatic that later stages lose room to escalate
- pet charm is lost in favor of aggressive enemy energy
- transparent background is incomplete
- animation rows are so unstable that playback visibly jitters before registration

## Implementation Notes

- use `samples/GeneralFrog.png` as the visual reference for identity
- treat `samples/GeneralFrog.png` explicitly as the stage-1 form
- create only the stage-2 sheet in this task
- generate a PNG asset as the primary deliverable for this test
- preserve room for later stages 3-5 to escalate body, armor, regality, and power presentation
