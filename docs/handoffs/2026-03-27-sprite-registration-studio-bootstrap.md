## Session Snapshot

- Goal: 실제 샘플 스프라이트 시트를 행 단위로 분리하고 정렬/보정된 결과를 export하는 파이프라인을 만든다.
- Current status: opaque background 후속 디버깅 완료. `GeneralFrog` 배경 누수를 줄이는 foreground refinement와 matte render를 반영했고, 회귀 테스트까지 통과했다.
- Last updated: 2026-03-27
- Primary repos: /home/muhyeon_shin/packages/sprite-registration-studio
- Active branches: 미초기화
- Last touched files:
  - /home/muhyeon_shin/packages/sprite-registration-studio/src/core/mask/foreground.ts
  - /home/muhyeon_shin/packages/sprite-registration-studio/src/core/pipeline/processSpriteSheet.ts
  - /home/muhyeon_shin/packages/sprite-registration-studio/scripts/processSamples.ts
  - /home/muhyeon_shin/packages/sprite-registration-studio/tests/realSamples.test.ts
  - /home/muhyeon_shin/packages/sprite-registration-studio/src/core/types/image.ts
  - /home/muhyeon_shin/packages/sprite-registration-studio/src/core/export/renderAnimationSheet.ts

## Next Actions

- [ ] before/after overlay와 onion-skin 기반의 시각 비교 UI를 추가한다.
- [ ] frame별 anchor/offset을 수동으로 미세 조정할 수 있는 편집 인터랙션을 설계한다.
- [ ] matte cutoff와 anchor lock 같은 수동 보정 옵션을 UI에 연결한다.

## Progress Checklist

- [x] Confirm starting context
- [x] Document current risks and planned edits
- [x] Implement first change set
- [x] Verify first change set
- [x] Implement remaining change set(s)
- [x] Verify final state
- [x] Refresh worklog summary

## Notes for Next Session

- 샘플 처리 명령은 `npm run process:samples`다.
- 생성 결과는 `output/<sheet-name>/<sheet-name>-row-<n>.png`와 `.json`으로 저장된다.
- 실제 샘플 기준 jitter metric은 `output/summary.json`에 기록된다.
- `GeneralFrog` 아티팩트 수정은 foreground refinement + matte regression test까지 반영 완료다.
- 다음 우선순위는 manual fine-tuning UI와 before/after 비교 경험이다.
- 현재 파이프라인은 automatic 1차 보정까지는 가능하지만, 사용자가 원한 최종 목표인 manual fine-tuning UI는 아직 시작 전이다.

## Verification Status

- Commands run:
  - `npm install`
  - `npm test`
  - `npm run process:samples`
  - `npm run build`
- Results:
  - 테스트 3개 통과
  - 실제 샘플 3장 재처리 성공
  - opaque background leakage 회귀 기준 통과
  - production build 성공
- Pending verification:
  - 시각 비교 UI
  - 수동 보정 UX
