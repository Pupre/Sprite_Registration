# Home Session Handoff

- 날짜: 2026-03-27
- 프로젝트: `sprite-registration-studio`
- 위치: `/home/muhyeon_shin/packages/sprite-registration-studio`
- 이 파일 용도: 집 세션에서 바로 읽고 이어서 작업하기 위한 최신 요약
- 우선 읽을 파일: 이 파일
- 상세 로그: `docs/worklogs/2026-03-27-sprite-registration-studio-bootstrap.md`

## 한 줄 결론

현재까지 확실히 건진 것은 `투명 알파가 있는 스프라이트에 대한 프레임 정렬 엔진`이다. `불투명 배경 이미지를 억지로 투명 복원하는 경로`는 제품 핵심으로 가져가면 안 된다.

## 지금까지 만든 것

- `4x3` 스프라이트 시트를 읽는다.
- 그리드를 감지하고 셀 단위로 분리한다.
- 각 행을 하나의 애니메이션으로 처리한다.
- 프레임별 core anchor / ground 기준으로 offset을 계산한다.
- 행 단위 결과 시트(`1x4`)와 JSON 메타데이터를 export한다.
- jitter 감소를 측정하는 자동 테스트를 만든 상태다.

핵심 코드 경로:

- `src/core/pipeline/processSpriteSheet.ts`
- `src/core/alignment/alignAnimation.ts`
- `src/core/export/renderAnimationSheet.ts`
- `src/core/mask/foreground.ts`
- `tests/alignment.test.ts`
- `tests/realSamples.test.ts`

## 샘플별 현재 판단

### 1. Sparky

가장 중요하다. `Sparky`는 실제 투명 알파가 있는 샘플이라 현재 엔진의 핵심 성능을 가장 잘 보여준다.

현재 판단:

- `투명 입력 전제`에서는 정렬 목표가 유효하게 달성됐다.
- 같은 셀 크기로 잘라 재생했을 때 프레임 흔들림이 크게 줄어드는 방향이 맞다.
- 현재 엔진의 진짜 기준 샘플은 `Sparky`다.

근거:

- `output/summary.json`에서 `Sparky` 3개 애니메이션의 improvement ratio가 모두 `0.0001` 수준이다.
- 즉 registration 자체는 강하게 먹힌다.

### 2. GeneralFrog / Slime

이 둘은 `실제 투명 알파가 없는 불투명 배경 합성 이미지`다.

중요한 판단:

- 이 둘에서 망가진 핵심 원인은 `정렬 알고리즘` 자체라기보다 `배경 제거/투명 복원`을 내부에서 같이 해결하려 했기 때문이다.
- 즉, 현재 코드가 억지로 배경을 추정해서 전경을 다시 투명 PNG처럼 만들려고 들었고, 그 과정에서 외곽/색/잔배경이 어색해졌다.
- 사용자가 눈으로 봤을 때 `Sparky 빼고 다 망했다`고 느낀 것은 타당하다.

이 말은 곧 다음 방향을 뜻한다.

- `투명 입력만 받는 제품`으로 가면 현재 정렬 엔진을 살릴 수 있다.
- `불투명 배경 이미지를 투명 복원까지 자동으로 하겠다`는 방향은 지금 기준으로 분리 과제다.

## 현재 제품 방향 결론

집 세션에서 이어갈 때는 아래를 전제로 시작하는 것이 맞다.

### 유지할 것

- 목표: `AI가 만든 스프라이트의 프레임 registration / pivot 보정`
- 전제: `입력은 투명 알파가 있는 PNG`
- 엔진: 현재 alignment pipeline 재사용
- 출력: 행 단위 보정 시트 + frame metadata

### 버릴 것 또는 뒤로 미룰 것

- 불투명 배경 이미지의 자동 배경 제거
- 불투명 배경 이미지의 자동 투명 복원
- opaque sample을 기준으로 품질을 증명하려는 시도

즉 다음 세션부터는 사실상 이렇게 생각하면 된다.

`이 프로젝트는 투명 스프라이트 시트 전용 정밀 정렬 툴 MVP로 다시 정의한다.`

## 현재 검증 상태

실행 완료:

- `npm test`
- `npm run process:samples`
- `npm run build`

기술적으로는 통과했다.

하지만 중요한 해석:

- 테스트 통과 = 현재 코드가 정한 기준을 통과했다는 뜻일 뿐이다.
- 사용자 기준의 시각 품질로 보면 `opaque background 결과물`은 아직 제품 수준이 아니다.
- 따라서 이후 품질 판단은 `transparent sprite sample` 기준으로 다시 잡아야 한다.

## 다음 세션에서 바로 해야 할 일

우선순위 순서:

1. 제품 범위를 `transparent input only`로 명시한다.
2. `Sparky` 같은 진짜 투명 샘플을 더 모은다.
3. 현재 정렬 엔진을 그 샘플들로 다시 검증한다.
4. 웹서비스 UI를 붙인다.
5. 수동 미세 보정 기능을 추가한다.

## 웹서비스로 가져갈 수 있나

가능하다. 다만 지금 상태는 `웹서비스 완성본`이 아니라 `핵심 엔진`이다.

현재 상태:

- 엔진/파이프라인은 있음
- 브라우저에서 쓰는 업로드/프리뷰 UI는 아직 없음

다음 단계 추천:

- `React + TypeScript` 기반 업로드 UI
- spritesheet 업로드
- row preview
- before/after animation preview
- export download
- 이후 manual nudge / anchor edit 추가

## 다음 세션에서 Codex에게 바로 줄 말

아래 문장으로 시작하면 된다.

`이 프로젝트는 transparent alpha가 있는 sprite sheet만 처리하는 방향으로 간다. opaque background 복원 문제는 제외한다. 현재 alignment engine을 기준으로 웹 UI MVP를 붙여라.`

## 참고 파일

- 현재 샘플 출력 요약: `output/summary.json`
- 현재 handoff 원본: `docs/handoffs/2026-03-27-sprite-registration-studio-bootstrap.md`
- 상세 작업 로그: `docs/worklogs/2026-03-27-sprite-registration-studio-bootstrap.md`

