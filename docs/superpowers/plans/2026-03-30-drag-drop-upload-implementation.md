# 드래그 앤 드롭 업로드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 업로드 영역에서 클릭 업로드와 PNG 드래그 앤 드롭 업로드를 모두 지원한다.

**Architecture:** 현재 `processFile(...)` 처리 흐름은 그대로 재사용하고, 업로드 카드에 drag 이벤트만 추가한다. 시각 피드백은 작은 `isDragOver` 상태와 CSS 클래스 하나로 해결하며, 지원하지 않는 파일은 현재 상태/에러 표시 방식에 맞춰 무시하거나 안내한다.

**Tech Stack:** React, TypeScript, existing browser upload flow, CSS, Playwright

---

## 파일 구조

- Modify: `src/app.tsx`
- Modify: `src/styles.css`
- Optionally modify: `tests/` 또는 Playwright 수동 검증 메모

### Task 1: 드롭 업로드 동작을 먼저 테스트 가능한 형태로 정의

**Files:**
- Modify: `src/app.tsx`

- [ ] **Step 1: 업로드 파일 선택 로직을 재사용 가능한 함수로 분리**

기존 `handleFileChange`가 하던 `files?.[0]` 선택 로직을 재사용 가능한 함수로 뽑는다.

추가 목표 함수 형태:

```ts
function pickFirstPngFile(files: FileList | File[] | null | undefined): File | null {
  if (!files) {
    return null;
  }

  const candidates = Array.from(files);
  return candidates.find((file) => file.type === "image/png" || file.name.toLowerCase().endsWith(".png")) ?? null;
}
```

- [ ] **Step 2: 기존 클릭 업로드가 이 함수를 쓰도록 변경**

`handleFileChange`를 다음 형태로 바꾼다.

```ts
function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
  const file = pickFirstPngFile(event.target.files);
  if (!file) {
    return;
  }

  void processFile(file);
}
```

- [ ] **Step 3: 드롭용 실패 처리 기준을 정한다**

유효한 PNG가 없을 때는 현재 상태/에러 시스템에 맞춰:

```ts
setError("PNG 파일만 업로드할 수 있습니다.");
setStatus("드롭한 항목에서 처리 가능한 PNG를 찾지 못했습니다.");
```

처럼 보여줄 수 있게 한다.

### Task 2: 업로드 카드에 drag-and-drop 이벤트 추가

**Files:**
- Modify: `src/app.tsx`

- [ ] **Step 1: drag-over 상태 추가**

`App()`에 상태를 추가한다.

```ts
const [isDragOver, setIsDragOver] = useState(false);
```

- [ ] **Step 2: drag 이벤트 핸들러 추가**

다음 형태의 핸들러를 추가한다.

```ts
function handleDragOver(event: DragEvent<HTMLLabelElement>) {
  event.preventDefault();
  setIsDragOver(true);
}

function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
  event.preventDefault();
  setIsDragOver(false);
}

function handleDrop(event: DragEvent<HTMLLabelElement>) {
  event.preventDefault();
  setIsDragOver(false);

  const file = pickFirstPngFile(event.dataTransfer?.files);
  if (!file) {
    setError("PNG 파일만 업로드할 수 있습니다.");
    setStatus("드롭한 항목에서 처리 가능한 PNG를 찾지 못했습니다.");
    return;
  }

  void processFile(file);
}
```

- [ ] **Step 3: 업로드 영역에 핸들러 연결**

기존 업로드 라벨을 다음과 같이 바꾼다.

```tsx
<label
  className={`upload-dropzone${isDragOver ? " drag-over" : ""}`}
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
>
```

- [ ] **Step 4: 드롭 안내 문구를 조금 더 명확히 수정**

업로드 카피를 다음 수준으로 맞춘다.

```tsx
시트 하나를 선택하거나, PNG를 이 영역에 드롭하세요.
자동 모드에서는 행 수를 기준으로 각 row의 frame 경계를 따로 감지하고,
수동 모드에서는 기존처럼 입력한 행/열 수를 사용합니다.
```

### Task 3: drag-over 시각 피드백 추가

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: 기본 업로드 카드 스타일 위치 확인**

`src/styles.css`에서 `.upload-dropzone` 관련 스타일 블록 옆에 drag-over 강조 상태를 추가한다.

- [ ] **Step 2: drag-over 강조 스타일 추가**

예시:

```css
.upload-dropzone.drag-over {
  border-color: rgba(244, 192, 105, 0.8);
  background: rgba(244, 192, 105, 0.12);
  box-shadow: 0 0 0 2px rgba(244, 192, 105, 0.18);
  transform: translateY(-1px);
}
```

- [ ] **Step 3: 처리 중 상태와 충돌 없는지 확인**

`drag-over`가 붙어도 기존 disabled/processing 상태에서 UI가 깨지지 않는지 확인한다.

### Task 4: 브라우저에서 실제 업로드 흐름 검증

**Files:**
- Reuse: `samples/GeneralFrog.png`
- Reuse: current local dev server flow

- [ ] **Step 1: 타입/빌드 확인**

Run: `npm run build`
Expected: PASS

- [ ] **Step 2: 브라우저에서 클릭 업로드가 그대로 되는지 확인**

확인 사항:

- 클릭 업로드 가능
- 기존 처리 흐름 그대로 동작
- 기존 상태 문구 유지

- [ ] **Step 3: 브라우저에서 drag-over 피드백 확인**

확인 사항:

- PNG를 드래그하면 업로드 영역이 강조됨
- 드래그가 빠져나가면 강조 해제됨

- [ ] **Step 4: 브라우저에서 드롭 업로드 확인**

확인 사항:

- `samples/GeneralFrog.png` 드롭 시 처리 시작
- 기존 업로드와 동일한 결과 생성
- invalid 파일 드롭 시 에러/상태 문구 표시

- [ ] **Step 5: 필요 시 Playwright로 최소 확인**

Playwright에서 확인할 포인트:

- 파일 업로드 input은 그대로 동작
- 업로드 영역이 존재
- 드롭 처리 후 결과 섹션이 정상 갱신

### Task 5: 변경사항 정리

**Files:**
- Modify: `src/app.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: 최종 diff 검토**

불필요한 리팩터링이나 업로드 외 변경이 섞이지 않았는지 확인한다.

- [ ] **Step 2: 커밋**

```bash
git add src/app.tsx src/styles.css docs/superpowers/specs/2026-03-30-drag-drop-upload-design.md docs/superpowers/plans/2026-03-30-drag-drop-upload-implementation.md
git commit -m "feat: support drag and drop sprite sheet uploads"
```
