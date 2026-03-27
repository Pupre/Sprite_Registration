# 작업 로그

- 날짜: 2026-03-27
- 작업: sprite-registration-studio 초기 부트스트랩과 실제 샘플 처리 파이프라인 구축
- 범위: 독립 신규 프로젝트 생성, 실제 PNG 샘플 분할/정렬/행별 export, 정량 테스트 기준 확립
- 저장소: /home/muhyeon_shin/packages/sprite-registration-studio
- 활성 브랜치: 미초기화

## 작업 배경

사용자는 AI가 생성한 2D 스프라이트 시트에서 프레임별 피벗 불일치 때문에 생기는 미세한 잔떨림을 줄이는 독립 프로젝트를 원했다. 요구사항의 핵심은 단순 crop이 아니라, 캐릭터 본체 기준의 registration과 행 단위 결과 export였다. 실제 샘플은 `GeneralFrog`, `Slime`, `Sparky` 세 시트였고, 각 시트는 `4 x 3` 구조에서 `행 하나 = 애니메이션 하나`로 해석해야 했다.

## 변경 전 상태

`packages` 하위에 해당 목적의 프로젝트 폴더가 없었고, 정렬 엔진, 샘플 처리 코드, 검증 기준, export 결과도 아직 존재하지 않았다.

## 문제점 또는 리스크

- 알고리즘 설계 없이 UI부터 만들면 "보기 좋은 편집기"만 생기고 핵심 정렬 품질이 검증되지 않는다.
- 시각적 흔들림 문제는 감각적으로만 판단하면 반복 수정이 길어진다.
- `Slime`과 `Sparky`처럼 배경이 완전 투명하지 않은 샘플은 내부적으로라도 foreground mask 추정이 필요하다.
- `Sparky`는 이미지 전체 크기가 `4 x 3` 균등 분할과 딱 떨어지지 않아, 단순 셀 등분 대신 projection 기반 그리드 검출이 필요하다.

## 변경 전략

첫 단계는 실제 이미지 편집기보다 앞서, 샘플 시트를 자동으로 읽어 `그리드 검출 -> 셀 crop -> foreground 분석 -> 행 단위 정렬 -> 행별 시트 export`까지 수행하는 결정론적 파이프라인을 만든다. 정렬 품질 평가는 단순 bbox variance가 아니라, 프레임 시퀀스의 선형 추세선에서 벗어난 residual jitter를 기준으로 측정한다. 이렇게 하면 도약이나 공격처럼 의도된 움직임은 보존하면서 미세한 흔들림만 줄였는지 더 정확히 볼 수 있다.

## 구현 메모

- 변경한 파일: `package.json`, `src/core/io/png.ts`, `src/core/grid/detectGrid.ts`, `src/core/mask/*`, `src/core/alignment/alignAnimation.ts`, `src/core/metrics/jitter.ts`, `src/core/pipeline/processSpriteSheet.ts`, `src/core/export/renderAnimationSheet.ts`, `scripts/processSamples.ts`, `tests/*`
- 무엇을 바꿨는지: 실제 PNG 스프라이트 시트를 읽어 4x3 그리드를 감지하고, 각 셀에서 foreground를 추정한 뒤, 행별로 정렬하여 1x4 결과 시트와 메타데이터를 export하는 파이프라인을 추가했다.
- 왜 바꿨는지: 사용자가 준 실제 샘플 3장과 9개 애니메이션에 대해 작동하는 최소 제품 핵심을 확보하기 위해서다.
- 사용자나 개발자 입장에서 어떤 영향이 생기는지: 이제 `samples/`에 있는 시트를 실제로 처리해 `output/`에 행별 결과 PNG/JSON을 만들 수 있다.

- 변경한 파일: `tests/alignment.test.ts`, `tests/realSamples.test.ts`
- 무엇을 바꿨는지: synthetic idle jitter 테스트와 실제 샘플 3장 전체를 대상으로 하는 통합 테스트를 작성했다.
- 왜 바꿨는지: 구현 후 사람이 계속 수동 확인하지 않아도, jitter 감소와 export 생성 여부를 자동으로 검증하기 위해서다.
- 사용자나 개발자 입장에서 어떤 영향이 생기는지: `npm test`가 실제 샘플 기준선까지 확인한다.

- 변경한 파일: `src/core/mask/foreground.ts`
- 무엇을 바꿨는지: 코너 배경 보간 기반 foreground 점수와 연결요소 분석을 구현하고, low-contrast cell이 비어 보이는 경우 score percentile 기반 fallback threshold를 추가했다.
- 왜 바꿨는지: `Slime` 3행 일부 프레임에서 초기 threshold가 너무 높아 전경이 0으로 떨어지는 문제를 해결하기 위해서다.
- 사용자나 개발자 입장에서 어떤 영향이 생기는지: 실제 샘플 9개 애니메이션 모두에서 non-empty foreground와 export가 가능해졌다.

## 기대 효과

- 스프라이트 시트를 행 단위 애니메이션으로 분리하면서, 프레임 내부 위치 흔들림을 줄인 결과를 바로 얻을 수 있다.
- 이후 수동 보정 UI를 붙이더라도, 현재 파이프라인과 jitter metric을 기준선으로 재사용할 수 있다.
- 실제 샘플 3장에 대한 자동 검증과 산출물이 이미 마련돼 있어 후속 개발 속도가 빨라진다.

## 검증

실행한 명령:

- `npm install`
- `npm test`
- `npm run process:samples`
- `npm run build`

결과:

- 테스트 2개 통과
- 실제 샘플 3장, 9개 애니메이션 처리 성공
- `output/` 아래에 총 9개의 보정된 row sheet PNG와 9개의 JSON 메타데이터 생성
- `output/summary.json` 기준 improvement ratio는 다음과 같다.
  - `GeneralFrog`: `0.0719`, `0.0028`, `0.1995`
  - `Slime`: `0.2910`, `0.0760`, `0.1376`
  - `Sparky`: `0.0001`, `0.0000`, `0.0001`

해석:

- ratio가 1보다 작을수록 residual jitter가 줄어든 것이다.
- 현재 실제 샘플 9개 애니메이션 모두에서 score가 감소했다.

## 남은 리스크

- 현재 정렬은 fully automatic 1차 파이프라인이고, manual anchor/offset 보정 UI는 아직 없다.
- foreground mask는 내부 전처리로 충분히 작동하지만, 복잡한 배경이나 더 많은 이펙트 종류에 대해서는 추가 튜닝이 필요할 수 있다.
- `Sparky`처럼 glow가 큰 샘플은 foreground 판단이 곧 정렬 결과를 좌우하므로, 이후 body/effect 가중치 분리를 더 정교하게 만들 여지가 있다.
- 현재 export 결과는 투명 배경 기반 PNG다. 사용자 UX 차원에서 overlay preview나 before/after 비교 화면이 아직 없다.

## 후속 디버깅 메모

사용자가 `GeneralFrog` 출력에 구멍처럼 보이는 아티팩트를 지적했다. 실제로는 내부 픽셀이 비는 문제라기보다, 불투명 checker 배경과 그라디언트 배경에서 foreground 추정이 느슨해져 `배경 조각`과 `배경색이 섞인 가장자리 픽셀`이 함께 export된 상태였다. 현재 테스트는 jitter 감소와 export 생성만 확인하고 있어, 이런 시각 아티팩트가 있어도 통과하는 구조였다.

이번 후속 수정의 목표는 두 가지다.

- opaque background 샘플에서 foreground mask가 배경 타일을 끌고 오지 않도록 배경 모델을 더 강하게 만든다.
- render 단계에서 binary include만 쓰지 않고 soft matte를 적용해, 남아 있는 배경색 섞임과 헤일로를 줄인다.

추가 검증 기준도 필요하다. 기존 jitter 기준에 더해, 실제 샘플 출력에서 `배경색과 과도하게 유사한 픽셀이 얼마나 남는지`를 확인하는 회귀 테스트를 추가해 같은 문제가 다시 통과하지 못하게 막는다.

## 후속 수정 결과

- 변경한 파일: `src/core/types/image.ts`, `src/core/mask/foreground.ts`, `src/core/export/renderAnimationSheet.ts`, `tests/realSamples.test.ts`
- 무엇을 바꿨는지: opaque background 셀에 대해 border color palette 기반 배경 모델과 soft matte를 추가하고, high-confidence non-border component만 남기는 2차 refinement를 넣었다. render 단계는 이 matte를 사용해 투명 PNG를 만들도록 바꾸고, 실제 샘플 테스트에는 background leakage 회귀 기준을 추가했다.
- 왜 바꿨는지: `GeneralFrog` 출력에서 보였던 구멍형 아티팩트와 checker 배경 누수를 자동으로 줄이고, 같은 문제가 다시 통과하지 못하게 막기 위해서다.
- 사용자나 개발자 입장에서 어떤 영향이 생기는지: 이제 opaque background 샘플도 행별 export 시 셀 전체가 배경으로 번지는 현상이 크게 줄었고, 테스트가 bounds 번짐과 고불투명 배경 유사 픽셀을 같이 감시한다.

## 후속 수정 검증

실행한 명령:

- `npm test`
- `npm run process:samples`
- `npm run build`

결과:

- 테스트 3개 통과
- `GeneralFrog`, `Slime`, `Sparky` 샘플 재처리 성공
- opaque background 회귀 테스트 기준 통과
- production build 성공

해석:

- 기존에는 jitter 기준만 통과해도 시각 아티팩트가 남을 수 있었지만, 현재는 opaque sample에 대해 bounds coverage와 background-like opaque pixel까지 같이 검증한다.
- `GeneralFrog`의 경우 이전처럼 full bounds가 셀 전체로 퍼지는 프레임이 사라졌고, 실제 export도 눈에 띄는 배경 누수가 크게 줄었다.

## 잔여 리스크 업데이트

- `GeneralFrog` 3행처럼 이펙트가 강한 프레임은 여전히 edge color가 완전히 이상적이지 않을 수 있다. 다만 현재 수준에서는 배경 누수보다 색 복원 미세 튜닝 문제에 가깝다.
- 이후 manual fine-tuning UI를 만들 때 frame별 matte cutoff나 anchor lock 같은 보정 옵션을 주면 품질을 더 밀어올릴 수 있다.
